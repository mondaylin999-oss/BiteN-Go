// ===========================================================================
//  drizzle/schema.ts — the TypeScript mirror of database/schema.sql
//
//  database/schema.sql is what actually creates the tables (you run it once in
//  pgAdmin4). This file describes the same tables to Drizzle ORM so the API
//  gets typed queries. If you change one, change the other.
//
//  Naming: PostgreSQL columns are snake_case (nice to read in pgAdmin4), and
//  the TypeScript properties stay camelCase — Drizzle maps between them.
// ===========================================================================

import { boolean, index, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

// --- enums -----------------------------------------------------------------
export const userRole = pgEnum("user_role", ["admin", "agent", "user", "driver"]);
export const accountStatus = pgEnum("account_status", ["active", "inactive"]);
export const flowDirection = pgEnum("flow_direction", ["in", "out"]);
export const foodAvailability = pgEnum("food_availability", ["available", "unavailable", "sold_out"]);
export const orderStatusEnum = pgEnum("order_status", ["pending", "preparing", "ready", "completed", "cancelled"]);
export const paymentMethodEnum = pgEnum("payment_method", ["wallet", "direct_cash"]);
export const paymentStatusEnum = pgEnum("payment_status", ["paid", "awaiting_confirmation"]);
export const vehicleStatusEnum = pgEnum("vehicle_status", ["operational", "unavailable", "maintenance"]);
export const maintenanceFlagEnum = pgEnum("maintenance_flag", ["clear", "reported", "in_service"]);
export const maintenanceStatusEnum = pgEnum("maintenance_status", ["reported", "in_progress", "resolved"]);
export const routeStatusEnum = pgEnum("route_status", ["active", "inactive"]);
export const driverAvailabilityEnum = pgEnum("driver_availability", ["available", "unavailable"]);
export const tripStatusEnum = pgEnum("trip_status", ["scheduled", "boarding", "in_progress", "completed", "cancelled"]);
export const bookingStatusEnum = pgEnum("booking_status", ["pending", "confirmed", "cancelled"]);
export const transportPayStatusEnum = pgEnum("transport_pay_status", ["charged", "refunded"]);

// --- accounts --------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    openId: varchar("open_id", { length: 64 }).notNull().unique(),
    username: varchar("username", { length: 64 }).unique(),
    passwordHash: varchar("password_hash", { length: 255 }),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("login_method", { length: 64 }).default("local"),
    role: userRole("role").notNull().default("user"),
    status: accountStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastSignedIn: timestamp("last_signed_in", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index("users_role_status_idx").on(table.role, table.status)],
);

// --- money -----------------------------------------------------------------
export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    createdById: integer("created_by_id").notNull(),
    agentId: integer("agent_id"),
    userId: integer("user_id"),
    direction: flowDirection("direction").notNull(),
    sourceRole: userRole("source_role").notNull(),
    targetRole: userRole("target_role").notNull(),
    amountCents: integer("amount_cents").notNull(),
    note: text("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index("transactions_agent_idx").on(table.agentId), index("transactions_user_idx").on(table.userId)],
);

// --- canteen ---------------------------------------------------------------
export const foodItems = pgTable(
  "food_items",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 280 }),
    category: varchar("category", { length: 60 }).notNull().default("Main"),
    imageUrl: varchar("image_url", { length: 2048 }),
    priceCents: integer("price_cents").notNull(),
    active: boolean("active").notNull().default(true),
    availability: foodAvailability("availability").notNull().default("available"),
    availabilityResetDate: varchar("availability_reset_date", { length: 10 }).notNull().default("1970-01-01"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index("food_items_agent_idx").on(table.agentId, table.availability)],
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    status: orderStatusEnum("status").notNull().default("pending"),
    totalCents: integer("total_cents").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("wallet"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("paid"),
    pickupNote: varchar("pickup_note", { length: 280 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index("orders_user_idx").on(table.userId), index("orders_status_idx").on(table.status)],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").notNull(),
    foodItemId: integer("food_item_id").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
  },
  table => [index("order_items_order_idx").on(table.orderId)],
);

