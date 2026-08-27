// ===========================================================================
//  seed.ts — starter accounts and demo data.
//
//  Runs automatically the first time the backend starts (SEED_ON_START=true in
//  .env), and can be run by hand at any time:
//
//      npm run seed          (from the backend folder)
//
//  It is safe to run twice: existing accounts are repaired, not duplicated.
//  "Repaired" matters — an account whose password_hash was written by hand
//  (or left as a placeholder) can never match any password, which is the
//  classic cause of "Invalid username or password" on a fresh install.
// ===========================================================================

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { assertSchemaInstalled, closeDatabase, db } from "./database.js";
import { ENV } from "./env.js";
import { hashPassword, isUsableHash } from "./auth.js";
import { foodItems, rideBookings, transactions, transportRoutes, trips, users, vehicles, routeStops, routeMapNodes, routeTimetables, driverProfiles } from "../drizzle/schema.js";
import { addMonths, daysInMonth, yangonMonthKey, yangonWallClockToDate } from "./time.js";
import { yangonDateKey, yangonHour } from "./time.js";

type SeedAccount = { username: string; name: string; email: string; role: "admin" | "agent" | "user" | "driver" };

const ACCOUNTS: SeedAccount[] = [
  { username: "admin", name: "Monday Lin", email: "admin@biten.test", role: "admin" },
  { username: "agent01", name: "Daw Hla Canteen", email: "agent01@biten.test", role: "agent" },
  { username: "agent02", name: "Ko Zaw Canteen", email: "agent02@biten.test", role: "agent" },
  { username: "driver01", name: "U Kyaw Ferry", email: "driver01@biten.test", role: "driver" },
  { username: "student01", name: "Aye Aye", email: "student01@biten.test", role: "user" },
  { username: "student02", name: "Ko Min", email: "student02@biten.test", role: "user" },
  { username: "student03", name: "Su Su", email: "student03@biten.test", role: "user" },
  { username: "student04", name: "Thura Win", email: "student04@biten.test", role: "user" },
  { username: "student05", name: "Nandar Moe", email: "student05@biten.test", role: "user" },
];

const MENU: Array<{ agentIndex: 0 | 1; name: string; description: string; category: string; priceCents: number }> = [
  { agentIndex: 0, name: "Mohinga", description: "Rice noodles in fish broth, the classic breakfast bowl.", category: "Main", priceCents: 1500 },
  { agentIndex: 0, name: "Tea Leaf Salad", description: "Laphet thoke with peanuts, garlic and tomato.", category: "Salad", priceCents: 1200 },
  { agentIndex: 0, name: "Coconut Chicken Noodles", description: "Ohn no khao swè with a boiled egg.", category: "Main", priceCents: 2200 },
  { agentIndex: 0, name: "Iced Milk Tea", description: "Strong, sweet, served over ice.", category: "Drink", priceCents: 800 },
  { agentIndex: 1, name: "Shan Noodles", description: "Tomato-marinated chicken with rice noodles.", category: "Main", priceCents: 1800 },
  { agentIndex: 1, name: "Samosa Salad", description: "Crushed samosa with curry broth and onions.", category: "Salad", priceCents: 1400 },
  { agentIndex: 1, name: "Fried Rice with Egg", description: "Wok-fried rice, spring onion, fried egg on top.", category: "Main", priceCents: 1600 },
  { agentIndex: 1, name: "Lime Soda", description: "Fresh lime, soda water, a little salt.", category: "Drink", priceCents: 900 },
];

async function upsertAccount(account: SeedAccount, password: string) {
  const existing = await db().select().from(users).where(eq(users.username, account.username)).limit(1);
  const found = existing[0];

  if (found) {
    // Repair anything that would stop this account from logging in.
    const patch: Record<string, unknown> = { status: "active", loginMethod: "local" };
    if (!isUsableHash(found.passwordHash)) patch.passwordHash = hashPassword(password);
    if (found.role !== account.role) patch.role = account.role;
    await db().update(users).set(patch).where(eq(users.id, found.id));
    return { id: found.id, created: false };
  }

  const inserted = await db()
    .insert(users)
    .values({
      openId: `local_${nanoid(16)}`,
      username: account.username,
      name: account.name,
      email: account.email,
      passwordHash: hashPassword(password),
      loginMethod: "local",
      role: account.role,
      status: "active",
    })
    .returning({ id: users.id });
  return { id: inserted[0]!.id, created: true };
}

