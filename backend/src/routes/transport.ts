// ===========================================================================
//  routes/transport.ts — /transport/*
// ===========================================================================

import { Router } from "express";
import { z } from "zod";
import {
  cancelOwnTripBooking,
  createTransportRoute,
  createTrip,
  createTripBooking,
  createVehicle,
  ensureDriverProfile,
  getDriverDashboard,
  getDriverProfile,
  listDrivers,
  listTransportRoutes,
  listTripBookings,
  listTrips,
  listVehicleMaintenance,
  listVehicles,
  publishOwnFerryRouteMap,
  reportVehicleIssue,
  resolveVehicleMaintenance,
  transitionTripStatus,
  updateBookingByDriver,
  updateOwnDriverProfile,
  updateOwnFerryRoute,
  updateOwnVehicleCapacity,
  updateTransportRoute,
  updateVehicle,
} from "../transport.js";
import { forbidden, parseBody, parseId, requireRole, requireUser, route } from "../http.js";

export const transportRouter = Router();

// --- shared reads ----------------------------------------------------------

transportRouter.get(
  "/routes",
  route(async req => {
    const user = requireUser(req);
    const rows = await listTransportRoutes(user.role === "user");
    return { routes: user.role === "driver" ? rows.filter(row => row.route.driverId === user.id) : rows };
  }),
);

transportRouter.get(
  "/trips",
  route(async req => {
    const user = requireUser(req);
    if (user.role === "driver") return { trips: await listTrips({ driverId: user.id, includeCompleted: true }) };
    if (user.role === "user") return { trips: await listTrips({ userId: user.id }) };
    return { trips: await listTrips({ includeCompleted: true }) };
  }),
);

transportRouter.get(
  "/bookings",
  route(async req => {
    const user = requireUser(req);
    if (user.role === "driver") return { bookings: await listTripBookings({ driverId: user.id }) };
    if (user.role === "user") return { bookings: await listTripBookings({ userId: user.id }) };
    return { bookings: await listTripBookings({}) };
  }),
);

// --- admin -----------------------------------------------------------------

transportRouter.get(
  "/drivers",
  route(async req => {
    requireRole(req, "admin");
    return { drivers: await listDrivers() };
  }),
);

transportRouter.get(
  "/vehicles",
  route(async req => {
    requireRole(req, "admin");
    return { vehicles: await listVehicles() };
  }),
);

transportRouter.get(
  "/maintenance",
  route(async req => {
    requireRole(req, "admin");
    return { maintenance: await listVehicleMaintenance() };
  }),
);

transportRouter.post(
  "/vehicles",
  route(async req => {
    requireRole(req, "admin");
    const input = parseBody(
      z.object({
        plateNumber: z.string().min(2).max(32),
        vehicleType: z.string().min(2).max(80),
        model: z.string().min(1).max(120),
        totalSeats: z.number().int().min(1).max(200),
        monthlyFeeCents: z.number().int().min(0).optional(),
        driverId: z.number().int().positive().optional(),
        status: z.enum(["operational", "unavailable", "maintenance"]).optional(),
      }),
      req.body,
    );
    return { id: await createVehicle(input) };
  }),
);

transportRouter.patch(
  "/vehicles/:id",
  route(async req => {
    requireRole(req, "admin");
    const input = parseBody(
      z.object({
        plateNumber: z.string().min(2).max(32).optional(),
        vehicleType: z.string().min(2).max(80).optional(),
        model: z.string().min(1).max(120).optional(),
        totalSeats: z.number().int().min(1).max(200).optional(),
        monthlyFeeCents: z.number().int().min(0).optional(),
        driverId: z.number().int().positive().nullable().optional(),
        status: z.enum(["operational", "unavailable", "maintenance"]).optional(),
        maintenanceStatus: z.enum(["clear", "reported", "in_service"]).optional(),
      }),
      req.body,
    );
    return { vehicle: await updateVehicle(parseId(req.params.id), input) };
  }),
);

const routeShape = {
  name: z.string().min(2).max(120),
  startPoint: z.string().min(2).max(160),
  destination: z.string().min(2).max(160),
  stops: z.array(z.string().min(2).max(160)).min(1).max(30),
  fareCents: z.number().int().positive(),
  mapUrl: z.string().max(2048).optional(),
  mapCoordinates: z.string().max(128).optional(),
  driverId: z.number().int().positive().optional(),
  vehicleId: z.number().int().positive().optional(),
  distanceKm: z.number().int().positive().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  status: z.enum(["active", "inactive"]).optional(),
};

transportRouter.post(
  "/routes",
  route(async req => {
    requireRole(req, "admin");
    const input = parseBody(z.object(routeShape), req.body);
    return { id: await createTransportRoute(input) };
  }),
);

transportRouter.patch(
  "/routes/:id",
  route(async req => {
    requireRole(req, "admin");
    const input = parseBody(
      z.object({
        name: routeShape.name.optional(),
        startPoint: routeShape.startPoint.optional(),
        destination: routeShape.destination.optional(),
        stops: routeShape.stops.optional(),
        fareCents: routeShape.fareCents.optional(),
        mapUrl: routeShape.mapUrl,
        mapCoordinates: routeShape.mapCoordinates,
        driverId: z.number().int().positive().nullable().optional(),
        vehicleId: z.number().int().positive().nullable().optional(),
        distanceKm: z.number().int().positive().nullable().optional(),
        estimatedMinutes: z.number().int().positive().nullable().optional(),
        status: routeShape.status,
      }),
      req.body,
    );
    return { route: await updateTransportRoute(parseId(req.params.id), input) };
  }),
);

