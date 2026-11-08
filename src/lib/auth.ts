import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";
import { verify } from "@node-rs/argon2";
import { getDb } from "./database";
import { AppError } from "./store";
import { matchesToken } from "./security";

interface OwnerSession {
  id?: string;
  oauthState?: string;
}
export async function ownerSession() {
  const password = process.env.AUTH_SECRET;
  if (!password || password.length < 32)
    throw new AppError(
      "Owner access is not configured. Run npm run setup:local or configure deployment secrets.",
      503,
    );
  return getIronSession<OwnerSession>(await cookies(), {
    password,
    cookieName: "factory_owner",
    ttl: 7 * 86400,
    cookieOptions: {
      httpOnly: true,
      secure:
        process.env.APP_URL?.startsWith("https://") ??
        process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  });
}
export async function isOwner() {
  const session = await ownerSession();
  if (!session.id) return false;
  const db = await getDb();
  const [row] = await db.query(
    sql`SELECT id FROM marketing_factory.owner_sessions WHERE id=${session.id} AND expires_at>now()`,
  );
  return !!row;
}
export async function requireOwner() {
  if (!(await isOwner()))
    throw new AppError("Sign in to access your factory.", 401);
}
export function requireBridge(request: Request) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!matchesToken(token, process.env.FACTORY_BRIDGE_TOKEN))
    throw new AppError("Invalid bridge credentials.", 401);
}
export function requireSameOrigin(request: Request) {
  const configured = process.env.APP_URL;
  if (process.env.NODE_ENV === "production" && !configured)
    throw new AppError("APP_URL must be configured.", 503);
  const expected = new URL(configured ?? request.url).origin;
  if (request.headers.get("origin") !== expected)
    throw new AppError("Invalid request origin.", 403);
}
export async function login(request: Request, password: string) {
  requireSameOrigin(request);
  const db = await getDb();
  // A global owner limit cannot be bypassed by spoofing forwarded IP headers.
  const key = createHash("sha256").update("factory-owner-login").digest("hex");
  const [attempt] = await db.query<{ attempts: number }>(
    sql`INSERT INTO marketing_factory.login_attempts(key,attempts,expires_at) VALUES(${key},1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN marketing_factory.login_attempts.expires_at<now() THEN 1 ELSE marketing_factory.login_attempts.attempts+1 END,expires_at=CASE WHEN marketing_factory.login_attempts.expires_at<now() THEN now()+interval '15 minutes' ELSE marketing_factory.login_attempts.expires_at END RETURNING attempts`,
  );
  if (attempt.attempts > 10)
    throw new AppError(
      "Too many sign-in attempts. Try again in 15 minutes.",
      429,
    );
  const hash = process.env.OWNER_PASSWORD_HASH;
  if (!hash) throw new AppError("Owner password is not configured.", 503);
  const encodedHash = hash.startsWith("$argon2")
    ? hash
    : Buffer.from(hash, "base64").toString("utf8");
  if (!(await verify(encodedHash, password).catch(() => false)))
    throw new AppError("Incorrect password.", 401);
  const previous = await ownerSession();
  if (previous.id)
    await db.query(
      sql`DELETE FROM marketing_factory.owner_sessions WHERE id=${previous.id}`,
    );
  await db.query(
    sql`DELETE FROM marketing_factory.login_attempts WHERE key=${key}`,
  );
  await db.query(
    sql`DELETE FROM marketing_factory.owner_sessions WHERE expires_at<now()`,
  );
  previous.id = randomUUID();
  await db.query(
    sql`INSERT INTO marketing_factory.owner_sessions(id,expires_at) VALUES(${previous.id},${new Date(Date.now() + 7 * 86400000)})`,
  );
  await previous.save();
}
export async function logout() {
  const session = await ownerSession();
  const db = await getDb();
  if (session.id)
    await db.query(
      sql`DELETE FROM marketing_factory.owner_sessions WHERE id=${session.id}`,
    );
  session.destroy();
}
