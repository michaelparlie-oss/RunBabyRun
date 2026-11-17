import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { callbackUrl, originOf } from "@/lib/server/origin";
import { OAUTH_COOKIE, startSession, unseal } from "@/lib/session";
import { completeLogin, siteCreds, TokenError, tokenRequest } from "@/lib/strava/oauth";
import type { OAuthPending } from "../login/route";

export async function GET(req: NextRequest) {
  const u = req.nextUrl;
  const back = (q: string) => NextResponse.redirect(new URL(`/?error=${q}`, originOf(req)), 303);
  const jar = await cookies();
  const pending = await unseal<OAuthPending>(jar.get(OAUTH_COOKIE)?.value);
  jar.delete(OAUTH_COOKIE);
  if (u.searchParams.get("error")) return back("denied");
  const code = u.searchParams.get("code");
  if (!code || !pending || pending.exp < Date.now() || u.searchParams.get("state") !== pending.state) return back("state");
  const scope = u.searchParams.get("scope") ?? "";
  if (!scope.includes("activity:read")) return back("scope");
  const own = pending.mode === "own" && pending.clientId && pending.clientSecret ? { clientId: pending.clientId, clientSecret: pending.clientSecret } : null;
  const creds = own ?? siteCreds();
  if (!creds) return back("not_configured");
  try {
    void callbackUrl; // the redirect URI is validated by Strava at the authorize step
    const t = await tokenRequest(creds, { code, grant_type: "authorization_code" });
    const acc = await completeLogin(t, scope, pending.mode, own);
    await startSession(acc.athlete_id);
  } catch (e) {
    if (e instanceof TokenError) return back(/limit/i.test(e.body) ? "limit" : e.status === 400 || e.status === 401 ? "keys" : "strava");
    return back("strava");
  }
  return NextResponse.redirect(new URL("/?connected=1", originOf(req)), 303);
}
