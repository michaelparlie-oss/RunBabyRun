"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 45_000;

/**
 * Keeps the signed-in dashboard feeling alive without a manual reload.
 * While the tab is visible, re-runs the current route's server components
 * (router.refresh()) every INTERVAL_MS, so today's date rollover, newly
 * synced Strava activities, and anything another tab/device changed show
 * up on their own. Pauses entirely when the tab is hidden or offline, and
 * never fires while a page is mid-interaction (focus in a form field).
 */
export function LiveRefresh() {
  const router = useRouter();
  const [pulse, setPulse] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function tick() {
      if (document.hidden) return;
      if (document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
      router.refresh();
      setPulse(true);
      setTimeout(() => setPulse(false), 900);
    }
    function start() {
      stop();
      timer.current = setInterval(tick, INTERVAL_MS);
    }
    function stop() {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    }
    function onVisibility() {
      if (document.hidden) stop();
      else { tick(); start(); }
    }
    start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", tick);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("focus", tick); };
  }, [router]);

  return (
    <span className="pointer-events-none fixed bottom-20 right-3 z-40 lg:bottom-4" aria-hidden>
      <span className={`block h-2 w-2 rounded-full bg-accent transition-opacity duration-700 ${pulse ? "opacity-100" : "opacity-0"}`} />
    </span>
  );
}
