// ===========================================================================
//  canteen.ts — smart canteen: menu, pre-orders, kitchen display.
//
//  The pricing rules, the pre-order window and the kitchen board ordering all
//  come from the C++ engine. This module reads and writes PostgreSQL and asks
//  the engine to decide.
// ===========================================================================

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./database.js";
import { foodItems, orderItems, orders, users, type FoodItem } from "../drizzle/schema.js";
import { callEngine, EngineRuleError } from "./engine.js";
import { yangonDateKey, yangonHour } from "./time.js";
import { createMovement, getWalletBalance } from "./cashflow.js";

export type FoodAvailability = FoodItem["availability"];
export type PaymentMethod = "wallet" | "direct_cash";
export type OrderStatus = "pending" | "preparing" | "ready" | "completed" | "cancelled";

// --- window ----------------------------------------------------------------

export async function getPreorderWindow(now = new Date()) {
  return callEngine<{ orderingOpen: boolean; message: string }>("canteen.window", { yangonHour: yangonHour(now) });
}

// --- menu ------------------------------------------------------------------

export async function listMenu(options: { availableOnly?: boolean; agentId?: number } = {}) {
  const conditions = [];
  if (options.availableOnly) conditions.push(eq(foodItems.availability, "available"));
  if (options.agentId) conditions.push(eq(foodItems.agentId, options.agentId));
  return db()
    .select({
      item: foodItems,
      agentName: users.name,
      agentUsername: users.username,
    })
    .from(foodItems)
    .leftJoin(users, eq(foodItems.agentId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(foodItems.createdAt));
}

/** What a student sees: only available items, and only inside the window. */
export async function listStudentMenu(now = new Date()) {
  const window = await getPreorderWindow(now);
  if (!window.orderingOpen) return { window, items: [] as Awaited<ReturnType<typeof listMenu>> };
  return { window, items: await listMenu({ availableOnly: true }) };
}

export async function createFoodItem(input: {
  agentId: number;
  name: string;
  priceCents: number;
  description?: string;
  category?: string;
  imageUrl?: string;
}) {
  const inserted = await db()
    .insert(foodItems)
    .values({
      agentId: input.agentId,
      name: input.name.trim(),
      priceCents: input.priceCents,
      description: input.description?.trim() || null,
      category: input.category?.trim() || "Main",
      imageUrl: input.imageUrl?.trim() || null,
      // A new dish starts hidden; the agent publishes it when the window opens.
      active: false,
      availability: "unavailable",
      availabilityResetDate: yangonDateKey(),
    })
    .returning({ id: foodItems.id });
  return inserted[0]!.id;
}

export async function setFoodAvailability(id: number, availability: FoodAvailability, agentId: number) {
  // Publishing is only allowed inside the Myanmar pre-order window; the C++
  // engine owns that rule and throws EngineRuleError outside it.
  if (availability === "available") await callEngine("canteen.publishGuard", { yangonHour: yangonHour() });

  const updated = await db()
    .update(foodItems)
    .set({ availability, active: availability === "available", availabilityResetDate: yangonDateKey() })
    .where(and(eq(foodItems.id, id), eq(foodItems.agentId, agentId)))
    .returning({ id: foodItems.id });
  return updated.length > 0;
}

export async function deleteFoodItem(id: number, agentId: number) {
  const deleted = await db()
    .delete(foodItems)
    .where(and(eq(foodItems.id, id), eq(foodItems.agentId, agentId)))
    .returning({ id: foodItems.id });
  return deleted.length > 0;
}

/** Closes every dish at Myanmar midnight (see the scheduled endpoint). */
export async function closeFoodAvailability(now = new Date()) {
  const updated = await db()
    .update(foodItems)
    .set({ availability: "unavailable", active: false, availabilityResetDate: yangonDateKey(now) })
    .returning({ id: foodItems.id });
  return updated.length;
}

// --- orders ----------------------------------------------------------------

export async function listOrdersForUser(userId: number) {
  return withLines(await db().select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)));
}

export async function listAllOrders() {
  return withLines(await db().select().from(orders).orderBy(desc(orders.createdAt)));
}

/** Orders containing at least one dish owned by this agent. */
export async function listOrdersForAgent(agentId: number) {
  const rows = await db()
    .selectDistinct({ order: orders })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(foodItems, eq(orderItems.foodItemId, foodItems.id))
    .where(eq(foodItems.agentId, agentId))
    .orderBy(desc(orders.createdAt));
  return withLines(rows.map(row => row.order));
}

/** Attaches the order lines and the student's name to a set of orders. */
async function withLines(rows: Array<typeof orders.$inferSelect>) {
  if (!rows.length) return [];
  const orderIds = rows.map(row => row.id);
  const [lines, people] = await Promise.all([
    db()
      .select({ line: orderItems, food: foodItems })
      .from(orderItems)
      .innerJoin(foodItems, eq(orderItems.foodItemId, foodItems.id))
      .where(inArray(orderItems.orderId, orderIds)),
    db().select({ id: users.id, name: users.name, username: users.username }).from(users),
  ]);
  const nameById = new Map(people.map(person => [person.id, person.name ?? person.username ?? `#${person.id}`]));

  return rows.map(order => ({
    ...order,
    studentName: nameById.get(order.userId) ?? `#${order.userId}`,
    items: lines
      .filter(entry => entry.line.orderId === order.id)
      .map(entry => ({
        id: entry.line.id,
        foodItemId: entry.line.foodItemId,
        name: entry.food.name,
        quantity: entry.line.quantity,
        unitPriceCents: entry.line.unitPriceCents,
        lineTotalCents: entry.line.quantity * entry.line.unitPriceCents,
        agentId: entry.food.agentId,
      })),
  }));
}

