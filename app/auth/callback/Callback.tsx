"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Landing spot for email links. Supabase puts the token in the URL fragment, which only the browser can read. */
export function Callback() {
  const [mode, setMode] = useState<"working" | "recovery" | "failed">("working");
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const t = h.get("access_token") ?? "";
    history.replaceState(null, "", window.location.pathname); // keep the token out of history
    if (!t) { setMsg(h.get("error_description")?.replace(/\+/g, " ") ?? "This link has expired or was already used."); setMode("failed"); return; }
    if (h.get("type") === "recovery") { setToken(t); setMode("recovery"); return; }
    fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: t }) })
      .then((r) => { if (r.ok) window.location.replace("/"); else { setMsg("This link has expired or was already used."); setMode("failed"); } })
      .catch(() => { setMsg("Could not reach the site. Try the link again."); setMode("failed"); });
  }, []);

  if (mode === "working") return <p role="status">Signing you in…</p>;
  if (mode === "failed") return <p role="alert">{msg} <Link href="/login" className="font-semibold underline underline-offset-4">Go to log in</Link></p>;
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setMsg("");
      const password = String(new FormData(e.currentTarget).get("password") ?? "");
      const r = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token, password }) }).catch(() => null);
      if (r?.ok) window.location.replace("/");
      else { setBusy(false); setMsg(r?.status === 400 ? "Use a password of at least 8 characters." : "This link has expired. Ask for a new one."); }
    }}>
      <label className="block text-sm font-semibold">New password<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input mt-1" /></label>
      {msg && <p role="alert" className="text-sm font-medium">{msg}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
    </form>
  );
}
