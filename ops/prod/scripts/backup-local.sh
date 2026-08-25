#!/usr/bin/env bash
set -euo pipefail

deploy_root=${BINDERLEDGER_DEPLOY_ROOT:-/srv/binderledger}
storage_root=${BINDERLEDGER_STORAGE_ROOT:-/mnt/storage/binderledger}
backup_dir=${storage_root}/backups/daily
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary=${backup_dir}/binderledger-${timestamp}.dump.partial
destination=${backup_dir}/binderledger-${timestamp}.dump

mkdir -p "${backup_dir}"
database=$(sed -n 's/^POSTGRES_DB=//p' "${deploy_root}/.env" | tail -1)
user=$(sed -n 's/^POSTGRES_USER=//p' "${deploy_root}/.env" | tail -1)
if [[ -z "${database}" || -z "${user}" ]]; then
  echo "POSTGRES_DB and POSTGRES_USER are required in ${deploy_root}/.env" >&2
  exit 1
fi

compose() {
  docker compose \
    --project-directory "${deploy_root}" \
    -f "${deploy_root}/docker-compose.yml" \
    --env-file "${deploy_root}/.env" \
    --env-file "${deploy_root}/images.env" \
    "$@"
}

umask 077
compose exec -T db pg_dump --format=custom --compress=6 -U "${user}" "${database}" >"${temporary}"
mv "${temporary}" "${destination}"
(
  cd "${backup_dir}"
  sha256sum "$(basename "${destination}")" >"$(basename "${destination}").sha256"
)

find "${backup_dir}" -maxdepth 1 -type f -name 'binderledger-*.dump' -mtime +14 -delete
find "${backup_dir}" -maxdepth 1 -type f -name 'binderledger-*.dump.sha256' -mtime +14 -delete

echo "Created ${destination}"
