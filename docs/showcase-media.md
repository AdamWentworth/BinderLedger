# Showcase Media Capture

BinderLedger includes an opt-in Playwright capture workflow for generating the
screenshots and short walkthrough videos used by portfolio surfaces such as
Phlosion. The workflow builds the Expo web client, serves the static export
locally, proxies same-origin `/api` requests to the API configured in
`apps/client/.env.local`, and performs read-only catalog and market interactions.

## Capture Everything

Install Chromium once, then run the capture from the client directory:

```bash
cd apps/client
npm ci
npx playwright install chromium
npm run capture:demo:media
```

Generated media is written to:

```text
apps/client/.artifacts/demo-media/binderledger/
├── manifest.json
├── screenshots/
└── videos/
```

The output directory is intentionally ignored by Git. Review the generated
media before copying selected assets into
`Phlosion/public/products/binderledger/demo/`.

## Capture Selection

The defaults produce desktop and mobile PNG screenshots plus WebM videos. A
smaller pass can be selected with environment variables:

```powershell
$env:BINDERLEDGER_DEMO_MEDIA_KINDS = "screenshots"
$env:BINDERLEDGER_DEMO_MEDIA_VIEWPORTS = "desktop"
npm run capture:demo:media
```

Accepted kinds are `screenshots` and `videos`. Accepted viewports are `desktop`
and `mobile`.

To use a different API without changing `.env.local`:

```powershell
$env:BINDERLEDGER_DEMO_MEDIA_API_URL = "http://<trusted-api-host>:4000"
npm run capture:demo:media
```

To capture an already-running web build, provide its URL and skip the managed
server:

```powershell
$env:BINDERLEDGER_DEMO_MEDIA_BASE_URL = "http://127.0.0.1:8082"
$env:BINDERLEDGER_DEMO_MEDIA_SKIP_SERVER = "1"
npm run capture:demo:media
```

## Safety Boundary

The capture flow only reads the catalog and market surfaces. It does not toggle
watchlist membership, upload scans, confirm scan results, or change collection
data. Because live catalog and market data can evolve, the manifest records the
generation time and should be regenerated when preparing a new showcase.
