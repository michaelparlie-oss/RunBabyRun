import { beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt, sign } from "@/lib/crypto";
import { makeSessionToken, readSessionToken, SESSION_MAX_AGE_S } from "@/lib/session";
import { memoryStore, setStoreForTests } from "@/lib/storage";
import { profileFromForm, ScreeningError, suggestFromActs } from "@/lib/screening";
import { completeLogin, loadAccount, validAccessToken } from "@/lib/strava/oauth";
import { accessRevoked, ensureDetail, loadActs, purgeStravaData, syncUser } from "@/lib/strava/sync";
import { getStore } from "@/lib/storage";
import { generatePlan } from "@/lib/plan/generate";
import { alerts, loadCtx } from "@/lib/server/view";
import type { ActSummary } from "@/lib/types";
import { addDays, nowEpoch, todayLocal } from "@/lib/util/dates";
import { profile } from "./helpers";

const TODAY = "2026-11-17";
process.env.APP_TODAY = TODAY;
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
process.env.STRAVA_CLIENT_ID = "111";
process.env.STRAVA_CLIENT_SECRET = "sharedsecretsharedsecret";

const act = (id: number, date: string, km: number, paceS = 400, hr: number | null = 150): ActSummary => ({
  id, name: `Run ${id}`, sport_type: "Run", start_date_local: `${date}T06:00:00Z`, local_date: date, distance_m: km * 1000,
  moving_time_s: Math.round(km * paceS), elapsed_time_s: Math.round(km * paceS) + 30, avg_hr: hr, max_hr: hr ? hr + 20 : null, avg_speed: 1000 / paceS,
});
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

beforeEach(() => setStoreForTests(memoryStore()));

describe("crypto and sessions", () => {
  it("encrypts and decrypts, and rejects tampering or the wrong key", () => {
    const c = encrypt("refresh-token-123", "k1");
    expect(c).not.toContain("refresh-token-123");
    expect(decrypt(c, "k1")).toBe("refresh-token-123");
    expect(() => decrypt(c, "k2")).toThrow();
    const parts = c.split("."); parts[3] = Buffer.from("x" + Buffer.from(parts[3], "base64url").toString("latin1"), "latin1").toString("base64url");
    expect(() => decrypt(parts.join("."), "k1")).toThrow();
  });
  it("accepts a valid session token and rejects forged, altered and expired ones", () => {
    const now = 1_800_000_000;
    const tok = makeSessionToken(42, "s", now);
    expect(readSessionToken(tok, "s", now + 10)).toBe(42);
    expect(readSessionToken(tok, "other", now + 10)).toBeNull();
    expect(readSessionToken(tok.replace(".42.", ".43."), "s", now + 10)).toBeNull();
    expect(readSessionToken(tok, "s", now + SESSION_MAX_AGE_S + 1)).toBeNull();
    expect(readSessionToken(`v1.43.${now}.${sign(`v1.42.${now}`, "s")}`, "s", now)).toBeNull();
    expect(readSessionToken("garbage", "s", now)).toBeNull();
    expect(readSessionToken(undefined, "s", now)).toBeNull();
  });
});

describe("storage", () => {
  it("keeps each runner's documents apart and deletes only the owner's", async () => {
    const s = memoryStore();
    await s.set("1", "plan", { a: 1 }); await s.set("2", "plan", { a: 2 }); await s.set("11", "plan", { a: 11 });
    expect(await s.get("1", "plan")).toEqual({ a: 1 });
    await s.delAll("1");
    expect(await s.get("1", "plan")).toBeNull();
    expect(await s.get("11", "plan")).toEqual({ a: 11 });
    expect(await s.get("2", "plan")).toEqual({ a: 2 });
    expect(await s.setIfNew("2", "plan", { a: 9 })).toBe(false);
    await expect(s.get("../2", "plan")).rejects.toThrow();
    await expect(s.set("2", "a/b", 1)).rejects.toThrow();
  });
});

