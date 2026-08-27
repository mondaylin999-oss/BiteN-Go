// ===========================================================================
//  transport.ts — ferry bus operations.
//
//  Roles: the TRANSPORT AGENT (driver) owns their ferry completely — the bus,
//  the road and its map, the monthly timetable, the seat requests and the
//  maintenance. The ADMIN only opens and closes accounts and watches; they no
//  longer create buses, roads or departures. The STUDENT takes a seat for a
//  whole month.
//
//  THE FERRY IS SOLD BY THE MONTH. A seat is bought once per calendar month
//  and is good for every departure in it; the daily timetable says when the
//  bus runs. Every seat number — taken, free, may-this-be-sold, may-this-be-
//  accepted, how-low-may-capacity-go — is decided by the C++ engine
//  (cpp/src/MonthlyPassPlanner.cpp). This module is the PostgreSQL and money
//  side of it.
// ===========================================================================

import { and, asc, desc, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "./database.js";
import {
  driverProfiles,
  rideBookings,
  routeMapNodes,
  routeStops,
  routeTimetables,
  transportRoutes,
  trips,
  users,
  vehicleMaintenance,
  vehicles,
} from "../drizzle/schema.js";
import { addMonths, daysInMonth, isMonthKey, yangonMonthKey, yangonWallClockToDate } from "./time.js";
import { callEngine, EngineRuleError } from "./engine.js";

/** `users` a second time, for the agent who runs a road: a seat row already
 *  joins `users` once for the passenger. */
const driver = alias(users, "road_driver");

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
  if (!/^https:\/\//i.test(url) || url.length > 2048) fail("Enter a valid https:// map link.");
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
 * A transport agent may resize only their own ferry, and never below the
 * busiest month it is already committed to. The floor is computed by the C++
 * engine (MonthlyPassPlanner::committedSeatsForRoute).
 */
export async function updateOwnVehicleCapacity(driverId: number, vehicleId: number, totalSeats: number) {
  const requestedSeats = assertPositiveInteger(totalSeats, "seat capacity", 200);

  const owned = await db()
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.driverId, driverId)))
    .limit(1);
  if (!owned.length) return false;

  // Every road this bus serves, across every month already sold.
  const roadRows = await db().select({ id: transportRoutes.id }).from(transportRoutes).where(eq(transportRoutes.vehicleId, vehicleId));
  const passes = await enginePasses();
  let committedSeats = 0;
  for (const road of roadRows) {
    const { committedSeats: floor } = await callEngine<{ committedSeats: number }>("ferry.monthCapacityFloor", {
      routeId: road.id,
      passes,
    });
    committedSeats = Math.max(committedSeats, floor);
  }
  if (requestedSeats < committedSeats)
    fail(`Seat capacity cannot go below ${committedSeats} seat${committedSeats === 1 ? "" : "s"} — that is what students have already paid for.`);

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
  // distanceKm / estimatedMinutes come from OSRM in the route editor: the map
  // measures the real driving distance and time, and the driver saves them
  // with the route so students see honest numbers.
  input: {
    name?: string;
    startPoint?: string;
    destination?: string;
    stops?: string[];
    fareCents?: number;
    mapUrl?: string;
    mapCoordinates?: string;
    distanceKm?: number | null;
    estimatedMinutes?: number | null;
  },
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
      // The student pays the agent outside the app, so the phone number has to
      // travel with the road — it is the only way to reach them.
      driverPhone: driverProfiles.phone,
      vehiclePlate: vehicles.plateNumber,
      vehicleSeats: vehicles.totalSeats,
      vehicleStatus: vehicles.status,
    })
    .from(transportRoutes)
    .leftJoin(users, eq(transportRoutes.driverId, users.id))
    .leftJoin(driverProfiles, eq(transportRoutes.driverId, driverProfiles.userId))
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
  // Seats are monthly now, so what matters for a departure is whether the
  // student holds a seat on that ROAD for the month the departure falls in.
  const ownPasses = input.userId
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
      ownPass:
        ownPasses.find(pass => pass.routeId === row.route.id && pass.month === yangonMonthKey(new Date(row.trip.departureAt))) ?? null,
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

