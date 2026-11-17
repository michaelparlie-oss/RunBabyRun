import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decrypt, encrypt, randomToken, safeEqual, sign } from "./crypto";
import { getStore } from "./storage";
import { nowEpoch } from "./util/dates";

export const SESSION_COOKIE = "rbr_session";
export const OAUTH_COOKIE = "rbr_oauth";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

const g = globalThis as unknown as { __rbrSecret?: Promise<string> };
/**
 * Secret for signing sessions and encrypting Strava tokens. SESSION_SECRET (site env var) is used
 * when set; otherwise a random secret is created once and kept in the site's private storage.
 */
export function getSecret(): Promise<string> {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) return Promise.resolve(process.env.SESSION_SECRET);
  if (!g.__rbrSecret) {
    g.__rbrSecret = (async () => {
      const store = await getStore();
      await store.setIfNew("sys", "secret", { value: randomToken(48) });
      const doc = await store.get<{ value: string }>("sys", "secret");
      if (!doc?.value) throw new Error("Could not create the site secret");
      return doc.value;
    })().catch((e) => { g.__rbrSecret = undefined; throw e; });
  }
  return g.__rbrSecret;
}

export async function seal(value: unknown): Promise<string> {
  return encrypt(JSON.stringify(value), await getSecret());
}
export async function unseal<T>(blob: string | undefined | null): Promise<T | null> {
  if (!blob) return null;
  try { return JSON.parse(decrypt(blob, await getSecret())) as T; } catch { return null; }
}

export function makeSessionToken(athleteId: number, secret: string, now = nowEpoch()): string {
  const payload = `v1.${athleteId}.${now}`;
  return `${payload}.${sign(payload, secret)}`;
}
export function readSessionToken(tok: string | undefined, secret: string, now = nowEpoch()): number | null {
  if (!tok) return null;
  const parts = tok.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const id = Number(parts[1]), issued = Number(parts[2]);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(issued) || now - issued > SESSION_MAX_AGE_S || issued > now + 60) return null;
  return safeEqual(parts[3], sign(`${parts[0]}.${parts[1]}.${parts[2]}`, secret)) ? id : null;
}

export const cookieOpts = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" && !process.env.ALLOW_HTTP, maxAge, path: "/" });

/** Signed-in runner's Strava athlete id, or null. */
export async function currentUser(): Promise<number | null> {
  const tok = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!tok) return null;
  return readSessionToken(tok, await getSecret());
}
export async function requireUser(): Promise<number> {
  const id = await currentUser();
  if (!id) redirect("/");
  return id;
}
export async function startSession(athleteId: number) {
  (await cookies()).set(SESSION_COOKIE, makeSessionToken(athleteId, await getSecret()), cookieOpts(SESSION_MAX_AGE_S));
}
export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