export type PlacedOrder = { orderId: number; totalCents: number; paymentMethod: PaymentMethod; agentId: number };

/**
 * Place a pre-order. The basket is priced by the C++ engine, which also
 * enforces the window, the single-agent rule and the wallet balance.
 */
export async function placeOrder(input: {
  userId: number;
  items: Array<{ foodItemId: number; quantity: number }>;
  paymentMethod: PaymentMethod;
  pickupNote?: string;
}): Promise<PlacedOrder> {
  const menu = await db().select().from(foodItems);
  const walletBalanceCents = input.paymentMethod === "wallet" ? await getWalletBalance(input.userId) : undefined;

  const quote = await callEngine<{
    agentId: number;
    totalCents: number;
    itemCount: number;
    lines: Array<{ foodItemId: number; quantity: number; unitPriceCents: number }>;
  }>("canteen.quote", {
    yangonHour: yangonHour(),
    paymentMethod: input.paymentMethod,
    walletBalanceCents,
    menu: menu.map(item => ({ id: item.id, agentId: item.agentId, name: item.name, priceCents: item.priceCents, availability: item.availability })),
    basket: input.items,
  });

  const orderId = await db().transaction(async tx => {
    const inserted = await tx
      .insert(orders)
      .values({
        userId: input.userId,
        totalCents: quote.totalCents,
        status: "pending",
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentMethod === "wallet" ? "paid" : "awaiting_confirmation",
        pickupNote: input.pickupNote?.trim() || null,
      })
      .returning({ id: orders.id });
    const newOrderId = inserted[0]!.id;
    await tx.insert(orderItems).values(
      quote.lines.map(line => ({
        orderId: newOrderId,
        foodItemId: line.foodItemId,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      })),
    );
    return newOrderId;
  });

  // A wallet order moves money immediately; a cash order moves it when the
  // agent confirms the payment at the counter.
  if (input.paymentMethod === "wallet") {
    await createMovement({
      createdById: input.userId,
      agentId: quote.agentId,
      userId: input.userId,
      direction: "out",
      sourceRole: "user",
      targetRole: "agent",
      amountCents: quote.totalCents,
      note: `Canteen order #${orderId}`,
      occurredAt: new Date(),
    });
  }

  return { orderId, totalCents: quote.totalCents, paymentMethod: input.paymentMethod, agentId: quote.agentId };
}

/** True when this agent owns at least one dish on the order. */
async function agentOwnsOrder(orderId: number, agentId: number) {
  const rows = await db()
    .select({ id: orders.id })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(foodItems, eq(orderItems.foodItemId, foodItems.id))
    .where(and(eq(orders.id, orderId), eq(foodItems.agentId, agentId)))
    .limit(1);
  return rows.length > 0;
}

export async function confirmCashPayment(orderId: number, agentId: number) {
  if (!(await agentOwnsOrder(orderId, agentId))) return false;
  const rows = await db().select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = rows[0];
  if (!order || order.paymentMethod !== "direct_cash" || order.paymentStatus !== "awaiting_confirmation") return false;

  await db().update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, orderId));
  await createMovement({
    createdById: agentId,
    agentId,
    userId: order.userId,
    direction: "out",
    sourceRole: "user",
    targetRole: "agent",
    amountCents: order.totalCents,
    note: `Canteen order #${orderId} (cash at counter)`,
    occurredAt: new Date(),
  });
  return true;
}

/** Move a ticket along the kitchen board. The allowed moves come from C++. */
export async function updateOrderStatus(orderId: number, status: OrderStatus, agentId: number) {
  if (!(await agentOwnsOrder(orderId, agentId))) return false;
  const rows = await db().select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = rows[0];
  if (!order) return false;

  const { allowed } = await callEngine<{ allowed: boolean }>("kds.canAdvance", { from: order.status, to: status });
  if (!allowed) throw new EngineRuleError(`A ${order.status} ticket cannot move to ${status}.`);
  if (status === "completed" && order.paymentStatus !== "paid")
    throw new EngineRuleError("Confirm the cash payment before completing this order.");

  await db().update(orders).set({ status }).where(eq(orders.id, orderId));
  return true;
}

/** The kitchen display board — lanes and priorities decided by the C++ engine. */
export async function getKitchenBoard(agentId: number, now = new Date()) {
  const rows = await listOrdersForAgent(agentId);
  const tickets = rows.map(order => ({
    orderId: order.id,
    placedAtMs: order.createdAt.getTime(),
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    studentName: order.studentName,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    totalCents: order.totalCents,
  }));

  const board = await callEngine<{
    incoming: any[];
    preparing: any[];
    ready: any[];
    openTickets: number;
    asapTickets: number;
    openValueCents: number;
    averageWaitMinutes: number;
  }>("kds.board", { tickets, nowMs: now.getTime() });

  // Re-attach the order lines so the kitchen screen can print each ticket.
  const linesByOrder = new Map(rows.map(order => [order.id, order.items]));
  const decorate = (lane: any[]) => lane.map(ticket => ({ ...ticket, items: linesByOrder.get(ticket.orderId) ?? [] }));
  return {
    ...board,
    incoming: decorate(board.incoming),
    preparing: decorate(board.preparing),
    ready: decorate(board.ready),
  };
}
