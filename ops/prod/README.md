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
docker compose --env-file .env --env-file images.env --profile tools run --rm sync-card-images -set-id <catalog-set-id>
docker compose --env-file .env --env-file images.env --profile tools run --rm expand-justtcg-history
```

`refresh-justtcg` updates catalog price quality and atomically rebuilds the
precomputed market snapshots after saving its provider batch. No separate
market cache service or schedule is required.

`sync-card-images` only accepts HTTPS images from its approved provider host,
validates the file type and card-like dimensions, writes files atomically, and
records the provider URL and SHA-256 in the private catalog. Run it with
`-dry-run` first when adding a new set. Restart the vision worker afterward so
it reloads the expanded reference library.

## Runner Deployment

GitHub-hosted CI tests Go, Expo, collectors, and vision, then builds each
production image, scans it for high and critical vulnerabilities, and publishes
private commit-addressed images to GHCR.

A dedicated repository runner handles only production deployment after a
successful `main` CI run:

1. Checks out the exact successful commit.
2. Pulls its four `sha-<commit>` images from private GHCR packages.
3. Validates the production Compose configuration.
4. Starts PostgreSQL and applies embedded migrations.
5. Recreates API, vision, and web services.
6. Verifies the API commit, catalog, web route, worker readiness, and container
   state before writing `deployments/current.json`.

The low-resource production host does not compile application images. The
runner connects outbound to GitHub, receives read-only source and package
permissions, and never runs pull-request jobs. GHCR packages contain private
runtime artifacts; they are not additional source repositories.

Runner requirements:

- Register it at repository scope with the `prod` and `binderledger` labels.
- Treat its operating-system account as production-admin because Docker control
  is effectively host-admin access.
- Never target the runner from a `pull_request` or `pull_request_target` job.
- Do not commit registration tokens, package tokens, or runner credentials.
- Keep the runner service current and remove its GitHub registration before
  retiring or repurposing the host.

Useful checks:

```bash
docker compose --project-directory /srv/binderledger \
  -f /srv/binderledger/docker-compose.yml \
  --env-file /srv/binderledger/.env \
  --env-file /srv/binderledger/images.env ps
```

## Scheduled Collection

Production owns recurring provider jobs. Collector caches and progress remain
under the configured persistent storage root, allowing quota-safe resume after
restarts. Budgets and reserves live in the private production environment and
must follow [the provider policy](../../docs/provider-api-policy.md).

## Backups

`binderledger-backup-local.timer` creates a daily PostgreSQL dump. The optional
NAS timer mirrors database dumps, media, collector state, deployment metadata,
and the private production environment. Once a month,
`binderledger-backup-restore-verify.timer` validates the latest checksum,
restores the dump into a temporary database, checks required schema and catalog
data, and removes the temporary database. The drill refuses to run unless the
storage volume has enough free space for the restore plus a 512 MiB reserve.

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
