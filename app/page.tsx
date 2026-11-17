import Link from "next/link";
import { redirect } from "next/navigation";
import { rebuildPlan } from "./actions";
import { RunCard, StrengthCard } from "./_c/Cards";
import { AutoSync, Submit, SyncButton } from "./_c/Forms";
import { Flash, Kpi, NoticeBox, PageTitle } from "./_c/ui";
import { alerts, loadCtx } from "@/lib/server/view";
import { currentUser } from "@/lib/session";
import { siteCreds } from "@/lib/strava/oauth";
import { AUTO_SYNC_AFTER_S } from "@/lib/strava/sync";
import { addDays, diffDays, fmtDate, mondayOf, nowEpoch } from "@/lib/util/dates";

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

function Landing({ error, deleted, host }: { error?: string; deleted?: boolean; host: string }) {
  const shared = !!siteCreds();
  return (
    <div className="space-y-6 pt-4">
      <header className="space-y-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-12 w-12 rounded-xl" />
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">RunBabyRun</h1>
        <p className="max-w-xl text-lg text-ink-2">A race plan built from your own running. Connect Strava, answer a two-minute questionnaire, and get a day-by-day plan for a 5K, 10K, half marathon or marathon, with pace and heart-rate targets for every run.</p>
      </header>
      {deleted && <Flash ok>Your data was deleted and Strava access was revoked.</Flash>}
      {error && <Flash ok={false}>{ERRORS[error] ?? "Something went wrong. Please try again."}</Flash>}

      <section className="card space-y-3">
        <h2 className="h2">Get started</h2>
        {shared ? (
          <>
            <a href="/api/strava/login" className="btn btn-primary w-full sm:w-auto" style={{ background: "#fc4c02", borderColor: "#fc4c02" }}>Connect with Strava</a>
            <p className="text-xs text-muted">You&apos;ll approve read-only access on Strava. RunBabyRun never posts or changes anything there.</p>
          </>
        ) : (
          <p className="text-sm text-ink-2">One-click sign-in is not set up on this site yet. Connect with your own Strava API keys below.</p>
        )}
        <details id="own-keys" className="rounded-xl border border-line p-3" open={!shared || error === "limit" || error === "bad_keys" || error === "keys" || error === "not_configured"}>
          <summary className="cursor-pointer text-sm font-semibold">Use my own Strava API keys</summary>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-2">
            <li>Open <a className="text-accent underline" href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer">strava.com/settings/api</a> and create an API application (any name and website).</li>
            <li>Set <b>Authorization Callback Domain</b> to <code className="rounded bg-slate-100 px-1">{host}</code>.</li>
            <li>Copy the <b>Client ID</b> and <b>Client Secret</b> here.</li>
          </ol>
          <form action="/api/strava/login" method="post" className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <label className="block text-sm font-medium">Client ID<input name="client_id" required inputMode="numeric" pattern="[0-9]{1,12}" className="input mt-1" autoComplete="off" /></label>
            <label className="block text-sm font-medium">Client secret<input name="client_secret" type="password" required minLength={20} maxLength={80} className="input mt-1" autoComplete="off" /></label>
            <button className="btn">Connect</button>
          </form>
          <p className="mt-2 text-xs text-muted">Your secret is encrypted before it is stored and is used only to talk to Strava for your own account.</p>
        </details>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["1. Connect", "Your last four weeks on Strava set the starting point: weekly distance, longest run and a recent best effort."],
          ["2. Answer", "Race, goal, the days you can run, equipment, and a short health check. A yes on health changes the advice, not your access."],
          ["3. Train", "Every day shows what to do and how hard. Runs sync from Strava and are checked against the plan, with warnings before risky jumps."],
        ].map(([t, d]) => (
          <div key={t} className="card"><h3 className="font-bold">{t}</h3><p className="mt-1 text-sm text-ink-2">{d}</p></div>
        ))}
      </section>
      <p className="text-sm text-muted">Plans follow published research where it exists and say so where they rely on coaching judgement. <Link href="/about" className="text-accent underline">How plans are built</Link>.</p>
    </div>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const uid = await currentUser();
  if (!uid) {
    const { headers } = await import("next/headers");
    const h = await headers();
    return <Landing error={q.error} deleted={q.deleted === "1"} host={(h.get("x-forwarded-host") ?? h.get("host") ?? "this site").split(":")[0]} />;
  }
  const c = await loadCtx(uid);
  if (!c.account) return <Landing error={q.error} host="this site" />;
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

  return (
    <>
      <PageTitle title={`Hi ${c.account.firstname}`} sub={fmtDate(c.today, { weekday: "long", day: "numeric", month: "long" })} actions={<SyncButton label="Sync" />} />
      <AutoSync enabled={stale} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label={over ? "Race" : "Race day in"} value={over ? "Done" : days} unit={over ? undefined : days === 1 ? "day" : "days"} sub={c.plan.summary.race_label} />
        <Kpi label="This week" value={doneKm.toFixed(1)} unit={`/ ${plannedKm.toFixed(1)} km`} sub={`${weekRuns.filter((s) => ["done", "moved", "partial"].includes(c.status.get(s.id) ?? "")).length} of ${weekRuns.length} runs done`} />
      </div>
      {al.length > 0 && (
        <div className="mb-4 space-y-3">
          {al.map((a, i) => (
            <NoticeBox key={i} n={a}>
              {a.action === "rebuild" && <form action={rebuildPlan}><Submit className="btn" pendingText="Rebuilding…">Rebuild my plan from recent training</Submit></form>}
            </NoticeBox>
          ))}
        </div>
      )}
      <h2 className="h2 mb-2">Today</h2>
      <div className="space-y-3">
        {over && <div className="card text-sm">Your race date has passed. Congratulations on getting there. <Link href="/start" className="font-semibold text-accent underline">Plan your next race</Link>.</div>}
        {!over && todays.length === 0 && <div className="card text-sm text-ink-2"><b>Rest day.</b> Rest is when training turns into fitness. A walk or gentle mobility is fine.</div>}
        {todays.map((s) => (s.category === "run" ? <RunCard key={s.id} s={s} c={c} full /> : <StrengthCard key={s.id} s={s} c={c} />))}
      </div>
      {next && (
        <>
          <h2 className="h2 mb-2 mt-6">Next run</h2>
          <RunCard s={next} c={c} />
        </>
      )}
      <p className="mt-6 text-center text-xs text-muted">{c.account.last_sync_at ? `Last synced with Strava ${Math.max(0, Math.round((nowEpoch() - c.account.last_sync_at) / 60))} min ago.` : "Not synced yet."} Powered by Strava.</p>
    </>
  );
}
