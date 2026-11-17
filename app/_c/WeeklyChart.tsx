"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = { start: string; planned: number; actual: number; future: boolean };

function shortDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function TooltipCard({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const planned = payload.find((p) => p.dataKey === "planned")?.value ?? 0;
  const actual = payload.find((p) => p.dataKey === "actual")?.value;
  return (
    <div className="border-2 border-ink bg-white px-3 py-2 text-xs">
      <div className="font-semibold">{label}</div>
      <div className="mt-1 tnum">Planned: {planned.toFixed(1)} km</div>
      {actual != null && <div className="tnum" style={{ color: "var(--color-series-1)" }}>Run: {actual.toFixed(1)} km</div>}
    </div>
  );
}

export function WeeklyChart({ rows, thisMon }: { rows: Row[]; thisMon: string }) {
  const data = rows.map((r) => ({ ...r, label: shortDate(r.start), actualVisible: r.future ? null : r.actual }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="planned-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-grid)" stopOpacity={0.9} />
              <stop offset="100%" stopColor="var(--color-grid)" stopOpacity={0.15} />
            </linearGradient>
            <linearGradient id="actual-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-series-1)" stopOpacity={0.55} />
              <stop offset="100%" stopColor="var(--color-series-1)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={32} tickFormatter={(v: number) => `${v}`} />
          <Tooltip content={<TooltipCard />} />
          <ReferenceLine x={shortDate(thisMon)} stroke="var(--color-ink)" strokeWidth={2} label={{ value: "now", position: "insideTopRight", fill: "var(--color-ink)", fontSize: 12, fontWeight: 600 }} />
          <Area type="stepAfter" dataKey="planned" stroke="var(--color-axis)" strokeWidth={1.5} fill="url(#planned-fill)" isAnimationActive animationDuration={500} />
          <Area type="stepAfter" dataKey="actualVisible" stroke="var(--color-series-1)" strokeWidth={2.5} fill="url(#actual-fill)" isAnimationActive animationDuration={500} connectNulls={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
