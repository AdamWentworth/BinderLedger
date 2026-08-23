# BinderLedger

BinderLedger is a condition-aware collection and market tracker for legacy trading cards. The initial product covers English Pokemon cards from the Wizards of the Coast era through the EX era, with a universal Expo client, a Go API, and PostgreSQL.

## Repository

```text
apps/client/          Expo + React Native client (web, iOS, Android)
cmd/api/              Go JSON API
cmd/migrate/          PostgreSQL migration command
docs/                 Architecture and decisions
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

The API listens on `http://127.0.0.1:4000` and Expo web on `http://localhost:8081` by default. For a physical phone, set `EXPO_PUBLIC_API_URL` to this computer's LAN address.

`go run ./cmd/import-justtcg` is idempotent. It imports every collected set JSON file under `tools/justtcg-audit/output/collections` into normalized catalog, variant, and daily price tables. Rerun it after a collector pass to update the database.

The current API surface includes:

- `GET /api/catalog/sets`
- `GET /api/catalog/cards`
- `GET /api/market/overview?period=1m&condition=Near%20Mint`
- `GET /api/market/variants/{variantID}/history?period=1m`

Market periods are `1d`, `1w`, `1m`, `1y`, and `all`. Market rankings keep NM, LP, MP, HP, and Damaged variants separate, exclude price series more than seven days behind the latest market observation, and label thin or unusually volatile histories.

On this 8 GB server, prefer the static web preview so Metro does not remain resident:

```bash
make client-preview
```

Use `make client` on a development laptop when hot reloading is useful. A first Metro build briefly used about 1.4 GB here; the static preview used about 77 MB.

The real JustTCG key belongs only in the ignored root `.env`. The collector reads it through `tools/justtcg-audit/.env`, which is a local symlink to that file.

See [docs/architecture.md](docs/architecture.md) for the system boundaries and deployment posture. The future personal-catalog import boundary is recorded in [docs/personal-catalog-inventory.md](docs/personal-catalog-inventory.md).
