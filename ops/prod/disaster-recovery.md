# Production Recovery

The TNAS production mirror contains everything not reproducible from Git and
GHCR:

- `Projects/BinderLedger/Production/database`: checksummed PostgreSQL dumps
- `Projects/BinderLedger/Production/card-images`: curated reference images
- `Projects/BinderLedger/Production/scan-images`: private scan originals
- `Projects/BinderLedger/Production/justtcg-collector`: history output and
  quota-saving response cache
- `Projects/BinderLedger/Production/deployment`: last deployed Compose and image
  metadata
- `Secrets/BinderLedger/Production/binderledger-production.env`: production
  database and provider credentials

## Restore A Replacement Authority Host

1. Install Docker Engine, the Compose plugin, Git, `rsync`, and `gio`. Mount the
   storage disk at `/mnt/storage` and the TNAS `vault` share.
2. Clone BinderLedger at `~/src/BinderLedger` and create `/srv/binderledger`.
3. Restore the production environment as `/srv/binderledger/.env`. Review the
   bind address and CORS origins for the replacement host.
4. Restore `card-images`, `scan-images`, and `justtcg-collector` under
   `/mnt/storage/binderledger`.
5. Copy `ops/prod/docker-compose.yml` to `/srv/binderledger/docker-compose.yml`
   and restore the latest `images.env`.
6. Start PostgreSQL, verify the dump checksum from inside its NAS directory,
   then restore it:

```bash
cd /srv/binderledger
docker compose --env-file .env --env-file images.env up -d --wait db
docker compose --env-file .env --env-file images.env exec -T db \
  pg_restore --clean --if-exists --no-owner --no-privileges \
  -U binderledger -d binderledger < /path/to/latest.dump
docker compose --env-file .env --env-file images.env --profile tools run --rm migrate
```

7. Apply UID/GID permissions using the deployment workflow's preparation step,
   start `api`, `vision`, and `web`, and run the health checks from
   `deploy-prod.yml`.
8. Run `bash ops/prod/scripts/install-user-services.sh`, confirm user lingering
   is enabled, and verify all four timers with `systemctl --user list-timers`.
9. Register a repo-scoped BinderLedger GitHub Actions runner with labels
   `linux`, `x64`, `prod`, and `binderledger`.

Delete `justtcg-collector/output/.production-imported-through` only when
restoring collector output into a database dump that predates it; the next
historical run will then re-import completed collection files idempotently.
