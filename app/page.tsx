import Link from "next/link";
import { redirect } from "next/navigation";
import { rebuildPlan } from "./actions";
import { RunCard, RunHero, StrengthCard } from "./_c/Cards";
import { effortOf } from "./_c/effort";
import { AutoSync, Submit, SyncButton } from "./_c/Forms";
import { WeekStrip, type StripDay } from "./_c/WeekStrip";
import { Flash, NoticeBox } from "./_c/ui";
import { alerts, loadCtx } from "@/lib/server/view";
import { currentUser } from "@/lib/session";
import { AUTO_SYNC_AFTER_S } from "@/lib/strava/sync";
import { addDays, diffDays, DOW, fmtDate, mondayOf, nowEpoch } from "@/lib/util/dates";

const SAMPLE: StripDay[] = [
  { date: "s1", dow: "Mon", effort: null, plannedKm: 0, doneKm: 0, today: false, future: false, strength: true },
  { date: "s2", dow: "Tue", effort: "easy", plannedKm: 6, doneKm: 6.2, today: false, future: false },
  { date: "s3", dow: "Wed", effort: "quality", plannedKm: 8, doneKm: 8.1, today: false, future: false },
  { date: "s4", dow: "Thu", effort: null, plannedKm: 0, doneKm: 0, today: false, future: false, strength: true },
  { date: "s5", dow: "Fri", effort: "easy", plannedKm: 5, doneKm: 0, today: true, future: true },
  { date: "s6", dow: "Sat", effort: null, plannedKm: 0, doneKm: 0, today: false, future: true },
  { date: "s7", dow: "Sun", effort: "long", plannedKm: 14, doneKm: 0, today: false, future: true },
];

