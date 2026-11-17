import Link from "next/link";
import type { Notice, Segment, Zone, Zones } from "@/lib/types";
import { fmtDuration, fmtHrRange, fmtKm, fmtPaceRange } from "@/lib/util/format";
import { Tip } from "./Tip";

const ZONE_COLORS: Record<string, string> = {
  E: "bg-emerald-100 text-emerald-800", L: "bg-emerald-100 text-emerald-800", REC: "bg-slate-100 text-slate-700", RP: "bg-sky-100 text-sky-800",
  T: "bg-amber-100 text-amber-800", I: "bg-orange-100 text-orange-800", ST: "bg-fuchsia-100 text-fuchsia-800", H: "bg-rose-100 text-rose-800", RACE: "bg-yellow-100 text-yellow-900",
};
const TARGET: Record<Zone["primary_target"], string> = { HR: "heart rate", pace: "pace (heart rate is a ceiling)", feel: "effort", plan: "the pacing notes" };

export function ZoneChip({ zone }: { zone: Zone }) {
  const pace = fmtPaceRange(zone.pace_min_s_per_km, zone.pace_max_s_per_km);
  const hr = fmtHrRange(zone.hr_min, zone.hr_max);
  return (
    <Tip className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${ZONE_COLORS[zone.code] ?? ""}`} label={<>{zone.name} ⓘ</>}>
      <b>{zone.name}.</b> {zone.feel}
      {pace && <span className="mt-1 block">Pace: {pace}</span>}
      {hr && <span className="block">Heart rate: {hr}</span>}
      <span className="mt-1 block text-muted">Main target: {TARGET[zone.primary_target]}</span>
    </Tip>
  );
}

const SEG_LABEL: Record<Segment["kind"], string> = { warmup: "Warm-up", work: "Work", cooldown: "Cool-down", steady: "Run", strides: "Strides", race: "Race" };
export const segLen = (s: Segment) => (s.distance_km != null ? fmtKm(s.distance_km) : fmtDuration(s.duration_s!));

export function SegmentList({ segments, zones }: { segments: Segment[]; zones: Zones }) {
  return (
    <ol className="mt-3 space-y-2">
      {segments.map((s, i) => {
        const z = zones[s.zone];
        const pace = fmtPaceRange(z.pace_min_s_per_km, z.pace_max_s_per_km);
        const hr = fmtHrRange(z.hr_min, z.hr_max);
        return (
          <li key={i} className="rounded-xl bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{SEG_LABEL[s.kind]}: {s.repeat > 1 ? `${s.repeat} × ` : ""}{segLen(s)}</span>
              <ZoneChip zone={z} />
            </div>
            <div className="mt-1 text-sm tnum">
              {pace && <span className="mr-3">Pace {pace}</span>}
              {hr && <span>HR {hr}</span>}
              {!pace && !hr && <span className="text-muted">{z.feel}</span>}
            </div>
            {s.recovery && <div className="mt-1 text-xs text-muted">Between reps: {fmtDuration(s.recovery.duration_s)} easy jog or walk</div>}
            {s.note && <div className="mt-1 text-xs text-muted">{s.note}</div>}
          </li>
        );
      })}
    </ol>
  );
}

export function TargetBadge({ kind }: { kind: string | null }) {
  const hr = kind === "easy" || kind === "long";
  const txt = kind === "race" ? "Race day: follow the pacing notes" : kind === "test" ? "Test day: even, honest effort" : hr ? "Heart rate decides today: keep it easy" : "Pace decides today: heart rate is a ceiling";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold text-white ${hr ? "bg-emerald-600" : "bg-indigo-600"}`}>{txt}</span>;
}

const STATUS: Record<string, [string, string]> = {
  done: ["Done", "bg-emerald-100 text-emerald-800"], partial: ["Partly done", "bg-amber-100 text-amber-800"], moved: ["Done (other day)", "bg-sky-100 text-sky-800"],
  missed: ["Missed", "bg-rose-100 text-rose-800"], skipped: ["Skipped", "bg-slate-200 text-slate-700"], pending: ["Planned", "bg-slate-100 text-slate-600"],
};
export function StatusPill({ status }: { status: string }) {
  const [l, c] = STATUS[status] ?? [status, "bg-slate-100"];
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${c}`}>{l}</span>;
}

export function ScoreRing({ score, label, size = 64 }: { score: number | null; label: string; size?: number }) {
  if (score == null) return null;
  const v = Math.max(0, Math.min(100, Math.round(score)));
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  const col = v >= 80 ? "var(--color-good)" : v >= 50 ? "var(--color-warn)" : "var(--color-critical)";
  return (
    <div className="flex flex-col items-center gap-1" title={`${label}: ${v} out of 100`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f3" strokeWidth={6} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-base font-extrabold tnum">{v}</span>
      </div>
      <span className="text-[11px] font-medium text-muted">{label}</span>
    </div>
  );
}

export function PageTitle({ title, sub, back, actions }: { title: string; sub?: React.ReactNode; back?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-5 lg:mb-7">
      {back && <Link href={back} className="mb-1 inline-block text-sm font-semibold text-accent hover:underline">← Back</Link>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">{title}</h1>
          {sub && <div className="mt-0.5 text-sm text-muted">{sub}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Panel({ title, sub, right, children, className = "" }: { title?: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="h2">{title}</h2>}
            {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, unit, sub }: { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode }) {
  return (
    <div className="card flex flex-col gap-1">
      <div className="label">{label}</div>
      <div className="text-2xl font-extrabold tracking-tight tnum">{value}{unit && <span className="ml-1 text-sm font-semibold text-muted">{unit}</span>}</div>
      {sub && <div className="text-xs font-medium text-muted">{sub}</div>}
    </div>
  );
}

const NOTICE: Record<Notice["level"], [string, string]> = {
  info: ["border-sky-200 bg-sky-50 text-sky-950", "Note"], warn: ["border-amber-300 bg-amber-50 text-amber-950", "Heads-up"], stop: ["border-red-300 bg-red-50 text-red-950", "Important"],
};
export function NoticeBox({ n, children }: { n: Notice; children?: React.ReactNode }) {
  const [cls, tag] = NOTICE[n.level];
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`} role={n.level === "stop" ? "alert" : undefined}>
      <div className="font-bold"><span className="mr-2 text-[11px] uppercase tracking-wider opacity-70">{tag}</span>{n.title}</div>
      <p className="mt-1">{n.text}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function Flash({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <p role="status" className={`rounded-lg px-3 py-2 text-sm ${ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{children}</p>;
}
