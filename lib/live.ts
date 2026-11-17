import { sign } from "@/lib/crypto";
import { getSecret } from "@/lib/session";
import { supabaseEnv } from "@/lib/supabase";

/**
 * Live updates through Supabase Realtime (Broadcast). Supabase carries only an empty "something changed" ping on a
 * per-runner topic; no training data, names or ids ever go there. The topic is an HMAC of the athlete id with the
 * site secret, so it cannot be guessed, and the worst a stranger with the public key could do is make a page reload.
 * Without SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY everything here is a no-op and the app falls back to polling.
 */
export interface LiveConfig { url: string; key: string; topic: string }

const env = supabaseEnv;

export async function liveTopic(uid: number): Promise<string> {
  return "rbr-" + sign(`live:${uid}`, await getSecret()).replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
}

export async function liveConfig(uid: number): Promise<LiveConfig | null> {
  const e = env();
  return e ? { ...e, topic: await liveTopic(uid) } : null;
}

/** Tell every open tab of this runner to re-render. Never throws and never waits more than 2.5 s. */
export async function publishChange(uid: number, f: typeof fetch = fetch): Promise<boolean> {
  const e = env();
  if (!e) return false;
  try {
    const res = await f(`${e.url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: e.key, Authorization: `Bearer ${e.key}` },
      body: JSON.stringify({ messages: [{ topic: await liveTopic(uid), event: "changed", payload: { at: Date.now() } }] }),
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}
