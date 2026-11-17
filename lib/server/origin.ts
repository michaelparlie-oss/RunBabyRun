import type { NextRequest } from "next/server";

/** Public origin of this request (behind Netlify's proxy the forwarded headers carry the real host). */
export function originOf(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return req.nextUrl.origin;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
export const callbackUrl = (req: NextRequest) => `${originOf(req)}/api/strava/callback`;
