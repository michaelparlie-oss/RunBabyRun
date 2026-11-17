import crypto from "node:crypto";
import { getStore } from "@/lib/storage";
import type { User } from "@/lib/types";

/**
 * Accounts. Every runner has a random numeric id that owns all of their documents. Two small indexes point at it:
 * the Supabase Auth user (sign-in) and, when connected, the Strava athlete (webhook events).
 */
const IDX = "idx";
const authKey = (authId: string) => `auth_${authId.replace(/[^A-Za-z0-9-]/g, "")}`;
const stravaKey = (athleteId: number) => `strava_${athleteId}`;

/** Random id well above any Strava athlete number, so old and new owners can never collide. */
export const newUid = () => 1e12 + crypto.randomInt(0, 2 ** 47);

export async function loadUser(uid: number): Promise<User | null> {
  return (await getStore()).get<User>(String(uid), "user");
}
export async function saveUser(u: User): Promise<void> {
  await (await getStore()).set(String(u.uid), "user", u);
}

/** The runner behind a Supabase Auth user, created on first sign-in. */
export async function userForAuth(authId: string, email: string, name: string): Promise<User> {
  const store = await getStore();
  await store.setIfNew(IDX, authKey(authId), { uid: newUid() });
  const { uid } = (await store.get<{ uid: number }>(IDX, authKey(authId)))!;
  const have = await loadUser(uid);
  if (have) {
    if (have.email !== email) await saveUser({ ...have, email });
    return { ...have, email };
  }
  const u: User = { uid, email, name: name.trim().slice(0, 40) || email.split("@")[0].slice(0, 40), source: null, created_at: new Date().toISOString() };
  await saveUser(u);
  return u;
}
export async function uidForAuth(authId: string): Promise<number | null> {
  return (await (await getStore()).get<{ uid: number }>(IDX, authKey(authId)))?.uid ?? null;
}
export async function unlinkAuth(authId: string): Promise<void> {
  await (await getStore()).del(IDX, authKey(authId));
}

export async function uidForStrava(athleteId: number): Promise<number | null> {
  return (await (await getStore()).get<{ uid: number }>(IDX, stravaKey(athleteId)))?.uid ?? null;
}
/** One Strava athlete belongs to one RunBabyRun account. Returns false when it is already linked to another. */
export async function linkStrava(athleteId: number, uid: number): Promise<boolean> {
  const store = await getStore();
  await store.setIfNew(IDX, stravaKey(athleteId), { uid });
  return (await uidForStrava(athleteId)) === uid;
}
export async function unlinkStrava(athleteId: number, uid: number): Promise<void> {
  if ((await uidForStrava(athleteId)) === uid) await (await getStore()).del(IDX, stravaKey(athleteId));
}
