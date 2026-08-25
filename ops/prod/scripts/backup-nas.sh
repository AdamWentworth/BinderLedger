#!/usr/bin/env bash
set -euo pipefail

deploy_root=${BINDERLEDGER_DEPLOY_ROOT:-/srv/binderledger}
storage_root=${BINDERLEDGER_STORAGE_ROOT:-/mnt/storage/binderledger}
config_file=${BINDERLEDGER_BACKUP_CONFIG:-${deploy_root}/backup.env}

if [[ -f "${config_file}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${config_file}"
  set +a
fi

nas_root=${BINDERLEDGER_NAS_BACKUP_DIR:-}
nas_secrets=${BINDERLEDGER_NAS_SECRETS_DIR:-}
nas_share_url=${BINDERLEDGER_NAS_SHARE_URL:-}

configure_from_existing_mount() {
  local gvfs_root mount_root mount_name server share
  local -a candidates
  gvfs_root="/run/user/$(id -u)/gvfs"
  shopt -s nullglob
  candidates=("${gvfs_root}"/smb-share:*/Projects/BinderLedger/Production)
  shopt -u nullglob
  if [[ "${#candidates[@]}" -ne 1 ]]; then
    return 1
  fi

  nas_root=${candidates[0]}
  mount_root=${nas_root%/Projects/BinderLedger/Production}
  nas_secrets=${mount_root}/Secrets/BinderLedger/Production
  mount_name=$(basename "${mount_root}")
  server=${mount_name#*server=}
  server=${server%%,*}
  share=${mount_name##*share=}
  if [[ -z "${server}" || -z "${share}" || "${server}" == "${mount_name}" ]]; then
    return 1
  fi
  nas_share_url="smb://${server}/${share}"

  mkdir -p "$(dirname "${config_file}")"
  {
    printf 'BINDERLEDGER_NAS_BACKUP_DIR=%q\n' "${nas_root}"
    printf 'BINDERLEDGER_NAS_SECRETS_DIR=%q\n' "${nas_secrets}"
    printf 'BINDERLEDGER_NAS_SHARE_URL=%q\n' "${nas_share_url}"
  } >"${config_file}"
  chmod 0600 "${config_file}"
  echo "Saved private NAS locations to ${config_file}."
}

if [[ -z "${nas_root}" || -z "${nas_secrets}" ]]; then
  configure_from_existing_mount || true
fi
if [[ "${1:-}" == "--configure-only" ]]; then
  [[ -n "${nas_root}" && -n "${nas_secrets}" ]]
  exit
fi
if [[ -z "${nas_root}" || -z "${nas_secrets}" ]]; then
  echo "Set private NAS locations in ${config_file}; backup was not started." >&2
  exit 1
fi

nas_parent=$(dirname "${nas_root}")
secrets_parent=$(dirname "${nas_secrets}")
if [[ ! -d "${nas_parent}" && -n "${nas_share_url}" ]] && command -v gio >/dev/null 2>&1; then
  gio mount "${nas_share_url}" >/dev/null 2>&1 || true
fi
if [[ ! -d "${nas_parent}" || ! -d "${secrets_parent}" ]]; then
  echo "NAS backup directories are unavailable; leaving the local backup intact." >&2
  exit 1
fi

mkdir -p \
  "${nas_root}/database" \
  "${nas_root}/card-images" \
  "${nas_root}/scan-images" \
  "${nas_root}/justtcg-collector" \
  "${nas_root}/deployment" \
  "${nas_secrets}"

rsync -a --delete --no-owner --no-group --no-perms \
  "${storage_root}/backups/daily/" "${nas_root}/database/"
rsync -a --delete --no-owner --no-group --no-perms \
  "${storage_root}/card-images/" "${nas_root}/card-images/"
rsync -a --delete --no-owner --no-group --no-perms \
  "${storage_root}/scan-images/" "${nas_root}/scan-images/"
rsync -a --delete --no-owner --no-group --no-perms \
  "${storage_root}/justtcg-collector/" "${nas_root}/justtcg-collector/"

cp "${deploy_root}/docker-compose.yml" "${nas_root}/deployment/docker-compose.yml"
cp "${deploy_root}/images.env" "${nas_root}/deployment/images.env"
if [[ -f "${deploy_root}/deployments/current.json" ]]; then
  cp "${deploy_root}/deployments/current.json" \
    "${nas_root}/deployment/current.json"
fi
cp "${deploy_root}/.env" "${nas_secrets}/binderledger-production.env"

date -u +%Y-%m-%dT%H:%M:%SZ >"${nas_root}/LAST_SUCCESSFUL_SYNC_UTC.txt"
echo "Synchronized BinderLedger production state to NAS storage."
