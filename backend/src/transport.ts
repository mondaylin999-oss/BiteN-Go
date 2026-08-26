// ===========================================================================
//  transport.ts — ferry bus operations.
//
//  Roles: the ADMIN registers vehicles, routes and trips; the DRIVER (the
//  transport agent) runs their own ferry — capacity, route map, trip status,
//  seat requests, maintenance; the STUDENT books a seat.
//
//  Every seat number in here — taken, free, may-this-be-booked, may-this-be-
//  confirmed, how-low-may-capacity-go — is decided by the C++ engine
//  (cpp/src/SeatPlanner.cpp). This module is the PostgreSQL side.
// ===========================================================================

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "./database.js";
import {
  driverProfiles,
  rideBookings,
  routeMapNodes,
  routeStops,
  transportRoutes,
  trips,
  users,
  vehicleMaintenance,
  vehicles,
} from "../drizzle/schema.js";
import { callEngine, EngineRuleError } from "./engine.js";

export type TripStatus = "scheduled" | "boarding" | "in_progress" | "completed" | "cancelled";
export type BookingStatus = "pending" | "confirmed" | "cancelled";
export type VehicleStatus = "operational" | "unavailable" | "maintenance";
export type MaintenanceStatus = "reported" | "in_progress" | "resolved";
export type FerryMapNodeInput = { name: string; latitude: number; longitude: number };

const REQUEST_STATUSES: BookingStatus[] = ["pending", "confirmed"];

const CAN_MOVE_TRIP: Record<TripStatus, TripStatus[]> = {
  scheduled: ["boarding", "cancelled"],
  boarding: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
};

const fail = (message: string) => {
  throw new EngineRuleError(message);
};

function requireText(value: string, label: string, max = 160) {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed.length > max) fail(`Enter a valid ${label}.`);
  return trimmed;
}

function assertPositiveInteger(value: number, label: string, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < 1 || value > max) fail(`Enter a valid ${label}.`);
  return value;
}

function optionalMapUrl(value: string | undefined) {
  if (value === undefined) return undefined;
  const url = value.trim();
  if (!url) return null;
  if (!/^https:\/\//i.test(url) || url.length > 2048) fail("Enter a valid HTTPS Google Maps link.");
  return url;
}

function optionalMapCoordinates(value: string | undefined) {
  if (value === undefined) return undefined;
  const coordinates = value.trim();
  if (!coordinates) return null;
  if (coordinates.length > 128 || !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(coordinates)) fail("Enter coordinates as latitude, longitude.");
  return coordinates;
}

function normalizeRouteLineColor(value: string) {
  const color = value.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(color)) fail("Choose a valid six-digit route line color.");
  return color;
}

function normalizeMapNodes(nodes: FerryMapNodeInput[]) {
  if (nodes.length < 2 || nodes.length > 50) fail("Publish between 2 and 50 map nodes.");
  return nodes.map((node, index) => {
    const latitude = Number(node.latitude);
    const longitude = Number(node.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)
      fail(`Node ${index + 1} needs valid latitude and longitude values.`);
    return { name: requireText(node.name, `node ${index + 1} name`), latitude: latitude.toFixed(6), longitude: longitude.toFixed(6), nodeOrder: index + 1 };
  });
}

// --- drivers ---------------------------------------------------------------

export async function ensureDriverProfile(driverId: number) {
  const existing = await db().select().from(driverProfiles).where(eq(driverProfiles.userId, driverId)).limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db().insert(driverProfiles).values({ userId: driverId }).returning();
  return inserted[0]!;
}

export async function getDriverProfile(driverId: number) {
  const rows = await db()
    .select({ profile: driverProfiles, user: users })
    .from(driverProfiles)
    .innerJoin(users, eq(driverProfiles.userId, users.id))
    .where(eq(driverProfiles.userId, driverId))
    .limit(1);
  return rows[0];
}

