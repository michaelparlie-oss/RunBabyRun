# Decisions

Each entry: what was decided, why, and how sure we are. "Judgement" means a coaching convention without direct trial
evidence; these are labelled the same way in the app at `/about`.

## Product

- **Each runner signs in with Strava; no separate accounts.** The Strava athlete id is the user id. Fewer passwords, and the
  app is useless without Strava anyway.
- **Two connection modes (shared app, own API keys).** Strava caps the number of athletes per API application until it
  reviews the application, so a public site cannot rely on one shared application from day one. Own-keys mode always works.
- **Screening before any plan.** A plan is only generated after the questionnaire, including a health check and a
  confirmation that the runner is an adult. A "yes" to a health question does not block the runner; it adds a prominent
  "check with a doctor first" notice and makes progression more conservative. The questions follow the logic of the ACSM
  preparticipation model (Riebe et al. 2015) but are written in our own words and are **not a validated instrument**.
- **Read-only.** Scope is `read,activity:read_all`. `activity:read_all` is needed to see runs the runner keeps private.

## Plan generator (`lib/plan/generate.ts`)

| Rule | Value | Basis |
|---|---|---|
| Long-run cap | ≤ 10% above the longest run of the previous 30 days (+1 km when under 10 km) | Frandsen et al. 2025 (cohort, association only). The +1 km floor is judgement so very short long runs can progress. |
| Weekly growth | 8% per week; 6% when "conservative" | Judgement, in the direction of Nielsen et al. 2014 |
| Conservative mode | Any health flag, any sore area, age ≥ 55, or a new runner | Judgement |
| Easier weeks | Every 4th week (3rd when conservative), about 25% less | Coaching convention |
| Hard sessions | None until the runner can run 30 min; fewer reps for new runners | Judgement; mostly-easy distribution per Stöggl & Sperlich 2015 (trained athletes) |
| Taper | 5K: race week only; 10K and HM: one lighter week; FM: two | Direction from Bosquet et al. 2007; scaling by distance is judgement |
| Race-time conversion | Riegel, exponent 1.06 | Riegel 1981. Known to be optimistic for the marathon at low weekly distance; the app says so. |
| Pace zones | Offsets in s/km from 10K-equivalent pace | Coaching convention |
| HR zones | Fractions of maximum heart rate | Coaching convention. Max HR: entered > highest seen in Strava > Tanaka 208 − 0.7 × age > 190 |
| Strength | 0–2 per week, never the day before the long run or race; extra hip work for a sore knee | Balsalobre-Fernández et al. 2016 (highly trained runners); Lack et al. 2015 (patellofemoral pain rehab). Placement is judgement. |
| Minimum build-up | 6 / 8 / 10 / 16 weeks for 5K / 10K / HM / FM | Judgement. Shorter is allowed with a warning; less than 2 weeks is refused. |

Known limits: no rule here has been shown to prevent injury in every runner; evidence from trained athletes is extrapolated
to recreational runners; a reference run taken from Strava training data understates race fitness, so paces start slow.

## Adapting the plan

- The plan is **not** changed silently. On every page load the runner's actual Strava running is checked against it, and the
  Today page shows alerts (distance spike, next long run too large a step, most of last week missed, pain logged).
  "Rebuild" regenerates the remaining weeks from the last four weeks of real running; past sessions are kept as history.
- A new race or time-trial result changes paces everywhere without changing the sessions.

## Technical

- **Document store, not relational tables.** A runner's whole state is five small JSON documents behind one interface
  (Netlify Blobs in production, files locally, memory in tests). Netlify's own guidance prefers a database for per-user
  data; Blobs was chosen for launch because Netlify Database consumes paid credits and is provisioned automatically as
  soon as its package is installed. The Postgres backend is ready in `docs/netlify-database.md`.
- **Strava calls are minimal.** Opening the app lists new activities (1–2 calls, at most every 30 minutes). Laps and
  streams are fetched only when a matched run is opened, once, then stored. Rate-limit responses pause syncing instead of
  retrying inside a serverless request.
