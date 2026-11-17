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
import { siteCreds } from "@/lib/strava/oauth";
import { AUTO_SYNC_AFTER_S } from "@/lib/strava/sync";
import { addDays, diffDays, DOW, fmtDate, mondayOf, nowEpoch } from "@/lib/util/dates";

const ERRORS: Record<string, string> = {
  denied: "Strava access was not granted. You can try again whenever you like.",
  state: "That sign-in link expired. Please try again.",
  scope: "RunBabyRun needs permission to read your activities. Please tick that box on Strava's screen.",
  limit: "This site's Strava connection has reached its athlete limit. You can still connect with your own Strava API keys (below).",
  keys: "Strava rejected those API keys. Check the client ID and secret, and that the callback domain matches this site.",
  bad_keys: "Enter the numeric client ID and the client secret from your Strava API settings.",
  not_configured: "One-click Strava sign-in is not set up on this site yet. Connect with your own Strava API keys (below).",
  strava: "Could not reach Strava. Please try again in a minute.",
};

const SAMPLE: StripDay[] = [
  { date: "s1", dow: "Mon", effort: null, plannedKm: 0, doneKm: 0, today: false, future: false, strength: true },
  { date: "s2", dow: "Tue", effort: "easy", plannedKm: 6, doneKm: 6.2, today: false, future: false },
  { date: "s3", dow: "Wed", effort: "quality", plannedKm: 8, doneKm: 8.1, today: false, future: false },
  { date: "s4", dow: "Thu", effort: null, plannedKm: 0, doneKm: 0, today: false, future: false, strength: true },
  { date: "s5", dow: "Fri", effort: "easy", plannedKm: 5, doneKm: 0, today: true, future: true },
  { date: "s6", dow: "Sat", effort: null, plannedKm: 0, doneKm: 0, today: false, future: true },
  { date: "s7", dow: "Sun", effort: "long", plannedKm: 14, doneKm: 0, today: false, future: true },
];