export async function updateOwnDriverProfile(
  driverId: number,
  input: { phone?: string; licenseNumber?: string; availability?: "available" | "unavailable" },
) {
  await ensureDriverProfile(driverId);
  const patch: Record<string, unknown> = {};
  if (input.phone !== undefined) patch.phone = input.phone.trim() || null;
  if (input.licenseNumber !== undefined) patch.licenseNumber = input.licenseNumber.trim() || null;
  if (input.availability) patch.availability = input.availability;
  if (!Object.keys(patch).length) fail("Choose at least one profile field to update.");
  await db().update(driverProfiles).set(patch).where(eq(driverProfiles.userId, driverId));
  return getDriverProfile(driverId);
}

export async function listDrivers() {
  return db()
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      status: users.status,
      phone: driverProfiles.phone,
      licenseNumber: driverProfiles.licenseNumber,
      availability: driverProfiles.availability,
    })
    .from(users)
    .leftJoin(driverProfiles, eq(users.id, driverProfiles.userId))
    .where(eq(users.role, "driver"))
    .orderBy(asc(users.name));
}

export async function assertActiveDriver(driverId: number) {
  const rows = await db()
    .select({ id: users.id, role: users.role, status: users.status, availability: driverProfiles.availability })
    .from(users)
    .leftJoin(driverProfiles, eq(users.id, driverProfiles.userId))
    .where(eq(users.id, driverId))
    .limit(1);
  const driver = rows[0];
  if (!driver || driver.role !== "driver" || driver.status !== "active") fail("Choose an active driver account.");
  if (driver!.availability === "unavailable") fail("The selected driver is unavailable.");
  return driver!;
}

// --- vehicles --------------------------------------------------------------

export async function createVehicle(input: {
  plateNumber: string;
  vehicleType: string;
  model: string;
  totalSeats: number;
  monthlyFeeCents?: number;
  driverId?: number;
  status?: VehicleStatus;
}) {
  const plateNumber = requireText(input.plateNumber, "plate number", 32).toUpperCase();
  const vehicleType = requireText(input.vehicleType, "vehicle type", 80);
  const model = requireText(input.model, "vehicle model", 120);
  const totalSeats = assertPositiveInteger(input.totalSeats, "seat capacity", 200);
  if (input.driverId) await assertActiveDriver(input.driverId);

  const inserted = await db()
    .insert(vehicles)
    .values({
      plateNumber,
      vehicleType,
      model,
      totalSeats,
      monthlyFeeCents: input.monthlyFeeCents ?? 0,
      driverId: input.driverId ?? null,
      status: input.status ?? "operational",
    })
    .returning({ id: vehicles.id });
  return inserted[0]!.id;
}

export async function updateVehicle(
  vehicleId: number,
  input: {
    plateNumber?: string;
    vehicleType?: string;
    model?: string;
    totalSeats?: number;
    monthlyFeeCents?: number;
    driverId?: number | null;
    status?: VehicleStatus;
    maintenanceStatus?: "clear" | "reported" | "in_service";
  },
) {
  const patch: Record<string, unknown> = {};
  if (input.plateNumber !== undefined) patch.plateNumber = requireText(input.plateNumber, "plate number", 32).toUpperCase();
  if (input.vehicleType !== undefined) patch.vehicleType = requireText(input.vehicleType, "vehicle type", 80);
  if (input.model !== undefined) patch.model = requireText(input.model, "vehicle model", 120);
  if (input.totalSeats !== undefined) patch.totalSeats = assertPositiveInteger(input.totalSeats, "seat capacity", 200);
  if (input.monthlyFeeCents !== undefined) patch.monthlyFeeCents = Math.max(0, Math.trunc(input.monthlyFeeCents));
  if (input.driverId !== undefined) {
    if (input.driverId) await assertActiveDriver(input.driverId);
    patch.driverId = input.driverId;
  }
  if (input.status) patch.status = input.status;
  if (input.maintenanceStatus) patch.maintenanceStatus = input.maintenanceStatus;
  if (!Object.keys(patch).length) fail("Choose at least one vehicle field to update.");

  const updated = await db().update(vehicles).set(patch).where(eq(vehicles.id, vehicleId)).returning({ id: vehicles.id });
  if (!updated.length) fail("Vehicle not found.");
  return getVehicle(vehicleId);
}

