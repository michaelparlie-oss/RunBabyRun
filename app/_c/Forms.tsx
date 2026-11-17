"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { logPain, syncNow, updateFitness, updateMaxHr, type ActionState } from "@/app/actions";
import { Flash } from "./ui";

export function Submit({ children, className = "btn btn-primary", pendingText = "Working…" }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending}>{pending ? pendingText : children}</button>;
}

export function SyncButton({ label = "Sync with Strava" }: { label?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <button className="btn" disabled={pending} onClick={() => start(async () => { setMsg((await syncNow()).message); })}>{pending ? "Syncing…" : label}</button>
      {msg && <p role="status" className="text-xs text-muted">{msg}</p>}
    </div>
  );
}

/** Syncs once when the page opens, if the server says the last sync is old. */
export function AutoSync({ enabled }: { enabled: boolean }) {
  const ran = useRef(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || ran.current) return;
    ran.current = true;
    setMsg("Checking Strava for new runs…");
    syncNow().then((r) => { setMsg(r.added ? r.message : null); }).catch(() => setMsg(null));
  }, [enabled]);
  return msg ? <p role="status" className="mb-3 rounded-lg bg-white px-3 py-1.5 text-center text-xs text-muted">{msg}</p> : null;
}

function Result({ state }: { state: ActionState }) {
  return state ? <Flash ok={state.ok}>{state.message}</Flash> : null;
}

export function PainForm({ areas, date }: { areas: string[]; date?: string }) {
  const [state, action] = useActionState(logPain, null);
  return (
    <form action={action} className="space-y-3">
      {date && <input type="hidden" name="date" value={date} />}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">Where
          <select name="area" className="input mt-1">{areas.map((a) => <option key={a}>{a}</option>)}<option>other</option></select>
        </label>
        <label className="block text-sm font-medium">Pain, 0–10
          <select name="pain" className="input mt-1" defaultValue="0">{Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}{i === 0 ? " (none)" : i === 10 ? " (worst)" : ""}</option>)}</select>
        </label>
      </div>
      <label className="block text-sm font-medium">Note (optional)
        <input name="note" maxLength={200} className="input mt-1" placeholder="e.g. after 12 km, gone by evening" />
      </label>
      <Submit className="btn">Log it</Submit>
      <Result state={state} />
    </form>
  );
}

export function FitnessForm() {
  const [state, action] = useActionState(updateFitness, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">Distance
          <select name="distance" className="input mt-1" defaultValue="5k"><option value="5k">5 km</option><option value="10k">10 km</option><option value="hm">Half marathon</option><option value="fm">Marathon</option></select>
        </label>
        <label className="block text-sm font-medium">Time
          <input name="time" required inputMode="numeric" pattern="[0-9:]{4,8}" placeholder="27:40" className="input mt-1" />
        </label>
      </div>
      <Submit className="btn">Update my paces</Submit>
      <Result state={state} />
    </form>
  );
}

export function MaxHrForm({ current }: { current: number }) {
  const [state, action] = useActionState(updateMaxHr, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="block text-sm font-medium">Maximum heart rate (bpm)
        <input name="max_hr" type="number" min={120} max={230} defaultValue={current} className="input mt-1 w-32" />
      </label>
      <Submit className="btn">Save</Submit>
      <div className="w-full"><Result state={state} /></div>
    </form>
  );
}
