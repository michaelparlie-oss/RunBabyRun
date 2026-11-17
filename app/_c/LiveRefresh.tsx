"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { syncBackground } from "@/app/actions";
import type { LiveConfig } from "@/lib/live";

const REFRESH_MS = 45_000; // re-render from stored data
const SYNC_MS = 5 * 60_000; // ask Strava for new runs (one small API call)

/**
 * Keeps the signed-in pages current without a reload:
 *  - instantly, when the server pings this runner's Supabase Realtime topic (a sync, a log entry, another device);
 *  - every 45 s while the tab is visible, as a fallback and for the date rolling over;
 *  - every 5 min it also checks Strava for new runs.
 * Pauses when the tab is hidden and never interrupts typing in a form field.
 */
export function LiveRefresh({ live }: { live: LiveConfig | null }) {
  const router = useRouter();
  const [state, setState] = useState<"off" | "live" | "poll">("off");
  const [pulse, setPulse] = useState(0);
  const lastSync = useRef(Date.now());

  useEffect(() => {
    const busy = () => !!document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
    const refresh = () => { if (document.hidden || busy()) return; router.refresh(); setPulse((n) => n + 1); };
    const tick = () => {
      if (document.hidden) return;
      if (Date.now() - lastSync.current > SYNC_MS) { lastSync.current = Date.now(); syncBackground().catch(() => {}); }
      refresh();
    };
    const timer = setInterval(tick, REFRESH_MS);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVisible);
    setState("poll");

    let stop = () => {};
    if (live) {
      let cancelled = false;
      import("@supabase/supabase-js").then(({ createClient }) => {
        if (cancelled) return;
        const sb = createClient(live.url, live.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
        const ch = sb.channel(live.topic).on("broadcast", { event: "changed" }, refresh).subscribe((s) => setState(s === "SUBSCRIBED" ? "live" : "poll"));
        stop = () => { sb.removeChannel(ch); };
      }).catch(() => {});
      const prev = stop;
      stop = () => { cancelled = true; prev(); };
    }
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); stop(); };
  }, [router, live]);

  if (state === "off") return null;
  return (
    <span className="pointer-events-none fixed bottom-20 right-3 z-40 flex items-center gap-1.5 border border-line bg-white px-2 py-1 text-xs font-semibold text-ink-2 lg:bottom-4" title={state === "live" ? "Updates arrive instantly" : "Refreshing every 45 seconds"}>
      <span className="relative flex h-2 w-2">
        <span key={pulse} className={`absolute inline-flex h-full w-full rounded-full ${state === "live" ? "bg-good" : "bg-warn"} live-ping`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${state === "live" ? "bg-good" : "bg-warn"}`} />
      </span>
      {state === "live" ? "Live" : "Auto"}
    </span>
  );
}
