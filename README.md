# RunBabyRun

A race training planner that any runner can use with **their own Strava account**. A runner connects Strava, answers a short
questionnaire (race, current running, available days, a health check), and gets a plan from today to race day for a **5K, 10K,
half marathon or marathon**. Each planned run is then matched to the Strava activity from that day and scored against its
distance, heart-rate and pace targets.

Built with Next.js 16 (App Router), TypeScript and Tailwind 4. Deployed on Netlify.

## How a runner uses it

1. **Create an account** with an email and password.
2. **Choose a path:** connect Strava (read-only: `read`, `activity:read_all`) or log runs by hand. It can be changed later in Settings.
3. **Questionnaire.** With Strava it is pre-filled from the last 120 days of runs; every number can be corrected.
4. **Plan.** Base, build, taper and race week, with paces and heart-rate ranges personal to the runner.
5. **Train.** Today / Week / Plan / Progress. Runs sync from Strava, or are ticked off or logged by hand.
6. **Adjust.** Log pain, skip a session, enter a new race result, or rebuild the remaining weeks from recent training.

How the plan is built, and which rules rest on research and which on coaching judgement, is documented in the app at `/about`
and in `DECISIONS.md`.

## The two ways to connect Strava

Strava limits how many athletes can authorize one API application. A new application can connect **one athlete** (its owner)
until Strava raises its capacity, so the app supports both of these at the same time:

| Mode | Who it is for | What is needed |
|---|---|---|
| **Own API keys** (always available) | Any runner | The runner creates a free API application at <https://www.strava.com/settings/api>, sets **Authorization Callback Domain** to this site's host name, and pastes the Client ID and Client Secret on the home page. |
| **Shared app** (one-click "Connect with Strava") | Everyone, once capacity allows | The site owner sets `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` in Netlify. Runners beyond the application's athlete capacity get a clear message and can fall back to their own keys. |

Check Strava's current API terms, rate limits and athlete-capacity process before opening the shared app to the public:
<https://developers.strava.com/docs/getting-started/> and <https://developers.strava.com/docs/rate-limits/>.

## Setup on Vercel (with Supabase)

Hosting is Vercel; sign-in, live updates and all runner data are in one Supabase project.

1. **Supabase:** create a project and apply the two migrations: `docs_table` (the `docs` table, row-level security on,
   no policies) and `delete_own_account`. Then follow "Accounts" below for the Auth settings.
2. **Vercel:** import this GitHub repository as a new project (framework: Next.js; `vercel.json` pins functions to
   Singapore, next to the database).
3. **Environment variables** on the Vercel project:

   | Name | Value |
   | --- | --- |
   | `SUPABASE_URL` | `https://YOUR-REF.supabase.co` (public) |
   | `SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key (public) |
   | `SUPABASE_SECRET_KEY` | the `sb_secret_…` key. Server only; it is what lets the site read and write `docs` |
   | `SESSION_SECRET` | a long random string. Signs sessions and encrypts Strava tokens; changing it signs everyone out and breaks stored Strava connections |
   | `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | optional, for one-click "Connect with Strava" |
   | `STRAVA_WEBHOOK_VERIFY_TOKEN` | optional, see Webhook |
   | `CONTACT_EMAIL` | optional, shown on the privacy page |

4. Deploy, then open `/api/health`: it should report `"storage":"supabase"`, `"storage_ok":true`, `"live_updates":true`.
5. In Strava API settings, the Authorization Callback Domain is the site's domain (for the shared app and for each
   runner's own keys alike).

The app still runs on Netlify (Netlify Blobs storage, chosen automatically when `SUPABASE_SECRET_KEY` is absent), but
Netlify's free plan meters every production deploy.

### Webhook (shared app only)

Strava's API terms ask applications to use webhooks to learn when an athlete revokes access. The endpoint is
`/api/strava/webhook`. When a runner disconnects RunBabyRun from Strava's side, it checks with Strava and then deletes
that runner's tokens and stored activities (their own answers, plan and logs stay until they delete their account).

One-time setup, after the shared app's env vars are set:

1. Set `STRAVA_WEBHOOK_VERIFY_TOKEN` in Netlify to any random string and redeploy.
2. Create the subscription (run once, from any computer):

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_CLIENT_ID -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://YOUR-SITE.netlify.app/api/strava/webhook \
  -F verify_token=THE_SAME_RANDOM_STRING
