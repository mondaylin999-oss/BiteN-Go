// ===========================================================================
//  cashflow.ts — money movements.
//
//  This module only *reads and writes rows*. Every figure derived from those
//  rows (balances, running totals, monthly buckets, agent positions) is
//  computed by the C++ engine — see engine.ts and cpp/src/CashflowEngine.cpp.
// ===========================================================================

import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "./database.js";
import { transactions, users, type Direction, type InsertTransaction, type Role } from "../drizzle/schema.js";
import { callEngine } from "./engine.js";

export type MovementFilters = {
  start?: Date;
  end?: Date;
  direction?: Direction;
  role?: Role;
  agentId?: number;
  userId?: number;
};

export type FlowSummary = {
  received: number;
  paidOut: number;
  balance: number;
  profit: number;
  profitPercentage: number;
  downstreamPaidOut: number;
  fundingTransfers: number;
};

/** Rows in the shape the C++ engine expects. */
function toEngineRows(rows: Array<typeof transactions.$inferSelect>) {
  return rows.map(row => ({
    id: row.id,
    agentId: row.agentId ?? 0,
    userId: row.userId ?? 0,
    direction: row.direction,
    sourceRole: row.sourceRole,
    targetRole: row.targetRole,
    amountCents: row.amountCents,
    occurredAt: row.occurredAt.toISOString(),
    note: row.note ?? "",
  }));
}

export async function listMovements(filters: MovementFilters = {}) {
  if (filters.role === "driver") return [];
  const conditions = [];
  if (filters.start) conditions.push(gte(transactions.occurredAt, filters.start));
  if (filters.end) conditions.push(lte(transactions.occurredAt, filters.end));
  if (filters.direction) conditions.push(eq(transactions.direction, filters.direction));
  if (filters.role) conditions.push(eq(transactions.sourceRole, filters.role));
  if (filters.agentId) conditions.push(eq(transactions.agentId, filters.agentId));
  if (filters.userId) conditions.push(eq(transactions.userId, filters.userId));

  return db()
    .select()
    .from(transactions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(transactions.occurredAt), desc(transactions.id));
}

/** History rows with the running balance the C++ engine calculated. */
export async function listHistory(filters: MovementFilters = {}) {
  const rows = await listMovements(filters);
  if (!rows.length) return [] as Array<(typeof rows)[number] & { balanceAfter: number; counterparty: string | null }>;

  const [{ ledger }, people] = await Promise.all([
    callEngine<{ ledger: Array<{ id: number; balanceAfter: number }> }>("cashflow.history", { rows: toEngineRows(rows) }),
    db().select({ id: users.id, name: users.name, username: users.username, role: users.role }).from(users),
  ]);

  const balanceById = new Map(ledger.map(entry => [entry.id, entry.balanceAfter]));
  const nameById = new Map(people.map(person => [person.id, person.name ?? person.username ?? `#${person.id}`]));

  return rows.map(row => ({
    ...row,
    balanceAfter: balanceById.get(row.id) ?? 0,
    counterparty: row.userId ? nameById.get(row.userId) ?? null : row.agentId ? nameById.get(row.agentId) ?? null : null,
  }));
}

function scopeFor(role: Role, userId: number): MovementFilters {
  if (role === "admin") return { role: "admin" };
  if (role === "agent") return { agentId: userId };
  return { userId };
}

export async function getFlowSummary(role: Role, userId: number): Promise<FlowSummary> {
  const rows = await listMovements(scopeFor(role, userId));
  const downstream = role === "admin" ? await listMovements({ role: "agent", direction: "out" }) : [];
  return callEngine<FlowSummary>("cashflow.summary", { role, rows: toEngineRows(rows), downstream: toEngineRows(downstream) });
}

export async function getMonthlySummary(role: Role, userId: number) {
  const rows = await listMovements(scopeFor(role, userId));
  const downstream = role === "admin" ? await listMovements({ role: "agent", direction: "out" }) : [];
  const { months } = await callEngine<{ months: Array<Record<string, number | string>> }>("cashflow.monthly", {
    role,
    rows: toEngineRows(rows),
    downstream: toEngineRows(downstream),
  });
  return months;
}

/** What each agent was allocated, has disbursed, and still holds. */
export async function getAgentPositions() {
  const [agents, rows] = await Promise.all([
    db().select({ id: users.id, name: users.name, username: users.username, status: users.status }).from(users).where(eq(users.role, "agent")),
    listMovements({}),
  ]);
  if (!agents.length) return [];
  const { agents: positions } = await callEngine<{ agents: Array<{ agentId: number; allocated: number; disbursed: number; balance: number }> }>(
    "cashflow.agents",
    { agentIds: agents.map(agent => agent.id), rows: toEngineRows(rows) },
  );
  return positions.map(position => ({ ...position, agent: agents.find(agent => agent.id === position.agentId)! }));
}

/** The spendable wallet balance of one student. */
export async function getWalletBalance(userId: number) {
  const rows = await listMovements({ userId });
  const { walletBalance } = await callEngine<{ walletBalance: number }>("cashflow.history", { rows: toEngineRows(rows) });
  return walletBalance;
}

/** The float an agent is holding (funding received minus payouts made). */
export async function getAgentBalance(agentId: number) {
  const summary = await getFlowSummary("agent", agentId);
  return summary.balance;
}

export async function createMovement(input: InsertTransaction) {
  const inserted = await db().insert(transactions).values(input).returning({ id: transactions.id });
  return inserted[0]!.id;
}

export async function deleteMovement(id: number) {
  const deleted = await db().delete(transactions).where(eq(transactions.id, id)).returning({ id: transactions.id });
  return deleted.length > 0;
}