// --- monthly seats ---------------------------------------------------------
//
//  The ferry is sold BY THE MONTH. A student asks for one seat on one road for
//  one calendar month, and the transport agent accepts it once.
//
//  NO MONEY MOVES THROUGH THE APP HERE. The student rings the agent on the
//  number shown beside the road and sends the fare the way they always have.
//  The agent holds no balance in BiteN Go, nothing is taken from the student's
//  wallet (that is the canteen wallet), and no cash-flow row is written. The
//  monthly price is what the agent announces, kept on the seat so both sides
//  can see what was agreed.
//
//  Every seat sum is decided by the C++ engine (cpp/src/MonthlyPassPlanner.cpp)
//  — this module is the PostgreSQL side of it.

/** How far ahead an agent may publish a timetable: two years. */
export const MONTHS_PUBLISHABLE = 24;

/**
 * The months an agent is allowed to publish a timetable for: this one and the
 * next two years' worth. The agent picks freely inside that window — a road is
 * on sale for a month only once its timetable exists, so this list is about
 * what the picker offers, not about what students can buy.
 */
export function monthsOnSale(now = new Date()) {
  const current = yangonMonthKey(now);
  return Array.from({ length: MONTHS_PUBLISHABLE }, (_, index) => addMonths(current, index));
}

/** Every monthly seat in the system, in the shape the engine expects. */
async function enginePasses() {
  const rows = await db().select().from(rideBookings);
  return rows.map(row => ({
    id: row.id,
    routeId: row.routeId,
    userId: row.userId,
    seatCount: row.seatCount,
    month: row.month,
    status: row.status,
  }));
}

/** One road considered for one month, in the shape the engine expects. */
function engineRoad(row: { route: { id: number; fareCents: number; status: string }; vehicle: { id: number; driverId: number | null; totalSeats: number; status: string } | null }, month: string) {
  return {
    routeId: row.route.id,
    vehicleId: row.vehicle?.id ?? 0,
    driverId: row.vehicle?.driverId ?? 0,
    totalSeats: row.vehicle?.totalSeats ?? 0,
    monthlyFareCents: row.route.fareCents,
    month,
    routeStatus: row.route.status,
    vehicleStatus: row.vehicle?.status ?? "unavailable",
  };
}

/** Road + its bus, for the seat maths. */
async function roadWithVehicle(routeId: number) {
  const rows = await db()
    .select({ route: transportRoutes, vehicle: vehicles })
    .from(transportRoutes)
    .leftJoin(vehicles, eq(transportRoutes.vehicleId, vehicles.id))
    .where(eq(transportRoutes.id, routeId))
    .limit(1);
  return rows[0];
}

/**
 * What the student sees: every road, with the seat position of each month on
 * sale, the published timetable and this student's own seat.
 */
