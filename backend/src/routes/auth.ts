// ===========================================================================
//  routes/auth.ts — /auth/*
// ===========================================================================

import { Router } from "express";
import { z } from "zod";
import { clearLoginAttempts, consumeLoginAttempt, createSessionToken, verifyPassword } from "../auth.js";
import { createAccount, getUserByUsername, markSignedIn, setPassword, toPublicUser } from "../accounts.js";
import { ENV } from "../env.js";
import { badRequest, HttpError, parseBody, requireUser, route, unauthorized } from "../http.js";

export const authRouter = Router();

const credentials = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

authRouter.post(
  "/login",
  route(async req => {
    const clientKey = req.ip ?? "unknown";
    if (!consumeLoginAttempt(clientKey))
      throw new HttpError(429, `Too many login attempts. Wait ${ENV.loginRateWindowSeconds} seconds and try again.`);

    const input = parseBody(credentials, req.body);
    const user = await getUserByUsername(input.username);

    // The same message for "no such user" and "wrong password" — never reveal
    // which usernames exist.
    if (!user || user.status !== "active" || !verifyPassword(input.password, user.passwordHash))
      throw unauthorized("Invalid username or password.");

    clearLoginAttempts(clientKey);
    await markSignedIn(user.id);
    const token = await createSessionToken({ sub: user.openId, uid: user.id, role: user.role, username: user.username });
    return { token, user: toPublicUser({ ...user, lastSignedIn: new Date() }) };
  }),
);

const registration = z.object({
  name: z.string().min(2).max(120),
  username: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9_.]+$/i, "Use letters, numbers, dot or underscore only.")
    .optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).max(128),
});

/** Student self-registration. Staff accounts are created by the admin. */
authRouter.post(
  "/register",
  route(async req => {
    const input = parseBody(registration, req.body);
    const user = await createAccount({ ...input, role: "user" });
    const token = await createSessionToken({ sub: user.openId, uid: user.id, role: user.role, username: user.username });
    return { token, user: toPublicUser(user) };
  }),
);

authRouter.get(
  "/me",
  route(req => (req.user ? { user: req.user } : { user: null })),
);

/** The token lives in the browser, so logging out is a client-side discard. */
authRouter.post(
  "/logout",
  route(() => ({ success: true })),
);

authRouter.post(
  "/password",
  route(async req => {
    const user = requireUser(req);
    const input = parseBody(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6).max(128) }), req.body);
    const stored = await getUserByUsername(user.username ?? "");
    if (!stored || !verifyPassword(input.currentPassword, stored.passwordHash)) throw badRequest("Your current password is not correct.");
    await setPassword(user.id, input.newPassword);
    return { success: true };
  }),
);
