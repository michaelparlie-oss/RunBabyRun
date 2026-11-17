import { decrypt, encrypt } from "@/lib/crypto";
import { getSecret } from "@/lib/session";
import { getStore } from "@/lib/storage";
import type { Account } from "@/lib/types";
import { nowEpoch } from "@/lib/util/dates";
import { STRAVA_OAUTH, type FetchFn } from "./client";

export const SCOPES = "read,activity:read_all";
export const REFRESH_MARGIN_S = 5 * 60;

export interface Creds { clientId: string; clientSecret: string }
export function siteCreds(): Creds | null {
  const clientId = process.env.STRAVA_CLIENT_ID?.trim(), clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: redirectUri, approval_prompt: "auto", scope: SCOPES, state });
  return `${STRAVA_OAUTH}/authorize?${q}`;
}

export interface TokenResponse {
  access_token: string; refresh_token: string; expires_at: number;
  athlete?: { id: number; firstname?: string; lastname?: string };
}
export class TokenError extends Error { constructor(public status: number, public body: string) { super(`Strava token request failed (${status})`); } }

export async function tokenRequest(creds: Creds, body: Record<string, string>, f: FetchFn = fetch): Promise<TokenResponse> {
  const res = await f(`${STRAVA_OAUTH}/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, ...body }).toString(),
  });
  if (!res.ok) throw new TokenError(res.status, (await res.text()).slice(0, 300));
  return (await res.json()) as TokenResponse;
}

export async function loadAccount(uid: number): Promise<Account | null> {
  return (await getStore()).get<Account>(String(uid), "account");
}
export async function saveAccount(a: Account): Promise<void> {
  await (await getStore()).set(String(a.uid), "account", a);
}

export async function credsFor(a: Account): Promise<Creds> {
  if (a.mode === "own" && a.client_id && a.client_secret_enc) return { clientId: a.client_id, clientSecret: decrypt(a.client_secret_enc, await getSecret()) };
  const s = siteCreds();
  if (!s) throw new Error("This site's Strava connection is not configured.");
  return s;
}

/** Store the runner's Strava connection after a successful authorization. */
export async function completeLogin(uid: number, t: TokenResponse, scope: string, mode: "shared" | "own", own: Creds | null): Promise<Account> {
  if (!t.athlete?.id) throw new Error("Strava did not return an athlete.");
  const secret = await getSecret();
  const prev = await loadAccount(uid);
  const acc: Account = {
    uid, athlete_id: t.athlete.id, firstname: t.athlete.firstname ?? prev?.firstname ?? "Runner", lastname: t.athlete.lastname ?? prev?.lastname ?? "",
    created_at: prev?.created_at ?? new Date().toISOString(), mode,
    client_id: mode === "own" ? own!.clientId : null, client_secret_enc: mode === "own" ? encrypt(own!.clientSecret, secret) : null,
    access_token_enc: encrypt(t.access_token, secret), refresh_token_enc: encrypt(t.refresh_token, secret), expires_at: t.expires_at, scope,
    last_sync_at: prev?.last_sync_at ?? null, sync_message: prev?.sync_message ?? null, paused_until: null,
  };
  await saveAccount(acc);
  return acc;
}

/** A valid access token, refreshed (and the rotated refresh token stored) when it is about to expire. */
export async function validAccessToken(uid: number, f: FetchFn = fetch): Promise<string> {
  const a = await loadAccount(uid);
  if (!a) throw new Error("Strava is not connected.");
  const secret = await getSecret();
  if (a.expires_at - nowEpoch() >= REFRESH_MARGIN_S) return decrypt(a.access_token_enc, secret);
  const t = await tokenRequest(await credsFor(a), { grant_type: "refresh_token", refresh_token: decrypt(a.refresh_token_enc, secret) }, f);
  await saveAccount({ ...a, access_token_enc: encrypt(t.access_token, secret), refresh_token_enc: encrypt(t.refresh_token, secret), expires_at: t.expires_at });
  return t.access_token;
}

/** Revoke this app's access at Strava. Best effort: local data is deleted either way. */
export async function deauthorize(uid: number, f: FetchFn = fetch): Promise<void> {
  try {
    const token = await validAccessToken(uid, f);
    await f(`${STRAVA_OAUTH}/deauthorize`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ access_token: token }).toString() });
  } catch { /* offline or already revoked */ }
}
