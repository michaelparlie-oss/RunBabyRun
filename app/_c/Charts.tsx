"use client";

import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const axis = { tickLine: false, axisLine: false } as const;
const GRID = <CartesianGrid vertical={false} stroke="var(--color-grid)" />;
const box = "border border-line-strong bg-white px-2.5 py-1.5 text-xs tnum";
const A = { isAnimationActive: false } as const; // these redraw on every live refresh: no replayed animation

export interface RunPoint { day: number; label: string; pace: number; trend: number | null; hr: number | null; km: number; recent: boolean }

/** Every run's average pace, with the 28-day rolling median through it. Faster is higher. */
export function PaceTrend({ runs }: { runs: RunPoint[] }) {
  const ticks = runs.length ? [runs[0].day, runs[Math.floor(runs.length / 2)].day, runs[runs.length - 1].day] : [];
  const lab = new Map(runs.map((r) => [r.day, r.label]));
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={runs} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {GRID}
          <XAxis dataKey="day" type="number" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={(d: number) => lab.get(d) ?? ""} {...axis} />
          <YAxis reversed domain={["dataMin - 10", "dataMax + 10"]} tickFormatter={mmss} width={40} {...axis} />
          <Tooltip content={({ active, payload }) => { const r = payload?.[0]?.payload as RunPoint | undefined; return active && r ? <div className={box}><b>{r.label}</b><br />{r.km.toFixed(1)} km at {mmss(r.pace)} /km{r.hr ? `, ${Math.round(r.hr)} bpm` : ""}{r.trend ? <><br />28-day median {mmss(r.trend)}</> : null}</div> : null; }} />
          <Scatter dataKey="pace" fill="var(--color-long)" stroke="var(--color-long-ink)" {...A} />
          <Line dataKey="trend" stroke="var(--color-ink)" strokeWidth={2} dot={false} connectNulls {...A} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Pace against heart rate. Recent runs sitting up and to the left of older ones means more speed for the same effort. */
export function PaceHeart({ runs }: { runs: RunPoint[] }) {
  const pts = runs.filter((r) => r.hr);
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 8, bottom: 16, left: 0 }}>
          <CartesianGrid stroke="var(--color-grid)" />
          <XAxis dataKey="hr" type="number" domain={["dataMin - 3", "dataMax + 3"]} tickFormatter={(v: number) => `${Math.round(v)}`} label={{ value: "average heart rate (bpm)", position: "insideBottom", offset: -8, fontSize: 12, fill: "var(--color-axis)" }} {...axis} />
          <YAxis dataKey="pace" type="number" reversed domain={["dataMin - 10", "dataMax + 10"]} tickFormatter={mmss} width={40} {...axis} />
          <ZAxis dataKey="km" range={[30, 220]} />
          <Tooltip content={({ active, payload }) => { const r = payload?.[0]?.payload as RunPoint | undefined; return active && r ? <div className={box}><b>{r.label}</b><br />{mmss(r.pace)} /km at {Math.round(r.hr!)} bpm, {r.km.toFixed(1)} km</div> : null; }} />
          <Scatter data={pts.filter((r) => !r.recent)} fill="var(--color-strength)" fillOpacity={0.55} {...A} />
          <Scatter data={pts.filter((r) => r.recent)} fill="var(--color-hard)" stroke="var(--color-hard-ink)" {...A} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface WeekPoint { label: string; km: number; longest: number; ratio: number | null }

/** Last 7 days against the average week of the last 28, for each of the past twelve weeks. */
export function LoadRatio({ weeks }: { weeks: WeekPoint[] }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {GRID}
          <XAxis dataKey="label" minTickGap={20} {...axis} />
          <YAxis domain={[0, 2]} ticks={[0, 0.5, 1, 1.5, 2]} width={32} {...axis} />
          <ReferenceArea y1={0.8} y2={1.3} fill="var(--color-easy)" fillOpacity={0.3} />
          <ReferenceLine y={1} stroke="var(--color-axis)" strokeDasharray="3 3" />
          <Tooltip content={({ active, payload, label }) => { const w = payload?.[0]?.payload as WeekPoint | undefined; return active && w ? <div className={box}><b>Week to {label}</b><br />{w.km.toFixed(1)} km{w.ratio != null ? <>, ratio {w.ratio.toFixed(2)}</> : null}</div> : null; }} />
          <Line dataKey="ratio" stroke="var(--color-ink)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-ink)" }} connectNulls {...A} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Weekly distance as bars with the longest single run marked inside each bar. */
export function VolumeBars({ weeks }: { weeks: WeekPoint[] }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={-22}>
          {GRID}
          <XAxis dataKey="label" minTickGap={20} {...axis} />
          <YAxis width={32} {...axis} />
          <Tooltip cursor={{ fill: "var(--color-wash)" }} content={({ active, payload, label }) => { const w = payload?.[0]?.payload as WeekPoint | undefined; return active && w ? <div className={box}><b>Week to {label}</b><br />{w.km.toFixed(1)} km in total, longest {w.longest.toFixed(1)} km</div> : null; }} />
          <Bar dataKey="km" fill="var(--color-long)" barSize={22} {...A} />
          <Bar dataKey="longest" fill="var(--color-long-ink)" barSize={22} {...A} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface Bucket { label: string; n: number; mid: boolean }
/** How many runs fall in each pace band. */
export function PaceBands({ buckets }: { buckets: Bucket[] }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {GRID}
          <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={12} {...axis} />
          <YAxis allowDecimals={false} width={28} {...axis} />
          <Tooltip cursor={{ fill: "var(--color-wash)" }} content={({ active, payload }) => { const b = payload?.[0]?.payload as Bucket | undefined; return active && b ? <div className={box}><b>{b.label} /km</b><br />{b.n} {b.n === 1 ? "run" : "runs"}</div> : null; }} />
          <Bar dataKey="n" {...A}>{buckets.map((b) => <Cell key={b.label} fill={b.mid ? "var(--color-test)" : "var(--color-test-soft)"} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
