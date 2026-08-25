# Frontend Development Handoff

The normal development workstation runs only the Expo/React Native toolchain.
The trusted authority host owns the API, PostgreSQL, vision worker, provider
jobs, media, backups, and production deployment.

## 1. Prerequisites

Install Git, Node.js 24 LTS, and npm. Docker, Go, PostgreSQL, provider keys, and
collector output are not required for frontend-only development.

## 2. Clone and Configure

```bash
git clone git@github.com:AdamWentworth/BinderLedger.git
cd BinderLedger/apps/client
npm ci
```

Create the ignored `apps/client/.env.local`:

```dotenv
EXPO_PUBLIC_API_URL=http://<trusted-api-host>:4000
```

Do not copy production environment files, database dumps, provider caches,
credentials, scans, or downloaded media to the frontend workstation.

## 3. Start and Verify

```bash
cd apps/client
npx expo start --lan --port 8082
```

Open the installed BinderLedger Android development client and select the LAN
server, or scan Metro's development-client QR code. Press `w` for the browser
build. The native app uses `EXPO_PUBLIC_API_URL`; the web client uses Metro's
same-origin development proxy.

The development client is required for the native card-outline detector and
automatic capture because those features use custom camera and OpenCV modules
that Expo Go does not include. Build a replacement Android APK when native
dependencies change:

```bash
npx eas-cli@latest build --platform android --profile development
```

Before pushing:

```bash
npm test
npm run typecheck
npm run lint
npm audit --omit=dev --audit-level=high
npm run doctor
npm run export:web
```

## 4. Production Boundary

- The authority host owns all stateful services, provider schedules, media,
  backups, and deployment automation.
- The development workstation owns source editing and local Metro/web preview
  processes only.
- Never run provider collectors, valuation jobs, or backup timers from the
  frontend workstation.
- Never commit `.env`, `.env.local`, provider responses, scans, media, or
  deployment metadata.
- Pushes to `main` deploy only after GitHub CI succeeds and the authority host
  selects that exact verified commit.

Using a production API for read-oriented frontend work is acceptable for the
current trusted-network deployment. Use an isolated API and database before
testing schema changes, authentication, catalog editing, or destructive flows.

## Optional Backend Work

Backend work should be enabled explicitly and use an isolated local database.
Follow the optional full-stack setup in the root README; never restore a
development snapshot over production or enable production provider schedules.

## Handoff Reading Order

Read `README.md`, this file, `docs/architecture.md`, and
`docs/provider-api-policy.md`. Treat the configured API host as production
infrastructure unless the project owner explicitly changes that boundary.
