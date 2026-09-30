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
| `API_ACCESS_TOKEN` | A new random secret (at least 32 characters), shared only with trusted demo users |
| `LIQUID_API_KEY` | Your Liquid API key |
| `TYPESAFE_API_KEY` | Your Jev/TypeSafe API key |
| `YOUTUBE_API_KEY` | Your YouTube Data API v3 key |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `OPENAI_MODEL` | `gpt-5-mini` |

Save and redeploy after adding them. No private keys were uploaded during deployment.
Without `API_ACCESS_TOKEN`, paid/import endpoints return 503. With a wrong or missing token, they return 401. `/api/health` remains public and exposes availability booleans only.

## Extension

The release extension points at this service's verified HTTPS URL. Load its `dist` folder in Chrome. Enter **Backend access token** once using the same value as `API_ACCESS_TOKEN`; this is not an OpenAI, Liquid, Jev, or YouTube key. It is stored in the local Chrome profile and sent only to the configured backend.

This is a protected pilot, not public account-based authentication. Trusted users can extract their own access token; revoke/rotate it on Render if you distribute it too broadly. Never put provider keys in the extension or repository. Keys previously shared in chat should be rotated before a public launch.

## Free-tier limitations

Render can sleep when idle, so the first request can be slow. SQLite provides the same analysis cache and dataset schema on Node, but this free instance has an ephemeral disk: caches reset on restarts/deploys/sleep. Completed extension reports remain in the user's Chrome profile. Use a durable database or a paid persistent disk before treating server-side data as permanent.

## Verification

`node --test scripts/test-render-db.mjs scripts/test-liquid-decisions.mjs`

`npm run build:render`

`PORT=5175 NODE_ENV=production npm run start:render`
