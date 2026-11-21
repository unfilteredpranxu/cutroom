# Cutroom Studio

Cutroom is an owner-only studio that finds highlights in public YouTube videos and makes vertical Shorts from an authorized local source file. The same editor also works with manual timestamps.

1. Unlock the studio and paste a public YouTube URL. Choose how many highlights to request and a preferred cut length.
2. Review Gemini’s ranked moments. Select **Use these timestamps** to load a cut into the editor.
3. Choose the matching source video from Files, adjust the start and end, and frame the shot. Play the cut to verify its boundaries.
4. Open **Captions** to transcribe on device, import SRT/VTT, or add and edit cues manually. Kinetic uses approximate Whisper word timings when available. Confirm the wording and timing before export.
5. Select 540 × 960, 720 × 1280, or 1080 × 1920 and export. Open a clip in the session library or download the MP4. Select multiple clips and prepare a ZIP for one download.

## Deploy from an iPad

1. In GitHub, put the finished studio branch on the repository’s default branch. You can merge it through a pull request. The deployment workflow runs only from the default branch.
2. In Google AI Studio, confirm your project can use `gemini-4-hydrogen` and public YouTube input on the free tier. Create a key in that project. Keep Cloud Billing disabled. Access and quota can vary by account and region.
3. In Cloudflare, keep the account on Workers Free. Create an account-scoped API token with **Workers Scripts Edit** and **Pages Edit** permissions. Copy the account ID from **Workers & Pages**.
4. In GitHub **Settings → Secrets and variables → Actions**, add the repository secret `CLOUDFLARE_API_TOKEN` and repository variable `CLOUDFLARE_ACCOUNT_ID`.
5. In GitHub **Actions → Deploy Cutroom → Run workflow**, select the default branch. Enable **Create the cutroom Pages project** on the first deploy if the project does not yet exist. The workflow deploys the private `cutroom-analysis` Worker and the `cutroom` Pages project with the same-origin service binding.
6. In Cloudflare **Workers & Pages → cutroom-analysis → Settings → Variables and Secrets**, save `GEMINI_API_KEY` and `CUTROOM_OWNER_TOKEN` as **Secrets**. Use at least 32 random letters, digits, hyphens, or underscores for the owner token. Save it in a password manager for Cutroom sign-in.
7. Open the production Pages URL shown in Cloudflare. Run the iPad acceptance check below before relying on a longer cut.

### Physical iPad acceptance check

- Open the Cloudflare URL in Safari. Use **Share → Add to Home Screen → Add** and launch Cutroom from its icon. Unlock it and rotate the iPad between portrait and landscape.
- Analyze a short, public video and verify that Gemini returns plausible cuts. Confirm each proposed timestamp against the source. Try the **Open on YouTube** link if the embed is restricted.
- Choose an authorized H.264/AAC MP4 from Files. Edit a short cut, move the framing slider, and play it. Try local transcription on clear speech and review every cue, or import a known SRT/VTT and edit a cue.
- Export at 540 × 960, open the result with its audio in Files, and check framing and caption timing. Try 1080 × 1920 if the shorter export works comfortably. Use 540 × 960 if the tab reloads or a large export fails.
- Cancel an in-progress encode, then export a second cut. Select both results, download the ZIP, and open it in Files. Save finished clips before locking or closing the app.

## Privacy, limits, and compatibility

- The Pages shell is public. Owner authentication gates server requests, and the Worker is addressed through a Pages service binding. The owner token stays in browser memory until lock or reload. The Worker holds the Gemini API key and stores only local quota counters. A single SQLite Durable Object caps analysis at two attempts per rolling minute and ten per UTC day, separate from Gemini's own quota.
- Cutroom sends the canonical public YouTube URL to Gemini. Source media, generated audio samples, captions, and MP4s stay on the device. Selecting transcription downloads Whisper weights from Hugging Face. The service worker caches public application assets and keeps authenticated API responses and local media out of its cache. Unlocking and Gemini analysis require an internet connection.
- Export uses single-threaded FFmpeg WebAssembly, one cut at a time, and releases the processing worker after each task. It reads the local file through the browser-backed filesystem. The app accepts MP4/MOV/M4V up to 512 MiB, cuts up to 60 seconds, and keeps up to 20 exports or 96 MiB in the active session. Source decoding depends on browser support. A failed higher-resolution encode can retry at 540 × 960.
- H.264 and AAC are used for MP4 playback. A source without audio produces a silent MP4. Subtitle drawing uses bundled DejaVu Sans and Noto Sans Devanagari. Check rendered text directly if the source uses other scripts, emojis, or unusual glyphs.

## Engineering checks

Use Node 24, FFmpeg/ffprobe, and unzip. Run the following in the repository root. The ONNX setting skips the unused native GPU package since Cutroom runs inference in the browser.

```sh
ONNXRUNTIME_NODE_INSTALL=skip npm ci
npm run typecheck
npm test
npm run build
npm run check:pages
npx playwright install chromium
npm run test:e2e
```

To run with the real Pages and Worker bindings, add the Worker secrets to the ignored `worker/.dev.vars` using [.env.example](.env.example), then run `npm run build` and `npx wrangler pages dev -c wrangler.toml -c worker/wrangler.toml`. Vite hot reload uses `npm run dev` with `npx wrangler dev --config worker/wrangler.toml --port 8787`.

The browser tests encode generated, authorized video fixtures with audio. They download actual MP4s, probe codecs and dimensions, decode all tracks, compare pixels to verify crop and caption timing, and inspect the selected ZIP. Gemini test traffic and model-download failure tests use labeled fixtures.

For a live Gemini test with an existing key in the process environment, set `CUTROOM_GEMINI_LIVE=1` and `CUTROOM_LIVE_YOUTUBE_URL` to a short public video, then run `npm test -- tests/gemini.live.test.ts`. It uses one analysis attempt. The server submits to the official Interactions API and asks Hydrogen to inspect the YouTube source in agentic mode. Validate free-tier entitlement and long-video behavior on the target account. Cutroom has no automatic paid fallback.

## Upstream sources

- [Google's Hydrogen and direct YouTube video example](https://github.com/google-gemini/cookbook/blob/main/quickstarts/Video_understanding.ipynb)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Cloudflare Pages service bindings](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings) and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [FFmpeg WebAssembly source and build instructions](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10), [FFmpeg source and licenses](https://ffmpeg.org/legal.html), and [Whisper model used by the local transcriber](https://huggingface.co/Xenova/whisper-tiny)
