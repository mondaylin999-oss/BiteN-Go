// ===========================================================================
//  engine.test.ts — parity tests for the rules engine.
//
//      cd backend && npm test
//
//  These run the SAME scenarios as backend/cpp/tests/engine_tests.cpp. When
//  the C++ binary is built they exercise it through the bridge; when it is
//  not, they exercise the TypeScript fallback. Either way the numbers must
//  match, which is what keeps the two implementations honest.
// ===========================================================================

import { describe, expect, it } from "vitest";
import { callEngine, engineMode, EngineRuleError } from "./engine.js";

const menu = [
  { id: 1, agentId: 7, name: "Mohinga", priceCents: 1500, availability: "available" },
  { id: 2, agentId: 7, name: "Salad", priceCents: 1200, availability: "available" },
  { id: 3, agentId: 8, name: "Shan noodles", priceCents: 1800, availability: "available" },
  { id: 4, agentId: 7, name: "Coconut rice", priceCents: 2000, availability: "sold_out" },
];

describe(`rules engine (${engineMode()})`, () => {
  it("opens the pre-order window at noon Myanmar time", async () => {
    expect((await callEngine<{ orderingOpen: boolean }>("canteen.window", { yangonHour: 11 })).orderingOpen).toBe(false);
    expect((await callEngine<{ orderingOpen: boolean }>("canteen.window", { yangonHour: 12 })).orderingOpen).toBe(true);
    expect((await callEngine<{ orderingOpen: boolean }>("canteen.window", { yangonHour: 23 })).orderingOpen).toBe(true);
  });

  it("prices a basket in integer kyat", async () => {
    const quote = await callEngine<{ totalCents: number; itemCount: number; agentId: number }>("canteen.quote", {
      yangonHour: 13,
      menu,
      basket: [
        { foodItemId: 1, quantity: 2 },
        { foodItemId: 2, quantity: 1 },
      ],
    });
    expect(quote.totalCents).toBe(1500 * 2 + 1200);
    expect(quote.itemCount).toBe(3);
    expect(quote.agentId).toBe(7);
  });

  it("refuses a basket that mixes two agents", async () => {
    await expect(
      callEngine("canteen.quote", { yangonHour: 13, menu, basket: [{ foodItemId: 1, quantity: 1 }, { foodItemId: 3, quantity: 1 }] }),
    ).rejects.toBeInstanceOf(EngineRuleError);
  });

  it("refuses a sold-out dish and an order outside the window", async () => {
    await expect(callEngine("canteen.quote", { yangonHour: 13, menu, basket: [{ foodItemId: 4, quantity: 1 }] })).rejects.toBeInstanceOf(EngineRuleError);
    await expect(callEngine("canteen.quote", { yangonHour: 9, menu, basket: [{ foodItemId: 1, quantity: 1 }] })).rejects.toBeInstanceOf(EngineRuleError);
  });

  it("refuses a wallet order the balance cannot cover", async () => {
    await expect(
      callEngine("canteen.quote", { yangonHour: 13, menu, basket: [{ foodItemId: 1, quantity: 1 }], paymentMethod: "wallet", walletBalanceCents: 1000 }),
    ).rejects.toBeInstanceOf(EngineRuleError);
  });

  it("computes the admin network position from agent disbursements", async () => {
    const rows = [
      { id: 1, agentId: 101, userId: 0, direction: "in", sourceRole: "admin", targetRole: "agent", amountCents: 1000, occurredAt: "2026-03-01T00:00:00.000Z" },
      { id: 2, agentId: 102, userId: 0, direction: "in", sourceRole: "admin", targetRole: "agent", amountCents: 500, occurredAt: "2026-04-01T00:00:00.000Z" },
    ];
    const downstream = [
      { id: 3, agentId: 101, userId: 201, direction: "out", sourceRole: "agent", targetRole: "user", amountCents: 400, occurredAt: "2026-03-05T00:00:00.000Z" },
      { id: 4, agentId: 101, userId: 202, direction: "out", sourceRole: "agent", targetRole: "user", amountCents: 100, occurredAt: "2026-04-05T00:00:00.000Z" },
    ];
    const summary = await callEngine<{ received: number; downstreamPaidOut: number; balance: number }>("cashflow.summary", { role: "admin", rows, downstream });
    expect(summary.received).toBe(1500);
    expect(summary.downstreamPaidOut).toBe(500);
    expect(summary.balance).toBe(1000);
  });

  it("computes a student wallet from credits minus spending", async () => {
    const rows = [
      { id: 5, agentId: 101, userId: 201, direction: "out", sourceRole: "agent", targetRole: "user", amountCents: 5000, occurredAt: "2026-03-05T00:00:00.000Z" },
      { id: 6, agentId: 101, userId: 201, direction: "out", sourceRole: "user", targetRole: "agent", amountCents: 1500, occurredAt: "2026-03-06T00:00:00.000Z" },
    ];
    const { walletBalance } = await callEngine<{ walletBalance: number }>("cashflow.history", { rows });
    expect(walletBalance).toBe(3500);
  });

  it("never lets a pending seat request hold a seat", async () => {
    const trip = { tripId: 500, routeId: 20, vehicleId: 10, driverId: 1, totalSeats: 4, fareCents: 1500, status: "scheduled", routeStatus: "active", vehicleStatus: "operational" };
    const bookings = [
      { id: 1, tripId: 500, userId: 101, seatCount: 3, status: "confirmed" },
      { id: 2, tripId: 500, userId: 102, seatCount: 2, status: "pending" },
    ];
    const { trips } = await callEngine<{ trips: Array<{ occupiedSeats: number; availableSeats: number }> }>("ferry.plan", { trips: [trip], bookings });
    expect(trips[0]!.occupiedSeats).toBe(3);
    expect(trips[0]!.availableSeats).toBe(1);

    const allowed = await callEngine<{ allowed: boolean }>("ferry.canRequest", { trip, bookings, userId: 104, seatCount: 1 });
    const tooMany = await callEngine<{ allowed: boolean }>("ferry.canRequest", { trip, bookings, userId: 104, seatCount: 2 });
    const duplicate = await callEngine<{ allowed: boolean }>("ferry.canRequest", { trip, bookings, userId: 102, seatCount: 1 });
    expect(allowed.allowed).toBe(true);
    expect(tooMany.allowed).toBe(false);
    expect(duplicate.allowed).toBe(false);
  });

  it("pins an old unpaid-cash ticket to the top of the kitchen board", async () => {
    const now = 1_700_000_000_000;
    const board = await callEngine<{ incoming: Array<{ orderId: number; asap: boolean; priorityScore: number }>; openTickets: number }>("kds.board", {
      nowMs: now,
      tickets: [
        { orderId: 1, placedAtMs: now - 15 * 60_000, status: "pending", paymentMethod: "direct_cash", paymentStatus: "awaiting_confirmation", itemCount: 1, totalCents: 1000 },
        { orderId: 2, placedAtMs: now - 60_000, status: "pending", paymentMethod: "wallet", paymentStatus: "paid", itemCount: 1, totalCents: 1000 },
        { orderId: 3, placedAtMs: now - 60 * 60_000, status: "completed", paymentMethod: "wallet", paymentStatus: "paid", itemCount: 1, totalCents: 1000 },
      ],
    });
    expect(board.openTickets).toBe(2);
    expect(board.incoming[0]!.orderId).toBe(1);
    expect(board.incoming[0]!.asap).toBe(true);
    expect(board.incoming[0]!.priorityScore).toBe(15 + 6 + 2);
  });

  it("allows only the legal kitchen transitions", async () => {
    expect((await callEngine<{ allowed: boolean }>("kds.canAdvance", { from: "pending", to: "preparing" })).allowed).toBe(true);
    expect((await callEngine<{ allowed: boolean }>("kds.canAdvance", { from: "pending", to: "completed" })).allowed).toBe(false);
    expect((await callEngine<{ allowed: boolean }>("kds.canAdvance", { from: "ready", to: "completed" })).allowed).toBe(true);
  });
});
