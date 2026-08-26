// ===========================================================================
//  routes/cashflow.ts — /cashflow/*
//
//  admin  → funds agents, sees the whole network
//  agent  → receives funding, tops up student wallets, sees their own float
//  user   → sees their wallet and their own history
// ===========================================================================

import { Router } from "express";
import { z } from "zod";
import {
  createMovement,
  deleteMovement,
  getAgentBalance,
  getAgentPositions,
  getFlowSummary,
  getMonthlySummary,
  getWalletBalance,
  listHistory,
} from "../cashflow.js";
import { createAccount, getUserById, listUsersByRole, setUserStatus, toPublicUser } from "../accounts.js";
import { ensureDriverProfile } from "../transport.js";
import { badRequest, forbidden, notFound, parseBody, parseId, requireRole, requireUser, route } from "../http.js";

export const cashflowRouter = Router();

cashflowRouter.get(
  "/overview",
  route(async req => {
    const user = requireUser(req);
    const summary = await getFlowSummary(user.role, user.id);
    return { summary, wallet: user.role === "user" ? await getWalletBalance(user.id) : summary.balance };
  }),
);

cashflowRouter.get(
  "/monthly",
  route(async req => {
    const user = requireUser(req);
    return { months: await getMonthlySummary(user.role, user.id) };
  }),
);

cashflowRouter.get(
  "/history",
  route(async req => {
    const user = requireUser(req);
    const query = parseBody(
      z.object({
        start: z.coerce.date().optional(),
        end: z.coerce.date().optional(),
        direction: z.enum(["in", "out"]).optional(),
        agentId: z.coerce.number().int().positive().optional(),
      }),
      req.query,
    );

    const scoped =
      user.role === "admin"
        ? { ...query, role: "admin" as const }
        : user.role === "agent"
          ? { ...query, agentId: user.id }
          : { ...query, userId: user.id };
    return { history: await listHistory(scoped) };
  }),
);

cashflowRouter.get(
  "/wallet",
  route(async req => {
    const user = requireUser(req);
    return { balance: user.role === "agent" ? await getAgentBalance(user.id) : await getWalletBalance(user.id) };
  }),
);

// --- people ----------------------------------------------------------------

cashflowRouter.get(
  "/participants",
  route(async req => {
    const user = requireUser(req);
    // Agents need the student list to be able to top up a wallet.
    if (user.role === "agent") return { participants: (await listUsersByRole("user", true)).map(toPublicUser) };
    requireRole(req, "admin");
    return { participants: (await listUsersByRole(undefined, false)).map(toPublicUser) };
  }),
);

cashflowRouter.post(
  "/participants",
  route(async req => {
    requireRole(req, "admin");
    const input = parseBody(
      z.object({
        name: z.string().min(2).max(120),
        username: z.string().min(3).max(64).optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).max(128).optional(),
        role: z.enum(["agent", "user", "driver"]),
      }),
      req.body,
    );
    const user = await createAccount(input);
    if (user.role === "driver") await ensureDriverProfile(user.id);
    return { participant: toPublicUser(user) };
  }),
);

cashflowRouter.post(
  "/participants/:id/deactivate",
  route(async req => {
    const admin = requireRole(req, "admin");
    const id = parseId(req.params.id);
    if (id === admin.id) throw badRequest("You cannot deactivate your own admin account.");
    const participant = await getUserById(id);
    if (!participant || participant.role === "admin") throw notFound("Managed participant not found.");
    await setUserStatus(id, "inactive");
    return { success: true };
  }),
);

cashflowRouter.post(
  "/participants/:id/activate",
  route(async req => {
    requireRole(req, "admin");
    const participant = await getUserById(parseId(req.params.id));
    if (!participant) throw notFound("Managed participant not found.");
    await setUserStatus(participant.id, "active");
    return { success: true };
  }),
);

// --- movements -------------------------------------------------------------

/** Admin funds an agent. */
cashflowRouter.post(
  "/allocate",
  route(async req => {
    const admin = requireRole(req, "admin");
    const input = parseBody(
      z.object({ agentId: z.number().int().positive(), amountCents: z.number().int().positive(), note: z.string().max(500).optional() }),
      req.body,
    );
    const agent = await getUserById(input.agentId);
    if (!agent || agent.role !== "agent" || agent.status !== "active") throw badRequest("Select an active agent.");

    return {
      id: await createMovement({
        createdById: admin.id,
        agentId: agent.id,
        direction: "in",
        sourceRole: "admin",
        targetRole: "agent",
        amountCents: input.amountCents,
        note: input.note ?? "Admin allocation",
        occurredAt: new Date(),
      }),
    };
  }),
);

/** Agent tops up a student's wallet — never beyond the float they hold. */
cashflowRouter.post(
  "/pay-user",
  route(async req => {
    const agent = requireRole(req, "agent");
    const input = parseBody(
      z.object({ userId: z.number().int().positive(), amountCents: z.number().int().positive(), note: z.string().max(500).optional() }),
      req.body,
    );
    const student = await getUserById(input.userId);
    if (!student || student.role !== "user" || student.status !== "active") throw badRequest("Select an active student.");

    const available = await getAgentBalance(agent.id);
    if (available < input.amountCents) throw badRequest("Insufficient agent balance for this payout.");

    return {
      id: await createMovement({
        createdById: agent.id,
        agentId: agent.id,
        userId: student.id,
        direction: "out",
        sourceRole: "agent",
        targetRole: "user",
        amountCents: input.amountCents,
        note: input.note ?? "Wallet top-up",
        occurredAt: new Date(),
      }),
    };
  }),
);

/** Free-form entry for admin/agent bookkeeping. */
cashflowRouter.post(
  "/entries",
  route(async req => {
    const user = requireRole(req, "admin", "agent");
    const input = parseBody(
      z.object({
        direction: z.enum(["in", "out"]),
        amountCents: z.number().int().positive(),
        note: z.string().max(500).optional(),
        agentId: z.number().int().positive().optional(),
        userId: z.number().int().positive().optional(),
        occurredAt: z.coerce.date().optional(),
      }),
      req.body,
    );

    if (user.role === "agent" && input.agentId && input.agentId !== user.id) throw forbidden("Agents can only submit entries for themselves.");
    const isIn = input.direction === "in";
    const agentId = user.role === "agent" ? user.id : input.agentId;
    if (user.role === "admin" && !agentId && !isIn) throw badRequest("Select an agent for an outgoing entry.");

    return {
      id: await createMovement({
        createdById: user.id,
        agentId: agentId ?? null,
        userId: isIn ? null : (input.userId ?? null),
        direction: input.direction,
        sourceRole: isIn ? "admin" : "agent",
        targetRole: isIn ? "agent" : "user",
        amountCents: input.amountCents,
        note: input.note ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      }),
    };
  }),
);

cashflowRouter.delete(
  "/entries/:id",
  route(async req => {
    requireRole(req, "admin");
    const deleted = await deleteMovement(parseId(req.params.id));
    if (!deleted) throw notFound("Cash-flow record not found.");
    return { success: true };
  }),
);

/** Per-agent allocated / disbursed / holding. */
cashflowRouter.get(
  "/admin-flow",
  route(async req => {
    requireRole(req, "admin");
    return { agents: await getAgentPositions() };
  }),
);
