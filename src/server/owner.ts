import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Figflow has no accounts: uploads belong to the browser that made them,
 * through a random, HTTP-only cookie. Records keep only its SHA-256, so a
 * leaked record doesn't grant access.
 */
const COOKIE = "ff_owner";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** The owner id of this browser; with `create`, one is made (and the cookie set) if it has none. */
export async function ownerId(create: true): Promise<string>;
export async function ownerId(create?: false): Promise<string | null>;
export async function ownerId(create = false): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token && TOKEN.test(token)) return hash(token);
  if (!create) return null;
  const fresh = randomBytes(32).toString("base64url");
  jar.set(COOKIE, fresh, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return hash(fresh);
}