export async function getVehicle(vehicleId: number) {
  const rows = await db()
    .select({ vehicle: vehicles, driverName: users.name, driverUsername: users.username })
    .from(vehicles)
    .leftJoin(users, eq(vehicles.driverId, users.id))
    .where(eq(vehicles.id, vehicleId))
    .limit(1);
  return rows[0];
}

export async function listVehicles() {
  return db()
    .select({ vehicle: vehicles, driverName: users.name, driverUsername: users.username })
    .from(vehicles)
    .leftJoin(users, eq(vehicles.driverId, users.id))
    .orderBy(asc(vehicles.plateNumber));
}

/**
 * A driver may resize only their own ferry, and never below the seats already
 * confirmed on their active trips. The floor is computed by the C++ engine.
 */
export async function updateOwnVehicleCapacity(driverId: number, vehicleId: number, totalSeats: number) {
  const requestedSeats = assertPositiveInteger(totalSeats, "seat capacity", 200);

  const owned = await db()
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.driverId, driverId)))
    .limit(1);
  if (!owned.length) return false;

  const [tripRows, bookingRows] = await Promise.all([engineTrips({ driverId }), engineBookings()]);
  const { committedSeats } = await callEngine<{ committedSeats: number }>("ferry.capacityFloor", {
    vehicleId,
    trips: tripRows,
    bookings: bookingRows,
  });
  if (requestedSeats < committedSeats)
    fail(`Seat capacity cannot be lower than ${committedSeats} confirmed seat${committedSeats === 1 ? "" : "s"}.`);

  await db().update(vehicles).set({ totalSeats: requestedSeats }).where(eq(vehicles.id, vehicleId));
  return true;
}

// --- routes ----------------------------------------------------------------

export async function createTransportRoute(input: {
  name: string;
  startPoint: string;
  destination: string;
  stops: string[];
  fareCents: number;
  mapUrl?: string;
  mapCoordinates?: string;
  driverId?: number;
  vehicleId?: number;
  distanceKm?: number;
  estimatedMinutes?: number;
  status?: "active" | "inactive";
}) {
  const name = requireText(input.name, "route name", 120);
  const startPoint = requireText(input.startPoint, "start point");
  const destination = requireText(input.destination, "destination");
  const stops = input.stops.map(stop => requireText(stop, "pickup stop")).filter((stop, index, list) => list.indexOf(stop) === index);
  if (!stops.length) fail("Add at least one pickup stop.");
  const fareCents = assertPositiveInteger(input.fareCents, "fare");
  const mapUrl = optionalMapUrl(input.mapUrl);
  const mapCoordinates = optionalMapCoordinates(input.mapCoordinates);

  if (input.driverId) await assertActiveDriver(input.driverId);
  if (input.vehicleId) {
    const vehicle = await getVehicle(input.vehicleId);
    if (!vehicle || vehicle.vehicle.status !== "operational") fail("Choose an operational vehicle.");
    if (input.driverId && vehicle!.vehicle.driverId && vehicle!.vehicle.driverId !== input.driverId)
      fail("The vehicle is assigned to a different driver.");
  }

  return db().transaction(async tx => {
    const inserted = await tx
      .insert(transportRoutes)
      .values({
        name,
        startPoint,
        destination,
        pickupLocations: stops.join(", "),
        fareCents,
        mapUrl: mapUrl ?? null,
        mapCoordinates: mapCoordinates ?? null,
        driverId: input.driverId ?? null,
        vehicleId: input.vehicleId ?? null,
        distanceKm: input.distanceKm ?? null,
        estimatedMinutes: input.estimatedMinutes ?? null,
        status: input.status ?? "active",
      })
      .returning({ id: transportRoutes.id });
    const routeId = inserted[0]!.id;
    await tx.insert(routeStops).values(stops.map((stop, index) => ({ routeId, name: stop, stopOrder: index + 1 })));
    return routeId;
  });
}

