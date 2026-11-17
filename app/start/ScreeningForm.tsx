"use client";
import { useActionState, useEffect, useState } from "react";
import { createPlan } from "@/app/actions";
import { Submit } from "@/app/_c/Forms";
import { Flash } from "@/app/_c/ui";
import type { Profile } from "@/lib/types";

interface Sug { weekly_km: number; longest_km: number; runs_per_week: number; max_hr: number | null; run_count: number; ref: { label: string } | null }
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Step({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <fieldset className="card space-y-4">
      <legend className="sr-only">{title}</legend>
      <div>
        <div className="kicker">Step {n} of 4</div>
        <h2 className="text-lg font-extrabold">{title}</h2>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </fieldset>
  );
}
const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block text-sm font-medium">{label}{children}{hint && <span className="mt-1 block text-xs font-normal text-muted">{hint}</span>}</label>
);
function Choice({ name, value, state, set, children }: { name: string; value: string; state: string; set: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${state === value ? "border-accent bg-accent-soft" : "border-line bg-white"}`}>
      <input type="radio" name={name} value={value} checked={state === value} onChange={() => set(value)} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}

export function ScreeningForm({ sug, questions, niggles, prev, minDate, maxDate }: {
  sug: Sug; questions: { id: string; text: string }[]; niggles: { id: string; label: string }[]; prev: Profile | null; minDate: string; maxDate: string;
}) {
  const [state, action] = useActionState(createPlan, null);
  const [tz, setTz] = useState(prev?.tz ?? "");
  const [goal, setGoal] = useState<string>(prev?.race.goal ?? "finish");
  const [refKind, setRefKind] = useState<string>(sug.ref ? "strava" : "none");
  const [exp, setExp] = useState<string>(prev?.fitness.experience ?? (sug.weekly_km >= 40 ? "experienced" : sug.weekly_km >= 12 ? "regular" : "new"));
  const defDays = prev?.schedule.run_days ?? (sug.runs_per_week >= 4.5 ? [0, 1, 3, 4, 6] : sug.runs_per_week >= 3.5 ? [1, 3, 4, 6] : [1, 3, 6]);
  const [days, setDays] = useState<number[]>(defDays);
  const [longDay, setLongDay] = useState<number>(prev?.schedule.long_day ?? 6);
  const [strength, setStrength] = useState<string>(String(prev?.schedule.strength_per_week ?? 2));
  useEffect(() => { try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { /* keep default */ } }, []);
  useEffect(() => { if (!days.includes(longDay) && days.length) setLongDay(days[days.length - 1]); }, [days, longDay]);
  const toggle = (d: number) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort((a, b) => a - b)));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tz" value={tz} />

      <Step n={1} title="Your race" sub="What are you training for?">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Distance">
            <select name="race_key" className="input mt-1" defaultValue={prev?.race.key ?? "10k"}>
              <option value="5k">5K</option><option value="10k">10K</option><option value="hm">Half marathon (21.1 km)</option><option value="fm">Marathon (42.2 km)</option>
            </select>
          </Field>
          <Field label="Race date"><input type="date" name="race_date" required min={minDate} max={maxDate} defaultValue={prev?.race.date ?? ""} className="input mt-1" /></Field>
        </div>
        <Field label="Race name (optional)"><input name="race_name" maxLength={80} defaultValue={prev?.race.name ?? ""} className="input mt-1" placeholder="e.g. Jakarta Marathon" /></Field>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Goal">
          <Choice name="goal" value="finish" state={goal} set={setGoal}><b>Finish feeling good.</b> No time target.</Choice>
          <Choice name="goal" value="time" state={goal} set={setGoal}><b>A goal time.</b> I&apos;ll train toward a pace.</Choice>
        </div>
        {goal === "time" && <Field label="Goal time" hint="h:mm:ss or mm:ss, for example 2:05:00 or 55:00"><input name="goal_time" required inputMode="numeric" pattern="[0-9:]{4,8}" className="input mt-1" placeholder="2:05:00" /></Field>}
      </Step>

      <Step n={2} title="Where you are now" sub={sug.run_count ? `Pre-filled from your last four weeks on Strava (${sug.run_count} runs found). Correct anything that looks off.` : "No recent runs found on Strava, so please fill these in."}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Typical distance per week (km)"><input type="number" name="weekly_km" min={0} max={250} step={1} defaultValue={sug.weekly_km} required className="input mt-1" /></Field>
          <Field label="Longest run in the last month (km)"><input type="number" name="longest_km" min={0} max={80} step={0.5} defaultValue={sug.longest_km} required className="input mt-1" /></Field>
        </div>
        <div className="grid gap-2" role="radiogroup" aria-label="Experience">
          <Choice name="experience" value="new" state={exp} set={setExp}><b>New to running</b> or back after a long break (under a year of regular running).</Choice>
          <Choice name="experience" value="regular" state={exp} set={setExp}><b>Regular runner.</b> Running most weeks for a year or more.</Choice>
          <Choice name="experience" value="experienced" state={exp} set={setExp}><b>Experienced.</b> Several years, and used to structured sessions.</Choice>
        </div>
        <Field label="Can you run for 30 minutes without stopping?">
          <select name="can_run_30" className="input mt-1" defaultValue={prev ? (prev.fitness.can_run_30 ? "yes" : "no") : sug.longest_km >= 4 ? "yes" : "no"}><option value="yes">Yes</option><option value="no">Not yet</option></select>
        </Field>
        <div>
          <div className="text-sm font-medium">A recent result, to set your paces</div>
          <div className="mt-2 grid gap-2" role="radiogroup" aria-label="Recent result">
            {sug.ref && <Choice name="ref_kind" value="strava" state={refKind} set={setRefKind}><b>Use my fastest recent Strava run:</b> {sug.ref.label}. Training runs understate race fitness, so paces start on the safe side.</Choice>}
            <Choice name="ref_kind" value="race" state={refKind} set={setRefKind}><b>Enter a race or all-out effort</b> from the last three months.</Choice>
            <Choice name="ref_kind" value="none" state={refKind} set={setRefKind}><b>I don&apos;t have one.</b> Start from an estimate; the plan adds a 5K time trial to correct it.</Choice>
          </div>
          {refKind === "race" && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Distance"><select name="ref_distance" className="input mt-1" defaultValue="5k"><option value="5k">5 km</option><option value="10k">10 km</option><option value="hm">Half marathon</option><option value="fm">Marathon</option></select></Field>
              <Field label="Time"><input name="ref_time" required inputMode="numeric" pattern="[0-9:]{4,8}" className="input mt-1" placeholder="27:40" /></Field>
            </div>
          )}
        </div>
      </Step>

      <Step n={3} title="Your week" sub="Pick days you can keep most weeks. More days is not better if you can't recover.">
        <div>
          <div className="text-sm font-medium">Running days (3 to 6)</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <label key={d} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold ${days.includes(i) ? "border-accent bg-accent text-white" : "border-line bg-white"}`}>
                <input type="checkbox" name="run_days" value={i} checked={days.includes(i)} onChange={() => toggle(i)} className="sr-only" />{d}
              </label>
            ))}
          </div>
          {(days.length < 3 || days.length > 6) && <p className="mt-1 text-xs text-red-700">Choose between 3 and 6 days.</p>}
        </div>
        <Field label="Long-run day" hint="Usually a weekend morning.">
          <select name="long_day" className="input mt-1" value={longDay} onChange={(e) => setLongDay(Number(e.target.value))}>{days.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}</select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Strength sessions per week" hint="Two short sessions help most runners; they are placed away from your long run.">
            <select name="strength" className="input mt-1" value={strength} onChange={(e) => setStrength(e.target.value)}><option value="0">None</option><option value="1">1</option><option value="2">2</option></select>
          </Field>
          {strength !== "0" && (
            <Field label="Equipment">
              <select name="equipment" className="input mt-1" defaultValue={prev?.schedule.equipment ?? "bodyweight"}><option value="bodyweight">Bodyweight only (at home)</option><option value="dumbbells">Dumbbells or kettlebells</option><option value="gym">Full gym</option></select>
            </Field>
          )}
        </div>
      </Step>

      <Step n={4} title="Health check" sub="Running hard is safe for most people, but a few should see a doctor first. Answer honestly; a yes does not block you, it changes the advice.">
        <div className="space-y-2">
          {questions.map((q) => (
            <label key={q.id} className="flex items-start gap-3 rounded-xl border border-line bg-white p-3 text-sm">
              <input type="checkbox" name="flags" value={q.id} defaultChecked={prev?.health.flags.includes(q.id)} className="mt-0.5 h-4 w-4" />
              <span>{q.text} <span className="text-muted">(tick for yes)</span></span>
            </label>
          ))}
        </div>
        <div>
          <div className="text-sm font-medium">Anything sore or injured right now? (optional)</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {niggles.map((n) => (
              <label key={n.id} className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm">
                <input type="checkbox" name="niggles" value={n.id} defaultChecked={prev?.health.niggles.includes(n.id)} />{n.label}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Age (optional)" hint="Used only to estimate your maximum heart rate."><input type="number" name="age" min={18} max={99} defaultValue={prev?.health.age ?? ""} className="input mt-1" /></Field>
          <Field label="Maximum heart rate, if you know it" hint={sug.max_hr ? `Highest in your recent Strava runs: ${sug.max_hr} bpm (used if you leave this empty).` : "Leave empty to estimate it."}><input type="number" name="max_hr" min={120} max={230} defaultValue={prev?.health.max_hr_source === "entered" ? prev.health.max_hr ?? "" : ""} className="input mt-1" /></Field>
        </div>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="adult" value="yes" required className="mt-0.5 h-4 w-4" /><span>I am 18 or older.</span></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="ack" value="yes" required className="mt-0.5 h-4 w-4" /><span>I understand this plan is general training guidance, not medical advice, and that I should stop and seek help if I feel chest pain, faint, or unusually breathless.</span></label>
      </Step>

      {state && <Flash ok={state.ok}>{state.message}</Flash>}
      <Submit pendingText="Building your plan…">Build my plan</Submit>
    </form>
  );
}
