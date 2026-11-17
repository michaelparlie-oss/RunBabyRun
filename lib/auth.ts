import { supabaseEnv } from "@/lib/supabase";

/**
 * Sign-in through Supabase Auth (email and password). The server talks to Supabase; the browser never does,
 * and no Supabase token is kept after sign-in: RunBabyRun issues its own session cookie.
 */
export interface AuthUser { id: string; email: string; name: string }
export type AuthFail = "not_configured" | "invalid" | "unconfirmed" | "exists" | "weak" | "rate" | "email_send" | "network";
export type AuthResult<T> = { ok: true; value: T } | { ok: false; error: AuthFail };
type F = typeof fetch;

const fail = (error: AuthFail) => ({ ok: false as const, error });
function classify(status: number, body: { error_code?: string; code?: string | number; msg?: string; message?: string; error_description?: string }): AuthFail {
  const code = String(body.error_code ?? body.code ?? ""), msg = `${body.msg ?? ""} ${body.message ?? ""} ${body.error_description ?? ""}`.toLowerCase();
  if (status === 429 || /rate_limit/.test(code)) return "rate";
  if (code === "email_not_confirmed" || msg.includes("not confirmed")) return "unconfirmed";
  if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered")) return "exists";
  if (code === "weak_password" || msg.includes("password should")) return "weak";
  if (code === "email_address_not_authorized" || msg.includes("sending") || msg.includes("not authorized")) return "email_send";
  return "invalid";
}
async function call(path: string, init: { method?: string; body?: unknown; token?: string }, f: F): Promise<AuthResult<Record<string, unknown>>> {
  const e = supabaseEnv();
  if (!e) return fail("not_configured");
  try {
    const res = await f(`${e.url}${path}`, {
      method: init.method ?? "POST",
      headers: { "Content-Type": "application/json", apikey: e.key, ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return res.ok ? { ok: true, value: body } : fail(classify(res.status, body));
  } catch {
    return fail("network");
  }
}
function toUser(u: unknown): AuthUser | null {
  const o = u as { id?: string; email?: string; user_metadata?: { name?: string } } | null;
  return o?.id && o.email ? { id: o.id, email: o.email, name: o.user_metadata?.name ?? "" } : null;
}

/** Create a login. `signedIn` is false when Supabase wants the email confirmed first. */
export async function signUp(email: string, password: string, name: string, redirectTo: string, f: F = fetch): Promise<AuthResult<{ user: AuthUser | null; signedIn: boolean }>> {
  const r = await call(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`, { body: { email, password, data: { name } } }, f);
  if (!r.ok) return r;
  const session = typeof r.value.access_token === "string";
  const user = toUser(session ? r.value.user : r.value);
  // With confirmation on, Supabase answers an existing address with a look-alike user that has no identities.
  if (!session && Array.isArray((r.value as { identities?: unknown[] }).identities) && (r.value as { identities: unknown[] }).identities.length === 0) return fail("exists");
  return { ok: true, value: { user: session ? user : null, signedIn: session && !!user } };
}

export async function signIn(email: string, password: string, f: F = fetch): Promise<AuthResult<{ user: AuthUser; token: string }>> {
  const r = await call("/auth/v1/token?grant_type=password", { body: { email, password } }, f);
  if (!r.ok) return r;
  const user = toUser(r.value.user);
  return user && typeof r.value.access_token === "string" ? { ok: true, value: { user, token: r.value.access_token } } : fail("invalid");
}

/** Who a Supabase access token belongs to (used after an email link). */
export async function userFromToken(token: string, f: F = fetch): Promise<AuthResult<AuthUser>> {
  const r = await call("/auth/v1/user", { method: "GET", token }, f);
  if (!r.ok) return r;
  const user = toUser(r.value);
  return user ? { ok: true, value: user } : fail("invalid");
}

export async function sendReset(email: string, redirectTo: string, f: F = fetch): Promise<AuthResult<true>> {
  const r = await call(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { body: { email } }, f);
  return r.ok ? { ok: true, value: true } : r;
}

export async function setPassword(token: string, password: string, f: F = fetch): Promise<AuthResult<AuthUser>> {
  const r = await call("/auth/v1/user", { method: "PUT", token, body: { password } }, f);
  if (!r.ok) return r;
  const user = toUser(r.value);
  return user ? { ok: true, value: user } : fail("invalid");
}

/** Remove the login itself. Runs as the signed-in user through a database function that can only delete its caller. */
export async function deleteLogin(token: string, f: F = fetch): Promise<boolean> {
  return (await call("/rest/v1/rpc/delete_own_account", { token, body: {} }, f)).ok;
}

export const validEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
export const validPassword = (p: string) => p.length >= 8 && p.length <= 72;