export async function updateTransportRoute(
  routeId: number,
  input: {
    name?: string;
    startPoint?: string;
    destination?: string;
    stops?: string[];
    fareCents?: number;
    mapUrl?: string;
    mapCoordinates?: string;
    driverId?: number | null;
    vehicleId?: number | null;
    distanceKm?: number | null;
    estimatedMinutes?: number | null;
    status?: "active" | "inactive";
  },
) {
  const patch: Record<string, unknown> = {};
  let stops: string[] | undefined;

  if (input.name !== undefined) patch.name = requireText(input.name, "route name", 120);
  if (input.startPoint !== undefined) patch.startPoint = requireText(input.startPoint, "start point");
  if (input.destination !== undefined) patch.destination = requireText(input.destination, "destination");
  if (input.fareCents !== undefined) patch.fareCents = assertPositiveInteger(input.fareCents, "fare");
  if (input.mapUrl !== undefined) patch.mapUrl = optionalMapUrl(input.mapUrl);
  if (input.mapCoordinates !== undefined) patch.mapCoordinates = optionalMapCoordinates(input.mapCoordinates);
  if (input.driverId !== undefined) {
    if (input.driverId) await assertActiveDriver(input.driverId);
    patch.driverId = input.driverId;
  }
  if (input.vehicleId !== undefined) patch.vehicleId = input.vehicleId;
  if (input.distanceKm !== undefined) patch.distanceKm = input.distanceKm;
  if (input.estimatedMinutes !== undefined) patch.estimatedMinutes = input.estimatedMinutes;
  if (input.status) patch.status = input.status;
  if (input.stops !== undefined) {
    stops = input.stops.map(stop => requireText(stop, "pickup stop")).filter((stop, index, list) => list.indexOf(stop) === index);
    if (!stops.length) fail("Add at least one pickup stop.");
    patch.pickupLocations = stops.join(", ");
  }
  if (!Object.keys(patch).length && !stops) fail("Choose at least one route field to update.");

  return db().transaction(async tx => {
    if (Object.keys(patch).length) {
      const updated = await tx.update(transportRoutes).set(patch).where(eq(transportRoutes.id, routeId)).returning({ id: transportRoutes.id });
      if (!updated.length) fail("Route not found.");
    }
    if (stops) {
      await tx.delete(routeStops).where(eq(routeStops.routeId, routeId));
      await tx.insert(routeStops).values(stops.map((name, index) => ({ routeId, name, stopOrder: index + 1 })));
    }
    return routeId;
  }).then(() => getTransportRoute(routeId));
}

export async function updateOwnFerryRoute(
  driverId: number,
  routeId: number,
  input: { name?: string; startPoint?: string; destination?: string; stops?: string[]; fareCents?: number; mapUrl?: string; mapCoordinates?: string },
) {
  const owned = await db()
    .select({ id: transportRoutes.id })
    .from(transportRoutes)
    .where(and(eq(transportRoutes.id, routeId), eq(transportRoutes.driverId, driverId)))
    .limit(1);
  if (!owned.length) return false;
  await updateTransportRoute(routeId, input);
  return true;
}

/** Only the assigned transport agent may publish a route's drawn path. */
export async function publishOwnFerryRouteMap(driverId: number, routeId: number, input: { routeLineColor: string; nodes: FerryMapNodeInput[] }) {
  const nodes = normalizeMapNodes(input.nodes);
  const routeLineColor = normalizeRouteLineColor(input.routeLineColor);

  return db().transaction(async tx => {
    const owned = await tx
      .select({ id: transportRoutes.id })
      .from(transportRoutes)
      .where(and(eq(transportRoutes.id, routeId), eq(transportRoutes.driverId, driverId)))
      .limit(1);
    if (!owned.length) return false;
    await tx.delete(routeMapNodes).where(eq(routeMapNodes.routeId, routeId));
    await tx.insert(routeMapNodes).values(nodes.map(node => ({ routeId, ...node })));
    await tx.update(transportRoutes).set({ routeLineColor }).where(eq(transportRoutes.id, routeId));
    return true;
  });
}

