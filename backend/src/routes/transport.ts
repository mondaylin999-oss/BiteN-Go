// ===========================================================================
//  routes/transport.ts — /transport/*
//
//  WHO MAY DO WHAT
//    Transport agent (driver)  owns their ferry completely: the bus, the road
//                              and its map, the seat requests and the
//                              maintenance reports.
//    Administrator             opens and closes accounts (see /cashflow) and
//                              WATCHES transport. Every write below that used
//                              to be admin's now belongs to the agent.
//    Student                   asks for a seat for a whole month, and gives it
//                              back.
// ===========================================================================

import { Router } from "express";
import { z } from "zod";
import {
  closeRoadMonth,
  monthsOnSale,
  cancelOwnMonthlySeat,
  createOwnRoute,
  createOwnVehicle,
  decideMonthlySeat,
  ensureDriverProfile,
  getDriverDashboard,
  getDriverProfile,
  listDrivers,
  listMonthlySeats,
  listRoadMonths,
  listTransportRoutes,
  listVehicleMaintenance,
  listVehicles,
  publishOwnFerryRouteMap,
  reportVehicleIssue,
  requestMonthlySeat,
  resolveVehicleMaintenance,
  updateOwnDriverProfile,
  updateOwnFerryRoute,
  updateOwnVehicleCapacity,
} from "../transport.js";
import { forbidden, parseBody, parseId, requireRole, requireUser, route } from "../http.js";

export const transportRouter = Router();

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month like 2026-09.");

// --- shared reads ----------------------------------------------------------

transportRouter.get(
  "/routes",
  route(async req => {
    const user = requireUser(req);
    const rows = await listTransportRoutes(user.role === "user");
    return { routes: user.role === "driver" ? rows.filter(row => row.route.driverId === user.id) : rows };
  }),
);

/** The months on sale, with the seat position of every road in each. */
transportRouter.get(
  "/roads",
  route(async req => {
    const user = requireUser(req);
    return {
      months: monthsOnSale(),
      roads: await listRoadMonths({ userId: user.role === "user" ? user.id : undefined, activeOnly: user.role === "user" }),
    };
  }),
);

/** Monthly seats: a student sees their own, an agent sees their road's, the
 *  administrator sees all of them. */
transportRouter.get(
  "/seats",
  route(async req => {
    const user = requireUser(req);
    if (user.role === "driver") return { seats: await listMonthlySeats({ driverId: user.id }) };
    if (user.role === "user") return { seats: await listMonthlySeats({ userId: user.id }) };
    return { seats: await listMonthlySeats({}) };
  }),
);

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
    const user = requireUser(req);
    const rows = await listVehicles();
    return { vehicles: user.role === "driver" ? rows.filter(row => row.vehicle.driverId === user.id) : rows };
  }),
);

transportRouter.get(
  "/maintenance",
  route(async req => {
    const user = requireUser(req);
    if (user.role === "admin") return { maintenance: await listVehicleMaintenance() };
    if (user.role === "driver") {
      const rows = await listVehicles();
      const own = rows.find(row => row.vehicle.driverId === user.id);
      return { maintenance: own ? await listVehicleMaintenance(own.vehicle.id) : [] };
    }
    throw forbidden("Maintenance reports are for the transport agent and the office.");
  }),
);

// --- the transport agent's own ferry ---------------------------------------

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

/** Register my ferry bus (once). */
transportRouter.post(
  "/driver/vehicle",
  route(async req => {
    const driver = requireRole(req, "driver");
    const input = parseBody(
      z.object({
        plateNumber: z.string().min(2).max(32),
        vehicleType: z.string().min(2).max(80).optional(),
        model: z.string().min(1).max(120).optional(),
        totalSeats: z.number().int().min(1).max(200),
        monthlyFeeCents: z.number().int().min(0).optional(),
      }),
      req.body,
    );
    return { id: await createOwnVehicle(driver.id, input) };
  }),
);

transportRouter.patch(
  "/driver/vehicle-capacity",
  route(async req => {
    const driver = requireRole(req, "driver");
    const input = parseBody(z.object({ vehicleId: z.number().int().positive(), totalSeats: z.number().int().min(1).max(200) }), req.body);
    const updated = await updateOwnVehicleCapacity(driver.id, input.vehicleId, input.totalSeats);
    if (!updated) throw forbidden("You can only change the seats on your own ferry bus.");
    return { success: true };
  }),
);

