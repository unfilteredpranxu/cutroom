# Cutroom G01

Cutroom analyzes a public YouTube link with Gemini 4 Hydrogen and ranks suggested shorts for review. The studio shows timestamps, an opening hook, a rationale, a score, and an optional embedded source preview. Title edits are kept in the current browser session. The studio uses estimated or uncertain cut boundaries. G01 leaves transcript excerpts empty because it has no verified speech source. Future export requires an authorized source MP4.

The Pages shell is publicly reachable. All analysis and session endpoints require the owner's token. The browser holds the owner token in memory until it is locked or reloaded. The analysis Worker is reachable through the Pages service binding. A single SQLite Durable Object caps analysis attempts across locations at two per rolling minute and ten per UTC day. Gemini quota is separate. Neither API results nor video files are persisted by Cutroom.

## Deploy from an iPad

1. In Google AI Studio, confirm your project can use `gemini-4-hydrogen` and direct YouTube input on the free tier. Create a Gemini API key in that project. Keep Cloud Billing disabled. Model and feature access can vary by project and region.
2. In Cloudflare, keep the account on Workers Free. Create an account-scoped API token with **Workers Scripts Edit** and **Pages Edit** permissions. Copy the account ID from **Workers & Pages**.
3. In the private GitHub repo, open **Settings → Secrets and variables → Actions**. Add the repository secret `CLOUDFLARE_API_TOKEN` and repository variable `CLOUDFLARE_ACCOUNT_ID`. Put the workflow on the default branch. The deploy job runs only from that branch.
4. In GitHub **Actions → Deploy Cutroom G01 → Run workflow**, select the default branch. Enable **Create the cutroom Pages project** on the first deploy if the project does not already exist. The workflow deploys the private `cutroom-analysis` Worker and publishes the `cutroom` Pages project with its same-origin service binding.
5. In Cloudflare **Workers & Pages → cutroom-analysis → Settings → Variables and Secrets**, save `GEMINI_API_KEY` and `CUTROOM_OWNER_TOKEN` as **Secrets**. Generate a unique token in a password manager using at least 32 random letters, digits, hyphens, or underscores. Keep it available for signing in to Cutroom.
6. Open the production Pages address from Cloudflare. Unlock the studio, then analyze a short public YouTube video. Compare the returned timestamps and highlights with the source.

The deployment workflow uses `CLOUDFLARE_API_TOKEN` exclusively as a deployment credential. The owner token and Gemini key belong in Worker secrets. The local equivalent is an ignored `worker/.dev.vars` file, based on [.env.example](.env.example).

## Development and verification

Use Node 24. In the repository root, run:

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

To run the app with the Worker and Pages bindings locally, add the local Worker secrets, then run:

```sh
npm run build
npx wrangler pages dev -c wrangler.toml -c worker/wrangler.toml
```

For frontend hot reload, use `npm run dev` alongside `npx wrangler dev --config worker/wrangler.toml --port 8787`. Vite proxies the local API. Automated tests label their synthetic Google and UI responses as fixtures.

## Gemini request and long videos

The Worker uses Google's JavaScript SDK to send an authenticated `POST /v1beta/interactions` request to `generativelanguage.googleapis.com`. It passes a canonical public YouTube watch URL as the video input. The request sets `processing: "agentic"` so Hydrogen can inspect portions of the original timeline, with structured JSON output, interaction storage disabled, and a bounded timeout. The app makes no automatic retry. Google documents static processing as lower latency for short clips and agentic processing as more efficient for long videos. Actual long-video latency and quota use require a live project test.

The server parses the structured response, drops invalid scores and time ranges, validates against reported duration if present, and keeps the higher-ranked selection when intervals overlap. Reported duration and timestamps should be checked in the source preview. Embeds also depend on the video owner's YouTube permissions.

Official references: [Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding), [Google's Hydrogen and YouTube cookbook](https://github.com/google-gemini/cookbook/blob/main/quickstarts/Video_understanding.ipynb), [Pages service bindings](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

### Optional live check

With an already configured free-tier Gemini key in the process environment, set `CUTROOM_GEMINI_LIVE=1` and `CUTROOM_LIVE_YOUTUBE_URL` to a suitable short public video, then run `npm test -- tests/gemini.live.test.ts`. This uses one analysis request. Ordinary tests skip the live check and use labeled fixtures.
