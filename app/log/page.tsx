import { redirect } from "next/navigation";
import { removeRun } from "@/app/actions";
import { LogRunForm, Submit } from "@/app/_c/Forms";
import { PageTitle, Panel } from "@/app/_c/ui";
import { loadCtx } from "@/lib/server/view";
import { requireUser } from "@/lib/session";
import { fmtDate } from "@/lib/util/dates";
import { fmtDuration, fmtKm, fmtPace } from "@/lib/util/format";

export default async function LogPage() {
  const c = await loadCtx(await requireUser());
  if (!c.plan) redirect("/start");
  const mine = c.acts.filter((a) => a.manual).slice(-15).reverse();
  return (
    <>
      <PageTitle title="Log a run" sub="For any run, planned or not. It is matched to your plan by date." back="/" />
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Panel><LogRunForm maxDate={c.today} /></Panel>
        <Panel title="Runs you entered">
          {mine.length === 0 ? <p className="text-sm text-muted">Nothing yet. Your first logged run shows up here.</p> : (
            <table className="tbl">
              <thead><tr><th>Date</th><th className="num">Distance</th><th className="num">Time</th><th className="num">Pace /km</th><th /></tr></thead>
              <tbody>
                {mine.map((a) => (
                  <tr key={a.id}>
                    <td>{fmtDate(a.local_date)}</td><td className="num">{fmtKm(a.distance_m / 1000)}</td>
                    <td className="num">{a.manual === "ticked" ? "marked done" : fmtDuration(a.moving_time_s)}</td>
                    <td className="num">{a.manual === "ticked" ? "" : fmtPace(a.moving_time_s / (a.distance_m / 1000))}</td>
                    <td className="num"><form action={removeRun}><input type="hidden" name="id" value={a.id} /><Submit className="text-sm font-semibold underline underline-offset-4" pendingText="…">Remove</Submit></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
