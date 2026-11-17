import { notFound, redirect } from "next/navigation";
import { toggleStrength } from "@/app/actions";
import { StrengthTable } from "@/app/_c/Cards";
import { Submit } from "@/app/_c/Forms";
import { PageTitle, Panel, StatusPill } from "@/app/_c/ui";
import { loadCtx } from "@/lib/server/view";
import { requireUser } from "@/lib/session";
import { fmtDate, weekdayShort } from "@/lib/util/dates";

export default async function StrengthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await loadCtx(await requireUser());
  if (!c.plan) redirect("/start");
  const s = c.sessions.find((x) => x.id === id && x.category === "strength");
  const t = s && c.plan.templates[s.template ?? ""];
  if (!s || !t) notFound();
  const st = c.status.get(s.id) ?? "pending";
  return (
    <>
      <PageTitle title={s.title} sub={`${weekdayShort(s.date)} ${fmtDate(s.date)} · about ${t.minutes} min`} back={`/week?w=${s.week}`} actions={<StatusPill status={st} />} />
      <Panel title="Today's menu" sub={t.intent} className="mb-4">
        <StrengthTable t={t} deload={s.deload} template={s.template!} />
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
          <li>RPE is effort out of 10. RPE 7 means you could have done about 3 more reps; RPE 8 means about 2.</li>
          <li>Tap an exercise for how to do it, a starting load and easier or harder versions.</li>
          <li>Stop any exercise that hurts (pain, not effort) and use its easier version.</li>
        </ul>
      </Panel>
      <form action={toggleStrength}><input type="hidden" name="id" value={s.id} /><Submit pendingText="Saving…">{st === "done" ? "Mark as not done" : "Mark as done"}</Submit></form>
    </>
  );
}
