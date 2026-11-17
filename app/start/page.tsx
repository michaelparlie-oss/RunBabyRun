import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { chooseManual } from "@/app/actions";
import { AutoSync, Submit } from "@/app/_c/Forms";
import { StravaConnect, STRAVA_ERRORS } from "@/app/_c/StravaConnect";
import { Flash, PageTitle } from "@/app/_c/ui";
import { HEALTH_QUESTIONS, NIGGLES, niggleId, suggestFromActs } from "@/lib/screening";
import { loadCtx } from "@/lib/server/view";
import { requireUser } from "@/lib/session";
import { syncUser } from "@/lib/strava/sync";
import { addDays, fmtDate } from "@/lib/util/dates";
import { fmtDuration, fmtKm } from "@/lib/util/format";
import { ScreeningForm } from "./ScreeningForm";

export default async function StartPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const uid = await requireUser();
  let c = await loadCtx(uid);
  if (!c.user) redirect("/");
  const { error } = await searchParams;
  const needsChoice = c.user.source == null || (c.user.source === "strava" && !c.account);
  if (needsChoice) {
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "this site").split(":")[0];
    return (
      <>
        <PageTitle title={`Welcome, ${c.user.name}`} sub={c.user.source === "strava" ? "Strava is no longer connected. Connect it again, or switch to logging runs yourself." : "First, choose how your runs get into RunBabyRun. You can change this later in Settings."} />
        {error && <div className="mb-4"><Flash ok={false}>{STRAVA_ERRORS[error] ?? "Something went wrong. Try again."}</Flash></div>}
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <section className="card lane" style={{ ["--lane" as string]: "var(--color-hard)" }}>
            <h2 className="h2">Connect Strava</h2>
            <p className="mb-4 mt-1 text-sm text-ink-2">Best if you record runs with a watch or the Strava app. Runs arrive on their own and are scored against the plan. Your last four weeks pre-fill the questionnaire.</p>
            <StravaConnect host={host} error={error} />
          </section>
          <section className="card lane" style={{ ["--lane" as string]: "var(--color-easy)" }}>
            <h2 className="h2">Log runs myself</h2>
            <p className="mb-4 mt-1 text-sm text-ink-2">No Strava needed. After each run you tick it as done, or type in distance and time for the full check. You tell the questionnaire how much you run now.</p>
            <form action={chooseManual}><Submit className="btn btn-primary w-full" pendingText="Saving…">Continue without Strava</Submit></form>
          </section>
        </div>
      </>
    );
  }
  // First visit with Strava: pull the last few months so the questionnaire can be pre-filled.
  if (c.account && c.account.last_sync_at == null) {
    await syncUser(uid);
    c = await loadCtx(uid);
  }
  const s = suggestFromActs(c.acts, c.today);
  const ref = s.ref && { label: `${fmtKm(s.ref.distance_km)} in ${fmtDuration(s.ref.time_s)} on ${fmtDate(s.ref.date)}` };
  return (
    <>
      <PageTitle title={c.profile ? "Redo your questionnaire" : "Build your plan"} sub={c.profile ? "Your current plan is replaced from today. Past sessions are kept as history." : "Four short steps, about two minutes. Your answers shape the whole plan."} back={c.profile ? "/settings" : undefined} />
      <AutoSync enabled={false} />
      <ScreeningForm
        manual={!c.account}
        sug={{ weekly_km: s.weekly_km, longest_km: s.longest_km, runs_per_week: s.runs_per_week, max_hr: s.max_hr, run_count: s.run_count, ref }}
        questions={HEALTH_QUESTIONS} niggles={NIGGLES.map((n) => ({ id: niggleId(n), label: n }))} prev={c.profile}
        minDate={addDays(c.today, 14)} maxDate={addDays(c.today, 365)}
      />
    </>
  );
}
