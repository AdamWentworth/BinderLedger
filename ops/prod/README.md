# BinderLedger Production

The production deployment is intentionally separate from the development
checkout:

- `/home/adam/src/BinderLedger` is the editable development repository.
- `/srv/binderledger` contains Compose configuration, deployment metadata, and
  server-local environment files.
- `/mnt/storage/binderledger` contains PostgreSQL data, curated card images,
  private scan originals, and backups.

## Runtime

| Container | Limit | Purpose |
| --- | ---: | --- |
| `binderledger_db` | 0.5 CPU / 512 MB | Private PostgreSQL database |
| `binderledger_api` | 0.5 CPU / 256 MB | Go API and scan uploads |
| `binderledger_vision` | 1 CPU / 768 MB | One-at-a-time OpenCV/Tesseract matching |
| `binderledger_web` | 0.25 CPU / 96 MB | Static Expo web export and API proxy |

The database and vision worker publish no ports. The API and web client bind to
the configured private LAN address only.

## Server Commands

```bash
cd /srv/binderledger
docker compose --env-file .env --env-file images.env ps
docker compose --env-file .env --env-file images.env logs -f vision
docker compose --env-file .env --env-file images.env run --rm migrate
docker compose --env-file .env --env-file images.env --profile tools run --rm refresh-justtcg
docker compose --env-file .env --env-file images.env --profile tools run --rm expand-justtcg-history
```

## Price Collection

Production owns both recurring JustTCG workflows. While the catalog is
incomplete, the current-price job is a zero-request no-op and the historical
collector receives all 28 sustainable requests/day. It collects one year of
history while expanding toward the 38 approved pre-Diamond-and-Pearl sets. Its
persistent output and response cache live under
`/mnt/storage/binderledger/justtcg-collector`, allowing quota-safe resume after
restarts.

After expansion completes, the historical collector becomes a no-op and the
current-price job automatically receives all 28 requests/day. It rotates the
least recently refreshed cards in batches of 20, requests 30 days of history,
and upserts every returned daily point. Both jobs stop with five daily and 100
monthly provider requests in reserve. PkmnPrices is not a catalog-wide
scheduled source on its Free plan.

Install or update every production timer, backup job, and localhost proxy with:

```bash
bash ops/prod/scripts/install-user-services.sh
```

Current prices run after 00:15 UTC; historical expansion runs after 01:00 UTC.
The server also creates a daily PostgreSQL dump and mirrors dumps, media,
collector state, deployment metadata, and production secrets to the private
TNAS vault.

## Deployment

`ci.yml` tests Go, Expo, collectors, and vision, then publishes four SHA-tagged
GHCR images. `deploy-prod.yml` runs only after successful main
branch CI or a manual dispatch. The self-hosted runner copies the production
Compose file into `/srv/binderledger`, pulls the exact SHA images, runs database
migrations, recreates API/vision/web, and performs health and resource checks.

The BinderLedger GitHub repository needs its own repo-scoped self-hosted runner
with labels `linux`, `x64`, `prod`, and `binderledger`. Existing runners scoped
to other repositories cannot execute this workflow.

## Data Safety

- Deployments never overwrite `/srv/binderledger/.env` or persistent data.
- Card and scan directories are mounted read-only in the vision worker.
- The API and vision worker share UID/GID `10001` for private scan access.
- Back up `/mnt/storage/binderledger` independently from Git source.
- Review reference-image rights before public distribution.

See [`disaster-recovery.md`](disaster-recovery.md) for replacement-host restore
steps and the authoritative TNAS paths.