export async function listRoadMonths(input: { userId?: number; activeOnly?: boolean; now?: Date } = {}) {
  const now = input.now ?? new Date();
  const roads = await listTransportRoutes(input.activeOnly ?? false);
  if (!roads.length) return [];

  const vehicleRows = await db().select().from(vehicles);
  const passes = await enginePasses();
  const timetables = await db().select().from(routeTimetables);
  const current = yangonMonthKey(now);

  /**
   * Which months this road offers. NOT a fixed window: a month is offered
   * because the agent published a timetable for it, so an agent who plans six
   * months ahead sells six months ahead. Months already finished drop off,
   * except one a student still holds a seat in, which stays visible to them.
   */
  const monthsFor = (routeId: number) => {
    const published = timetables.filter(entry => entry.routeId === routeId).map(entry => entry.month);
    const held = passes.filter(pass => pass.routeId === routeId && REQUEST_STATUSES.includes(pass.status as BookingStatus)).map(pass => pass.month);
    return Array.from(new Set([...published, ...held]))
      .filter(month => month >= current)
      .sort();
  };

  const roadMonths = roads.flatMap(road => {
    const vehicle = vehicleRows.find(candidate => candidate.id === road.route.vehicleId) ?? null;
    return monthsFor(road.route.id).map(month => engineRoad({ route: road.route, vehicle }, month));
  });

  const { roads: plan } = await callEngine<{
    roads: Array<{ routeId: number; month: string; totalSeats: number; occupiedSeats: number; pendingSeats: number; availableSeats: number; loadPercent: number; sellable: boolean }>;
  }>("ferry.planMonth", { roads: roadMonths, passes });

  const ownPasses = input.userId
    ? await db().select().from(rideBookings).where(and(eq(rideBookings.userId, input.userId), inArray(rideBookings.status, REQUEST_STATUSES)))
    : [];

  const currentMonth = current;

  return roads.map(road => {
    const vehicle = vehicleRows.find(candidate => candidate.id === road.route.vehicleId) ?? null;
    return {
      ...road,
      vehicle,
      months: monthsFor(road.route.id).map(month => {
        const seats = plan.find(entry => entry.routeId === road.route.id && entry.month === month);
        return {
          month,
          totalSeats: seats?.totalSeats ?? vehicle?.totalSeats ?? 0,
          occupiedSeats: seats?.occupiedSeats ?? 0,
          pendingSeats: seats?.pendingSeats ?? 0,
          availableSeats: seats?.availableSeats ?? 0,
          loadPercent: seats?.loadPercent ?? 0,
          // A month already gone is never sellable, whatever the seat count.
          sellable: (seats?.sellable ?? false) && month >= currentMonth,
          timetable: timetables.find(entry => entry.routeId === road.route.id && entry.month === month)?.times ?? "",
          ownPass: ownPasses.find(pass => pass.routeId === road.route.id && pass.month === month) ?? null,
        };
      }),
    };
  });
}

export async function requestMonthlySeat(input: { routeId: number; userId: number; month: string; seatCount: number }) {
  if (!isMonthKey(input.month)) fail("Choose a month.");
  const road = await roadWithVehicle(input.routeId);
  if (!road) fail("That road does not exist.");
  if (!road!.vehicle) fail("This road has no ferry bus assigned yet.");

  const passes = await enginePasses();
  const decision = await callEngine<{ allowed: boolean; reason: string; fareCents: number; availableSeats: number }>("ferry.canRequestMonth", {
    road: engineRoad(road!, input.month),
    passes,
    userId: input.userId,
    seatCount: input.seatCount,
    currentMonth: yangonMonthKey(),
  });
  if (!decision.allowed) fail(decision.reason);

  const inserted = await db()
    .insert(rideBookings)
    .values({
      routeId: input.routeId,
      tripId: null,
      userId: input.userId,
      month: input.month,
      seatCount: input.seatCount,
      fareCents: decision.fareCents,
      status: "pending",
    })
    .returning({ id: rideBookings.id });

  return { passId: inserted[0]!.id, fareCents: decision.fareCents, month: input.month, status: "pending" as const };
}

/**
 * The transport agent accepts or refuses a request.
 *
 * NO MONEY MOVES HERE. The ferry fare is settled between the student and the
 * agent outside this app: the student rings the number on the road's card and
 * sends the money the way they always have. The agent then accepts, and
 * accepting is purely "yes, this seat is yours for that month". The app never
 * holds, moves or counts ferry money, and an agent has no balance in it.
 */
export async function decideMonthlySeat(input: { passId: number; driverId: number; status: "confirmed" | "cancelled" }) {
  const rows = await db()
    .select({ pass: rideBookings, route: transportRoutes })
    .from(rideBookings)
    .innerJoin(transportRoutes, eq(rideBookings.routeId, transportRoutes.id))
    .where(eq(rideBookings.id, input.passId))
    .limit(1);
  const row = rows[0];
  if (!row || row.route.driverId !== input.driverId) return false;

  if (input.status === "cancelled") {
    if (row.pass.status === "cancelled") fail("That request was already cancelled.");
    await db().update(rideBookings).set({ status: "cancelled" }).where(eq(rideBookings.id, input.passId));
    return true;
  }

  const road = await roadWithVehicle(row.route.id);
  const passes = await enginePasses();
  const decision = await callEngine<{ allowed: boolean; reason: string; fareCents: number }>("ferry.canAcceptMonth", {
    road: engineRoad(road!, row.pass.month),
    passes,
    passId: input.passId,
  });
  if (!decision.allowed) fail(decision.reason);

  // The fare is recorded on the seat so both sides can see what was agreed,
  // but nothing is taken from anybody's wallet — see the note above.
  await db().update(rideBookings).set({ status: "confirmed", fareCents: decision.fareCents }).where(eq(rideBookings.id, input.passId));
  return true;
}