- **Webhook for deauthorization only.** Strava's getting-started guide says its API terms require webhooks to learn when
  an athlete deauthorizes an application. `/api/strava/webhook` handles that for the shared app. Strava does not sign
  webhook events, so an event never deletes data by itself: it triggers a check with Strava, and Strava-derived data is
  removed only when Strava confirms the token is dead. Activity events are ignored; syncing stays pull-based. Own-keys
  mode has no webhook because each runner's application would need its own subscription.
- **Secrets.** `SESSION_SECRET` from the environment when set; otherwise generated once and stored in site storage so the
  site works with zero configuration. Setting the env var is safer because the key is then held apart from the data.

### Live updates: Supabase Realtime as a signal, not a datastore

Supabase is used only for Realtime Broadcast. The server posts an empty `changed` event to a topic derived from
HMAC(site secret, athlete id); the browser subscribes with the publishable key and calls `router.refresh()`, which
re-renders from Netlify Blobs under the normal session check. This keeps runner data in one place, needs no Supabase
secret key or row-level-security policies, and a leaked topic lets a stranger trigger a reload and nothing else.
Polling (45 s render, 5 min Strava check) stays as the fallback, so the app works unchanged if Supabase is down or
not configured.

### Accounts first, Strava optional

A runner is a RunBabyRun account (email and password through Supabase Auth), not a Strava athlete. Every account has
a random numeric id that owns its documents; two small indexes map the Supabase user and, when connected, the Strava
athlete to it, and one Strava athlete can belong to only one account. After sign-up the runner picks a path:

- **Strava:** as before. Runs sync, are matched by date and scored.
- **By hand:** "Mark as done" stores a placeholder run at the planned distance, so the week strip, progress chart and
  spike checks keep working; "Log this run" stores real distance, time and optional heart rate and gets the same
  scoring as a Strava run from its summary. Manual logging is hidden while Strava is connected, to avoid double counting.

Switching to manual removes Strava-imported runs (Strava's terms) and keeps hand-entered ones. Deleting the account
asks for the password, which both confirms intent and yields the token needed to delete the Supabase login itself
through `delete_own_account()`, so no Supabase secret key has to live on the site.

### Plans are held to recorded history

Before any plan is generated or rebuilt, `lib/analysis.ts` reads the runner's stored runs in rolling 7-day blocks and
`applyEvidence` adjusts the answers. It only ever lowers them:

- Starting weekly distance is the lower of what was entered and what was sustained: the 4-week average, or the lower
  of the 4- and 8-week averages once eight weeks of history exist, so a recent ramp is not treated as a base.
- The long run builds from the longest run of the last 30 days if that is shorter than the answer.
- Experience drops one level when the 8-week average is far below what that level assumes.
- A gap of more than 10 days, a last week more than 1.3 times the 4-week average, or running in fewer than 6 of the
  last 8 weeks switches on the gentler build-up (about 6% growth, an easier week every third week).
- The biggest week is capped at the greater of 1.8 times the starting volume and starting volume + 12 km.

It needs at least three weeks of history and four runs; with less, the runner's answers stand. These thresholds are
coaching judgement, chosen to err low. The load ratio in particular is shown on the Analysis page as a descriptive
guide and is labelled as contested; it is not presented as an injury predictor. The plan shows a notice saying what
was measured and what was changed.

### Hosting on Vercel, data in Supabase

Netlify's free plan charges credits per production deploy and paused deploys after about twenty in a month, so
hosting moved to Vercel. Netlify Blobs does not exist there, so runner documents moved to a single Supabase table,
`docs(owner, key, value jsonb)`, behind the existing `DocStore` interface. Row-level security is on with no policies:
the publishable key (which the browser sees) can do nothing with it, and the server uses the secret key. This
replaces the earlier position that Supabase held no runner data; the privacy page says so. Functions run in Singapore
(`sin1`) to sit next to the database.
