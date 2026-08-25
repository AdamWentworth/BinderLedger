# BinderLedger Production

The production deployment is intentionally separate from the development
checkout:

- `/srv/binderledger/src/BinderLedger` is the editable development repository.
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
```

## Price Collection

Production owns the recurring JustTCG current-price refresh. The job runs once
per day, requests cards in Free-tier batches of 20, and rotates the least
recently refreshed cards first. Its default 15-request budget updates as many as
300 cards per day, covering the current catalog about every three days while
leaving quota for catalog bootstrap and manual diagnostics. Each successful
price is stored as a dated observation, even when it has not changed.

Install the production user timer on the server with:

```bash
install -Dm644 ops/prod/systemd/binderledger-justtcg-refresh.service \
  ~/.config/systemd/user/binderledger-justtcg-refresh.service
install -Dm644 ops/prod/systemd/binderledger-justtcg-refresh.timer \
  ~/.config/systemd/user/binderledger-justtcg-refresh.timer
systemctl --user daemon-reload
systemctl --user enable --now binderledger-justtcg-refresh.timer
```

The timer runs after 00:15 UTC with a randomized delay. Provider metadata can
stop a run before either the five-request daily reserve or the 100-request
monthly reserve. PkmnPrices is not a catalog-wide scheduled source on its Free
plan; keep it for explicitly selected fallback records.

## Deployment

`ci.yml` tests Go, Expo, and the deployed vision environment, then publishes
three SHA-tagged GHCR images. `deploy-prod.yml` runs only after successful main
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