/** A student gives up their own seat. */
export async function cancelOwnMonthlySeat(passId: number, userId: number) {
  const rows = await db()
    .select({ pass: rideBookings, route: transportRoutes })
    .from(rideBookings)
    .innerJoin(transportRoutes, eq(rideBookings.routeId, transportRoutes.id))
    .where(and(eq(rideBookings.id, passId), eq(rideBookings.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  if (!REQUEST_STATUSES.includes(row.pass.status)) fail("That seat is already cancelled.");

  const currentMonth = yangonMonthKey();
  if (row.pass.month < currentMonth) fail("That month has already finished.");

  // Nothing to refund: the app never took the fare. Any money already sent to
  // the agent is settled between the two of them, as it was paid.
  await db().update(rideBookings).set({ status: "cancelled" }).where(eq(rideBookings.id, passId));
  return true;
}

export async function listMonthlySeats(input: { routeId?: number; driverId?: number; userId?: number; month?: string }) {
  const conditions = [];
  if (input.routeId) conditions.push(eq(rideBookings.routeId, input.routeId));
  if (input.userId) conditions.push(eq(rideBookings.userId, input.userId));
  if (input.month) conditions.push(eq(rideBookings.month, input.month));
  if (input.driverId) conditions.push(eq(transportRoutes.driverId, input.driverId));

  return db()
    .select({
      pass: rideBookings,
      route: transportRoutes,
      passengerName: users.name,
      passengerUsername: users.username,
      // Shown on the student's pass: who to ring about this seat.
      driverName: driver.name,
      driverPhone: driverProfiles.phone,
    })
    .from(rideBookings)
    .innerJoin(transportRoutes, eq(rideBookings.routeId, transportRoutes.id))
    .leftJoin(users, eq(rideBookings.userId, users.id))
    .leftJoin(driver, eq(transportRoutes.driverId, driver.id))
    .leftJoin(driverProfiles, eq(transportRoutes.driverId, driverProfiles.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(rideBookings.createdAt));
}

// --- the monthly timetable -------------------------------------------------

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The timetable rows a road has published, newest month first. */
export async function listTimetables(routeId?: number) {
  return db()
    .select()
    .from(routeTimetables)
    .where(routeId ? eq(routeTimetables.routeId, routeId) : undefined)
    .orderBy(desc(routeTimetables.month));
}

/**
 * The agent publishes the daily times their bus runs for a whole month, and
 * the system writes a departure for every day of that month. Re-publishing the
 * same month replaces the departures that have not happened yet and leaves the
 * ones already run (or already cancelled) untouched.
 */
export async function publishTimetable(driverId: number, routeId: number, input: { month: string; times: string[] }) {
  if (!isMonthKey(input.month)) fail("Choose a month.");
  const currentMonth = yangonMonthKey();
  if (input.month < currentMonth) fail("That month has already finished.");
  if (input.month > addMonths(currentMonth, MONTHS_PUBLISHABLE - 1)) fail("Publish a timetable up to two years ahead.");

  const times = Array.from(new Set(input.times.map(time => time.trim()))).sort();
  if (!times.length) fail("Add at least one departure time.");
  if (times.length > 6) fail("Up to six departures a day.");
  for (const time of times) if (!TIME_PATTERN.test(time)) fail(`"${time}" is not a time like 05:05.`);

  const road = await roadWithVehicle(routeId);
  if (!road || road.route.driverId !== driverId) return false;
  if (!road.vehicle) fail("Add your ferry bus before publishing a timetable.");

  const now = new Date();
  const days = daysInMonth(input.month);
  const departures: Array<{ routeId: number; driverId: number; vehicleId: number; departureAt: Date }> = [];
  for (let day = 1; day <= days; day += 1) {
    for (const time of times) {
      const departureAt = yangonWallClockToDate(input.month, day, time);
      if (departureAt.getTime() <= now.getTime()) continue; // today's earlier runs are in the past
      departures.push({ routeId, driverId, vehicleId: road.vehicle!.id, departureAt });
    }
  }

  const monthStart = yangonWallClockToDate(input.month, 1, "00:00");
  const monthEnd = yangonWallClockToDate(addMonths(input.month, 1), 1, "00:00");

  await db().transaction(async tx => {
    // Only untouched, still-to-come departures are replaced.
    await tx
      .delete(trips)
      .where(
        and(
          eq(trips.routeId, routeId),
          eq(trips.status, "scheduled"),
          gte(trips.departureAt, monthStart),
          lt(trips.departureAt, monthEnd),
          gt(trips.departureAt, now),
        ),
      );
    if (departures.length) await tx.insert(trips).values(departures);

    const existing = await tx
      .select({ id: routeTimetables.id })
      .from(routeTimetables)
      .where(and(eq(routeTimetables.routeId, routeId), eq(routeTimetables.month, input.month)))
      .limit(1);
    if (existing[0]) await tx.update(routeTimetables).set({ times: times.join(",") }).where(eq(routeTimetables.id, existing[0].id));
    else await tx.insert(routeTimetables).values({ routeId, month: input.month, times: times.join(",") });
  });

  return { month: input.month, times, departuresCreated: departures.length };
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

// --- the agent's own ferry and road ----------------------------------------
//
//  The administrator only opens and closes accounts, so a transport agent sets
//  up their own ferry bus and their own road the first time they sign in.

/** The agent registers their ferry bus. One bus per agent. */
export async function createOwnVehicle(
  driverId: number,
  input: { plateNumber: string; vehicleType?: string; model?: string; totalSeats: number; monthlyFeeCents?: number },
) {
  const existing = await db().select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.driverId, driverId)).limit(1);
  if (existing.length) fail("You already have a ferry bus. Edit the one you have instead.");

  return createVehicle({
    plateNumber: input.plateNumber,
    vehicleType: input.vehicleType ?? "Ferry bus",
    model: input.model ?? "Unspecified",
    totalSeats: input.totalSeats,
    monthlyFeeCents: input.monthlyFeeCents,
    driverId,
  });
}

/** The agent opens a road of their own, served by their own bus. */
export async function createOwnRoute(
  driverId: number,
  input: { name: string; startPoint: string; destination: string; stops: string[]; fareCents: number; mapUrl?: string; distanceKm?: number; estimatedMinutes?: number },
) {
  const busRows = await db().select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.driverId, driverId)).limit(1);
  const bus = busRows[0];
  if (!bus) fail("Register your ferry bus first — a road needs a bus to carry it.");

  return createTransportRoute({ ...input, driverId, vehicleId: bus!.id });
}

// --- driver dashboard ------------------------------------------------------

export async function getDriverDashboard(driverId: number) {
  await ensureDriverProfile(driverId);
  const [profile, vehicleRows, routeRows, tripRows, bookingRows, maintenanceRows] = await Promise.all([
    getDriverProfile(driverId),
    listVehicles(),
    listTransportRoutes(),
    listTrips({ driverId, includeCompleted: true }),
    listMonthlySeats({ driverId }),
    listVehicleMaintenance(),
  ]);

  const vehicle = vehicleRows.find(row => row.vehicle.driverId === driverId) ?? null;
  return {
    profile,
    vehicle,
    routes: routeRows.filter(row => row.route.driverId === driverId),
    trips: tripRows,
    pendingBookings: bookingRows.filter(row => row.pass.status === "pending"),
    confirmedBookings: bookingRows.filter(row => row.pass.status === "confirmed").length,
    maintenance: vehicle ? maintenanceRows.filter(row => row.report.vehicleId === vehicle.vehicle.id) : [],
  };
}