describe("screening", () => {
  const form = (over: Record<string, string | string[]> = {}) => {
    const base: Record<string, string | string[]> = {
      tz: "Asia/Jakarta", race_key: "10k", race_date: addDays(TODAY, 70), race_name: "City 10K", goal: "time", goal_time: "58:00", ref_kind: "race", ref_distance: "5k", ref_time: "29:30",
      weekly_km: "18", longest_km: "8", experience: "regular", can_run_30: "yes", run_days: ["1", "3", "5"], long_day: "5", strength: "1", equipment: "bodyweight",
      adult: "yes", ack: "yes", age: "34", max_hr: "", flags: [], niggles: ["knee", "bogus"], ...over,
    };
    const f = new FormData();
    for (const [k, v] of Object.entries(base)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
    return f;
  };
  const none = suggestFromActs([], TODAY);
  it("turns answers into a profile", () => {
    const p = profileFromForm(form(), none, TODAY);
    expect(p.race).toMatchObject({ key: "10k", goal: "time", goal_time_s: 58 * 60 });
    expect(p.fitness).toMatchObject({ ref_distance_km: 5, ref_time_s: 29 * 60 + 30, ref_source: "race" });
    expect(p.schedule.run_days).toEqual([1, 3, 5]);
    expect(p.health).toMatchObject({ age: 34, max_hr: null, max_hr_source: "age", niggles: ["knee"] });
    expect(generatePlan(p, TODAY).sessions.length).toBeGreaterThan(20);
  });
  it("rejects under-18s, missing acknowledgement, bad days and races that are too close", () => {
    const cases: Record<string, string | string[]>[] = [{ adult: "" }, { ack: "" }, { age: "16" }, { run_days: ["1", "3"] }, { long_day: "6" }, { race_date: addDays(TODAY, 5) }, { goal_time: "5" }, { ref_time: "1" }, { race_key: "ultra" }];
    for (const bad of cases)
      expect(() => profileFromForm(form(bad), none, TODAY), JSON.stringify(bad)).toThrow(ScreeningError);
  });
  it("suggests fitness from Strava runs and ignores walks and GPS glitches", () => {
    const acts = [act(1, addDays(TODAY, -3), 8, 390), act(2, addDays(TODAY, -6), 5, 360), act(3, addDays(TODAY, -10), 12, 420), act(4, addDays(TODAY, -12), 6, 900), act(5, addDays(TODAY, -20), 5, 100), act(6, addDays(TODAY, -100), 21, 380)];
    const s = suggestFromActs(acts, TODAY);
    expect(s.longest_km).toBe(12);
    expect(s.weekly_km).toBe(9); // 36 km in 28 days
    expect(s.ref?.name).toBe("Run 2");
    expect(s.max_hr).toBe(170);
    expect(profileFromForm(form({ ref_kind: "strava" }), s, TODAY).fitness.ref_source).toBe("strava");
    expect(profileFromForm(form({ ref_kind: "strava" }), none, TODAY).fitness.ref_source).toBe("estimate");
  });
});

describe("Strava connection", () => {
  const login = (id = 7, expires = nowEpoch() + 3600) => completeLogin(id, { access_token: "acc-1", refresh_token: "ref-1", expires_at: expires, athlete: { id, firstname: "Ana", lastname: "R" } }, "read,activity:read_all", "shared", null);

  it("stores tokens encrypted and refreshes them when they expire", async () => {
    const acc = await login(7, nowEpoch() - 10);
    expect(JSON.stringify(acc)).not.toContain("acc-1");
    expect(JSON.stringify(acc)).not.toContain("ref-1");
    const calls: string[] = [];
    const f = async (url: string, init?: RequestInit) => { calls.push(`${url} ${init?.body ?? ""}`); return json({ access_token: "acc-2", refresh_token: "ref-2", expires_at: nowEpoch() + 3600 }); };
    expect(await validAccessToken(7, f)).toBe("acc-2");
    expect(calls[0]).toContain("grant_type=refresh_token");
    expect(calls[0]).toContain("refresh_token=ref-1");
    expect(calls[0]).toContain("client_id=111");
    expect(await validAccessToken(7, async () => { throw new Error("no call expected"); })).toBe("acc-2");
  });

  it("uses the runner's own API keys when they connected with them", async () => {
    await completeLogin(8, { access_token: "a", refresh_token: "r", expires_at: nowEpoch() - 10, athlete: { id: 8 } }, "read,activity:read_all", "own", { clientId: "999", clientSecret: "ownsecretownsecretownsecret" });
    const acc = (await loadAccount(8))!;
    expect(acc.mode).toBe("own");
    expect(JSON.stringify(acc)).not.toContain("ownsecret");
    let body = "";
    await validAccessToken(8, async (_u, init) => { body = String(init?.body); return json({ access_token: "a2", refresh_token: "r2", expires_at: nowEpoch() + 3600 }); });
    expect(body).toContain("client_id=999");
    expect(body).toContain("client_secret=ownsecretownsecretownsecret");
  });

  it("syncs runs only, without duplicates, and keeps runners separate", async () => {
    await login(7); await login(9);
    const page = [
      { id: 1, name: "Morning Run", sport_type: "Run", start_date_local: "2026-11-15T06:00:00Z", distance: 8000, moving_time: 3000, elapsed_time: 3100, average_heartrate: 148, max_heartrate: 171 },
      { id: 2, name: "Ride", sport_type: "Ride", start_date_local: "2026-11-14T06:00:00Z", distance: 30000, moving_time: 4000, elapsed_time: 4100 },
      { id: 3, name: "Trail", sport_type: "TrailRun", start_date_local: "2026-11-10T06:00:00Z", distance: 12000, moving_time: 5400, elapsed_time: 5600 },
    ];
    const urls: string[] = [];
    const f = async (url: string, init?: RequestInit) => { urls.push(url); expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer acc-1"); return json(page); };
    const r1 = await syncUser(7, { fetch: f });
    expect(r1).toMatchObject({ status: "ok", added: 2 });
    expect(urls[0]).toContain("/athlete/activities");
    const r2 = await syncUser(7, { fetch: f });
    expect(r2.added).toBe(0);
    expect((await loadActs(7)).map((a) => a.id)).toEqual([3, 1]);
    expect(await loadActs(9)).toEqual([]);
    expect((await loadAccount(7))!.last_sync_at).toBeGreaterThan(0);
  });

  it("pauses on a rate limit and reports revoked access", async () => {
    await login(7);
    const limited = await syncUser(7, { fetch: async () => json({ message: "Rate Limit Exceeded" }, 429, { "x-ratelimit-limit": "100,1000", "x-ratelimit-usage": "100,400" }) });
    expect(limited.status).toBe("paused");
    expect((await loadAccount(7))!.paused_until).toBeTruthy();
    expect((await syncUser(7, { fetch: async () => { throw new Error("should not be called while paused"); } })).status).toBe("paused");
    const revoked = await syncUser(7, { force: true, fetch: async () => json({ message: "Authorization Error" }, 401) });
    expect(revoked).toMatchObject({ status: "error" });
    expect(revoked.message).toMatch(/revoked/);
  });

  it("fetches laps and streams once, and only for the runner's own activities", async () => {
    await login(7);
    await syncUser(7, { fetch: async () => json([{ id: 1, name: "Run", sport_type: "Run", start_date_local: "2026-11-15T06:00:00Z", distance: 8000, moving_time: 3000, elapsed_time: 3100 }]) });
    let n = 0;
    const f = async (url: string) => { n++; return url.includes("/streams") ? json({ time: { data: [0, 1, 2] }, distance: { data: [0, 3, 6] }, heartrate: { data: [100, 101, 102] } }) : json({ laps: [{ lap_index: 1, distance: 1000, moving_time: 300, elapsed_time: 300, start_index: 0, end_index: 2, average_heartrate: 150, max_heartrate: 160, average_speed: 3.3 }] }); };
    const d = await ensureDetail(7, 1, { fetch: f });
    expect(d?.laps).toHaveLength(1);
    expect(d?.streams?.time).toEqual([0, 1, 2]);
    await ensureDetail(7, 1, { fetch: f });
    expect(n).toBe(2);
    expect(await ensureDetail(7, 999, { fetch: f })).toBeNull();
    expect(n).toBe(2);
  });

  it("removes Strava data only when Strava confirms access was revoked, and keeps the runner's own plan", async () => {
    await login(7);
    const store = await getStore();
    await store.set("7", "profile", { mine: true });
    await syncUser(7, { fetch: async () => json([{ id: 1, name: "Run", sport_type: "Run", start_date_local: "2026-11-15T06:00:00Z", distance: 8000, moving_time: 3000, elapsed_time: 3100 }]) });
    await store.set("7", "act_1", { id: 1 });
    expect(await accessRevoked(7, async () => json({ id: 7 }))).toBe(false);
    expect(await accessRevoked(7, async () => { throw new Error("network down"); })).toBe(false);
    expect(await accessRevoked(99, async () => json({}, 401))).toBe(false);
    expect(await accessRevoked(7, async () => json({ message: "Authorization Error" }, 401))).toBe(true);
    await purgeStravaData(7);
    expect(await loadAccount(7)).toBeNull();
    expect(await loadActs(7)).toEqual([]);
    expect(await store.get("7", "act_1")).toBeNull();
    expect(await store.get("7", "profile")).toEqual({ mine: true });
  });
});

describe("runner view and safety alerts", () => {
  async function setup(acts: ActSummary[], logs?: unknown) {
    const store = memoryStore(); setStoreForTests(store);
    const p = profile({ fitness: { weekly_km: 25, longest_km: 10 } });
    const start = addDays(TODAY, -14);
    await store.set("7", "profile", p);
    await store.set("7", "plan", generatePlan(p, start));
    await store.set("7", "acts", acts);
    if (logs) await store.set("7", "logs", logs);
    return loadCtx(7);
  }
  it("matches Strava runs to planned sessions", async () => {
    expect(todayLocal("Asia/Jakarta")).toBe(TODAY);
    const blank = await setup([]);
    const first = blank.sessions.find((s) => s.category === "run" && s.date < TODAY)!;
    const c = await setup([act(1, first.date, first.distance_km!, 420)]);
    expect(c.status.get(first.id)).toBe("done");
    expect(c.actFor.get(first.id)?.id).toBe(1);
    expect([...c.status.values()].filter((s) => s === "missed").length).toBeGreaterThan(0);
  });
  it("warns about a distance spike, repeated pain and a missed week", async () => {
    const spike = await setup([act(1, addDays(TODAY, -20), 8), act(2, addDays(TODAY, -2), 14)]);
    expect(alerts(spike).map((a) => a.title)).toContain("Big jump in distance");
    const calm = await setup([act(1, addDays(TODAY, -20), 8), act(2, addDays(TODAY, -2), 8.5)]);
    expect(alerts(calm).map((a) => a.title)).not.toContain("Big jump in distance");
    const pain = await setup([], { wellbeing: [{ date: addDays(TODAY, -1), area: "knee", pain: 5, note: "" }, { date: addDays(TODAY, -6), area: "knee", pain: 4, note: "" }], strength_done: {}, skipped: {}, results: [] });
    expect(alerts(pain).find((a) => a.level === "stop")?.title).toBe("Pain keeps coming back");
    expect(alerts(pain).some((a) => a.action === "rebuild" && a.title === "Last week went off plan")).toBe(true);
  });
});
