// ===========================================================================
//  routes/canteen.ts — /canteen/*
// ===========================================================================

import { Router } from "express";
import { z } from "zod";
import {
  confirmCashPayment,
  createFoodItem,
  deleteFoodItem,
  getKitchenBoard,
  getPreorderWindow,
  listAllOrders,
  listMenu,
  listOrdersForAgent,
  listOrdersForUser,
  listStudentMenu,
  placeOrder,
  setFoodAvailability,
  setFoodPhoto,
  updateOrderStatus,
} from "../canteen.js";
import { getWalletBalance } from "../cashflow.js";
import { badRequest, forbidden, notFound, parseBody, parseId, requireRole, requireUser, route } from "../http.js";
import { isPhotoError } from "../photos.js";

export const canteenRouter = Router();

canteenRouter.get(
  "/window",
  route(() => getPreorderWindow()),
);

/** The menu each role should see. */
canteenRouter.get(
  "/menu",
  route(async req => {
    const user = requireUser(req);
    if (user.role === "user") {
      const { window, items } = await listStudentMenu();
      return { window, items, walletBalance: await getWalletBalance(user.id) };
    }
    if (user.role === "agent") return { window: await getPreorderWindow(), items: await listMenu({ agentId: user.id }) };
    if (user.role === "driver") return { window: await getPreorderWindow(), items: [] };
    return { window: await getPreorderWindow(), items: await listMenu() };
  }),
);

canteenRouter.post(
  "/menu",
  route(async req => {
    const agent = requireRole(req, "agent");
    const input = parseBody(
      z.object({
        name: z.string().min(2).max(120),
        priceCents: z.number().int().positive(),
        description: z.string().max(280).optional(),
        category: z.string().max(60).optional(),
        imageUrl: z.string().max(2048).optional(),
      }),
      req.body,
    );
    return { id: await createFoodItem({ agentId: agent.id, ...input }) };
  }),
);

/**
 * The dish's photo. The browser sends an already-shrunk JPEG as a data URL;
 * this backend is what talks to Supabase, so no key ever reaches a browser.
 * Sending no dataUrl (or DELETE below) takes the photo off.
 */
canteenRouter.put(
  "/menu/:id/photo",
  route(async req => {
    const agent = requireRole(req, "agent");
    const input = parseBody(z.object({ dataUrl: z.string().min(20).max(6_000_000) }), req.body);
    try {
      const result = await setFoodPhoto({ foodItemId: parseId(req.params.id), agentId: agent.id, dataUrl: input.dataUrl });
      if (!result) throw forbidden("You can only put a photo on food from your own board.");
      return result;
    } catch (error) {
      // Anything photos.ts rejected is the agent's problem to fix, not a crash.
      if (isPhotoError(error)) throw badRequest(error instanceof Error ? error.message : "Could not save that photo.");
      throw error;
    }
  }),
);

canteenRouter.delete(
  "/menu/:id/photo",
  route(async req => {
    const agent = requireRole(req, "agent");
    const result = await setFoodPhoto({ foodItemId: parseId(req.params.id), agentId: agent.id, dataUrl: null });
    if (!result) throw forbidden("You can only change food on your own board.");
    return result;
  }),
);

canteenRouter.patch(
  "/menu/:id/availability",
  route(async req => {
    const agent = requireRole(req, "agent");
    const input = parseBody(z.object({ availability: z.enum(["available", "unavailable", "sold_out"]) }), req.body);
    const updated = await setFoodAvailability(parseId(req.params.id), input.availability, agent.id);
    if (!updated) throw forbidden("You can only update food items on your own board.");
    return { success: true };
  }),
);

canteenRouter.delete(
  "/menu/:id",
  route(async req => {
    const agent = requireRole(req, "agent");
    const deleted = await deleteFoodItem(parseId(req.params.id), agent.id);
    if (!deleted) throw forbidden("You can only remove food items from your own board.");
    return { success: true };
  }),
);

canteenRouter.get(
  "/orders",
  route(async req => {
    const user = requireUser(req);
    if (user.role === "user") return { orders: await listOrdersForUser(user.id) };
    if (user.role === "agent") return { orders: await listOrdersForAgent(user.id) };
    if (user.role === "admin") return { orders: await listAllOrders() };
    return { orders: [] };
  }),
);

canteenRouter.post(
  "/orders",
  route(async req => {
    const student = requireRole(req, "user");
    const input = parseBody(
      z.object({
        items: z.array(z.object({ foodItemId: z.number().int().positive(), quantity: z.number().int().positive().max(20) })).min(1),
        paymentMethod: z.enum(["wallet", "direct_cash"]),
        pickupNote: z.string().max(280).optional(),
      }),
      req.body,
    );
    return placeOrder({ userId: student.id, ...input });
  }),
);

canteenRouter.post(
  "/orders/:id/confirm-cash",
  route(async req => {
    const agent = requireRole(req, "agent");
    const confirmed = await confirmCashPayment(parseId(req.params.id), agent.id);
    if (!confirmed) throw forbidden("You cannot confirm this payment.");
    return { success: true };
  }),
);

canteenRouter.patch(
  "/orders/:id/status",
  route(async req => {
    const agent = requireRole(req, "agent");
    const input = parseBody(z.object({ status: z.enum(["pending", "preparing", "ready", "completed", "cancelled"]) }), req.body);
    const updated = await updateOrderStatus(parseId(req.params.id), input.status, agent.id);
    if (!updated) throw notFound("You cannot update this order.");
    return { success: true };
  }),
);

/** The kitchen display board — lanes and priorities come from the C++ engine. */
canteenRouter.get(
  "/kds",
  route(async req => {
    const agent = requireRole(req, "agent");
    return getKitchenBoard(agent.id);
  }),
);