export async function getTransportRoute(routeId: number) {
  const routeRows = await db()
    .select({
      route: transportRoutes,
      driverName: users.name,
      vehiclePlate: vehicles.plateNumber,
      vehicleSeats: vehicles.totalSeats,
      vehicleStatus: vehicles.status,
    })
    .from(transportRoutes)
    .leftJoin(users, eq(transportRoutes.driverId, users.id))
    .leftJoin(vehicles, eq(transportRoutes.vehicleId, vehicles.id))
    .where(eq(transportRoutes.id, routeId))
    .limit(1);
  if (!routeRows[0]) return undefined;

  const [stops, mapNodes] = await Promise.all([
    db().select().from(routeStops).where(eq(routeStops.routeId, routeId)).orderBy(asc(routeStops.stopOrder)),
    db().select().from(routeMapNodes).where(eq(routeMapNodes.routeId, routeId)).orderBy(asc(routeMapNodes.nodeOrder)),
  ]);
  return { ...routeRows[0], stops, mapNodes };
}

export async function listTransportRoutes(activeOnly = false) {
  const rows = await db()
    .select({
      route: transportRoutes,
      driverName: users.name,
      vehiclePlate: vehicles.plateNumber,
      vehicleSeats: vehicles.totalSeats,
      vehicleStatus: vehicles.status,
    })
    .from(transportRoutes)
    .leftJoin(users, eq(transportRoutes.driverId, users.id))
    .leftJoin(vehicles, eq(transportRoutes.vehicleId, vehicles.id))
    .where(activeOnly ? eq(transportRoutes.status, "active") : undefined)
    .orderBy(desc(transportRoutes.updatedAt));

  const [stops, mapNodes] = await Promise.all([
    db().select().from(routeStops).orderBy(asc(routeStops.stopOrder)),
    db().select().from(routeMapNodes).orderBy(asc(routeMapNodes.nodeOrder)),
  ]);
  return rows.map(row => ({
    ...row,
    stops: stops.filter(stop => stop.routeId === row.route.id),
    mapNodes: mapNodes.filter(node => node.routeId === row.route.id),
  }));
}

// --- trips -----------------------------------------------------------------

export async function createTrip(input: { routeId: number; driverId: number; vehicleId: number; departureAt: Date }) {
  if (input.departureAt.getTime() <= Date.now()) fail("Schedule a trip for a future time.");
  await assertActiveDriver(input.driverId);

  const [route, vehicle] = await Promise.all([getTransportRoute(input.routeId), getVehicle(input.vehicleId)]);
  if (!route || route.route.status !== "active") fail("Choose an active route.");
  if (!vehicle || vehicle.vehicle.status !== "operational") fail("Choose an operational vehicle.");
  if (vehicle!.vehicle.driverId !== input.driverId) fail("Assign this vehicle to the selected driver before scheduling a trip.");

  const inserted = await db().insert(trips).values(input).returning({ id: trips.id });
  return inserted[0]!.id;
}

/** Raw trip rows joined with their route, vehicle and driver. */
async function rawTrips(input: { driverId?: number; includeCompleted?: boolean } = {}) {
  return db()
    .select({ trip: trips, route: transportRoutes, vehicle: vehicles, driverName: users.name, driverPhone: driverProfiles.phone })
    .from(trips)
    .innerJoin(transportRoutes, eq(trips.routeId, transportRoutes.id))
    .innerJoin(vehicles, eq(trips.vehicleId, vehicles.id))
    .innerJoin(users, eq(trips.driverId, users.id))
    .leftJoin(driverProfiles, eq(users.id, driverProfiles.userId))
    .where(
      input.driverId
        ? eq(trips.driverId, input.driverId)
        : input.includeCompleted
          ? undefined
          : inArray(trips.status, ["scheduled", "boarding", "in_progress"]),
    )
    .orderBy(asc(trips.departureAt));
}

