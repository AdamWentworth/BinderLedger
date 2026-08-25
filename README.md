# BinderLedger

BinderLedger is a condition-aware collection and market tracker for legacy trading cards. The initial product covers English Pokemon cards from the Wizards of the Coast era through the EX era, with a universal Expo client, a Go API, and PostgreSQL.

## Repository

```text
apps/client/          Expo + React Native client (web, iOS, Android)
cmd/api/              Go JSON API
cmd/migrate/          PostgreSQL migration command
cmd/backfill-pricecharting-images/  Printing-specific image collector
docs/                 Architecture and decisions
services/vision/      OpenCV/Tesseract recognition worker
ops/prod/             Resource-bounded production deployment
tools/justtcg-audit/  Preserved JustTCG research collector
```

## Local setup

Requirements: Go 1.26+, Node 24 LTS, npm, Docker Compose, and PostgreSQL 17.

```bash
cp .env.example .env
docker compose up -d postgres
go run ./cmd/migrate
go run ./cmd/import-justtcg
go run ./cmd/api
```

In another terminal:

```bash
cd apps/client
npm install
npm run web
```

Development uses its own Compose project, PostgreSQL volume, and ports. The
database listens only on `127.0.0.1:55432`, the API uses `4001`, Expo Go uses
`8082`, and the static development web preview uses `8083`. These are
separate from every production app stack on the server.

Start or stop the complete development runtime without affecting production:

```bash
make dev-up
make dev-status
make dev-down
```

The development database persists in the dedicated
`binderledger_dev_postgres` Docker volume when the runtime is stopped. While
the runtime is up, the exported browser app is available at
`http://localhost:8083` or `http://PRODUCTION_HOST:8083`, and the phone-only Metro
server is available to Expo Go at `exp://PRODUCTION_HOST:8082`. Loopback proxies
provide localhost access without exposing the development services on every
network interface. Keeping web out of Metro prevents the two bundles from
exhausting memory on this server. Run `make client-export` and refresh the
browser after changing client code.

For Expo Go on the same trusted Wi-Fi network, bind the API to this computer's
LAN address, place the same URL in `apps/client/.env.local`, and run:

```bash
make client-phone
```

The phone workflow currently uses Expo SDK 54 because that is the version in
the public-store Expo Go client during the SDK 57 transition. `make
client-phone` targets the isolated development API. `make client-phone-prod`
uses the production API for an explicit integration test.

`go run ./cmd/import-justtcg` is idempotent. It imports every collected set JSON file under `tools/justtcg-audit/output/collections` into normalized catalog, variant, and daily price tables. Rerun it after a collector pass to update the database.

The current API surface includes:

- `GET /api/catalog/sets`
- `GET /api/catalog/cards`
- `GET /api/market/overview?period=1m&condition=Near%20Mint`
- `GET /api/market/variants/{variantID}/history?period=1m`
- `GET /api/watchlists/default?period=1m&condition=Near%20Mint`
- `GET /api/watchlists/default/items`
- `POST /api/watchlists/default/cards`
- `DELETE /api/watchlists/default/cards/{itemID}`
- `POST /api/watchlists/default/sets`
- `DELETE /api/watchlists/default/sets/{itemID}`
- `POST /api/scans`
- `GET /api/scans/{scanID}`
- `POST /api/scans/{scanID}/confirmation`

Market periods are `1d`, `1w`, `1m`, `1y`, and `all`. Market rankings keep NM, LP, MP, HP, and Damaged variants separate, exclude price series more than seven days behind the latest market observation, and label thin or unusually volatile histories.

The MVP uses one database-backed local watchlist. Card entries identify an exact
printing while inheriting the selected market condition; set entries identify a
set and edition. The tables and routes are ready to receive ownership and named
lists when accounts are introduced.

The scanner MVP accepts a required front and optional back JPEG or PNG in a
size-limited multipart request. It stores private originals under
`data/scan-images` and records dimensions and checksums in PostgreSQL. The
resource-limited vision worker corrects perspective, combines OpenCV features,
targeted printing regions, and Tesseract OCR, and returns up to three verified
exact-printing candidates. The user must confirm or reject those candidates.
Condition suggestions remain pending until a trustworthy labeled photograph set
exists.

On this 8 GB server, stop Metro when phone development is finished. The static
development preview can also be rebuilt and run directly with:

```bash
make client-preview
```

Use `make client` on a development laptop when web hot reloading is useful. The
combined web and Android Metro workload exceeded Node's heap on this machine;
the static preview uses a small fraction of that memory.

Production runs independently from this checkout. Compose configuration and
deployment metadata live under `/srv/binderledger`; PostgreSQL, curated card
images, and private scans live under `/mnt/storage/binderledger`. The private-LAN
web client is `http://PRODUCTION_HOST:8081`, and the API is
`http://PRODUCTION_HOST:4000`. See [ops/prod/README.md](ops/prod/README.md) for
resource limits, deployment commands, and the GitHub runner handoff.

Real provider keys belong only in the ignored root `.env`. The JustTCG collector reads that file through `tools/justtcg-audit/.env`, which is a local symlink. PkmnPrices uses `PKMNPRICES_API_KEY` for historical backfills and as a fallback when JustTCG omits a card.

Printing-specific card images live in the ignored `data/card-images` directory. `make pricecharting-images-status` reports coverage, and `make pricecharting-images-gallery` rebuilds the local visual-review pages. Back up the image directory separately from Git.

See [docs/architecture.md](docs/architecture.md) for the system boundaries and deployment posture. The future personal-catalog import boundary is recorded in [docs/personal-catalog-inventory.md](docs/personal-catalog-inventory.md). Printing-specific image discovery and verification are documented in [docs/image-curation.md](docs/image-curation.md), with unresolved replacements tracked in [docs/image-upgrade-list.md](docs/image-upgrade-list.md).
Provider quotas, retry rules, and data-use boundaries are recorded in [docs/provider-api-policy.md](docs/provider-api-policy.md). Review that policy before adding a collector or changing its schedule.

Graded PriceCharting snapshots are retained as append-only observations. The
manual review and recording workflow is documented in
[docs/graded-price-monitoring.md](docs/graded-price-monitoring.md).
