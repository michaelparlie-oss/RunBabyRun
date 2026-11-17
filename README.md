# RunBabyRun

A race training planner that any runner can use with **their own Strava account**. A runner connects Strava, answers a short
questionnaire (race, current running, available days, a health check), and gets a plan from today to race day for a **5K, 10K,
half marathon or marathon**. Each planned run is then matched to the Strava activity from that day and scored against its
distance, heart-rate and pace targets.

Built with Next.js 16 (App Router), TypeScript and Tailwind 4. Deployed on Netlify.

## How a runner uses it

1. **Connect with Strava** (read-only: `read`, `activity:read_all`).
2. **Questionnaire.** Pre-filled from the last 120 days of Strava runs; every number can be corrected.
3. **Plan.** Base, build, taper and race week, with paces and heart-rate ranges personal to the runner.
4. **Train.** Today / Week / Plan / Progress. Runs sync from Strava when the app is opened.
5. **Adjust.** Log pain, skip a session, enter a new race result, or rebuild the remaining weeks from recent training.

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

## Setup on Netlify

1. Create the site from this repository (build command and plugin come from `netlify.toml`).
2. Optional environment variables (see `.env.example`):
   - `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`: enables the shared app.
   - `SESSION_SECRET`: 32+ random characters. If unset, a secret is generated and kept in the site's storage.
   - `CONTACT_EMAIL`: shown on the privacy page.
3. In the Strava API application, set **Authorization Callback Domain** to the site's host (e.g. `runbabyrun.netlify.app`).
4. Open `/api/health`. It reports whether storage works and whether the shared app is configured.

### Storage

Each runner's data is a handful of JSON documents keyed by their Strava athlete id (`lib/storage`):

- **Netlify Blobs** in production. No setup and no extra cost. Suitable while the number of runners is modest.
- **Files in `.data/`** for local development.
- `docs/netlify-database.md` describes how to move to **Netlify Database (Postgres)**, which costs credits, when the
  site grows.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests (plan generator, screening, crypto, storage, Strava sync, alerts)
npm run typecheck
```

Strava only redirects to the callback domain registered for the API application, so for local sign-in set that domain to
`localhost` on a development application.

End-to-end check without Strava (uses a stand-in server):

```bash
npm run build
python3 scripts/fake-strava.py 4010 &
ALLOW_HTTP=1 STRAVA_API_BASE=http://127.0.0.1:4010/api/v3 STRAVA_OAUTH_BASE=http://127.0.0.1:4010/oauth \
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
- [ ] Request more athlete capacity for the shared Strava application, or keep the site on own-keys mode.
- [ ] Have the Terms and Privacy pages reviewed for your jurisdiction. They are plain-language drafts, not legal advice.
      The app stores health-related answers, which many privacy laws treat as sensitive data.
- [ ] Set `SESSION_SECRET` and `CONTACT_EMAIL`.
- [ ] Decide on storage for scale (`docs/netlify-database.md`).

## Not medical advice

RunBabyRun gives general training guidance. It does not diagnose or treat anything, and it is for adults.
