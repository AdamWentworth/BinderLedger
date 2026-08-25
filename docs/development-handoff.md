# Frontend Development Machine Handoff

BinderLedger production remains authoritative on `adam-ubuntu`. The development
machine runs only the Expo/React Native toolchain and sends API requests to the
production server while the MVP is read-mostly.

## 1. Prerequisites

Install Git, Node 24 LTS, and npm. Configure GitHub SSH access for
`AdamWentworth`. Docker, Go, PostgreSQL, provider keys, and collector output are
not required for frontend-only development.

## 2. Clone And Configure

```bash
mkdir -p ~/src
git clone git@github.com:AdamWentworth/BinderLedger.git ~/src/BinderLedger
cd ~/src/BinderLedger/apps/client
npm ci
```

Create `apps/client/.env.local` with:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.77:4000
```

Do not restore the root `.env`, production database, provider credentials,
JustTCG cache, or production media onto this machine. Those belong to the
authority server and are backed up separately on TNAS.

## 3. Start And Verify

```bash
cd ~/src/BinderLedger/apps/client
npm start
```

Use the QR code with Expo Go, or press `w` for the browser build. Before using a
new browser origin, add its exact `http://<DEV_LAN_IP>:<PORT>` value to
`CORS_ALLOWED_ORIGINS` in `/srv/binderledger/.env` on `adam-ubuntu`, then
recreate `binderledger_api`.

Before pushing:

```bash
npm run typecheck
npm run lint
npm run export:web
```

## 4. Production Boundary

- `adam-ubuntu` owns PostgreSQL, API, web, vision, media, scans, historical
  expansion, current-price snapshots, provider keys, backups, and deployment.
- The development machine owns Expo/React Native source editing and local Metro
  or web preview processes only.
- Never enable JustTCG, PkmnPrices, PriceCharting, valuation, or backup timers on
  the development machine.
- Never commit `.env`, `.env.local`, provider output, scans, or media.
- A push to `main` should deploy only through the BinderLedger production
  workflow after CI succeeds.

Using production for frontend reads is acceptable for the current private MVP.
Before account, catalog-editing, or destructive workflows are exercised during
development, add an isolated staging API/database and point `.env.local` there.

## Optional Backend Work

Backend development should be explicitly enabled only when needed. The private
TNAS snapshot under `Projects/BinderLedger/Backups/2026-08-24` contains the old
development database and ignored assets, with restore instructions and SHA-256
manifests. It must remain isolated from `/srv/binderledger` and from production
provider schedules.

## Other Codex Starting Point

Read `README.md`, this handoff, `docs/architecture.md`, and
`docs/provider-api-policy.md`. Treat `adam-ubuntu` as production infrastructure
and the other machine as a frontend client unless the user explicitly changes
that boundary.