```

Own-keys mode has no webhook (each runner's own application would need its own subscription); a revoked connection is
detected at the next sync instead.

### Accounts (Supabase Auth, required)

Runners sign up with an email and password, then choose to connect Strava or to log runs by hand. Sign-in uses the
same Supabase project as live updates (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`). The server calls Supabase Auth and
then issues RunBabyRun's own session cookie; no Supabase token is kept and no secret key is needed.

One-time setup in the Supabase dashboard, under Authentication:

- **URL Configuration:** set Site URL to the site's address and add `https://YOUR-SITE/auth/callback` to Redirect URLs.
  Confirmation and password-reset links land there.
- **Email:** Supabase's built-in mailer only delivers to members of the Supabase organisation (about two messages an
  hour). For a public site either add custom SMTP (Authentication, Emails, SMTP Settings), or turn off "Confirm email"
  under Sign In / Providers, Email so sign-up works without a message. Password reset needs working email either way.
- The migration `delete_own_account` (a database function that deletes only its caller) lets "Delete my account"
  remove the login as well as the data.

### Live updates (Supabase Realtime, optional)

Signed-in pages refresh themselves every 45 seconds and check Strava for new runs every 5 minutes while open. With a
free Supabase project they also update the moment something changes (a sync, a log entry on another device, a Strava
webhook event). Set two site environment variables, both public values from the Supabase project's Connect dialog:

- `SUPABASE_URL`, e.g. `https://abcd.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`, the `sb_publishable_…` key

No tables, secret keys or personal data are involved: the server posts an empty ping to an unguessable per-runner
Broadcast topic and the open tab re-renders from the site's own storage. `/api/health` reports `live_updates`.
Instant pickup of a brand-new Strava run also needs the webhook above (shared app); in own-keys mode the 5-minute
check does that job.

### Storage

Each runner's data is a handful of JSON documents keyed by their account id (`lib/storage`):

- **Supabase Postgres** (`docs` table) when `SUPABASE_SECRET_KEY` is set. This is the production setup.
- **Netlify Blobs** on Netlify without that key.
- **Files in `.data/`** for local development.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests (plan generator, screening, crypto, storage, Strava sync, alerts)
npm run typecheck
```

Strava only redirects to the callback domain registered for the API application, so for local sign-in set that domain to
`localhost` on a development application.

End-to-end check without Strava or Supabase (one stand-in server plays both; start from an empty `.data/`):

```bash
npm run build
python3 scripts/fake-strava.py 4010 &
ALLOW_HTTP=1 STRAVA_API_BASE=http://127.0.0.1:4010/api/v3 STRAVA_OAUTH_BASE=http://127.0.0.1:4010/oauth \
  SUPABASE_URL=http://127.0.0.1:4010 SUPABASE_PUBLISHABLE_KEY=test \
  STRAVA_CLIENT_ID=123 STRAVA_CLIENT_SECRET=sharedsecretsharedsecret12 npx next start -p 3111 &
python3 scripts/smoke.py http://127.0.0.1:3111 $(date +%F)
```

## Privacy and security

- Read-only Strava scope. Nothing is ever written to Strava.
- Strava tokens and runner-supplied client secrets are encrypted at rest (AES-256-GCM).
- Sign-in is an HMAC-signed, httpOnly cookie. Every read and write is scoped to the athlete id in the verified session.
- Runners can download their data and delete their account (which also revokes access at Strava) from Settings.

## Before a public launch (owner's checklist)

- [ ] Read and accept the current Strava API Agreement and Brand Guidelines; replace the text "Connect with Strava" button
      with Strava's official button asset if required.
- [ ] Create the webhook subscription (see Webhook above).
- [ ] Request more athlete capacity for the shared Strava application, or keep the site on own-keys mode.
- [ ] Have the Terms and Privacy pages reviewed for your jurisdiction. They are plain-language drafts, not legal advice.
      The app stores health-related answers, which many privacy laws treat as sensitive data.
- [ ] Set `SESSION_SECRET` and `CONTACT_EMAIL`.
- [ ] Decide on storage for scale (`docs/netlify-database.md`).

## Not medical advice

RunBabyRun gives general training guidance. It does not diagnose or treat anything, and it is for adults.
