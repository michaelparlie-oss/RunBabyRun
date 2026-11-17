"use client";

import { useEffect, useRef, useState } from "react";

function useAnimatedValue(target: number, ms = 900) {
  const [v, setV] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    let raf = 0;
    start.current = null;
    function step(t: number) {
      if (start.current == null) start.current = t;
      const p = Math.min(1, (t - start.current) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return v;
}

/** A single animated progress ring with a big number in the middle. Re-animates whenever `pct` changes (e.g. after LiveRefresh pulls fresh data). */
export function ProgressRing({
  pct, value, unit, label, sub, color = "var(--color-accent)", track = "#eef0f3", size = 92, stroke = 9,
}: { pct: number; value: React.ReactNode; unit?: string; label: string; sub?: string; color?: string; track?: string; size?: number; stroke?: number }) {
  const clamped = Math.max(0, Math.min(1, pct));
  const animated = useAnimatedValue(clamped);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="card flex items-center gap-3">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - animated)}
            style={{ transition: "stroke-dashoffset 120ms linear" }}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-lg font-extrabold tnum">{value}</span>
      </div>
      <div className="min-w-0">
        <div className="label">{label}</div>
        <div className="text-sm font-semibold text-ink-2">{unit}</div>
        {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
      </div>
    </div>
  );
}
