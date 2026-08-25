# 📒 BinderLedger — Legacy Trading Card Collection & Market Tracker

[![CI](https://github.com/AdamWentworth/BinderLedger/actions/workflows/ci.yml/badge.svg)](https://github.com/AdamWentworth/BinderLedger/actions/workflows/ci.yml)

BinderLedger is a condition-aware catalog, collection, and market tracker for
legacy trading cards. Its first product scope is English Pokémon cards from the
Wizards of the Coast era through the EX era, delivered through one Expo app for
web, iOS, and Android.

The project combines exact-printing catalog data, condition-specific pricing,
watchlists, historical market views, and assisted card recognition in a
resource-conscious private deployment.

> [!IMPORTANT]
> BinderLedger is currently a private, personal MVP. It has no user accounts,
> is not intended for public internet exposure, and may operate directly on
> production data during frontend development.

---

## ✨ What BinderLedger Does

- **Tracks exact printings** across set, edition, finish, language, and market
  condition instead of collapsing cards by name.
- **Explores legacy catalogs** with search, set browsing, edition and finish
  filters, graded-price indicators, and multiple card densities.
- **Charts market history** for NM, LP, MP, HP, and Damaged variants while
  flagging stale, thin, or unusually volatile price series.
- **Builds watchlists** from exact card printings or entire set editions while
  inheriting the selected market condition.
- **Captures and identifies cards** from mobile camera photos or desktop image
  uploads using an OpenCV/Tesseract worker and verified catalog candidates.
- **Expands provider data safely** with persistent caches, resumable collectors,
  idempotent imports, and request budgets below provider limits.
- **Runs everywhere from one client** through Expo Router and React Native Web.

The active catalog expansion targets 38 approved English Pokémon sets released
before Diamond and Pearl.

---

## 🧰 Technology Stack

<!-- markdownlint-disable MD013 -->

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Client | Expo 57, React Native 0.86, React 19, TypeScript | Web, iOS, Android, camera capture, local interaction state |
| Navigation and data | Expo Router, TanStack Query | Typed routes, API caching, loading and mutation state |
| API | Go 1.26, `net/http`, pgx | Catalog rules, market views, watchlists, scans, stable JSON contracts |
| Database | PostgreSQL 17 | Catalog, exact printings, price observations, watchlists, scans |
| Vision | Python, OpenCV, Tesseract | Perspective correction, feature matching, OCR, ranked candidates |
| Collection | Node.js and Go workers | Quota-aware provider collection, normalization, refresh jobs |
| Delivery | Docker Compose, GHCR, GitHub Actions, systemd | Tested images, migrations, deployment, timers, backups |

<!-- markdownlint-enable MD013 -->

---

## 🏗️ Architecture

```text
                         ┌────────────────────┐
 Web / iOS / Android ───▶│ Expo client        │
                         └─────────┬──────────┘
                                   │ JSON + image uploads
                         ┌─────────▼──────────┐
                         │ Go API             │
                         └──────┬───────┬─────┘
                                │       │ private media
                     ┌──────────▼──┐    └──────────────┐
                     │ PostgreSQL  │                   │
                     └──────▲──────┘          card / scan images
                            │
              ┌─────────────┼─────────────────┐
              │             │                 │
       import / refresh  history jobs   vision worker
       JustTCG + fallbacks              OpenCV + OCR
```

The client owns presentation and device capabilities. The Go API owns domain
rules and contracts. PostgreSQL is the source of truth. Collectors and vision
workers operate behind those boundaries rather than writing client state.

See [the architecture notes](docs/architecture.md) for the full system shape.

---

## 📦 Repository Layout

```text
apps/client/                         Expo + React Native universal client
cmd/api/                             Go JSON API
cmd/migrate/                         Embedded PostgreSQL migration command
cmd/import-justtcg/                  Idempotent catalog and history importer
cmd/refresh-justtcg/                 Rotating current-price refresh worker
cmd/backfill-pkmnprices/             Controlled historical fallback worker
cmd/backfill-pricecharting-images/   Manual printing-image curation tool
internal/                            API, catalog, market, scan, and DB packages
services/vision/                     OpenCV/Tesseract recognition worker
tools/justtcg-audit/                 Discovery and historical collection tools
ops/prod/                            Production Compose, timers, and recovery
deploy/systemd/user/                 Legacy development-host user services
docs/                                Architecture, policy, and workflow notes
```

Downloaded media, scans, provider output, caches, dumps, and credentials are
intentionally ignored and backed up outside Git.

---

## 🚀 Frontend Development

The primary development machine runs only the Expo frontend. The authoritative
API, PostgreSQL database, vision worker, collectors, media, and backups remain
on the trusted production host.

### Prerequisites

- Git
- Node.js 24 LTS
- npm
- Expo Go on a phone connected to the same trusted network

### Install

```bash
git clone git@github.com:AdamWentworth/BinderLedger.git
cd BinderLedger/apps/client
npm ci
```

Create the ignored `apps/client/.env.local`:

```dotenv
EXPO_PUBLIC_API_URL=http://<API_LAN_IP>:4000
```

### Run Web and Expo Go

```bash
cd apps/client
npx expo start --lan --port 8082
```

One Metro process serves both targets:

- Press `w` or open `http://localhost:8082` for the web app.
- Scan the QR code with Expo Go for the native app.
- Native builds call `EXPO_PUBLIC_API_URL` directly.
- Web requests stay same-origin and pass through the development Metro proxy.

> [!WARNING]
> If `.env.local` points at production, watchlist changes, scan uploads, and
> confirmations affect production data. Add staging before developing accounts,
> catalog editing, or destructive workflows.

The complete machine boundary is documented in
[the frontend development handoff](docs/development-handoff.md).

---

## 🧪 Verification

Run the client checks before pushing frontend work:

```bash
cd apps/client
npm test
npm run typecheck
npm run lint
npm audit --omit=dev --audit-level=high
npm run doctor
npm run export:web
```

Backend and collector checks:

```bash
go test ./cmd/... ./internal/...
go vet ./cmd/... ./internal/...
go run golang.org/x/vuln/cmd/govulncheck@v1.7.0 ./...
npm test --prefix tools/justtcg-audit
```

The CI workflow also builds and tests the deployed vision environment before it
publishes production images.

---

## 🧱 Optional Isolated Full-Stack Development

Backend work should use an isolated development database—never the production
database directly.

Additional requirements: Docker Compose, Go 1.26+, and PostgreSQL 17 client
tools.

```bash
cp .env.example .env
docker compose up -d postgres
go run ./cmd/migrate
go run ./cmd/import-justtcg
docker compose up -d --build vision
go run ./cmd/api
```

Development defaults are intentionally separate from production:

| Service | Development endpoint |
| --- | --- |
| PostgreSQL | `127.0.0.1:55432` |
| Go API | `127.0.0.1:4001` |
| Expo / Metro | `8082` |
| Static web preview | `8083` |

The private TNAS handoff contains an older isolated development snapshot when
backend restoration is explicitly required. It must never be restored over
production.

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
| Watchlists | `GET /api/watchlists/{watchlistID}`, membership `GET`, card/set `POST` and `DELETE` routes |
| Scans | `POST /api/scans`, `GET /api/scans/{scanID}`, `POST /api/scans/{scanID}/confirmation` |

<!-- markdownlint-enable MD013 -->

Market periods are `1d`, `1w`, `1m`, `1y`, and `all`. Prices preserve market
condition instead of blending NM, LP, MP, HP, and Damaged observations.

---

## 📈 Catalog and Pricing Data

BinderLedger keeps durable raw provider responses and normalizes them into
stable set, card, printing, variant, and daily observation records.

- **JustTCG** is the primary catalog and condition-price history source.
- **PkmnPrices** and **PokemonPriceTracker** are controlled fallback sources.
- **PriceCharting** supports manually reviewed graded snapshots and private
  printing-image curation—not scheduled page collection.
- **Bulbagarden** is used only for manual discovery of reviewed replacement
  images.

Collection is resumable, quota-aware, and deliberately stays below provider
limits. Do not add a collector or increase its schedule without reviewing
[the provider API policy](docs/provider-api-policy.md).

---

## 📷 Recognition Workflow

1. The client uploads a required front image and optional back image.
2. The API stores private originals and records dimensions and checksums.
3. The vision worker corrects perspective and combines image features with OCR.
4. Up to three verified exact-printing candidates are returned.
5. The user confirms or rejects the result.

Condition grading remains a suggestion boundary until a trustworthy labeled
photograph set exists. Recognition details live in
[the card-recognition pipeline](docs/card-recognition-pipeline.md).

---

## 🌐 Production and CI/CD

Production is a private-LAN Docker Compose deployment. Pushes to `main` run CI;
a successful workflow publishes immutable SHA-tagged images and dispatches a
repo-scoped self-hosted runner that:

1. Selects the exact commit image tag.
2. Validates storage mounts and server-local environment files.
3. Pulls images from GHCR.
4. Runs database migrations.
5. Recreates API, vision, collector, and web services.
6. Performs API, web, container, and resource smoke checks.

### Published GHCR Packages

| Package | Purpose |
| --- | --- |
| `binderledger-core` | API, migrations, refresh, and administrative commands |
| `binderledger-web` | Static Expo web export served by nginx |
| `binderledger-vision` | OpenCV/Tesseract recognition worker |
| `binderledger-collector` | Quota-aware historical collection runtime |

These packages are deployment artifacts produced from this repository, not
independent libraries. Production authenticates to GHCR before pulling them.

Operational commands, limits, timers, backups, and restore procedures are in
[the production runbook](ops/prod/README.md) and
[disaster-recovery guide](ops/prod/disaster-recovery.md).

---

## 🔐 Security and Data Boundaries

- Provider keys live only in ignored server-local environment files.
- PostgreSQL and the vision worker are not published directly to the network.
- Development, production, media, scans, caches, and backups have separate
  ownership and storage boundaries.
- Deployments do not overwrite production secrets or persistent data.
- The current API is unauthenticated and binds only to the trusted private LAN;
  it must not be forwarded to the public internet.
- Card recognition results require human confirmation.
- Provider data must not be republished as a raw dataset or substitute API.
- Reference-image rights must be reviewed before any public distribution.

This repository is public source code, but the current deployment is not a
public hosted service.

---

## 📚 Project Documentation

| Document | Purpose |
| --- | --- |
| [Architecture](docs/architecture.md) | Components, ownership, ingestion, and deployment posture |
| [Development handoff](docs/development-handoff.md) | Frontend-only workstation setup and production boundary |
| [Provider API policy](docs/provider-api-policy.md) | Quotas, retries, terms, and collection rules |
| [Recognition pipeline](docs/card-recognition-pipeline.md) | Scan processing and candidate verification |
| [Image curation](docs/image-curation.md) | Printing-specific image sourcing and review |
| [Graded price monitoring](docs/graded-price-monitoring.md) | Manual valuation review workflow |
| [Personal catalog boundary](docs/personal-catalog-inventory.md) | Future import and ownership model |
| [Production runbook](ops/prod/README.md) | Deployment, timers, runtime limits, and backups |
| [Disaster recovery](ops/prod/disaster-recovery.md) | Replacement-host restoration procedure |
| [Security policy](SECURITY.md) | Private vulnerability reporting and supported deployment boundary |

---

## 🧭 Roadmap

- Continue the approved pre-Diamond-and-Pearl catalog expansion.
- Add accounts, ownership, named lists, and personal collection imports.
- Introduce isolated staging before destructive or multi-user workflows.
- Improve recognition evidence and train condition suggestions only from a
  trustworthy labeled photo set.
- Resolve image-rights and provider-plan requirements before wider release.
- Continue accessibility, responsive-layout, and device-camera refinement.

---

## ⚠️ Project Status and Disclaimer

BinderLedger is a personal, non-commercial project under active development.
It is not affiliated with, endorsed by, or sponsored by Nintendo, Creatures,
GAME FREAK, The Pokémon Company, or any pricing provider. Pokémon and related
marks belong to their respective owners.

The source is publicly visible but remains proprietary. See [LICENSE](LICENSE)
for the applicable terms; repository visibility does not grant redistribution,
hosting, or reuse rights.
