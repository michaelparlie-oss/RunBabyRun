/** The Supabase project used for sign-in and live updates. Both values are public. */
export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, ""), key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) return { url, key };
  return process.env.ALLOW_HTTP && /^http:\/\/127\.0\.0\.1:\d+$/.test(url) ? { url, key } : null; // local stand-in for tests
}
