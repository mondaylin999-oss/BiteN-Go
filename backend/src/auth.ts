// ===========================================================================
//  auth.ts — local username + password login.
//
//  The original BiteN Go build signed in through a hosted OAuth portal. That
//  is gone: this version owns its accounts, so it runs entirely on your own
//  computer with nothing but PostgreSQL.
//
//  * passwords     scrypt with a per-account random salt, compared in
//                  constant time (never store or log a plain password)
//  * sessions      a signed JWT the browser keeps in localStorage and sends
//                  as  Authorization: Bearer <token>
//  * rate limiting a small in-process counter per IP on /auth/login
// ===========================================================================

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env.js";

const KEY_LENGTH = 64;

// --- passwords -------------------------------------------------------------

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt:${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;
  const [algorithm, salt, key] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "hex");
  const actual = scryptSync(password, salt, KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** A hash that was never produced by hashPassword can never match — repair it. */
export function isUsableHash(storedHash: string | null | undefined) {
  return typeof storedHash === "string" && storedHash.startsWith("scrypt:") && storedHash.split(":").length === 3;
}

// --- session tokens --------------------------------------------------------

const secretKey = new TextEncoder().encode(ENV.jwtSecret);

export type SessionClaims = { sub: string; uid: number; role: string; username: string | null };

export async function createSessionToken(claims: SessionClaims) {
  return new SignJWT({ uid: claims.uid, role: claims.role, username: claims.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer("biten-go")
    .setExpirationTime(`${ENV.jwtExpireMinutes}m`)
    .sign(secretKey);
}

export async function readSessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, { issuer: "biten-go" });
    if (typeof payload.uid !== "number") return null;
    return {
      sub: String(payload.sub ?? ""),
      uid: payload.uid,
      role: String(payload.role ?? "user"),
      username: (payload.username as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** Pulls the token out of the Authorization header (or an ?access_token query). */
export function extractToken(headerValue: string | undefined, queryValue?: unknown) {
  if (headerValue?.toLowerCase().startsWith("bearer ")) return headerValue.slice(7).trim();
  if (typeof queryValue === "string" && queryValue.trim()) return queryValue.trim();
  return null;
}

// --- brute-force protection ------------------------------------------------

const attempts = new Map<string, { count: number; resetAt: number }>();

/** Returns false when this client has spent its login attempts for the window. */
export function consumeLoginAttempt(clientKey: string) {
  const now = Date.now();
  const windowMs = ENV.loginRateWindowSeconds * 1000;
  const entry = attempts.get(clientKey);

  if (!entry || entry.resetAt <= now) {
    attempts.set(clientKey, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= ENV.loginRateLimit) return false;
  entry.count += 1;
  return true;
}

export function clearLoginAttempts(clientKey: string) {
  attempts.delete(clientKey);
}