transportRouter.post(
  "/trips",
  route(async req => {
    requireRole(req, "admin");
    const input = parseBody(
      z.object({
        routeId: z.number().int().positive(),
        driverId: z.number().int().positive(),
        vehicleId: z.number().int().positive(),
        departureAt: z.coerce.date(),
      }),
      req.body,
    );
    return { id: await createTrip(input) };
  }),
);

transportRouter.patch(
  "/maintenance/:id",
  route(async req => {
    requireRole(req, "admin");
    const input = parseBody(
      z.object({ status: z.enum(["in_progress", "resolved"]), resolutionNote: z.string().max(2000).optional() }),
      req.body,
    );
    await resolveVehicleMaintenance({ maintenanceId: parseId(req.params.id), ...input });
    return { success: true };
  }),
);

// --- driver (the transport agent) -----------------------------------------

transportRouter.get(
  "/driver/dashboard",
  route(async req => {
    const driver = requireRole(req, "driver");
    return getDriverDashboard(driver.id);
  }),
);

transportRouter.get(
  "/driver/profile",
  route(async req => {
    const driver = requireRole(req, "driver");
    await ensureDriverProfile(driver.id);
    return { profile: await getDriverProfile(driver.id) };
  }),
);

transportRouter.patch(
  "/driver/profile",
  route(async req => {
    const driver = requireRole(req, "driver");
    const input = parseBody(
      z.object({
        phone: z.string().max(32).optional(),
        licenseNumber: z.string().max(80).optional(),
        availability: z.enum(["available", "unavailable"]).optional(),
      }),
      req.body,
    );
    return { profile: await updateOwnDriverProfile(driver.id, input) };
  }),
);

transportRouter.patch(
  "/driver/vehicle-capacity",
  route(async req => {
    const driver = requireRole(req, "driver");
    const input = parseBody(
      z.object({ vehicleId: z.number().int().positive(), totalSeats: z.number().int().min(1).max(200) }),
      req.body,
    );
    const updated = await updateOwnVehicleCapacity(driver.id, input.vehicleId, input.totalSeats);
    if (!updated) throw forbidden("You can only update capacity for your own ferry bus.");
    return { success: true };
  }),
);

transportRouter.patch(
  "/driver/routes/:id",
  route(async req => {
    const driver = requireRole(req, "driver");
    const input = parseBody(
      z.object({
        name: z.string().min(2).max(120).optional(),
        startPoint: z.string().min(2).max(160).optional(),
        destination: z.string().min(2).max(160).optional(),
        stops: z.array(z.string().min(2).max(160)).min(1).max(30).optional(),
        fareCents: z.number().int().positive().optional(),
        mapUrl: z.string().max(2048).optional(),
        mapCoordinates: z.string().max(128).optional(),
        // Measured by OSRM in the driver's route editor (see
        // frontend/src/components/RouteMap.tsx) rather than typed by hand.
        distanceKm: z.number().int().positive().max(2000).optional(),
        estimatedMinutes: z.number().int().positive().max(1440).optional(),
      }),
      req.body,
    );
    const updated = await updateOwnFerryRoute(driver.id, parseId(req.params.id), input);
    if (!updated) throw forbidden("You can only update your own ferry routes.");
    return { success: true };
  }),
);

transportRouter.post(
  "/driver/routes/:id/map",
  route(async req => {
    const driver = requireRole(req, "driver");
    const input = parseBody(
      z.object({
        routeLineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a six-digit route line color."),
        nodes: z
          .array(z.object({ name: z.string().min(2).max(160), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }))
          .min(2)
          .max(50),
      }),
      req.body,
    );
    const published = await publishOwnFerryRouteMap(driver.id, parseId(req.params.id), input);
    if (!published) throw forbidden("You can only publish a map for your own ferry route.");
    return { success: true };
  }),
);

transportRouter.patch(
  "/driver/trips/:id/status",
  route(async req => {
    const driver = requireRole(req, "driver");
    const input = parseBody(z.object({ status: z.enum(["boarding", "in_progress", "completed", "cancelled"]) }), req.body);
    const updated = await transitionTripStatus(parseId(req.params.id), driver.id, input.status);
    if (!updated) throw forbidden("You can only update your own trips.");
    return { success: true };
  }),
);

transportRouter.patch(
  "/driver/bookings/:id",
  route(async req => {
    const driver = requireRole(req, "driver");
    const input = parseBody(z.object({ status: z.enum(["confirmed", "cancelled"]) }), req.body);
    const updated = await updateBookingByDriver({ bookingId: parseId(req.params.id), driverId: driver.id, status: input.status });
    if (!updated) throw forbidden("You can only update bookings for your own trips.");
    return { success: true };
  }),
);

transportRouter.post(
  "/driver/maintenance",
  route(async req => {
    const driver = requireRole(req, "driver");
    const input = parseBody(z.object({ vehicleId: z.number().int().positive(), issue: z.string().min(4).max(2000) }), req.body);
    return { id: await reportVehicleIssue({ driverId: driver.id, ...input }) };
  }),
);

// --- student ---------------------------------------------------------------

transportRouter.post(
  "/bookings",
  route(async req => {
    const student = requireRole(req, "user");
    const input = parseBody(
      z.object({
        tripId: z.number().int().positive(),
        seatCount: z.number().int().min(1).max(8),
        seatNumber: z.string().max(16).optional(),
      }),
      req.body,
    );
    return createTripBooking({ userId: student.id, ...input });
  }),
);

transportRouter.delete(
  "/bookings/:id",
  route(async req => {
    const student = requireRole(req, "user");
    const cancelled = await cancelOwnTripBooking(parseId(req.params.id), student.id);
    if (!cancelled) throw forbidden("You can only cancel your own booking.");
    return { success: true };
  }),
);
