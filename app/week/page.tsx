import Link from "next/link";
import { redirect } from "next/navigation";
import { RunCard, StrengthCard } from "@/app/_c/Cards";
import { PageTitle } from "@/app/_c/ui";
import { loadCtx } from "@/lib/server/view";
import { requireUser } from "@/lib/session";
import { addDays, DOW_LONG, fmtDate, mondayOf } from "@/lib/util/dates";

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const c = await loadCtx(await requireUser());
  if (!c.plan) redirect("/start");
  const weeks = c.plan.weeks;
  const current = weeks.find((w) => w.start === mondayOf(c.today))?.n ?? (c.today < weeks[0].start ? 1 : weeks.length);
  const n = Math.min(weeks.length, Math.max(1, Number((await searchParams).w) || current));
  const w = weeks[n - 1];
  const inWeek = c.plan.sessions.map((s) => c.sessions.find((x) => x.id === s.id)!).filter((s) => s.week === n);
  const actual = c.acts.filter((a) => a.local_date >= w.start && a.local_date < addDays(w.start, 7)).reduce((t, a) => t + a.distance_m / 1000, 0);
  return (
    <>
      <PageTitle
        title={`Week ${n} of ${weeks.length}`}
        sub={`${fmtDate(w.start)} – ${fmtDate(addDays(w.start, 6))}, ${w.phase}${w.deload ? ", easier week" : ""}, planned ${w.planned_km} km, run ${actual.toFixed(1)} km`}
        actions={<>
          {n > 1 && <Link className="btn" href={`/week?w=${n - 1}`}>Earlier</Link>}
          {n !== current && <Link className="btn" href="/week">This week</Link>}
          {n < weeks.length && <Link className="btn" href={`/week?w=${n + 1}`}>Later</Link>}
        </>}
      />
      {w.deload && <p className="mb-3 rounded-lg border-l-[6px] border-long bg-card px-4 py-3 text-sm"><b>Easier week.</b> About a quarter less running and half the strength sets. This is where fitness is absorbed, so resist adding more.</p>}
      <div className="space-y-3">
        {Array.from({ length: 7 }, (_, d) => addDays(w.start, d)).map((date, d) => {
          const day = inWeek.filter((s) => s.date === date);
          return (
            <section key={date} aria-label={DOW_LONG[d]}>
              {day.length === 0 ? (
                <div className={`rounded-lg border border-dashed border-line px-4 py-2 text-sm text-muted ${date === c.today ? "bg-white" : ""}`}>{DOW_LONG[d]} {fmtDate(date)}, rest</div>
              ) : (
                <div className="space-y-3">{day.map((s) => (s.category === "run" ? <RunCard key={s.id} s={s} c={c} /> : <StrengthCard key={s.id} s={s} c={c} />))}</div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