function Landing({ error, deleted, host }: { error?: string; deleted?: boolean; host: string }) {
  const shared = !!siteCreds();
  const ownOpen = !shared || error === "limit" || error === "bad_keys" || error === "keys" || error === "not_configured";
  return (
    <div className="space-y-8 pt-2 lg:space-y-12 lg:pt-6">
      <header>
        <p className="flex items-center gap-2 text-sm font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-7 w-7" />RunBabyRun
        </p>
        <h1 className="display mt-5 text-6xl sm:text-7xl lg:text-8xl">Your next race,<br />one day at a time.</h1>
        <p className="mt-5 max-w-xl text-lg text-ink-2">Connect Strava and answer a two-minute questionnaire. You get a day-by-day plan for a 5K, 10K, half marathon or marathon, built from the running you already do, with a pace and heart-rate target for every run.</p>
      </header>
      {deleted && <Flash ok>Your data was deleted and Strava access was revoked.</Flash>}
      {error && <Flash ok={false}>{ERRORS[error] ?? "Something went wrong. Try again."}</Flash>}

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        <div>
          <WeekStrip days={SAMPLE} plannedKm={33} doneKm={14.3} caption="Sample week from a half-marathon plan" />
          <p className="mt-2 text-sm text-muted">Bars are distance, colours are effort. A run fills in when it arrives from Strava, and the plan warns you before a risky jump.</p>
        </div>

        <section className="block-ink p-5 lg:p-6">
          <h2 className="display text-4xl">Start your plan</h2>
          {shared ? (
            <>
              <a href="/api/strava/login" className="btn btn-primary mt-4 w-full">Connect with Strava</a>
              <p className="mt-2 text-sm text-white/75">You approve read-only access on Strava. RunBabyRun never posts or changes anything there.</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-white/85">One-click sign-in isn&apos;t set up on this site yet. Connect with your own Strava API keys, which takes about three minutes.</p>
          )}
          <details id="own-keys" className="mt-4 border-t border-white/25 pt-3" open={ownOpen}>
            <summary className="cursor-pointer text-sm font-semibold">Use my own Strava API keys</summary>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-white/85">
              <li>Open <a className="font-semibold text-hivis underline underline-offset-4" href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer">strava.com/settings/api</a> and create an API application. Any name and website will do.</li>
              <li>Set Authorization Callback Domain to <code className="bg-white/15 px-1.5 py-0.5 text-white">{host}</code></li>
              <li>Copy the Client ID and Client Secret into the boxes below.</li>
            </ol>
            <form action="/api/strava/login" method="post" className="mt-4 space-y-3">
              <label className="block text-sm font-semibold">Client ID<input name="client_id" required inputMode="numeric" pattern="[0-9]{1,12}" className="input mt-1 text-ink" autoComplete="off" /></label>
              <label className="block text-sm font-semibold">Client secret<input name="client_secret" type="password" required minLength={20} maxLength={80} className="input mt-1 text-ink" autoComplete="off" /></label>
              <button className="btn btn-primary w-full">Connect Strava</button>
            </form>
            <p className="mt-2 text-xs text-white/70">Your secret is encrypted before it is stored and is used only to talk to Strava for your own account.</p>
          </details>
        </section>
      </div>

      <section>
        <h2 className="h2 border-b-2 border-ink pb-2">How it works</h2>
        <ol className="grid gap-x-8 sm:grid-cols-3">
          {[
            ["Connect", "Your last four weeks on Strava set the starting point: weekly distance, longest run and a recent best effort."],
            ["Answer", "Race, goal, the days you can run, equipment, and a short health check. A yes on health changes the advice, not your access."],
            ["Train", "Every day shows what to do and how hard. Runs sync from Strava and are checked against the plan."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-4 border-b border-line py-4 sm:block sm:border-b-0">
              <span className="numeral text-5xl text-faint">{i + 1}</span>
              <div><h3 className="text-2xl font-bold uppercase sm:mt-2">{t}</h3><p className="mt-1 text-sm text-ink-2">{d}</p></div>
            </li>
          ))}
        </ol>
      </section>
      <p className="max-w-prose text-sm text-ink-2">Plans follow published research where it exists and say so where they rely on coaching judgement. <Link href="/about" className="font-semibold underline underline-offset-4">Read how plans are built</Link>.</p>
    </div>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const uid = await currentUser();
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "this site").split(":")[0];
  if (!uid) return <Landing error={q.error} deleted={q.deleted === "1"} host={host} />;
  const c = await loadCtx(uid);
  if (!c.account) return <Landing error={q.error} host={host} />; // access revoked at Strava: connect again to pick up the plan
  if (!c.profile || !c.plan) redirect("/start");

  const todays = c.sessions.filter((s) => s.date === c.today);
  const next = c.sessions.find((s) => s.date > c.today && s.category === "run" && !s.skipped);
  const days = diffDays(c.today, c.plan.race_date);
  const mon = mondayOf(c.today);
  const weekRuns = c.sessions.filter((s) => s.category === "run" && !s.optional && s.date >= mon && s.date < addDays(mon, 7));
  const plannedKm = weekRuns.reduce((t, s) => t + (s.distance_km ?? 0), 0);
  const doneKm = c.acts.filter((a) => a.local_date >= mon && a.local_date < addDays(mon, 7)).reduce((t, a) => t + a.distance_m / 1000, 0);
  const stale = !c.account.last_sync_at || nowEpoch() - c.account.last_sync_at > AUTO_SYNC_AFTER_S;
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
        <SyncButton label="Sync Strava" />
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
      <p className="mt-6 text-xs text-muted">{c.account.last_sync_at ? `Last synced with Strava ${Math.max(0, Math.round((nowEpoch() - c.account.last_sync_at) / 60))} min ago.` : "Not synced yet."} Powered by Strava.</p>
    </>
  );
}
