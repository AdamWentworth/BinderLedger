# Production Recovery

The private backup target must contain everything that is not reproducible from
Git:

- checksummed PostgreSQL dumps;
- curated card images;
- private scan originals;
- collector output, progress, and response caches;
- deployment metadata and Compose configuration;
- production and backup environment files.

Keep credential backups in a location with stricter access than ordinary media
and deployment metadata.

## Restore a Replacement Authority Host

1. Install Docker Engine, the Compose plugin, Git, `curl`, `python3`, `rsync`,
   and `gio` when GVFS mounting is used.
2. Mount the persistent storage volume and private backup target.
3. Clone BinderLedger and create the configured deployment root.
4. Restore the production environment as `<deploy-root>/.env` and the optional
   NAS configuration as `<deploy-root>/backup.env`. Review bind addresses, CORS
   origins, provider budgets, and storage paths.
5. Restore card images, scan images, and collector state under the configured
   storage root.
6. Copy `ops/prod/docker-compose.yml` into the deployment root and prepare an
   `images.env` that selects locally available recovery images.
7. Start PostgreSQL, verify the dump checksum, and restore it:

```bash
cd /srv/binderledger
docker compose --env-file .env --env-file images.env up -d --wait db
docker compose --env-file .env --env-file images.env exec -T db \
  pg_restore --clean --if-exists --no-owner --no-privileges \
  -U binderledger -d binderledger < /path/to/latest.dump
docker compose --env-file .env --env-file images.env --profile tools run --rm migrate
```

8. Start API, vision, and web; verify `/api/health`, a catalog request, the web
   scan route, worker readiness, and container state.
9. Run `bash ops/prod/scripts/install-user-services.sh`, confirm user lingering
   is enabled, and verify the provider and backup timers.
10. Reconnect the dedicated repository runner, then dispatch `deploy-prod` for
    a CI-verified `main` commit. It will pull the corresponding private GHCR
    images and return the host to the normal deployment path.

Only clear collector completion markers when the restored output is newer than
the database dump. Imports are idempotent, but unnecessary replay wastes time
and complicates recovery verification.
