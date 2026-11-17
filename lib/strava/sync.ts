import { getStore } from "@/lib/storage";
import type { ActSummary } from "@/lib/types";
import type { Lap, Streams } from "@/lib/match/types";
import { localDateOf, nowEpoch } from "@/lib/util/dates";
import { RateLimitPause, StravaClient, StravaError, type FetchFn } from "./client";
import { loadAccount, saveAccount, TokenError, validAccessToken } from "./oauth";

export const FIRST_SYNC_DAYS = 120;
export const RELIST_OVERLAP_DAYS = 7;
export const AUTO_SYNC_AFTER_S = 30 * 60;
export const KEEP_ACTIVITIES = 600;
export const MAX_STREAM_POINTS = 2000;
export const RUN_SPORTS = ["Run", "TrailRun", "VirtualRun"];

interface SummaryActivity {
  id: number; name: string; sport_type: string; start_date_local: string; distance: number; moving_time: number; elapsed_time: number;
  average_heartrate?: number; max_heartrate?: number; average_speed?: number;
}
export interface SyncResult { status: "ok" | "paused" | "error" | "disconnected"; added: number; message: string }
export interface ActDetail { id: number; fetched_at: number; laps: Lap[] | null; streams: Streams | null }

const toSummary = (a: SummaryActivity): ActSummary => ({
  id: a.id, name: a.name, sport_type: a.sport_type, start_date_local: a.start_date_local, local_date: localDateOf(a.start_date_local),
  distance_m: a.distance, moving_time_s: a.moving_time, elapsed_time_s: a.elapsed_time,
  avg_hr: a.average_heartrate ?? null, max_hr: a.max_heartrate ?? null, avg_speed: a.average_speed ?? null,
});

export async function loadActs(uid: number): Promise<ActSummary[]> {
  return (await (await getStore()).get<ActSummary[]>(String(uid), "acts")) ?? [];
}

function clientFor(uid: number, f?: FetchFn) {
  // Serverless: never sleep waiting for a rate-limit window; record the pause and resume later.
  return new StravaClient({ getAccessToken: () => validAccessToken(uid, f), fetch: f, maxWaitMs: 0 });
}

/** List new runs from Strava (1–2 API calls). Detail and streams are fetched only when a session is opened. */
export async function syncUser(uid: number, opts: { fetch?: FetchFn; force?: boolean } = {}): Promise<SyncResult> {
  const acc = await loadAccount(uid);
  if (!acc) return { status: "disconnected", added: 0, message: "Strava is not connected." };
  if (!opts.force && acc.paused_until && new Date(acc.paused_until) > new Date())
    return { status: "paused", added: 0, message: acc.sync_message ?? "Waiting for Strava's rate limit to reset." };
  const store = await getStore();
  const existing = await loadActs(uid);
  const byId = new Map(existing.map((a) => [a.id, a]));
  const newest = existing.reduce((m, a) => (a.start_date_local > m ? a.start_date_local : m), "");
  const after = newest ? Math.floor(new Date(newest).getTime() / 1000) - RELIST_OVERLAP_DAYS * 86400 : nowEpoch() - FIRST_SYNC_DAYS * 86400;
  const client = clientFor(uid, opts.fetch);
  let added = 0;
  try {
    for (let page = 1; page <= 4; page++) {
      const list = await client.get<SummaryActivity[]>("/athlete/activities", { after, per_page: 100, page });
      for (const a of list) if (RUN_SPORTS.includes(a.sport_type)) { if (!byId.has(a.id)) added++; byId.set(a.id, toSummary(a)); }
      if (list.length < 100) break;
    }
    const all = [...byId.values()].sort((a, b) => a.start_date_local.localeCompare(b.start_date_local)).slice(-KEEP_ACTIVITIES);
    await store.set(String(uid), "acts", all);
    const message = added ? `${added} new run${added === 1 ? "" : "s"} from Strava.` : "Up to date.";
    await saveAccount({ ...(await loadAccount(uid))!, last_sync_at: nowEpoch(), sync_message: message, paused_until: null });
    return { status: "ok", added, message };
  } catch (e) {
    const fresh = (await loadAccount(uid)) ?? acc;
    if (e instanceof RateLimitPause) {
      const message = "Strava's rate limit is reached for now. Syncing resumes automatically in a few minutes.";
      await saveAccount({ ...fresh, sync_message: message, paused_until: e.resumeAt.toISOString() });
      return { status: "paused", added, message };
    }
    const revoked = (e instanceof StravaError && e.status === 401) || (e instanceof TokenError && (e.status === 400 || e.status === 401));
    const message = revoked ? "Strava access was revoked or has expired. Reconnect from Settings." : "Could not reach Strava. Try again shortly.";
    await saveAccount({ ...fresh, sync_message: message });
    return { status: "error", added, message };
  }
}

export function downsample<T extends Record<string, unknown[]>>(st: T, max = MAX_STREAM_POINTS): T {
  const n = (st.time ?? st.distance ?? []).length;
  if (n <= max) return st;
  const k = Math.ceil(n / max);
  const idx: number[] = [];
  for (let i = 0; i < n; i += k) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  return Object.fromEntries(Object.entries(st).map(([key, arr]) => [key, idx.map((i) => arr[i])])) as T;
}

/** Laps and streams for one activity, fetched once (2 API calls) and kept. Returns null if Strava can't be reached. */
export async function ensureDetail(uid: number, actId: number, opts: { fetch?: FetchFn } = {}): Promise<ActDetail | null> {
  const store = await getStore();
  const key = `act_${actId}`;
  const have = await store.get<ActDetail>(String(uid), key);
  if (have) return have;
  if (!(await loadActs(uid)).some((a) => a.id === actId)) return null; // only the runner's own, listed activities
  try {
    const client = clientFor(uid, opts.fetch);
    const d = await client.get<{ laps?: Lap[] }>(`/activities/${actId}`);
    let streams: Streams | null = null;
    try {
      const raw = await client.get<Record<string, { data: unknown[] }>>(`/activities/${actId}/streams`, { keys: "time,distance,heartrate,velocity_smooth,moving", key_by_type: "true" });
      const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.data]));
      if (flat.time && flat.distance) streams = downsample(flat) as unknown as Streams;
    } catch (e) { if (e instanceof RateLimitPause) throw e; }
    const detail: ActDetail = { id: actId, fetched_at: nowEpoch(), laps: d.laps?.length ? d.laps : null, streams };
    await store.set(String(uid), key, detail);
    return detail;
  } catch {
    return null;
  }
}

/**
 * The runner revoked access at Strava: remove everything that came from Strava (tokens, activities, laps and
 * streams). Their own answers, plan and logs stay, so reconnecting picks up where they left off.
 */
export async function purgeStravaData(uid: number): Promise<void> {
  const store = await getStore();
  const o = String(uid);
  for (const a of await loadActs(uid)) await store.del(o, `act_${a.id}`);
  await store.del(o, "acts");
  await store.del(o, "account");
}

/** True only when Strava itself confirms the stored token no longer works. */
export async function accessRevoked(uid: number, f: FetchFn = fetch): Promise<boolean> {
  if (!(await loadAccount(uid))) return false;
  try {
    await new StravaClient({ getAccessToken: () => validAccessToken(uid, f), fetch: f, maxWaitMs: 0 }).get("/athlete");
    return false;
  } catch (e) {
    return (e instanceof StravaError && e.status === 401) || (e instanceof TokenError && (e.status === 400 || e.status === 401));
  }
}
