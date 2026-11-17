import Link from "next/link";
import { deleteAccount, rebuildPlan } from "@/app/actions";
import { FitnessForm, MaxHrForm, PainForm, Submit, SyncButton } from "@/app/_c/Forms";
import { Flash, PageTitle, Panel } from "@/app/_c/ui";
import { NIGGLES } from "@/lib/screening";
import { loadCtx } from "@/lib/server/view";
import { requireUser } from "@/lib/session";
import { fmtDate } from "@/lib/util/dates";
import { fmtDuration } from "@/lib/util/format";
import { RACES, resolveMaxHr } from "@/lib/zones";

const HR_SOURCE = { entered: "the value you entered", strava: "the highest heart rate in your Strava runs", age: "an estimate from your age", default: "a default; please enter your own" } as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const c = await loadCtx(await requireUser());
  const { error } = await searchParams;
  const p = c.profile;
  const hr = p ? resolveMaxHr(p) : null;
  const lastSync = c.account?.last_sync_at ? new Date(c.account.last_sync_at * 1000).toLocaleString("en-GB", { timeZone: p?.tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";
  return (
    <>
      <PageTitle title="Settings" sub={c.account ? `Signed in as ${c.account.firstname} ${c.account.lastname}`.trim() : undefined} />
      {error === "rebuild" && <div className="mb-4"><Flash ok={false}>The plan could not be rebuilt, most likely because the race is now too close for a safe build-up. Change the race in the questionnaire.</Flash></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Strava" sub={`Last sync: ${lastSync}. ${c.acts.length} runs stored. Using ${c.account?.mode === "own" ? "your own Strava API application" : "this site's Strava application"}.`}>
          <SyncButton />
          {c.account?.sync_message && <p className="mt-2 text-xs text-muted">{c.account.sync_message}</p>}
          {c.account?.sync_message && /revoked/i.test(c.account.sync_message) && (
            c.account.mode === "shared"
              ? <a href="/api/strava/login" className="btn mt-2">Reconnect Strava</a>
              : <p className="mt-2 text-xs text-muted">To reconnect, sign out and connect again with your Strava API keys. Your plan and logs are kept.</p>
          )}
          <p className="mt-3 text-xs text-muted">RunBabyRun only reads your runs. It never posts, edits or deletes anything on Strava.</p>
        </Panel>

        {p && (
          <Panel title="Your plan" sub={`${p.race.name || RACES[p.race.key].label} on ${fmtDate(p.race.date, { day: "numeric", month: "short", year: "numeric" })} · ${p.race.goal === "time" && p.race.goal_time_s ? `goal ${fmtDuration(p.race.goal_time_s)}` : "goal: finish"}`}>
            <div className="flex flex-wrap gap-2">
              <form action={rebuildPlan}><Submit className="btn" pendingText="Rebuilding…">Rebuild from today</Submit></form>
              <Link href="/start" className="btn">Redo the questionnaire</Link>
            </div>
            <p className="mt-3 text-xs text-muted">Rebuild keeps your answers and re-plans the remaining weeks from the last four weeks of Strava running. Use it after illness, travel or a run of missed sessions. Redo the questionnaire to change the race, your days or your equipment.</p>
          </Panel>
        )}

        {p && (
          <Panel title="New race or time-trial result" sub={`Paces are currently set from ${+p.fitness.ref_distance_km.toFixed(1)} km in ${fmtDuration(p.fitness.ref_time_s)}${p.fitness.ref_source === "estimate" ? " (an estimate)" : ""}.`}>
            <FitnessForm />
          </Panel>
        )}

        {p && hr && (
          <Panel title="Heart rate" sub={`Ranges use a maximum of ${hr} bpm, from ${HR_SOURCE[p.health.max_hr_source]}.`}>
            <MaxHrForm current={hr} />
            <p className="mt-3 text-xs text-muted">Age formulas can be out by 10 beats or more for an individual. The highest value you have seen at the end of a hard race or hill session is a better number.</p>
          </Panel>
        )}

        <Panel title="Log pain" sub="0 is none, 10 is the worst imaginable.">
          <PainForm areas={NIGGLES as unknown as string[]} />
        </Panel>

        <Panel title="Your data">
          <div className="flex flex-wrap gap-2">
            <a href="/api/export" className="btn">Download my data (JSON)</a>
            <form action="/api/logout" method="post"><button className="btn">Sign out</button></form>
          </div>
          <p className="mt-3 text-xs text-muted">The download has everything stored about you except your Strava tokens. See the <Link href="/privacy" className="underline">privacy page</Link>.</p>
        </Panel>

        <Panel title="Delete my account" className="lg:col-span-2">
          <div id="delete" className="scroll-mt-4">
            <p className="text-sm">This disconnects RunBabyRun from your Strava account and permanently deletes your plan, answers, logs and stored runs from this site. Your activities on Strava are not touched.</p>
            {error === "confirm" && <div className="mt-3"><Flash ok={false}>Type DELETE in the box to confirm.</Flash></div>}
            <form action={deleteAccount} className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block text-sm font-medium">Type DELETE to confirm<input name="confirm" autoComplete="off" className="input mt-1 w-40" /></label>
              <Submit className="btn btn-danger" pendingText="Deleting…">Delete everything</Submit>
            </form>
          </div>
        </Panel>
      </div>
    </>
  );
}
