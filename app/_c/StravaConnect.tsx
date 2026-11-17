import { siteCreds } from "@/lib/strava/oauth";

export const STRAVA_ERRORS: Record<string, string> = {
  denied: "Strava access was not granted. You can try again whenever you like.",
  state: "That Strava link expired. Try again.",
  scope: "RunBabyRun needs permission to read your activities. Tick that box on Strava's screen.",
  limit: "This site's Strava connection has reached its athlete limit. You can still connect with your own Strava API keys.",
  keys: "Strava rejected those API keys. Check the client ID and secret, and that the callback domain matches this site.",
  bad_keys: "Enter the numeric client ID and the client secret from your Strava API settings.",
  not_configured: "One-click Strava sign-in is not set up on this site yet. Connect with your own Strava API keys.",
  strava: "Could not reach Strava. Try again in a minute.",
  linked: "That Strava account is already connected to another RunBabyRun account.",
};

/** The two ways to connect Strava: the site's own application, or the runner's own API keys. */
export function StravaConnect({ host, error }: { host: string; error?: string }) {
  const shared = !!siteCreds();
  const open = !shared || ["limit", "bad_keys", "keys", "not_configured"].includes(error ?? "");
  return (
    <div>
      {shared ? (
        <>
          <a href="/api/strava/login" className="btn btn-primary w-full">Connect with Strava</a>
          <p className="mt-2 text-sm text-ink-2">You approve read-only access on Strava. RunBabyRun never posts or changes anything there.</p>
        </>
      ) : (
        <p className="text-sm text-ink-2">One-click connection isn&apos;t set up on this site yet. Use your own Strava API keys, which takes about three minutes.</p>
      )}
      <details id="own-keys" className="mt-4 border-t border-line pt-3" open={open}>
        <summary className="cursor-pointer text-sm font-semibold">Use my own Strava API keys</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
          <li>Open <a className="font-semibold underline underline-offset-4" href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer">strava.com/settings/api</a> and create an API application. Any name and website will do.</li>
          <li>Set Authorization Callback Domain to <code className="bg-wash px-1.5 py-0.5">{host}</code></li>
          <li>Copy the Client ID and Client Secret into the boxes below.</li>
        </ol>
        <form action="/api/strava/login" method="post" className="mt-4 space-y-3">
          <label className="block text-sm font-semibold">Client ID<input name="client_id" required inputMode="numeric" pattern="[0-9]{1,12}" className="input mt-1" autoComplete="off" /></label>
          <label className="block text-sm font-semibold">Client secret<input name="client_secret" type="password" required minLength={20} maxLength={80} className="input mt-1" autoComplete="off" /></label>
          <button className="btn w-full">Connect Strava</button>
        </form>
        <p className="mt-2 text-xs text-muted">Your secret is encrypted before it is stored and is used only to talk to Strava for your own account.</p>
      </details>
    </div>
  );
}
