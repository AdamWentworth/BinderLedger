# BinderLedger Production Runbook

Production separates reproducible deployment state from persistent data:

- `/srv/binderledger` contains Compose configuration, a read-only deployment
  checkout, private environment files, and deployment metadata.
- `/mnt/storage/binderledger` contains PostgreSQL data, curated card images,
  private scan originals, collector state, and local backups.

The exact paths are configurable through the production environment.

## Runtime

| Container | Limit | Purpose |
| --- | ---: | --- |
| `binderledger_db` | 0.5 CPU / 512 MB | Private PostgreSQL database |
| `binderledger_api` | 0.5 CPU / 256 MB | Go API and scan uploads |
| `binderledger_vision` | 1 CPU / 768 MB | OpenCV/Tesseract matching worker |
| `binderledger_web` | 0.25 CPU / 96 MB | Static Expo web export and API proxy |

The database and vision worker publish no ports. API and web bindings must be
restricted to the trusted network in `/srv/binderledger/.env`.

## Server Commands

```bash
cd /srv/binderledger
docker compose --env-file .env --env-file images.env ps
docker compose --env-file .env --env-file images.env logs -f vision
docker compose --env-file .env --env-file images.env --profile tools run --rm migrate
docker compose --env-file .env --env-file images.env --profile tools run --rm refresh-justtcg
docker compose --env-file .env --env-file images.env --profile tools run --rm expand-justtcg-history
```

## Pull Deployment

GitHub-hosted CI tests Go, Expo, collectors, and vision, then builds each
production image as a smoke test. CI does not publish runtime images.

`binderledger-deploy-pull.timer` checks GitHub's public workflow API every five
minutes. When a newer successful `main` run exists, the authority host:

1. Fetches the exact successful commit into `/srv/binderledger/source`.
2. Builds four commit-tagged Docker images locally.
3. Validates the production Compose configuration.
4. Starts PostgreSQL and applies embedded migrations.
5. Recreates API, vision, and web services.
6. Verifies the API commit, catalog, web route, worker readiness, and container
   state before writing `deployments/current.json`.

The poller uses no GitHub credential because the source repository and CI
status are public. It requires outbound HTTPS only; there is no inbound runner,
webhook, registry, or second deployment repository.

Useful checks:

```bash
systemctl --user status binderledger-deploy-pull.service
systemctl --user list-timers binderledger-deploy-pull.timer
journalctl --user -u binderledger-deploy-pull.service -n 200
```

Run an immediate check with:

```bash
systemctl --user start binderledger-deploy-pull.service
```

## Scheduled Collection

Production owns recurring provider jobs. Collector caches and progress remain
under the configured persistent storage root, allowing quota-safe resume after
restarts. Budgets and reserves live in the private production environment and
must follow [the provider policy](../../docs/provider-api-policy.md).

## Backups

`binderledger-backup-local.timer` creates a daily PostgreSQL dump. The optional
NAS timer mirrors database dumps, media, collector state, deployment metadata,
and the private production environment.

Keep NAS locations in `/srv/binderledger/backup.env`, mode `0600`:

```dotenv
BINDERLEDGER_NAS_BACKUP_DIR=/mounted/private/path/application
BINDERLEDGER_NAS_SECRETS_DIR=/mounted/private/path/secrets
BINDERLEDGER_NAS_SHARE_URL=smb://private-host/private-share
```

The installer can migrate an existing mounted GVFS share into this private
file. It preserves an already installed backup script if discovery is not
possible, so a deployment cannot silently replace working backup configuration.

Install or update production scripts and timers with:

```bash
bash ops/prod/scripts/install-user-services.sh
```

## Data Safety

- Deployments never overwrite `.env`, `backup.env`, or persistent storage.
- The vision worker mounts card and scan directories read-only.
- API and vision use a shared private UID/GID for scan access.
- Back up persistent storage independently from Git source.
- Review provider-plan and media-rights requirements before wider distribution.

See [disaster recovery](disaster-recovery.md) for replacement-host restoration.
