#!/usr/bin/env bash
set -Eeuo pipefail

deploy_root=${BINDERLEDGER_DEPLOY_ROOT:-/srv/binderledger}
storage_root=${BINDERLEDGER_STORAGE_ROOT:-/mnt/storage/binderledger}
backup_dir=${storage_root}/backups/daily
verification_database=binderledger_restore_verify

mkdir -p "${deploy_root}/deployments"
exec 9>"${deploy_root}/deployments/deploy.lock"
if ! flock -n 9; then
  echo "A BinderLedger deployment or restore drill is already running." >&2
  exit 1
fi

database=$(sed -n 's/^POSTGRES_DB=//p' "${deploy_root}/.env" | tail -1)
user=$(sed -n 's/^POSTGRES_USER=//p' "${deploy_root}/.env" | tail -1)
for identifier in "${database}" "${user}" "${verification_database}"; do
  if [[ ! "${identifier}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "PostgreSQL identifiers must contain only letters, digits, and underscores." >&2
    exit 1
  fi
done

shopt -s nullglob
dumps=("${backup_dir}"/binderledger-*.dump)
shopt -u nullglob
if [[ "${#dumps[@]}" -eq 0 ]]; then
  echo "No BinderLedger database backup exists in ${backup_dir}." >&2
  exit 1
fi
latest_dump=${dumps[-1]}
checksum_file=${latest_dump}.sha256
if [[ ! -f "${checksum_file}" ]]; then
  echo "Missing backup checksum: ${checksum_file}" >&2
  exit 1
fi
(
  cd "${backup_dir}"
  sha256sum --check "$(basename "${checksum_file}")"
)

compose() {
  docker compose \
    --project-directory "${deploy_root}" \
    -f "${deploy_root}/docker-compose.yml" \
    --env-file "${deploy_root}/.env" \
    --env-file "${deploy_root}/images.env" \
    "$@"
}

current_size=$(
  compose exec -T db psql -U "${user}" -d postgres -Atqc \
    "SELECT pg_database_size('${database}')"
)
available_size=$(df --output=avail -B1 "${storage_root}" | tail -1 | tr -d '[:space:]')
if [[ ! "${current_size}" =~ ^[0-9]+$ || ! "${available_size}" =~ ^[0-9]+$ ]]; then
  echo "Could not determine database size or available storage." >&2
  exit 1
fi
required_size=$((current_size + 536870912))
if (( available_size < required_size )); then
  echo "Restore drill needs ${required_size} free bytes; only ${available_size} are available." >&2
  exit 1
fi

cleanup() {
  compose exec -T db dropdb --if-exists -U "${user}" "${verification_database}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
compose exec -T db createdb -U "${user}" "${verification_database}"
compose exec -T db pg_restore \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  -U "${user}" \
  -d "${verification_database}" <"${latest_dump}"

verified=$(
  compose exec -T db psql -U "${user}" -d "${verification_database}" -Atqc \
    "SELECT
       to_regclass('public.catalog_sets') IS NOT NULL
       AND to_regclass('public.catalog_cards') IS NOT NULL
       AND to_regclass('public.price_observations') IS NOT NULL
       AND EXISTS (SELECT 1 FROM goose_db_version WHERE is_applied)
       AND EXISTS (SELECT 1 FROM watchlists WHERE is_default)
       AND EXISTS (SELECT 1 FROM catalog_sets)
       AND EXISTS (SELECT 1 FROM catalog_cards)"
)
if [[ "${verified}" != "t" ]]; then
  echo "The restored database failed schema or data sanity checks." >&2
  exit 1
fi

echo "Successfully restored and verified $(basename "${latest_dump}")."