/** Open a road of my own. */
transportRouter.post(
  "/driver/routes",
  route(async req => {
    const driver = requireRole(req, "driver");
    const input = parseBody(
      z.object({
        name: z.string().min(2).max(120),
        startPoint: z.string().min(2).max(160),
        destination: z.string().min(2).max(160),
        stops: z.array(z.string().min(2).max(160)).min(1).max(30),
        // The monthly price of one seat on this road.
        fareCents: z.number().int().positive(),
        mapUrl: z.string().max(2048).optional(),
        distanceKm: z.number().int().positive().max(2000).optional(),
        estimatedMinutes: z.number().int().positive().max(1440).optional(),
        // The bus runs these same times every day. There is no departure list.
        morningTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Times look like 06:30.").optional(),
        eveningTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Times look like 06:30.").or(z.literal("")).optional(),
        // The months this road is sold for.
        sellFrom: monthSchema.optional(),
        sellTo: monthSchema.or(z.literal("")).optional(),
      }),
      req.body,
    );
    return { id: await createOwnRoute(driver.id, input) };
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
        status: z.enum(["active", "inactive"]).optional(),
        // Measured by the map (see frontend/src/components/RouteMap.tsx)
        // rather than typed by hand.
        distanceKm: z.number().int().positive().max(2000).optional(),
        estimatedMinutes: z.number().int().positive().max(1440).optional(),
        morningTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Times look like 06:30.").optional(),
        eveningTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Times look like 06:30.").or(z.literal("")).optional(),
        sellFrom: monthSchema.optional(),
        sellTo: monthSchema.or(z.literal("")).optional(),
      }),
      req.body,
    );
    const updated = await updateOwnFerryRoute(driver.id, parseId(req.params.id), input);
    if (!updated) throw forbidden("You can only change your own road.");
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
    if (!published) throw forbidden("You can only publish a map for your own road.");
    return { success: true };
  }),
);

/** Take one month off sale — the agent shortening their own month list. */
transportRouter.delete(
  "/driver/routes/:id/months/:month",
  route(async req => {
    const driver = requireRole(req, "driver");
    const month = monthSchema.parse(String(req.params.month));
    const removed = await closeRoadMonth(driver.id, parseId(req.params.id), month);
    if (!removed) throw forbidden("You can only change your own road.");
    return { success: true };
  }),
);

/** Accept or refuse a student's monthly seat. */
transportRouter.patch(
  "/driver/seats/:id",
  route(async req => {
    const driver = requireRole(req, "driver");
    const input = parseBody(z.object({ status: z.enum(["confirmed", "cancelled"]) }), req.body);
    const updated = await decideMonthlySeat({ passId: parseId(req.params.id), driverId: driver.id, status: input.status });
    if (!updated) throw forbidden("You can only decide seats on your own road.");
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

/** The agent closes off their own maintenance report once the bus is back. */
transportRouter.patch(
  "/driver/maintenance/:id",
  route(async req => {
    requireRole(req, "driver");
    const input = parseBody(z.object({ status: z.enum(["in_progress", "resolved"]), resolutionNote: z.string().max(2000).optional() }), req.body);
    await resolveVehicleMaintenance({ maintenanceId: parseId(req.params.id), ...input });
    return { success: true };
  }),
);

// --- student ---------------------------------------------------------------

/** Ask for one seat on one road for a whole month. */
transportRouter.post(
  "/seats",
  route(async req => {
    const student = requireRole(req, "user");
    const input = parseBody(
      z.object({
        routeId: z.number().int().positive(),
        month: monthSchema,
        seatCount: z.number().int().min(1).max(8),
      }),
      req.body,
    );
    return requestMonthlySeat({ userId: student.id, ...input });
  }),
);

transportRouter.delete(
  "/seats/:id",
  route(async req => {
    const student = requireRole(req, "user");
    const cancelled = await cancelOwnMonthlySeat(parseId(req.params.id), student.id);
    if (!cancelled) throw forbidden("You can only give up your own seat.");
    return { success: true };
  }),
);
