import Link from "next/link";
import type { Notice, Segment, Zone, Zones } from "@/lib/types";
import { fmtDuration, fmtHrRange, fmtKm, fmtPaceRange } from "@/lib/util/format";
import { Tip } from "./Tip";

const ZONE_COLORS: Record<string, string> = {
  E: "var(--color-easy)", L: "var(--color-long)", REC: "var(--color-strength)", RP: "var(--color-ink)",
  T: "var(--color-warn)", I: "var(--color-hard)", ST: "var(--color-test)", H: "var(--color-hard)", RACE: "var(--color-ink)",
};
const TARGET: Record<Zone["primary_target"], string> = { HR: "heart rate", pace: "pace (heart rate is a ceiling)", feel: "effort", plan: "the pacing notes" };

export function ZoneChip({ zone }: { zone: Zone }) {
  const pace = fmtPaceRange(zone.pace_min_s_per_km, zone.pace_max_s_per_km);
  const hr = fmtHrRange(zone.hr_min, zone.hr_max);
  return (
    <Tip className="inline-flex items-center gap-1.5 text-sm font-semibold underline decoration-dotted underline-offset-4" label={<><i className="inline-block h-2.5 w-2.5" style={{ background: ZONE_COLORS[zone.code] ?? "var(--color-strength)" }} />{zone.name}</>}>
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
          <li key={i} className="border-l-4 bg-wash py-2 pl-3 pr-3" style={{ borderColor: ZONE_COLORS[s.zone] ?? "var(--color-strength)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{SEG_LABEL[s.kind]}, {s.repeat > 1 ? `${s.repeat} × ` : ""}{segLen(s)}</span>
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
  return <span className="mark text-sm font-semibold">{txt}</span>;
}

const STATUS: Record<string, [string, string]> = {
  done: ["Done", "var(--color-good)"], partial: ["Partly done", "var(--color-warn)"], moved: ["Done on another day", "var(--color-good)"],
  missed: ["Missed", "var(--color-critical)"], skipped: ["Skipped", "var(--color-faint)"], pending: ["Planned", "var(--color-faint)"],
};
export function StatusPill({ status, invert = false }: { status: string; invert?: boolean }) {
  const [l, c] = STATUS[status] ?? [status, "var(--color-faint)"];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold ${invert ? "text-white" : "text-ink"}`}><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}</span>;
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
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={6} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={6} strokeDasharray={`${(v / 100) * c} ${c}`} />
        </svg>
        <span className="absolute inset-0 grid place-items-center numeral text-2xl">{v}</span>
      </div>
      <span className="text-xs font-medium text-muted">{label}</span>
    </div>
  );
}

export function PageTitle({ title, sub, back, actions }: { title: string; sub?: React.ReactNode; back?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-5 border-b-2 border-ink pb-3 lg:mb-7">
      {back && <Link href={back} className="mb-2 inline-block text-sm font-semibold underline underline-offset-4">Back</Link>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-4xl lg:text-5xl">{title}</h1>
          {sub && <div className="mt-1.5 text-sm text-ink-2">{sub}</div>}
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
            {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
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
    <div className="border-t-2 border-ink pt-2">
      <div className="numeral text-4xl">{value}{unit && <span className="ml-1.5 font-sans text-sm font-semibold text-muted">{unit}</span>}</div>
      <div className="mt-1 text-sm font-semibold">{label}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

const NOTICE: Record<Notice["level"], [string, string]> = {
  info: ["var(--color-long)", "Note"], warn: ["var(--color-warn)", "Heads-up"], stop: ["var(--color-critical)", "Stop and check"],
};
export function NoticeBox({ n, children }: { n: Notice; children?: React.ReactNode }) {
  const [color, tag] = NOTICE[n.level];
  return (
    <div className="border-l-[6px] bg-card px-4 py-3 text-sm" style={{ borderColor: color }} role={n.level === "stop" ? "alert" : undefined}>
      <div className="text-base font-bold">{tag}: {n.title}</div>
      <p className="mt-1 text-ink-2">{n.text}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function Flash({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <p role="status" className="border-l-[6px] bg-card px-3 py-2 text-sm font-medium" style={{ borderColor: ok ? "var(--color-good)" : "var(--color-critical)" }}>{children}</p>;
}
