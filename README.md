# 📒 BinderLedger — Legacy Trading Card Collection & Market Tracker

[![CI](https://github.com/AdamWentworth/BinderLedger/actions/workflows/ci.yml/badge.svg)](https://github.com/AdamWentworth/BinderLedger/actions/workflows/ci.yml)

BinderLedger is a condition-aware catalog, collection, and market tracker for
legacy trading cards. Its initial scope is English Pokémon cards from the
Wizards of the Coast era through the EX era, delivered through one Expo app for
web, iOS, and Android.

The project combines exact-printing catalog data, condition-specific prices,
watchlists, historical market views, and assisted card recognition in a
resource-conscious self-hosted deployment.

> [!IMPORTANT]
> BinderLedger is an active source-available portfolio project. Its current API
> has no user authentication and is designed for a trusted private network, not
> public internet exposure.

---

## ✨ Highlights

- **Exact-printing catalog** — distinguish edition, finish, language, set, and
  market condition instead of collapsing cards by name.
- **Universal Expo client** — one responsive codebase for web, iOS, and
  Android, including native camera capture.
- **Condition-aware markets** — preserve NM, LP, MP, HP, and Damaged history,
  with precomputed movement snapshots plus stale and thin-data quality indicators.
- **Flexible watchlists** — follow individual printings or whole set editions
  at a selected condition.
- **Assisted recognition** — combine perspective correction, image features,
  and OCR to rank verified card candidates.
- **Quota-aware ingestion** — cache responses, resume interrupted collection,
  upsert idempotently, and stay inside configured provider budgets.
- **Small-server operations** — constrained Docker services, health checks,
  scheduled backups, and commit-addressed deployments.

---

## 🧰 Technology Stack

<!-- markdownlint-disable MD013 -->

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Client | Expo 57, React Native 0.86, React 19, TypeScript | Web, iOS, Android, camera capture, interaction state |
| Navigation and data | Expo Router, TanStack Query | Typed routes, API caching, loading and mutation state |
| API | Go 1.26, `net/http`, pgx | Catalog rules, market views, watchlists, scans, JSON contracts |
| Database | PostgreSQL 17 | Catalog, printings, observations, watchlists, scans |
| Vision | Python, OpenCV, Tesseract | Perspective correction, feature matching, OCR, candidate ranking |
| Collection | Node.js and Go workers | Provider collection, normalization, refresh jobs |
| Delivery | Docker Compose, GitHub Actions, systemd | Verification, local image builds, migrations, timers, backups |

<!-- markdownlint-enable MD013 -->

---

## 🏗️ Architecture

```text
 Web / iOS / Android
          │
          ▼
   Expo universal client
          │ JSON + image uploads
          ▼
       Go API ─────────────── private card and scan media
          │
          ▼
     PostgreSQL ◀──────────── vision worker
          ▲                   OpenCV + OCR
          │
   import and refresh workers
```

The client owns presentation and device capabilities. The Go API owns domain
rules and contracts. PostgreSQL is the source of truth. Background workers
operate behind those boundaries rather than writing client state.

See [the architecture notes](docs/architecture.md) for the full system shape.

---

## 📦 Repository Layout

```text
apps/client/                 Expo + React Native universal client
cmd/api/                     Go JSON API
cmd/migrate/                 Embedded PostgreSQL migration command
cmd/import-justtcg/          Idempotent catalog and history importer
cmd/refresh-justtcg/         Rotating current-price refresh worker
cmd/backfill-pkmnprices/     Controlled API fallback worker
internal/                    API, catalog, market, scan, and DB packages
services/vision/             OpenCV/Tesseract recognition worker
tools/justtcg-audit/         Discovery and historical collection tools
ops/prod/                    Compose, runner deployment, timers, and recovery
docs/                        Architecture, policy, and workflow notes
```

Credentials, raw provider responses, downloaded media, scans, caches, database
dumps, and production metadata are intentionally excluded from Git.

---

## 🚀 Frontend Development

Frontend work needs no local Docker stack. Run Metro locally and point it at an
API available on your trusted network.

### Prerequisites

- Git
- Node.js 24 LTS
- npm
- The BinderLedger Android development client on a phone connected to the same
  trusted network

### Install and Configure

```bash
git clone git@github.com:AdamWentworth/BinderLedger.git
cd BinderLedger/apps/client
npm ci
```

Create the ignored `apps/client/.env.local`:

```dotenv
EXPO_PUBLIC_API_URL=http://<trusted-api-host>:4000
```

### Run Web and the Native Development Client

```bash
npx expo start --lan --port 8082
```

One Metro process serves both targets:

- Press `w` or open `http://localhost:8082` for the web app.
- Open the installed BinderLedger development client and select the LAN server,
  or scan Metro's development-client QR code.
- Native builds call `EXPO_PUBLIC_API_URL` directly.
- Web requests remain same-origin and use the Metro development proxy.

The live card-outline detector uses custom native camera and OpenCV modules, so
it cannot run inside Expo Go. To create a replacement Android development APK:

```bash
npx eas-cli@latest build --platform android --profile development
```

> [!WARNING]
> When the configured API is production, watchlist mutations, scan uploads,
> and confirmations change production data. Use an isolated stack for backend,
> schema, authentication, or destructive workflow development.

See [the development handoff](docs/development-handoff.md) for the complete
machine boundary.

---

## 🧪 Verification

Run the complete repository check on Linux, macOS, or WSL:

```bash
make verify
```

The client also exposes a standalone all-in-one check:

```bash
cd apps/client
npx playwright install chromium # one-time browser setup
npm run verify
```

Client checks:

```bash
cd apps/client
npm test
npm run typecheck
npm run lint
npm audit --omit=dev --audit-level=high
npm run doctor
npm run export:web
npm run test:e2e
```

Backend and worker checks:

```bash
go test ./cmd/... ./internal/...
go vet ./cmd/... ./internal/...
test -z "$(gofmt -l cmd internal)"
go run golang.org/x/vuln/cmd/govulncheck@v1.7.0 ./...
npm test --prefix tools/justtcg-audit
```

GitHub Actions repeats these checks, builds every production image as a
deployment smoke test, scans it for high and critical vulnerabilities, and
publishes CycloneDX software bills of materials for the CI-approved image set.

---

## 🧱 Optional Isolated Full Stack

Backend work should use an isolated development database. Additional
requirements are Docker Compose, Go 1.26+, and PostgreSQL 17 client tools.

```bash
cp .env.example .env
docker compose up -d postgres
go run ./cmd/migrate
go run ./cmd/import-justtcg
docker compose up -d --build vision
go run ./cmd/api
```

| Service | Development endpoint |
| --- | --- |
| PostgreSQL | `127.0.0.1:55432` |
| Go API | `127.0.0.1:4001` |
| Expo / Metro | `8082` |
| Static web preview | `8083` |

---

## 🔌 API Surface

<!-- markdownlint-disable MD013 -->

| Area | Routes |
| --- | --- |
| Health | `GET /api/health` |
| Catalog | `GET /api/catalog/sets`, `GET /api/catalog/cards`, `GET /api/catalog/listings` |
| Set pricing | `GET /api/catalog/sets/{setID}/pricing` |
| Images | `GET /api/catalog/images/{filename}` |
| Market | `GET /api/market/overview`, `GET /api/market/variants/{variantID}/history` |
| Watchlists | overview, membership, card, and set routes under `/api/watchlists/{watchlistID}` |
| Scans | create, retrieve, and confirm routes under `/api/scans` |

<!-- markdownlint-enable MD013 -->

Market periods are `1d`, `1w`, `1m`, `1y`, and `all`. Prices preserve market
condition instead of blending observations across conditions.

---

## 📈 Catalog and Pricing Data

BinderLedger normalizes approved provider responses into stable set, card,
printing, variant, and daily observation records. Collectors use documented
APIs, persistent private caches, bounded retries, explicit request budgets, and
exact provider identifiers.

The repository contains integration code and schemas, but not raw provider
payloads, private valuation ladders, downloaded card imagery, or credentials.
Review [the provider API policy](docs/provider-api-policy.md) before adding a
source, increasing a schedule, or changing distribution plans.

---

## 📷 Recognition Workflow

1. The client uploads a required front image and optional back image.
2. The API stores private originals and records dimensions and checksums.
3. The vision worker corrects perspective and combines features with OCR.
4. Up to three verified exact-printing candidates are returned.
5. The user confirms or rejects the result.

Condition grading remains a suggestion boundary until a trustworthy labeled
photograph set exists. See [the recognition pipeline](docs/card-recognition-pipeline.md).

---

## 🌐 Production and CI/CD

Production is a private-network Docker Compose deployment with a deliberately
small trust surface:

1. Pushes to `main` run GitHub-hosted CI.
2. CI builds and security-scans four immutable, private GHCR images.
3. A dedicated production runner pulls the exact successful commit images.
4. The runner validates Compose, runs migrations, and recreates services.
5. API, web, vision, and container smoke checks must pass before the deployment
   is recorded.

The production host compiles no application images. GHCR packages are private
deployment artifacts rather than source repositories, and the deployment
workflow has read-only source and package permissions. Operational details are
in the [production runbook](ops/prod/README.md).

---

## 🔐 Security and Data Boundaries

- Secrets live only in ignored machine-local environment files.
- PostgreSQL and the vision worker publish no network ports.
- Production data, media, scans, caches, and backups remain outside Git.
- Deployments never overwrite server-local secrets or persistent storage.
- The current unauthenticated API must remain on a trusted private network.
- Recognition results require human confirmation.
- Provider content is not redistributed as a raw dataset or substitute API.
- Media rights and provider plans must be reviewed before wider distribution.

Report security issues privately through the process in [SECURITY.md](SECURITY.md).

---

## 📚 Documentation

| Document | Purpose |
| --- | --- |
| [Architecture](docs/architecture.md) | Components, ownership, ingestion, and deployment posture |
| [Development handoff](docs/development-handoff.md) | Frontend-only workstation setup and production boundary |
| [Provider API policy](docs/provider-api-policy.md) | Collection, quota, caching, and distribution rules |
| [Recognition pipeline](docs/card-recognition-pipeline.md) | Scan processing and candidate verification |
| [Production runbook](ops/prod/README.md) | Deployment, timers, runtime limits, and backups |
| [Disaster recovery](ops/prod/disaster-recovery.md) | Replacement-host restoration procedure |
| [Security policy](SECURITY.md) | Private reporting and supported deployment boundary |

---

## 🧭 Roadmap

- Complete the approved pre-Diamond-and-Pearl catalog expansion.
- Add accounts, ownership, named lists, and personal collection imports.
- Introduce isolated staging before destructive or multi-user workflows.
- Expand recognition evaluation with trustworthy real-device photographs.
- Resolve provider-plan and image-rights requirements before wider release.
- Continue accessibility, responsive-layout, and device-camera refinement.

---

## ⚠️ Status and Disclaimer

BinderLedger is a personal, non-commercial project under active development.
It is not affiliated with, endorsed by, or sponsored by Nintendo, Creatures,
GAME FREAK, The Pokémon Company, or any data provider. Pokémon and related marks
belong to their respective owners.

The source is publicly visible but remains source-available under the terms in
[LICENSE](LICENSE). Repository visibility does not grant redistribution,
hosting, or reuse rights.
