import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { loadAccount } from "@/lib/strava/oauth";
import { publishChange } from "@/lib/live";
import { uidForStrava } from "@/lib/users";
import { accessRevoked, purgeStravaData, syncUser } from "@/lib/strava/sync";

/**
 * Strava webhook for the shared Strava application. It acts when a runner revokes access from Strava's side,
 * as Strava's API terms ask, and it pulls a new or changed activity straight away so open tabs update at once. See README ("Webhook") for the one-time subscription.
 */

/** Subscription handshake: Strava calls this once and expects the challenge echoed back. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const want = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
  const got = q.get("hub.verify_token") ?? "";
  const challenge = q.get("hub.challenge");
  if (!want || q.get("hub.mode") !== "subscribe" || !challenge || !safeEqual(got, want)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ "hub.challenge": challenge });
}

/**
 * Events are not signed by Strava, so nothing is deleted on the event's word alone: a deauthorization
 * event only prompts a check with Strava, and data is removed when Strava confirms the token is dead.
 */
export async function POST(req: NextRequest) {
  let ev: { object_type?: string; aspect_type?: string; owner_id?: number; updates?: Record<string, unknown> } = {};
  try { ev = await req.json(); } catch { /* ignore malformed bodies */ }
  const athlete = Number(ev.owner_id);
  const uid = Number.isSafeInteger(athlete) && athlete > 0 ? ((await uidForStrava(athlete).catch(() => null)) ?? 0) : 0;
  if (ev.object_type === "athlete" && String(ev.updates?.authorized) === "false" && Number.isSafeInteger(uid) && uid > 0) {
    try {
      const acc = await loadAccount(uid);
      if (acc?.mode === "shared" && (await accessRevoked(uid))) await purgeStravaData(uid);
    } catch { /* Strava expects a fast 200 regardless; the next sync reports a revoked connection */ }
  }
  // New, edited or deleted activity: the event is only a hint. The data comes from our own authenticated sync.
  if (ev.object_type === "activity" && Number.isSafeInteger(uid) && uid > 0) {
    try {
      const acc = await loadAccount(uid);
      if (acc?.mode === "shared") { await syncUser(uid); await publishChange(uid); }
    } catch { /* the open tab's own periodic check picks it up instead */ }
  }
  return NextResponse.json({ ok: true });
}