/** Trip rows in the shape the C++ seat planner expects. */
async function engineTrips(input: { driverId?: number; includeCompleted?: boolean } = { includeCompleted: true }) {
  const rows = await rawTrips(input);
  return rows.map(row => ({
    tripId: row.trip.id,
    routeId: row.route.id,
    vehicleId: row.vehicle.id,
    driverId: row.trip.driverId,
    totalSeats: row.vehicle.totalSeats,
    fareCents: row.route.fareCents,
    status: row.trip.status,
    routeStatus: row.route.status,
    vehicleStatus: row.vehicle.status,
  }));
}

async function engineBookings() {
  const rows = await db().select().from(rideBookings);
  return rows.map(row => ({ id: row.id, tripId: row.tripId ?? 0, userId: row.userId, seatCount: row.seatCount, status: row.status }));
}

export async function listTrips(input: { driverId?: number; userId?: number; includeCompleted?: boolean } = {}) {
  const rows = await rawTrips(input);
  if (!rows.length) return [];

  const bookingRows = await engineBookings();
  const { trips: seatPlan } = await callEngine<{ trips: Array<{ tripId: number; occupiedSeats: number; pendingSeats: number; availableSeats: number; loadPercent: number; bookable: boolean }> }>(
    "ferry.plan",
    {
      trips: rows.map(row => ({
        tripId: row.trip.id,
        routeId: row.route.id,
        vehicleId: row.vehicle.id,
        driverId: row.trip.driverId,
        totalSeats: row.vehicle.totalSeats,
        fareCents: row.route.fareCents,
        status: row.trip.status,
        routeStatus: row.route.status,
        vehicleStatus: row.vehicle.status,
      })),
      bookings: bookingRows,
    },
  );

  const mapNodes = await db().select().from(routeMapNodes).orderBy(asc(routeMapNodes.nodeOrder));
  const ownBookings = input.userId
    ? await db()
        .select()
        .from(rideBookings)
        .where(and(eq(rideBookings.userId, input.userId), inArray(rideBookings.status, REQUEST_STATUSES)))
    : [];

  return rows.map(row => {
    const seats = seatPlan.find(entry => entry.tripId === row.trip.id);
    return {
      ...row,
      route: { ...row.route, mapNodes: mapNodes.filter(node => node.routeId === row.route.id) },
      occupiedSeats: seats?.occupiedSeats ?? 0,
      pendingSeats: seats?.pendingSeats ?? 0,
      availableSeats: seats?.availableSeats ?? row.vehicle.totalSeats,
      loadPercent: seats?.loadPercent ?? 0,
      bookable: seats?.bookable ?? false,
      ownBooking: ownBookings.find(booking => booking.tripId === row.trip.id) ?? null,
    };
  });
}

export async function getTrip(tripId: number) {
  const rows = await listTrips({ includeCompleted: true });
  return rows.find(row => row.trip.id === tripId);
}

export async function transitionTripStatus(tripId: number, driverId: number, nextStatus: TripStatus) {
  const rows = await db().select().from(trips).where(eq(trips.id, tripId)).limit(1);
  const trip = rows[0];
  if (!trip || trip.driverId !== driverId) return false;
  if (!CAN_MOVE_TRIP[trip.status].includes(nextStatus))
    fail(`A ${trip.status.replace("_", " ")} trip cannot move to ${nextStatus.replace("_", " ")}.`);

  await db()
    .update(trips)
    .set({ status: nextStatus, arrivedAt: nextStatus === "completed" ? new Date() : trip.arrivedAt })
    .where(eq(trips.id, tripId));
  return true;
}

// --- bookings --------------------------------------------------------------

