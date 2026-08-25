# Development Machine Handoff

This guide moves BinderLedger development off `adam-ubuntu` while leaving the
production deployment and database on that server unchanged.

The snapshot described below was created from commit
`e5ce6fd1eab51f11620f72dc5f08b3b28bbb6654` on 2026-08-24. All snapshot and
credential files have SHA-256 manifests on the private TNAS vault.

## 1. Prerequisites

Install Git, Docker Engine with the Compose plugin, Go 1.26 or newer, Node 24
LTS, npm, and `rsync`. Configure GitHub SSH access for `AdamWentworth`.

Mount the `vault` share from `NAS_HOST.local`. In the commands below, replace
`/path/to/vault` with that mount point:

```bash
export TNAS_VAULT=/path/to/vault
export BACKUP="$TNAS_VAULT/Projects/BinderLedger/Backups/2026-08-24"
export SECRETS="$TNAS_VAULT/Secrets/BinderLedger/Dev Handoff 2026-08-24"
```

## 2. Clone And Restore Files

The committed user services expect the repository at `~/src/BinderLedger`.

```bash
mkdir -p ~/src
git clone git@github.com:AdamWentworth/BinderLedger.git ~/src/BinderLedger
cd ~/src/BinderLedger

mkdir -p data tools/justtcg-audit/output apps/client
rsync -rt "$BACKUP/data/" data/
rsync -rt "$BACKUP/collector-output/" tools/justtcg-audit/output/
cp "$SECRETS/repository/.env" .env
cp "$SECRETS/repository/apps/client/.env.local" apps/client/.env.local
```

Verify every restored file before continuing:

```bash
(cd data && sha256sum -c "$BACKUP/MANIFEST.sha256")
(cd tools/justtcg-audit/output && sha256sum -c "$BACKUP/COLLECTOR_MANIFEST.sha256")
sha256sum -c "$SECRETS/SECRETS_MANIFEST.sha256"
(cd "$BACKUP/database" && sha256sum -c binderledger-dev-e5ce6fd.sha256)
```

The ignored directories and credentials must remain untracked. Confirm that
`git status --short` is empty.

## 3. Set The New Network Address

Choose the new development machine's stable LAN address.

Update `.env`:

- `HTTP_ADDR=<NEW_LAN_IP>:4001`
- `CORS_ALLOWED_ORIGINS` must include localhost and the new LAN address on
  ports `8082` and `8083`.

Update `apps/client/.env.local`:

- `EXPO_PUBLIC_API_URL=http://<NEW_LAN_IP>:4001`

Create the machine-local service environment:

```bash
mkdir -p ~/.config/binderledger
cp deploy/systemd/user/binderledger-server.env.example ~/.config/binderledger/server.env
```

Replace every example address in `~/.config/binderledger/server.env` with the
new LAN address. Keep `BINDERLEDGER_BIND_HOST` on that trusted LAN address so
Expo Go can connect without exposing development services on every interface.

## 4. Install Dependencies

```bash
go mod download
(cd apps/client && npm ci)
(cd tools/justtcg-audit && npm ci)
```

## 5. Restore The Development Database

Start only the isolated development PostgreSQL container:

```bash
docker compose up -d --wait postgres
docker compose ps
```

Restore the custom-format PostgreSQL 17 snapshot:

```bash
POSTGRES_CONTAINER=$(docker compose ps -q postgres)
docker cp "$BACKUP/database/binderledger-dev-e5ce6fd.dump" \
  "$POSTGRES_CONTAINER:/tmp/binderledger-dev.dump"
docker compose exec -T postgres pg_restore \
  --clean --if-exists --no-owner --no-privileges \
  -U binder_ledger_dev -d binder_ledger_dev \
  /tmp/binderledger-dev.dump
docker compose exec -T postgres rm /tmp/binderledger-dev.dump
go run ./cmd/migrate
```

The restore may print harmless notices while dropping objects from the empty
database. It must finish with exit code zero.

## 6. Start And Verify Development

```bash
make dev-up
make dev-status
curl --fail http://localhost:4001/api/health
curl --fail 'http://localhost:4001/api/catalog/listings?limit=1'
go test ./cmd/... ./internal/...
(cd apps/client && npm run typecheck && npm run lint)
```

Open the web preview at `http://localhost:8083`. Expo Go should connect to
`exp://<NEW_LAN_IP>:8082` from a phone on the same trusted network.

## 7. Boundaries

- Do not copy or modify `/srv/binderledger`; it is the independent production
  deployment on `adam-ubuntu`.
- Do not reuse the production PostgreSQL database for development.
- Never commit `.env`, `.env.local`, `data/`, or collector output.
- Provider collection remains quota-aware. Read `docs/provider-api-policy.md`
  before running collection or backfill jobs.
- `adam-ubuntu` owns the enabled production JustTCG daily refresh timer. Do not
  enable another recurring JustTCG or PkmnPrices job on the development machine;
  manual provider work must leave room for the production collector's quota.
- Once this new development runtime is verified, shut down the old one on
  `adam-ubuntu` with `make dev-down`. Production remains available at
  `http://PRODUCTION_HOST:8081`.

## Other Codex Starting Point

Read `README.md`, this handoff, `docs/architecture.md`, and
`docs/provider-api-policy.md`. Then verify the restored catalog and image
counts before changing code. Preserve the development/production database
separation and treat the server deployment as production infrastructure.
