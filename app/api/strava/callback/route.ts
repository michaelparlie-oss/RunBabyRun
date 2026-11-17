import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { callbackUrl, originOf } from "@/lib/server/origin";
import { publishChange } from "@/lib/live";
import { currentUser, OAUTH_COOKIE, unseal } from "@/lib/session";
import { completeLogin, siteCreds, TokenError, tokenRequest } from "@/lib/strava/oauth";
import { linkStrava, loadUser, saveUser } from "@/lib/users";
import type { OAuthPending } from "../login/route";

export async function GET(req: NextRequest) {
  const u = req.nextUrl;
  const back = (q: string) => NextResponse.redirect(new URL(`/start?error=${q}`, originOf(req)), 303);
  const uid = await currentUser();
  const user = uid ? await loadUser(uid) : null;
  if (!uid || !user) return NextResponse.redirect(new URL("/login?error=signin", originOf(req)), 303);
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
    if (!t.athlete?.id) return back("strava");
    if (!(await linkStrava(t.athlete.id, uid))) return back("linked");
    await completeLogin(uid, t, scope, pending.mode, own);
    await saveUser({ ...user, source: "strava" });
    await publishChange(uid);
  } catch (e) {
    if (e instanceof TokenError) return back(/limit/i.test(e.body) ? "limit" : e.status === 400 || e.status === 401 ? "keys" : "strava");
    return back("strava");
  }
  return NextResponse.redirect(new URL("/?connected=1", originOf(req)), 303);
}