export async function seedDatabase({ quiet = false } = {}) {
  const password = ENV.seedPassword;
  const log = (message: string) => {
    if (!quiet) console.log(`[seed] ${message}`);
  };

  const ids: Record<string, number> = {};
  let created = 0;
  for (const account of ACCOUNTS) {
    const result = await upsertAccount(account, password);
    ids[account.username] = result.id;
    if (result.created) created += 1;
  }
  log(`${created} account(s) created, ${ACCOUNTS.length - created} verified. Password: ${password}`);

  const agentIds = [ids.agent01!, ids.agent02!];
  const driverId = ids.driver01!;
  const adminId = ids.admin!;
  const studentIds = [ids.student01!, ids.student02!, ids.student03!, ids.student04!, ids.student05!];

  await db()
    .insert(driverProfiles)
    .values({ userId: driverId, phone: "+95 9 555 0101", licenseNumber: "YGN-DRV-4471", availability: "available" })
    .onConflictDoNothing();

  // --- menu ---------------------------------------------------------------
  const existingFood = await db().select({ id: foodItems.id }).from(foodItems).limit(1);
  if (!existingFood.length) {
    // Dishes are published (available) only if we are inside the Myanmar
    // pre-order window right now; otherwise they wait for the agent, exactly
    // like real ones do.
    const open = yangonHour() >= 12;
    await db()
      .insert(foodItems)
      .values(
        MENU.map(dish => ({
          agentId: agentIds[dish.agentIndex]!,
          name: dish.name,
          description: dish.description,
          category: dish.category,
          priceCents: dish.priceCents,
          active: open,
          availability: open ? ("available" as const) : ("unavailable" as const),
          availabilityResetDate: yangonDateKey(),
        })),
      );
    log(`${MENU.length} demo dishes added (${open ? "published" : "waiting for the 12:00 PM window"}).`);
  }

  // --- ferry --------------------------------------------------------------
  const existingVehicle = await db().select({ id: vehicles.id }).from(vehicles).limit(1);
  if (!existingVehicle.length) {
    const vehicleRows = await db()
      .insert(vehicles)
      .values({
        driverId,
        plateNumber: "YGN-FERRY-01",
        vehicleType: "Ferry bus",
        model: "Hino Rainbow",
        totalSeats: 18,
        monthlyFeeCents: 45_000,
        status: "operational",
      })
      .returning({ id: vehicles.id });
    const vehicleId = vehicleRows[0]!.id;

    const routeRows = await db()
      .insert(transportRoutes)
      .values({
        name: "North Hall Ferry",
        driverId,
        vehicleId,
        startPoint: "Main Gate",
        destination: "North Hall",
        pickupLocations: "Library, Science Block, Sports Field",
        mapUrl: "https://www.openstreetmap.org/#map=14/16.8409/96.1735",
        mapCoordinates: "16.840900, 96.173500",
        routeLineColor: "#0284C7",
        distanceKm: 7,
        estimatedMinutes: 25,
        // The MONTHLY price of one seat on this road.
        fareCents: 45_000,
        status: "active",
      })
      .returning({ id: transportRoutes.id });
    const routeId = routeRows[0]!.id;

    await db()
      .insert(routeStops)
      .values([
        { routeId, name: "Library", stopOrder: 1 },
        { routeId, name: "Science Block", stopOrder: 2 },
        { routeId, name: "Sports Field", stopOrder: 3 },
      ]);

    // The geographic route line students see on the map. These are real
    // points along real Yangon roads, so OSRM can return a genuine driving
    // path between them instead of a straight line across the city.
    // The driver can move, add or remove them in Route & Map at any time.
    await db()
      .insert(routeMapNodes)
      .values([
        { routeId, name: "Main Gate", latitude: "16.825300", longitude: "96.132900", nodeOrder: 1 },
        { routeId, name: "Library", latitude: "16.830200", longitude: "96.138500", nodeOrder: 2 },
        { routeId, name: "Science Block", latitude: "16.834000", longitude: "96.146700", nodeOrder: 3 },
        { routeId, name: "Sports Field", latitude: "16.842000", longitude: "96.155200", nodeOrder: 4 },
        { routeId, name: "North Hall", latitude: "16.851000", longitude: "96.163100", nodeOrder: 5 },
      ]);

    // The ferry runs to a timetable for the whole month: out in the morning,
    // back in the afternoon, every day. Publishing a timetable is what creates
    // the individual departures, so the seed does exactly what the transport
    // agent's screen does.
    const times = ["05:05", "16:30"];
    const months = [yangonMonthKey(), addMonths(yangonMonthKey(), 1)];
    const now = new Date();
    const departures: Array<{ routeId: number; driverId: number; vehicleId: number; departureAt: Date }> = [];
    for (const month of months) {
      for (let day = 1; day <= daysInMonth(month); day += 1) {
        for (const time of times) {
          const departureAt = yangonWallClockToDate(month, day, time);
          if (departureAt.getTime() > now.getTime()) departures.push({ routeId, driverId, vehicleId, departureAt });
        }
      }
    }
    if (departures.length) await db().insert(trips).values(departures);
    await db()
      .insert(routeTimetables)
      .values(months.map(month => ({ routeId, month, times: times.join(",") })));

    // One student has already asked for a seat next month, so the transport
    // agent's screen has something waiting the first time they sign in.
    await db()
      .insert(rideBookings)
      .values({
        routeId,
        userId: studentIds[0]!,
        month: addMonths(yangonMonthKey(), 1),
        seatCount: 1,
        fareCents: 45_000,
        status: "pending",
      });

    log(`Ferry bus, road, map line, ${departures.length} departures across ${months.length} months, and one waiting seat request added.`);
  }

  // --- opening money ------------------------------------------------------
  const existingMovement = await db().select({ id: transactions.id }).from(transactions).limit(1);
  if (!existingMovement.length) {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    await db()
      .insert(transactions)
      .values([
        { createdById: adminId, agentId: agentIds[0]!, direction: "in", sourceRole: "admin", targetRole: "agent", amountCents: 1_280_000, note: "Opening allocation", occurredAt: new Date(now - 20 * day) },
        { createdById: adminId, agentId: agentIds[1]!, direction: "in", sourceRole: "admin", targetRole: "agent", amountCents: 740_000, note: "Opening allocation", occurredAt: new Date(now - 18 * day) },
        { createdById: agentIds[0]!, agentId: agentIds[0]!, userId: studentIds[0]!, direction: "out", sourceRole: "agent", targetRole: "user", amountCents: 60_000, note: "Wallet top-up", occurredAt: new Date(now - 10 * day) },
        { createdById: agentIds[0]!, agentId: agentIds[0]!, userId: studentIds[1]!, direction: "out", sourceRole: "agent", targetRole: "user", amountCents: 50_000, note: "Wallet top-up", occurredAt: new Date(now - 9 * day) },
        { createdById: agentIds[1]!, agentId: agentIds[1]!, userId: studentIds[2]!, direction: "out", sourceRole: "agent", targetRole: "user", amountCents: 12_000, note: "Wallet top-up", occurredAt: new Date(now - 5 * day) },
        { createdById: agentIds[1]!, agentId: agentIds[1]!, userId: studentIds[3]!, direction: "out", sourceRole: "agent", targetRole: "user", amountCents: 9_000, note: "Wallet top-up", occurredAt: new Date(now - 3 * day) },
      ]);
    log("Opening allocations and student wallet top-ups added.");
  }

  return { accounts: ACCOUNTS.length, created, password };
}

// `npm run seed` runs this file directly.
const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("src/seed.ts") || process.argv[1]?.replace(/\\/g, "/").endsWith("dist/src/seed.js");
if (isDirectRun) {
  assertSchemaInstalled()
    .then(() => seedDatabase())
    .then(result => {
      console.log(`\nDone. Log in with any of these usernames and the password "${result.password}":`);
      console.log("  admin · agent01 · agent02 · driver01 · student01 … student05\n");
      return closeDatabase();
    })
    .catch(async error => {
      console.error("\nSeeding failed:\n", error instanceof Error ? error.message : error, "\n");
      await closeDatabase();
      process.exit(1);
    });
}
