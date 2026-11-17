import { NextResponse } from "next/server";
import { getStore } from "@/lib/storage";
import { siteCreds } from "@/lib/strava/oauth";

/** Deployment check: is storage working, and is the shared Strava app configured? No personal data. */
export async function GET() {
  const out: Record<string, unknown> = { app: "runbabyrun", shared_strava_app: !!siteCreds(), session_secret_env: !!process.env.SESSION_SECRET, live_updates: !!(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) };
  try {
    const store = await getStore();
    const stamp = Date.now();
    await store.set("sys", "health", { stamp });
    const back = await store.get<{ stamp: number }>("sys", "health");
    out.storage = store.kind;
    out.storage_ok = back?.stamp === stamp;
  } catch (e) {
    out.storage_ok = false;
    out.storage_error = e instanceof Error ? e.message.slice(0, 200) : "error";
  }
  return NextResponse.json({ ok: out.storage_ok === true, ...out }, { status: out.storage_ok ? 200 : 500, headers: { "Cache-Control": "no-store" } });
}
