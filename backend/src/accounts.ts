// ===========================================================================
//  accounts.ts — user records: lookup, creation, status.
// ===========================================================================

import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "./database.js";
import { users, type Role, type User } from "../drizzle/schema.js";
import { hashPassword } from "./auth.js";

/** The shape sent to the browser — never includes the password hash. */
export type PublicUser = Omit<User, "passwordHash">;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _ignored, ...safe } = user;
  return safe;
}

export async function getUserById(id: number) {
  const rows = await db().select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function getUserByUsername(username: string) {
  const rows = await db().select().from(users).where(eq(users.username, username.trim().toLowerCase())).limit(1);
  return rows[0];
}

export async function listUsersByRole(role?: Role, activeOnly = false) {
  const conditions = [];
  if (role) conditions.push(eq(users.role, role));
  if (activeOnly) conditions.push(eq(users.status, "active"));
  return db()
    .select()
    .from(users)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(users.id));
}

export async function createAccount(input: {
  name: string;
  username?: string;
  email?: string;
  password?: string;
  role: Role;
  status?: "active" | "inactive";
}) {
  const username = input.username?.trim().toLowerCase() || (await suggestUsername(input.name));
  const existing = await getUserByUsername(username);
  if (existing) throw Object.assign(new Error(`The username "${username}" is already taken.`), { status: 409 });

  const inserted = await db()
    .insert(users)
    .values({
      openId: `local_${nanoid(16)}`,
      name: input.name.trim(),
      username,
      email: input.email?.trim() || null,
      passwordHash: hashPassword(input.password ?? "biten123"),
      loginMethod: "local",
      role: input.role,
      status: input.status ?? "active",
    })
    .returning();
  return inserted[0]!;
}

/** "Aye Aye" -> "ayeaye", "ayeaye2", … */
async function suggestUsername(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "student";
  let candidate = base;
  let counter = 2;
  while (await getUserByUsername(candidate)) {
    candidate = `${base}${counter}`;
    counter += 1;
  }
  return candidate;
}

export async function setUserStatus(id: number, status: "active" | "inactive") {
  await db().update(users).set({ status }).where(eq(users.id, id));
}

export async function markSignedIn(id: number) {
  await db().update(users).set({ lastSignedIn: new Date(), loginMethod: "local" }).where(eq(users.id, id));
}

export async function setPassword(id: number, password: string) {
  await db().update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, id));
}