async function engineTripFor(tripId: number) {
  const rows = await db()
    .select({ trip: trips, route: transportRoutes, vehicle: vehicles })
    .from(trips)
    .innerJoin(transportRoutes, eq(trips.routeId, transportRoutes.id))
    .innerJoin(vehicles, eq(trips.vehicleId, vehicles.id))
    .where(eq(trips.id, tripId))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return {
    row,
    engine: {
      tripId: row.trip.id,
      routeId: row.route.id,
      vehicleId: row.vehicle.id,
      driverId: row.trip.driverId,
      totalSeats: row.vehicle.totalSeats,
      fareCents: row.route.fareCents,
      status: row.trip.status,
      routeStatus: row.route.status,
      vehicleStatus: row.vehicle.status,
    },
  };
}

export async function createTripBooking(input: { tripId: number; userId: number; seatCount: number; seatNumber?: string }) {
  const trip = await engineTripFor(input.tripId);
  if (!trip) fail("This trip is not available for booking.");

  const bookings = await engineBookings();
  const decision = await callEngine<{ allowed: boolean; reason: string; fareCents: number; availableSeats: number }>("ferry.canRequest", {
    trip: trip!.engine,
    bookings,
    userId: input.userId,
    seatCount: input.seatCount,
  });
  if (!decision.allowed) fail(decision.reason);

  const inserted = await db()
    .insert(rideBookings)
    .values({
      routeId: trip!.row.route.id,
      tripId: trip!.row.trip.id,
      userId: input.userId,
      seatCount: input.seatCount,
      seatNumber: input.seatNumber?.trim() || null,
      fareCents: decision.fareCents,
      status: "pending",
    })
    .returning({ id: rideBookings.id });

  return { bookingId: inserted[0]!.id, fareCents: decision.fareCents, status: "pending" as const };
}

export async function updateBookingByDriver(input: { bookingId: number; driverId: number; status: BookingStatus }) {
  const rows = await db()
    .select({ booking: rideBookings, trip: trips })
    .from(rideBookings)
    .innerJoin(trips, eq(rideBookings.tripId, trips.id))
    .where(eq(rideBookings.id, input.bookingId))
    .limit(1);
  const row = rows[0];
  if (!row || row.trip.driverId !== input.driverId) return false;
  if (input.status === "pending") fail("Choose confirmation or cancellation for this request.");

  if (input.status === "confirmed") {
    const trip = await engineTripFor(row.trip.id);
    const bookings = await engineBookings();
    const decision = await callEngine<{ allowed: boolean; reason: string }>("ferry.canConfirm", {
      trip: trip!.engine,
      bookings,
      bookingId: input.bookingId,
    });
    if (!decision.allowed) fail(decision.reason);
    await db().update(rideBookings).set({ status: "confirmed" }).where(eq(rideBookings.id, input.bookingId));
    return true;
  }

  if (row.booking.status !== "pending") fail("Only pending bookings can be confirmed or rejected.");
  await db().update(rideBookings).set({ status: "cancelled" }).where(eq(rideBookings.id, input.bookingId));
  return true;
}

