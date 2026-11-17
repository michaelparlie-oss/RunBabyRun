import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { randomToken } from "@/lib/crypto";
import { callbackUrl, originOf } from "@/lib/server/origin";
import { cookieOpts, OAUTH_COOKIE, seal } from "@/lib/session";
import { authorizeUrl, siteCreds } from "@/lib/strava/oauth";

export interface OAuthPending { state: string; mode: "shared" | "own"; clientId?: string; clientSecret?: string; exp: number }

async function begin(req: NextRequest, mode: "shared" | "own", own?: { clientId: string; clientSecret: string }) {
  const clientId = mode === "own" ? own!.clientId : siteCreds()?.clientId;
  if (!clientId) return NextResponse.redirect(new URL("/?error=not_configured", originOf(req)), 303);
  const state = randomToken(24);
  const pending: OAuthPending = { state, mode, ...(own ?? {}), exp: Date.now() + 10 * 60 * 1000 };
  (await cookies()).set(OAUTH_COOKIE, await seal(pending), cookieOpts(600));
  return NextResponse.redirect(authorizeUrl(clientId, callbackUrl(req), state), 303);
}

/** "Connect with Strava" using this site's Strava application. */
export async function GET(req: NextRequest) {
  return begin(req, "shared");
}

/** Connect using the runner's own Strava API application (client ID and secret from strava.com/settings/api). */
export async function POST(req: NextRequest) {
  const f = await req.formData();
  const clientId = String(f.get("client_id") ?? "").trim();
  const clientSecret = String(f.get("client_secret") ?? "").trim();
  if (!/^\d{1,12}$/.test(clientId) || !/^[A-Za-z0-9]{20,80}$/.test(clientSecret)) return NextResponse.redirect(new URL("/?error=bad_keys#own-keys", originOf(req)), 303);
  return begin(req, "own", { clientId, clientSecret });
}
