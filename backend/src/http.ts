// ===========================================================================
//  http.ts — small Express helpers shared by every route file.
// ===========================================================================

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { extractToken, readSessionToken } from "./auth.js";
import { getUserById, toPublicUser, type PublicUser } from "./accounts.js";
import { EngineRuleError } from "./engine.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = (message = "Please log in.") => new HttpError(401, message);
export const forbidden = (message = "You do not have access to this action.") => new HttpError(403, message);
export const notFound = (message = "Not found.") => new HttpError(404, message);

/**
 * Wraps a handler so that:
 *   * whatever it returns is sent as JSON (so route files stay one-liners),
 *   * a rejected promise reaches the error middleware instead of hanging,
 *   * a handler that writes the response itself is left alone.
 */
export function route(handler: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res))
      .then(payload => {
        if (res.headersSent) return;
        if (payload === undefined) {
          res.status(204).end();
          return;
        }
        res.json(payload);
      })
      .catch(next);
  };
}

/** Reads the Bearer token and attaches req.user. Never rejects. */
export const attachUser: RequestHandler = (req, _res, next) => {
  const token = extractToken(req.headers.authorization, req.query.access_token);
  if (!token) return next();

  readSessionToken(token)
    .then(async claims => {
      if (!claims) return;
      const user = await getUserById(claims.uid);
      if (user && user.status === "active") req.user = toPublicUser(user);
    })
    .catch(() => undefined)
    .finally(next);
};

export function requireUser(req: Request): PublicUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requireRole(req: Request, ...roles: Array<PublicUser["role"]>): PublicUser {
  const user = requireUser(req);
  if (!roles.includes(user.role)) throw forbidden();
  return user;
}

/** Validates a request body with zod and returns typed data. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw badRequest(first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid request.");
  }
  return result.data;
}

export function parseId(value: unknown, label = "id") {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw badRequest(`Invalid ${label}.`);
  return id;
}

/** One error shape for the whole API: { error: "message" }. */
export function errorMiddleware(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error instanceof EngineRuleError) return res.status(400).json({ error: error.message });
  const anyError = error as { status?: unknown; message?: unknown } | null;
  if (anyError && typeof anyError === "object" && typeof anyError.status === "number")
    return res.status(anyError.status).json({ error: String(anyError.message ?? "Request refused.") });

  const message = error instanceof Error ? error.message : String(error);
  // A PostgreSQL constraint violation is the user's mistake far more often
  // than ours, so give it a readable 400 instead of a bare 500.
  if (/duplicate key value/i.test(message)) return res.status(409).json({ error: "That value is already taken." });
  if (/violates foreign key constraint/i.test(message)) return res.status(400).json({ error: "That record is referenced by something else." });

  console.error("[api]", error);
  return res.status(500).json({ error: message || "Unexpected server error." });
}