export async function cancelOwnTripBooking(bookingId: number, userId: number) {
  const rows = await db()
    .select({ booking: rideBookings, trip: trips })
    .from(rideBookings)
    .innerJoin(trips, eq(rideBookings.tripId, trips.id))
    .where(and(eq(rideBookings.id, bookingId), eq(rideBookings.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  if (!REQUEST_STATUSES.includes(row.booking.status) || !["scheduled", "boarding"].includes(row.trip.status))
    fail("This booking can no longer be cancelled.");

  await db().update(rideBookings).set({ status: "cancelled" }).where(eq(rideBookings.id, bookingId));
  return true;
}

export async function listTripBookings(input: { tripId?: number; driverId?: number; userId?: number }) {
  return db()
    .select({
      booking: rideBookings,
      trip: trips,
      route: transportRoutes,
      passengerName: users.name,
      passengerUsername: users.username,
    })
    .from(rideBookings)
    .leftJoin(trips, eq(rideBookings.tripId, trips.id))
    .leftJoin(transportRoutes, eq(rideBookings.routeId, transportRoutes.id))
    .leftJoin(users, eq(rideBookings.userId, users.id))
    .where(
      input.tripId
        ? eq(rideBookings.tripId, input.tripId)
        : input.userId
          ? eq(rideBookings.userId, input.userId)
          : input.driverId
            ? eq(trips.driverId, input.driverId)
            : undefined,
    )
    .orderBy(desc(rideBookings.createdAt));
}

// --- maintenance -----------------------------------------------------------

export async function reportVehicleIssue(input: { driverId: number; vehicleId: number; issue: string }) {
  const vehicle = await getVehicle(input.vehicleId);
  if (!vehicle || vehicle.vehicle.driverId !== input.driverId) fail("You can only report issues for your assigned vehicle.");
  const issue = requireText(input.issue, "vehicle issue", 2000);

  return db().transaction(async tx => {
    const inserted = await tx
      .insert(vehicleMaintenance)
      .values({ vehicleId: input.vehicleId, reportedByDriverId: input.driverId, issue, status: "reported" })
      .returning({ id: vehicleMaintenance.id });
    await tx.update(vehicles).set({ maintenanceStatus: "reported", status: "maintenance" }).where(eq(vehicles.id, input.vehicleId));
    return inserted[0]!.id;
  });
}

export async function listVehicleMaintenance(vehicleId?: number) {
  return db()
    .select({ report: vehicleMaintenance, plateNumber: vehicles.plateNumber, driverName: users.name })
    .from(vehicleMaintenance)
    .innerJoin(vehicles, eq(vehicleMaintenance.vehicleId, vehicles.id))
    .leftJoin(users, eq(vehicleMaintenance.reportedByDriverId, users.id))
    .where(vehicleId ? eq(vehicleMaintenance.vehicleId, vehicleId) : undefined)
    .orderBy(desc(vehicleMaintenance.createdAt));
}

export async function resolveVehicleMaintenance(input: { maintenanceId: number; status: MaintenanceStatus; resolutionNote?: string }) {
  const rows = await db().select().from(vehicleMaintenance).where(eq(vehicleMaintenance.id, input.maintenanceId)).limit(1);
  const report = rows[0];
  if (!report) fail("Maintenance record not found.");

  await db().transaction(async tx => {
    await tx
      .update(vehicleMaintenance)
      .set({
        status: input.status,
        resolutionNote: input.resolutionNote?.trim() || null,
        resolvedAt: input.status === "resolved" ? new Date() : null,
      })
      .where(eq(vehicleMaintenance.id, input.maintenanceId));
    if (input.status === "resolved")
      await tx.update(vehicles).set({ maintenanceStatus: "clear", status: "operational" }).where(eq(vehicles.id, report!.vehicleId));
    if (input.status === "in_progress")
      await tx.update(vehicles).set({ maintenanceStatus: "in_service", status: "maintenance" }).where(eq(vehicles.id, report!.vehicleId));
  });
}

// --- driver dashboard ------------------------------------------------------

export async function getDriverDashboard(driverId: number) {
  await ensureDriverProfile(driverId);
  const [profile, vehicleRows, routeRows, tripRows, bookingRows, maintenanceRows] = await Promise.all([
    getDriverProfile(driverId),
    listVehicles(),
    listTransportRoutes(),
    listTrips({ driverId, includeCompleted: true }),
    listTripBookings({ driverId }),
    listVehicleMaintenance(),
  ]);

  const vehicle = vehicleRows.find(row => row.vehicle.driverId === driverId) ?? null;
  return {
    profile,
    vehicle,
    routes: routeRows.filter(row => row.route.driverId === driverId),
    trips: tripRows,
    pendingBookings: bookingRows.filter(row => row.booking.status === "pending"),
    confirmedBookings: bookingRows.filter(row => row.booking.status === "confirmed").length,
    maintenance: vehicle ? maintenanceRows.filter(row => row.report.vehicleId === vehicle.vehicle.id) : [],
  };
}