// --- transport -------------------------------------------------------------
export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").unique(),
  plateNumber: varchar("plate_number", { length: 32 }).unique(),
  vehicleType: varchar("vehicle_type", { length: 80 }).notNull().default("Ferry bus"),
  model: varchar("model", { length: 120 }).notNull().default("Unspecified"),
  totalSeats: integer("total_seats").notNull(),
  monthlyFeeCents: integer("monthly_fee_cents").notNull().default(0),
  status: vehicleStatusEnum("status").notNull().default("operational"),
  maintenanceStatus: maintenanceFlagEnum("maintenance_status").notNull().default("clear"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const driverProfiles = pgTable(
  "driver_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    phone: varchar("phone", { length: 32 }),
    licenseNumber: varchar("license_number", { length: 80 }),
    availability: driverAvailabilityEnum("availability").notNull().default("available"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex("driver_profiles_user_unique").on(table.userId)],
);

export const transportRoutes = pgTable(
  "transport_routes",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull().default("Campus route"),
    driverId: integer("driver_id"),
    vehicleId: integer("vehicle_id"),
    startPoint: varchar("start_point", { length: 160 }).notNull(),
    destination: varchar("destination", { length: 160 }).notNull(),
    pickupLocations: text("pickup_locations").notNull(),
    mapUrl: varchar("map_url", { length: 2048 }),
    mapCoordinates: varchar("map_coordinates", { length: 128 }),
    routeLineColor: varchar("route_line_color", { length: 7 }).notNull().default("#0284C7"),
    distanceKm: integer("distance_km"),
    estimatedMinutes: integer("estimated_minutes"),
    fareCents: integer("fare_cents").notNull(),
    status: routeStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index("transport_routes_driver_idx").on(table.driverId)],
);

export const routeStops = pgTable(
  "route_stops",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    stopOrder: integer("stop_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex("route_stops_route_order_unique").on(table.routeId, table.stopOrder)],
);

export const routeMapNodes = pgTable(
  "route_map_nodes",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    latitude: varchar("latitude", { length: 32 }).notNull(),
    longitude: varchar("longitude", { length: 32 }).notNull(),
    nodeOrder: integer("node_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex("route_map_nodes_route_order_unique").on(table.routeId, table.nodeOrder),
    index("route_map_nodes_route_idx").on(table.routeId),
  ],
);

export const trips = pgTable(
  "trips",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id").notNull(),
    driverId: integer("driver_id").notNull(),
    vehicleId: integer("vehicle_id").notNull(),
    departureAt: timestamp("departure_at", { withTimezone: true }).notNull(),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    status: tripStatusEnum("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index("trips_driver_departure_idx").on(table.driverId, table.departureAt),
    index("trips_route_departure_idx").on(table.routeId, table.departureAt),
  ],
);

export const rideBookings = pgTable(
  "ride_bookings",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id").notNull(),
    tripId: integer("trip_id"),
    userId: integer("user_id").notNull(),
    /** The calendar month this seat is for, 'YYYY-MM' (Myanmar time). */
    month: varchar("month", { length: 7 }).notNull(),
    seatCount: integer("seat_count").notNull().default(1),
    seatNumber: varchar("seat_number", { length: 16 }),
    fareCents: integer("fare_cents").notNull(),
    status: bookingStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index("ride_bookings_trip_idx").on(table.tripId, table.status),
    index("ride_bookings_user_idx").on(table.userId),
    index("ride_bookings_month_idx").on(table.routeId, table.month, table.status),
  ],
);

/**
 * The daily timetable a road runs to for one month. Publishing one creates the
 * `trips` rows for every day of that month.
 */
export const routeTimetables = pgTable(
  "route_timetables",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id").notNull(),
    month: varchar("month", { length: 7 }).notNull(),
    /** 'HH:MM,HH:MM' in Myanmar time, in order. */
    times: text("times").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex("route_timetables_route_month_unique").on(table.routeId, table.month)],
);

export const transportPayments = pgTable(
  "transport_payments",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id").notNull(),
    transactionId: integer("transaction_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: transportPayStatusEnum("status").notNull().default("charged"),
    refundedTransactionId: integer("refunded_transaction_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
  },
  table => [
    uniqueIndex("transport_payments_booking_unique").on(table.bookingId),
    uniqueIndex("transport_payments_transaction_unique").on(table.transactionId),
  ],
);

export const vehicleMaintenance = pgTable(
  "vehicle_maintenance",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id").notNull(),
    reportedByDriverId: integer("reported_by_driver_id").notNull(),
    issue: text("issue").notNull(),
    status: maintenanceStatusEnum("status").notNull().default("reported"),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  table => [index("vehicle_maintenance_vehicle_idx").on(table.vehicleId)],
);

// --- inferred types --------------------------------------------------------
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
export type FoodItem = typeof foodItems.$inferSelect;
export type InsertFoodItem = typeof foodItems.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type TransportRoute = typeof transportRoutes.$inferSelect;
export type RideBooking = typeof rideBookings.$inferSelect;
export type DriverProfile = typeof driverProfiles.$inferSelect;
export type RouteStop = typeof routeStops.$inferSelect;
export type RouteMapNode = typeof routeMapNodes.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type VehicleMaintenance = typeof vehicleMaintenance.$inferSelect;

export type Role = User["role"];
export type Direction = Transaction["direction"];
