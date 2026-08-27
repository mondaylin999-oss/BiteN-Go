// ===========================================================================
//  engine.ts — the bridge between the Node API and the C++ domain engine.
//
//  BiteN Go keeps its decision rules in C++ (backend/cpp). Anything that
//  decides money, seats, kitchen order or the pre-order window is asked of
//  the compiled engine:
//
//      Node  ──JSON on stdin──►  biten_engine <command>  ──JSON on stdout──►  Node
//
//  Build it once with  bash cpp/build.sh  (or cpp\build.bat on Windows).
//
//  FALLBACK
//  --------
//  If the binary has not been compiled yet, this module runs an equivalent
//  TypeScript implementation of the same rules, so the app never breaks
//  before a compiler is installed — the same approach GameBuddy uses for its
//  C++ matchmaking module. GET /health tells you which one is live, and
//  setting BITEN_ENGINE_REQUIRED=true in .env turns a missing binary into a
//  hard startup error instead.
// ===========================================================================

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV } from "./env.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const cppRoot = path.resolve(here, "..", "cpp");

const CANDIDATES = [
  ENV.enginePath,
  path.join(cppRoot, "build", "biten_engine"),
  path.join(cppRoot, "build", "biten_engine.exe"),
  path.join(cppRoot, "build", "Release", "biten_engine.exe"),
  path.join(cppRoot, "build", "Debug", "biten_engine.exe"),
].filter(Boolean) as string[];

export type EngineMode = "c++" | "typescript";

let cachedBinary: string | null | undefined;

export function enginePath(): string | null {
  if (cachedBinary === undefined) cachedBinary = CANDIDATES.find(candidate => existsSync(candidate)) ?? null;
  return cachedBinary;
}

export function engineMode(): EngineMode {
  return enginePath() ? "c++" : "typescript";
}

/** Forget the cached lookup — used after a build, and by the tests. */
export function refreshEngine() {
  cachedBinary = undefined;
}

/** Thrown when the engine says a rule was broken (ok:false). Maps to HTTP 400. */
export class EngineRuleError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "EngineRuleError";
  }
}

