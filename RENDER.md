# Liquid Signal on Render

This separate build supports both Liquid d1 and Jev. Original Jev repositories remain unchanged.

## Service setup

- Runtime: Node (Node 24)
- Branch: liquid-d1
- Build: `npm ci --include=dev && npm run build:render`
- Start: `npm run start:render`
- Health check: `/api/health`
- Environment: `NODE_ENV=production`, `DEPLOY_TARGET=render`, `NODE_VERSION=24`

`render.yaml` includes the free service configuration but no secrets.

## Add these manually in Render → Environment

| Variable | Value |
| --- | --- |
| `DEMO_ACCESS_MODE` | `public` for the no-login demo; leave unset for private mode |
| `DEMO_USAGE_LIMITS` | `off` for the owner-approved unrestricted demo; unset keeps the quotas below |
| `API_ACCESS_TOKEN` | Private-mode server credential only; never bundle in the extension |
| `LIQUID_API_KEY` | Your Liquid API key |
| `TYPESAFE_API_KEY` | Your Jev/TypeSafe API key |
| `YOUTUBE_API_KEY` | Your YouTube Data API v3 key |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `OPENAI_MODEL` | `gpt-5-mini` |

The authorized keys are configured in Render's private environment settings, never in this repository. Save and redeploy after rotating them.
Public access is explicitly opt-in: set `DEMO_ACCESS_MODE=public` only after approving the public exposure of the paid endpoints. Missing or unknown values keep the existing private protection: production without `API_ACCESS_TOKEN` returns 503; missing/wrong credentials return 401. `/api/health` remains public and exposes provider availability and demo configuration, never secrets.

## Extension

The extension points at `https://liquid-signal.onrender.com`. Reload its existing installed folder in Chrome. It bundles only this public URL, needs no cookies, and has no access-token input. In public demo mode, users need no account, Google OAuth, Supabase session, or sign-in. Reports stay local in the Chrome profile. Legacy token preferences are removed without deleting reports.

## No-login demo safeguards

### Unrestricted public demo

With `DEMO_ACCESS_MODE=public` and `DEMO_USAGE_LIMITS=off`, there are **no application daily quotas or request-rate quotas**, and the extension has no 1,000-comment sample ceiling. Choose a preset or enter any positive whole-number custom sample; imports stop when the video has no more comments. Requests use 250-comment import chunks and 100-comment analysis batches; these are technical batch sizes, not total usage limits. Two extension workers feed ten classification workers per backend request (up to 20 concurrent provider calls per extension run). Both Liquid and Jev receive one comment per native call, with all typed questions together. JSON validation, private dataset protection, and provider limits remain in force. Long-comment classification uses its first 2,000 characters; local exports preserve full imported text.

**Anyone, including bots outside the extension, can consume all API credits or incur charges.** This mode has no app spending protection and must be enabled only with explicit owner approval. Set `DEMO_USAGE_LIMITS=on` (or remove it) to restore quotas. Supabase and login are not used in either mode.

### Optional limited mode

The extension offers up to 1,000 comments per sample. The backend accepts only POST requests for import, suggestions, classification and summaries; shared dataset APIs are blocked. JSON bodies are limited to 1 MiB to fit 100 multilingual comments, classification batches to 100 comments, comment text to 2,000 characters, and questions/choices to 240/80 characters. Exports retain original text; longer comments are truncated only for classification. Both decision models remain available.

UTC daily quotas apply atomically across concurrent requests:

| Endpoint | Server-wide daily limit | Per-network daily limit |
| --- | --- | --- |
| Classification | 5,000 comments and 2,000,000 comment characters | 2,000 comments |
| Question suggestions | 60 calls | 10 calls |
| Final AI summaries | 40 calls | 10 calls |
| YouTube import | 30,000 requested comments | 5,000 requested comments |

Per-network per-minute limits are 120 analysis requests, 5 suggestion calls, 5 summary calls, and 30 imports. Reservations count attempted requests (including cached or failed work); they are not refunded. Limits return 429 with a reset delay. The extension shows the limit instead of repeatedly retrying it. Network identifiers are daily hashes, not stored raw IP addresses. There is no shared token that bypasses these limits in public mode.

**These are per-instance demo safeguards, not permanent spending caps.** Render Free has an ephemeral disk: restarts/redeploys reset the counters. Multiple instances would have separate counters. Keep one instance and use provider-side spending controls; use durable quota storage before broad public distribution. Supabase is not required and no existing Supabase project is modified. Public endpoints can be called outside the extension and consume credits up to these safeguards.

To turn the demo off, remove `DEMO_ACCESS_MODE` or set it to `private` and redeploy. Never put provider keys in the extension or repository; rotate credentials previously shared in chat before public launch.

## Free-tier limitations

Render can sleep when idle, so the first request can be slow. SQLite provides the same analysis cache and dataset schema on Node, but this free instance has an ephemeral disk: caches reset on restarts/deploys/sleep. Completed extension reports remain in the user's Chrome profile. Use a durable database or a paid persistent disk before treating server-side data as permanent.

## Verification

`node --test scripts/test-demo-access.mjs scripts/test-render-db.mjs scripts/test-liquid-decisions.mjs`

`npm run build:render`

Public demo verification (makes small real provider calls): `node scripts/smoke-render.mjs`

Private-mode verification (reads the ignored pilot token, never prints it): `node --env-file=.env.render-token scripts/smoke-render.mjs`

`PORT=5175 NODE_ENV=production npm run start:render`
