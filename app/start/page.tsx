import { redirect } from "next/navigation";
import { PageTitle } from "@/app/_c/ui";
import { AutoSync } from "@/app/_c/Forms";
import { HEALTH_QUESTIONS, NIGGLES, niggleId, suggestFromActs } from "@/lib/screening";
import { loadCtx } from "@/lib/server/view";
import { requireUser } from "@/lib/session";
import { syncUser } from "@/lib/strava/sync";
import { addDays, fmtDate } from "@/lib/util/dates";
import { fmtDuration, fmtKm } from "@/lib/util/format";
import { ScreeningForm } from "./ScreeningForm";

export default async function StartPage() {
  const uid = await requireUser();
  let c = await loadCtx(uid);
  if (!c.account) redirect("/");
  const firstname = c.account.firstname;
  // First visit: pull the last few months from Strava so the questionnaire can be pre-filled.
  if (c.account.last_sync_at == null) {
    await syncUser(uid);
    c = await loadCtx(uid);
  }
  const s = suggestFromActs(c.acts, c.today);
  const ref = s.ref && { label: `${fmtKm(s.ref.distance_km)} in ${fmtDuration(s.ref.time_s)} on ${fmtDate(s.ref.date)}` };
  return (
    <>
      <PageTitle title={c.profile ? "Redo your questionnaire" : `Welcome, ${firstname}`} sub={c.profile ? "Your current plan is replaced from today. Past sessions are kept as history." : "Four short steps, about two minutes. Your answers shape the whole plan."} back={c.profile ? "/settings" : undefined} />
      <AutoSync enabled={false} />
      <ScreeningForm
        sug={{ weekly_km: s.weekly_km, longest_km: s.longest_km, runs_per_week: s.runs_per_week, max_hr: s.max_hr, run_count: s.run_count, ref }}
        questions={HEALTH_QUESTIONS} niggles={NIGGLES.map((n) => ({ id: niggleId(n), label: n }))} prev={c.profile}
        minDate={addDays(c.today, 14)} maxDate={addDays(c.today, 365)}
      />
    </>
  );
}