function runBinary(binary: string, command: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [command], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`C++ engine timed out running "${command}".`));
    }, 10_000);

    child.stdout.on("data", chunk => (stdout += chunk));
    child.stderr.on("data", chunk => (stderr += chunk));
    child.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", code => {
      clearTimeout(timer);
      if (!stdout.trim()) {
        reject(new Error(`C++ engine produced no output for "${command}" (exit ${code}). ${stderr.trim()}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { ok: boolean; result?: unknown; error?: string };
        if (!parsed.ok) {
          reject(new EngineRuleError(parsed.error ?? "The request was refused by the engine."));
          return;
        }
        resolve(parsed.result);
      } catch (error) {
        reject(new Error(`C++ engine returned malformed JSON for "${command}": ${String(error)}`));
      }
    });

    child.stdin.write(JSON.stringify(payload ?? {}));
    child.stdin.end();
  });
}

/**
 * Run one engine command. Uses the C++ binary when it exists, otherwise the
 * TypeScript twin below. A broken *rule* (EngineRuleError) is never retried in
 * the fallback — only a broken *process* is.
 */
export async function callEngine<T>(command: EngineCommand, payload: Record<string, unknown> = {}): Promise<T> {
  const binary = enginePath();
  if (binary) {
    try {
      return (await runBinary(binary, command, payload)) as T;
    } catch (error) {
      if (error instanceof EngineRuleError) throw error;
      console.warn(`[engine] C++ call "${command}" failed (${String(error)}) — using the TypeScript fallback.`);
      cachedBinary = null;
    }
  }
  return fallback<T>(command, payload);
}

// ===========================================================================
//  TypeScript twin of the C++ rules.
//  Keep this in step with backend/cpp/src/*.cpp — the unit tests in
//  cpp/tests/engine_tests.cpp document the expected numbers.
// ===========================================================================

export type EngineCommand =
  | "info"
  | "canteen.window"
  | "canteen.quote"
  | "canteen.publishGuard"
  | "cashflow.summary"
  | "cashflow.history"
  | "cashflow.monthly"
  | "cashflow.agents"
  | "ferry.plan"
  | "ferry.canRequest"
  | "ferry.canConfirm"
  | "ferry.capacityFloor"
  | "ferry.planMonth"
  | "ferry.canRequestMonth"
  | "ferry.canAcceptMonth"
  | "ferry.monthCapacityFloor"
  | "kds.board"
  | "kds.canAdvance";

type Row = Record<string, any>;

const asList = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);

/** Seats held on one road, in one month, with one status. */
const passSeats = (passes: Row[], routeId: unknown, month: unknown, status: string) =>
  passes
    .filter(pass => Number(pass.routeId) === Number(routeId) && pass.month === month && pass.status === status)
    .reduce((sum, pass) => sum + Number(pass.seatCount ?? 1), 0);
const monthKey = (occurredAt: string) => (occurredAt ?? "").slice(0, 7) || "0000-00";

function fallback<T>(command: EngineCommand, payload: Record<string, any>): T {
  switch (command) {
    case "info":
      return { engine: "typescript", version: "1.0.0", commands: [] } as T;

    case "canteen.window": {
      const open = payload.yangonHour >= 12 && payload.yangonHour <= 23;
      return {
        orderingOpen: open,
        message: open
          ? "Pre-orders are open until 12:00 AM for tomorrow's food."
          : "Pre-orders are closed from 12:00 AM to 12:00 PM Myanmar time.",
      } as T;
    }

    case "canteen.publishGuard": {
      if (!(payload.yangonHour >= 12 && payload.yangonHour <= 23))
        throw new EngineRuleError("Food can be made available only from 12:00 PM Myanmar time for tomorrow's pre-orders.");
      return { allowed: true } as T;
    }

    case "canteen.quote": {
      if (!(payload.yangonHour >= 12 && payload.yangonHour <= 23))
        throw new EngineRuleError("Pre-orders open at 12:00 PM Myanmar time and close at 12:00 AM.");
      const menu = asList(payload.menu);
      const basket = asList(payload.basket);
      if (!basket.length) throw new EngineRuleError("Add at least one item to the basket.");

      const agents = new Set<number>();
      const lines: Row[] = [];
      let totalCents = 0;
      let itemCount = 0;

      for (const line of basket) {
        const quantity = Number(line.quantity ?? 0);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20)
          throw new EngineRuleError("Choose between 1 and 20 of each item.");
        const item = menu.find(candidate => Number(candidate.id) === Number(line.foodItemId));
        if (!item) throw new EngineRuleError("One or more selected food items are unavailable.");
        if (item.availability !== "available") throw new EngineRuleError(`${item.name} is no longer available today.`);
        if (Number(item.priceCents) <= 0) throw new EngineRuleError(`${item.name} has no published price.`);

        agents.add(Number(item.agentId));
        if (agents.size > 1) throw new EngineRuleError("Choose items from one agent at a time.");

        const lineTotalCents = Number(item.priceCents) * quantity;
        totalCents += lineTotalCents;
        itemCount += quantity;
        lines.push({ foodItemId: Number(item.id), name: item.name, quantity, unitPriceCents: Number(item.priceCents), lineTotalCents });
      }

      const paymentMethod = payload.paymentMethod ?? "wallet";
      if (paymentMethod === "wallet" && payload.walletBalanceCents !== undefined && Number(payload.walletBalanceCents) < totalCents)
        throw new EngineRuleError("Insufficient wallet balance for this order.");

      return { agentId: [...agents][0], totalCents, itemCount, paymentMethod, lines } as T;
    }

    case "cashflow.summary": {
      const role = payload.role as string;
      const rows = asList(payload.rows);
      const downstream = asList(payload.downstream);
      const received = rows.filter(row => row.direction === "in").reduce((sum, row) => sum + Number(row.amountCents), 0);
      const paidOut = rows.filter(row => row.direction === "out").reduce((sum, row) => sum + Number(row.amountCents), 0);

      if (role === "driver")
        return { received: 0, paidOut: 0, balance: 0, profit: 0, profitPercentage: 0, downstreamPaidOut: 0, fundingTransfers: 0 } as T;

      if (role === "user") {
        const credited = rows.filter(row => row.targetRole === "user").reduce((sum, row) => sum + Number(row.amountCents), 0);
        const spent = rows.filter(row => row.sourceRole === "user").reduce((sum, row) => sum + Number(row.amountCents), 0);
        return {
          received: credited,
          paidOut: spent,
          balance: credited - spent,
          profit: credited - spent,
          profitPercentage: 0,
          downstreamPaidOut: 0,
          fundingTransfers: 0,
        } as T;
      }

      if (role === "agent") {
        return {
          received,
          paidOut,
          balance: received - paidOut,
          profit: received - paidOut,
          profitPercentage: received ? ((received - paidOut) / received) * 100 : 0,
          downstreamPaidOut: 0,
          fundingTransfers: rows.filter(row => row.direction === "in").length,
        } as T;
      }

      const downstreamPaidOut = downstream
        .filter(row => row.direction === "out" && row.sourceRole === "agent")
        .reduce((sum, row) => sum + Number(row.amountCents), 0);
      const balance = received - downstreamPaidOut;
      return {
        received,
        paidOut,
        balance,
        profit: balance,
        profitPercentage: received ? (balance / received) * 100 : 0,
        downstreamPaidOut,
        fundingTransfers: 0,
      } as T;
    }

    case "cashflow.history": {
      const rows = [...asList(payload.rows)].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));
      let running = 0;
      const ledger = rows.map(row => {
        running += row.direction === "in" ? Number(row.amountCents) : -Number(row.amountCents);
        return { id: Number(row.id), balanceAfter: running };
      });
      const walletBalance = asList(payload.rows).reduce(
        (sum, row) => sum + (row.targetRole === "user" ? Number(row.amountCents) : row.sourceRole === "user" ? -Number(row.amountCents) : 0),
        0,
      );
      return { ledger, walletBalance } as T;
    }

    case "cashflow.monthly": {
      const role = payload.role as string;
      const buckets = new Map<string, Row>();
      const bucketFor = (key: string) => {
        if (!buckets.has(key))
          buckets.set(key, { month: key, invested: 0, returned: 0, downstreamPaidOut: 0, fundingTransfers: 0, payoutTransfers: 0 });
        return buckets.get(key)!;
      };

      for (const row of asList(payload.rows)) {
        const bucket = bucketFor(monthKey(row.occurredAt));
        const amount = Number(row.amountCents);
        if (role === "user") {
          if (row.targetRole === "user") bucket.invested += amount;
          else bucket.returned += amount;
        } else if (row.direction === "in") {
          bucket.invested += amount;
          if (role === "agent") bucket.fundingTransfers += 1;
        } else {
          bucket.returned += amount;
          if (role === "agent") bucket.payoutTransfers += 1;
        }
      }

      if (role === "admin") {
        for (const row of asList(payload.downstream)) {
          if (row.direction !== "out" || row.sourceRole !== "agent") continue;
          bucketFor(monthKey(row.occurredAt)).downstreamPaidOut += Number(row.amountCents);
        }
      }

      const months = [...buckets.values()]
        .map((bucket: Row) => ({ ...bucket, profit: Number(bucket.invested) - Number(bucket.returned) }))
        .sort((left: Row, right: Row) => String(right.month).localeCompare(String(left.month)));
      return { months } as T;
    }

    case "cashflow.agents": {
      const rows = asList(payload.rows);
      const agents = (payload.agentIds as number[]).map(agentId => {
        const mine = rows.filter(row => Number(row.agentId) === Number(agentId));
        const allocated = mine.filter(row => row.direction === "in").reduce((sum, row) => sum + Number(row.amountCents), 0);
        const disbursed = mine.filter(row => row.direction === "out").reduce((sum, row) => sum + Number(row.amountCents), 0);
        return { agentId, allocated, disbursed, balance: allocated - disbursed };
      });
      return { agents } as T;
    }

    case "ferry.plan": {
      const bookings = asList(payload.bookings);
      const trips = asList(payload.trips).map(trip => {
        const occupiedSeats = seatsWithStatus(bookings, trip.tripId, "confirmed");
        const pendingSeats = seatsWithStatus(bookings, trip.tripId, "pending");
        const availableSeats = Math.max(0, Number(trip.totalSeats) - occupiedSeats);
        return {
          tripId: Number(trip.tripId),
          totalSeats: Number(trip.totalSeats),
          occupiedSeats,
          pendingSeats,
          availableSeats,
          loadPercent: Number(trip.totalSeats) ? (occupiedSeats * 100) / Number(trip.totalSeats) : 0,
          bookable: isBookable(trip) && availableSeats > 0,
        };
      });
      return { trips } as T;
    }

    case "ferry.canRequest": {
      const trip = payload.trip as Row;
      const bookings = asList(payload.bookings);
      const seatCount = Number(payload.seatCount ?? 1);
      const fareCents = Number(trip.fareCents) * Math.max(0, seatCount);
      const occupied = seatsWithStatus(bookings, trip.tripId, "confirmed");
      const availableSeats = Math.max(0, Number(trip.totalSeats) - occupied);

      if (seatCount < 1 || seatCount > 8) return { allowed: false, reason: "Request between 1 and 8 seats.", fareCents, availableSeats: 0 } as T;
      if (!isBookable(trip)) return { allowed: false, reason: "This trip is not available for booking.", fareCents, availableSeats: 0 } as T;
      if (bookings.some(booking => Number(booking.tripId) === Number(trip.tripId) && Number(booking.userId) === Number(payload.userId) && ["pending", "confirmed"].includes(booking.status)))
        return { allowed: false, reason: "You already have an active booking for this trip.", fareCents, availableSeats: 0 } as T;
      if (availableSeats <= 0) return { allowed: false, reason: "There are no seats remaining on this trip.", fareCents, availableSeats } as T;
      if (seatCount > availableSeats)
        return { allowed: false, reason: "This request exceeds the currently available ferry seats.", fareCents, availableSeats } as T;
      return { allowed: true, reason: "", fareCents, availableSeats } as T;
    }

    case "ferry.canConfirm": {
      const trip = payload.trip as Row;
      const bookings = asList(payload.bookings);
      const booking = bookings.find(candidate => Number(candidate.id) === Number(payload.bookingId));
      if (!booking) return { allowed: false, reason: "Booking request was not found.", fareCents: 0, availableSeats: 0 } as T;
      if (booking.status !== "pending")
        return { allowed: false, reason: "Only pending bookings can be confirmed or rejected.", fareCents: 0, availableSeats: 0 } as T;
      const occupied = seatsWithStatus(bookings, trip.tripId, "confirmed");
      const availableSeats = Math.max(0, Number(trip.totalSeats) - occupied);
      const fareCents = Number(booking.seatCount) * Number(trip.fareCents);
      if (occupied + Number(booking.seatCount) > Number(trip.totalSeats))
        return { allowed: false, reason: "This request cannot be accepted because the ferry bus is full.", fareCents, availableSeats } as T;
      return { allowed: true, reason: "", fareCents, availableSeats } as T;
    }

    case "ferry.capacityFloor": {
      const bookings = asList(payload.bookings);
      const committedSeats = asList(payload.trips)
        .filter(trip => Number(trip.vehicleId) === Number(payload.vehicleId) && ["scheduled", "boarding", "in_progress"].includes(trip.status))
        .reduce((sum, trip) => sum + seatsWithStatus(bookings, trip.tripId, "confirmed"), 0);
      return { committedSeats } as T;
    }

    // ---- the ferry sold by the month -------------------------------------
    // Twin of cpp/src/MonthlyPassPlanner.cpp. A pending request holds no seat;
    // each calendar month is counted on its own.

    case "ferry.planMonth": {
      const passes = asList(payload.passes);
      const roads = asList(payload.roads).map(road => {
        const occupiedSeats = passSeats(passes, road.routeId, road.month, "confirmed");
        const pendingSeats = passSeats(passes, road.routeId, road.month, "pending");
        const availableSeats = Math.max(0, Number(road.totalSeats) - occupiedSeats);
        return {
          routeId: Number(road.routeId),
          month: String(road.month ?? ""),
          totalSeats: Number(road.totalSeats),
          occupiedSeats,
          pendingSeats,
          availableSeats,
          loadPercent: Number(road.totalSeats) ? (occupiedSeats * 100) / Number(road.totalSeats) : 0,
          sellable: road.routeStatus === "active" && road.vehicleStatus === "operational" && availableSeats > 0,
        };
      });
      return { roads } as T;
    }

    case "ferry.canRequestMonth": {
      const road = payload.road as Row;
      const passes = asList(payload.passes);
      const seatCount = Number(payload.seatCount ?? 1);
      const currentMonth = String(payload.currentMonth ?? "");
      const fareCents = Number(road.monthlyFareCents) * Math.max(0, seatCount);
      const occupied = passSeats(passes, road.routeId, road.month, "confirmed");
      const availableSeats = Math.max(0, Number(road.totalSeats) - occupied);
      const no = (reason: string) => ({ allowed: false, reason, fareCents, availableSeats }) as T;

      if (seatCount < 1 || seatCount > 8) return no("Ask for between 1 and 8 seats.");
      if (String(road.month ?? "").length !== 7) return no("Choose a month.");
      if (currentMonth && String(road.month) < currentMonth) return no("That month has already finished.");
      if (road.routeStatus !== "active") return no("This road is not running at the moment.");
      if (road.vehicleStatus !== "operational") return no("The ferry bus on this road is not in service.");
      if (
        passes.some(
          pass =>
            Number(pass.routeId) === Number(road.routeId) &&
            Number(pass.userId) === Number(payload.userId) &&
            pass.month === road.month &&
            ["pending", "confirmed"].includes(pass.status),
        )
      )
        return no("You already have a seat on this road for that month.");
      if (availableSeats <= 0) return no("Every seat on this road is taken for that month.");
      if (seatCount > availableSeats) return no("That is more seats than are left for that month.");
      return { allowed: true, reason: "ok", fareCents, availableSeats } as T;
    }

    case "ferry.canAcceptMonth": {
      const road = payload.road as Row;
      const passes = asList(payload.passes);
      const pass = passes.find(candidate => Number(candidate.id) === Number(payload.passId));
      if (!pass) return { allowed: false, reason: "That request no longer exists.", fareCents: 0, availableSeats: 0 } as T;
      if (pass.status !== "pending") return { allowed: false, reason: "Only a waiting request can be accepted.", fareCents: 0, availableSeats: 0 } as T;
      const occupied = passSeats(passes, road.routeId, pass.month, "confirmed");
      const availableSeats = Math.max(0, Number(road.totalSeats) - occupied);
      const fareCents = Number(road.monthlyFareCents) * Number(pass.seatCount);
      if (Number(pass.seatCount) > availableSeats)
        return { allowed: false, reason: "Accepting this would put more students on the bus than it has seats.", fareCents, availableSeats } as T;
      return { allowed: true, reason: "ok", fareCents, availableSeats } as T;
    }

    case "ferry.monthCapacityFloor": {
      const passes = asList(payload.passes).filter(pass => Number(pass.routeId) === Number(payload.routeId) && pass.status === "confirmed");
      const committedSeats = passes.reduce((worst, pass) => Math.max(worst, passSeats(passes, payload.routeId, pass.month, "confirmed")), 0);
      return { committedSeats } as T;
    }

    case "kds.board": {
      const nowMs = Number(payload.nowMs ?? Date.now());
      const scored: Row[] = asList(payload.tickets)
        .map((ticket): Row => {
          const lane = ticket.status === "preparing" ? "preparing" : ticket.status === "ready" ? "ready" : ticket.status === "pending" ? "incoming" : "archived";
          const waitingMinutes = Math.max(0, Math.floor((nowMs - Number(ticket.placedAtMs)) / 60000));
          const unpaidCash = ticket.paymentMethod === "direct_cash" && ticket.paymentStatus !== "paid";
          const priorityScore = waitingMinutes + (unpaidCash ? 6 : 0) + Math.max(0, Number(ticket.itemCount ?? 1)) * 2;
          return { ...ticket, lane, waitingMinutes, priorityScore, asap: waitingMinutes >= 12 };
        })
        .filter(ticket => ticket.lane !== "archived");

      const byPriority = (left: Row, right: Row) =>
        left.asap !== right.asap ? (left.asap ? -1 : 1) : right.priorityScore - left.priorityScore || Number(left.placedAtMs) - Number(right.placedAtMs);
      const lane = (name: string) => scored.filter((ticket: Row) => ticket.lane === name).sort(byPriority);

      return {
        incoming: lane("incoming"),
        preparing: lane("preparing"),
        ready: lane("ready"),
        openTickets: scored.length,
        asapTickets: scored.filter((ticket: Row) => ticket.asap).length,
        openValueCents: scored.reduce((sum: number, ticket: Row) => sum + Number(ticket.totalCents ?? 0), 0),
        averageWaitMinutes: scored.length ? scored.reduce((sum: number, ticket: Row) => sum + Number(ticket.waitingMinutes), 0) / scored.length : 0,
      } as T;
    }

    case "kds.canAdvance": {
      const allowed =
        (payload.from === "pending" && ["preparing", "cancelled"].includes(payload.to)) ||
        (payload.from === "preparing" && ["ready", "cancelled"].includes(payload.to)) ||
        (payload.from === "ready" && payload.to === "completed");
      return { allowed } as T;
    }

    default:
      throw new Error(`Unknown engine command: ${command}`);
  }
}

function seatsWithStatus(bookings: Row[], tripId: unknown, status: string) {
  return bookings
    .filter(booking => Number(booking.tripId) === Number(tripId) && booking.status === status)
    .reduce((sum, booking) => sum + Number(booking.seatCount ?? 0), 0);
}

function isBookable(trip: Row) {
  return ["scheduled", "boarding"].includes(trip.status) && trip.routeStatus === "active" && trip.vehicleStatus === "operational";
}
