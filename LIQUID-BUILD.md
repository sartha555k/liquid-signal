# Liquid Signal — isolated d1 build

This directory contains two independent Git repositories on branch `liquid-d1`:

- `backend/`: a copy of the existing Jev dashboard and server, with Liquid d1 classification.
- `chrome-extension/`: a separate extension named **Liquid Signal (d1)**, with a purple icon and its own report store.

The original Jev repositories and deployment are unchanged. These copies have no Git remote, and the original Sites project identifier was removed so this backend is not tied to the Jev deployment.

## Start and install

1. In `backend/`, run `npm run db:local` once to initialize this build's local database, then `npm run dev`. The new backend runs on **http://localhost:5174**.
2. In `chrome-extension/`, run `npm run build`.
3. Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select `chrome-extension/dist` in this directory.
4. Keep the original Jev Signal extension installed. Pin **Liquid Signal (d1)** separately, open a YouTube video, then ask a question.

The unpacked folder has a separate path, so Chrome treats it as a different extension and keeps preferences/reports separate.

## Configuration

All private keys are in the ignored `backend/.env.local`:

```env
LIQUID_API_KEY=your_liquid_key
TYPESAFE_API_KEY=your_jev_key
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-5-mini
YOUTUBE_API_KEY=your_youtube_key
```

The new Liquid and OpenAI keys have already been configured locally. YouTube uses the existing project's key.

`chrome-extension/.env.local` contains only the public address:

```env
API_BASE_URL=http://localhost:5174
```

The build refuses to target the existing Jev deployment. It bundles no API keys, and requests import, analysis, suggestions and summaries from the new backend.

## What changed

Version 0.6 adds **Decision model: Liquid d1 / Jev** in the extension and dashboard. The selected provider is sent with every batch. Each provider has separate cache keys and analysis versions; switching providers requires its own analysis. Dashboard snapshots are kept separately while the page is open. The extension remembers the selection, and completed reports always show their actual provider/model, regardless of later selections. CSV/JSON/PDF reports preserve that attribution. OpenAI remains responsible only for question suggestions and written summaries.

Jev uses `https://api.typesafe.ai/v1/systemone`, model `jev-1.13.0`. Its existing input-token rate is an estimate, not a billing guarantee. No provider fallback occurs when a key is unavailable. All three AI keys stay on the backend.

Liquid endpoint: `https://api.liquid.ai/decisions/v1/systemone`; model: `d1:free`.

The existing analysis questions and result/report format remain compatible. All core questions plus the audience question share one call per comment. The extension sends 100 comments per backend job, using two workers; each backend job uses up to ten classification workers (up to 20 provider requests from one extension run). These settings apply to both Liquid and Jev. This batches the extension/backend transport, not the provider's native single-comment API: a 1,000-comment sample uses ten backend jobs, assembled in input order. Provider retries and completed-result caching remain enabled.

Every requested answer is validated before storing results. Incomplete answers are retried rather than cached. Cache keys include Liquid's endpoint, model and analysis version, keeping them separate from Jev results. Cost reporting uses the documented `d1:free` tier rather than Jev's rate; GPT and YouTube have separate usage policies, and Liquid's future pricing/quotas are not guaranteed.

GPT still generates metadata-based question suggestions and the final written explanation. The full report and CSV downloads remain in the extension.

## Before a separate deployment

Deploy `backend/` as a **new** application. Configure its server secrets in that application's environment. Update `API_BASE_URL` to its HTTPS URL, rebuild, and reload only Liquid Signal. Do not deploy over the existing Jev site. The inherited Cloudflare D1 cache/database binding needs its own database/migrations for persistence; analysis works without the cache if the local database is not initialized.

## Verification

```sh
cd backend
node --test scripts/test-liquid-decisions.mjs
node scripts/smoke-providers.mjs
cd ../chrome-extension
npm test
npm run build
```

Each build has its own installed dependency folder. For a standalone checkout on another machine, run `npm ci` in each repository.