function Landing({ deleted }: { deleted?: boolean }) {
  return (
    <div className="space-y-8 pt-2 lg:space-y-12 lg:pt-6">
      <header>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-7 w-7" />RunBabyRun
          </p>
          <Link href="/login" className="btn">Log in</Link>
        </div>
        <h1 className="display mt-5 text-6xl sm:text-7xl lg:text-8xl">Your next race,<br />one day at a time.</h1>
        <p className="mt-5 max-w-xl text-lg text-ink-2">A day-by-day plan for a 5K, 10K, half marathon or marathon, with a pace and heart-rate target for every run. Connect Strava and your runs arrive on their own, or log them yourself.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/signup" className="btn btn-primary px-6">Create an account</Link>
          <Link href="/about" className="btn">How plans are built</Link>
        </div>
      </header>
      {deleted && <Flash ok>Your account and data were deleted.</Flash>}

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        <div>
          <WeekStrip days={SAMPLE} plannedKm={33} doneKm={14.3} caption="Sample week from a half-marathon plan" />
          <p className="mt-2 text-sm text-muted">Bars are distance, colours are effort. A run fills in when you do it, and the plan warns you before a risky jump.</p>
        </div>
        <section>
          <h2 className="h2 border-b-2 border-ink pb-2">Two ways to track your runs</h2>
          <div className="border-b border-line py-4">
            <h3 className="text-2xl font-bold uppercase">With Strava</h3>
            <p className="mt-1 text-sm text-ink-2">Runs sync from your watch or phone. Each one is matched to the plan and scored against its pace and heart-rate target.</p>
          </div>
          <div className="py-4">
            <h3 className="text-2xl font-bold uppercase">By hand</h3>
            <p className="mt-1 text-sm text-ink-2">No Strava needed. Tick a run as done in one tap, or add distance and time for the full check. You can connect Strava later.</p>
          </div>
        </section>
      </div>

      <section>
        <h2 className="h2 border-b-2 border-ink pb-2">How it works</h2>
        <ol className="grid gap-x-8 sm:grid-cols-3">
          {[
            ["Sign up", "Create an account with your email, then choose Strava or manual tracking."],
            ["Answer", "Race, goal, the days you can run, equipment, and a short health check. A yes on health changes the advice, not your access."],
            ["Train", "Every day shows what to do and how hard. Your runs are checked against the plan as you go."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-4 border-b border-line py-4 sm:block sm:border-b-0">
              <span className="numeral text-5xl text-faint">{i + 1}</span>
              <div><h3 className="text-2xl font-bold uppercase sm:mt-2">{t}</h3><p className="mt-1 text-sm text-ink-2">{d}</p></div>
            </li>
          ))}
        </ol>
      </section>
      <p className="max-w-prose text-sm text-ink-2">Plans follow published research where it exists and say so where they rely on coaching judgement.</p>
    </div>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const uid = await currentUser();
  if (!uid) return <Landing deleted={q.deleted === "1"} />;
  const c = await loadCtx(uid);
  if (!c.user) return <Landing />; // account deleted elsewhere
  if (!c.profile || !c.plan) redirect("/start");

  const todays = c.sessions.filter((s) => s.date === c.today);
  const next = c.sessions.find((s) => s.date > c.today && s.category === "run" && !s.skipped);
  const days = diffDays(c.today, c.plan.race_date);
  const mon = mondayOf(c.today);
  const weekRuns = c.sessions.filter((s) => s.category === "run" && !s.optional && s.date >= mon && s.date < addDays(mon, 7));
  const plannedKm = weekRuns.reduce((t, s) => t + (s.distance_km ?? 0), 0);
  const doneKm = c.acts.filter((a) => a.local_date >= mon && a.local_date < addDays(mon, 7)).reduce((t, a) => t + a.distance_m / 1000, 0);
  const stale = !!c.account && (!c.account.last_sync_at || nowEpoch() - c.account.last_sync_at > AUTO_SYNC_AFTER_S);
  const al = alerts(c);
  const over = days < 0;

  const doneOf = (d: string) => c.acts.filter((x) => x.local_date === d).reduce((t, x) => t + x.distance_m / 1000, 0);
  const strip: StripDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(mon, i);
    const run = c.sessions.find((s) => s.date === date && s.category === "run" && !s.skipped);
    const done = doneOf(date);
    return {
      date, dow: DOW[i], effort: run ? effortOf(run) : done ? "easy" : null, plannedKm: run?.distance_km ?? 0, doneKm: done,
      today: date === c.today, future: date >= c.today && !done, href: run ? `/session/${run.id}` : undefined,
      strength: c.sessions.some((s) => s.date === date && s.category === "strength" && !s.skipped),
    };
  });
  const todayRun = todays.find((s) => s.category === "run");
  const runsDone = weekRuns.filter((s) => ["done", "moved", "partial"].includes(c.status.get(s.id) ?? "")).length;

  return (
    <>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
        <div>
          <p className="text-sm font-semibold text-ink-2">{fmtDate(c.today, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="display mt-1 text-4xl lg:text-5xl">{over ? "Race done" : <><span className="mark">{days}</span> {days === 1 ? "day" : "days"} to go</>}</h1>
          <p className="mt-1 text-sm text-ink-2">{c.plan.summary.race_label}</p>
        </div>
        {c.account ? <SyncButton label="Sync Strava" /> : <Link href="/log" className="btn">Log a run</Link>}
      </header>
      <AutoSync enabled={stale} />
      {al.length > 0 && (
        <div className="mb-4 space-y-3">
          {al.map((a, i) => (
            <NoticeBox key={i} n={a}>
              {a.action === "rebuild" && <form action={rebuildPlan}><Submit className="btn" pendingText="Rebuilding…">Rebuild my plan from recent training</Submit></form>}
            </NoticeBox>
          ))}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <div className="space-y-4">
          {over && <div className="card">Your race date has passed. Well done for getting there. <Link href="/start" className="font-semibold underline underline-offset-4">Plan your next race</Link>.</div>}
          {!over && todays.length === 0 && (
            <div className="block-ink p-5 lg:p-6">
              <h2 className="display text-6xl lg:text-7xl">Rest day</h2>
              <p className="mt-3 max-w-prose text-white/85">Rest is when training turns into fitness. A walk or gentle mobility is fine.</p>
            </div>
          )}
          {todayRun && <RunHero s={todayRun} c={c} />}
          {todays.filter((s) => s !== todayRun).map((s) => (s.category === "run" ? <RunCard key={s.id} s={s} c={c} full /> : <StrengthCard key={s.id} s={s} c={c} />))}
        </div>
        <div className="space-y-4">
          <WeekStrip days={strip} plannedKm={plannedKm} doneKm={doneKm} caption={`${runsDone} of ${weekRuns.length} runs done`} />
          {next && (
            <div>
              <h2 className="h2 mb-2">Next run</h2>
              <RunCard s={next} c={c} />
            </div>
          )}
        </div>
      </div>
      <p className="mt-6 text-xs text-muted">{!c.account ? "You log runs yourself. Connect Strava in Settings to import them automatically." : c.account.last_sync_at ? `Last synced with Strava ${Math.max(0, Math.round((nowEpoch() - c.account.last_sync_at) / 60))} min ago.` : "Not synced yet."}{c.account ? " Powered by Strava." : ""}</p>
    </>
  );
}
