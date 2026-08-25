#!/usr/bin/env bash
set -euo pipefail

deploy_root=${BINDERLEDGER_DEPLOY_ROOT:-/srv/binderledger}
storage_root=${BINDERLEDGER_STORAGE_ROOT:-/mnt/storage/binderledger}
nas_root=${BINDERLEDGER_NAS_BACKUP_DIR:-/run/user/1000/gvfs/smb-share:server=tnas-98b9.local,share=vault/Projects/BinderLedger/Production}
nas_secrets=${BINDERLEDGER_NAS_SECRETS_DIR:-/run/user/1000/gvfs/smb-share:server=tnas-98b9.local,share=vault/Secrets/BinderLedger/Production}

nas_parent=$(dirname "${nas_root}")
secrets_parent=$(dirname "${nas_secrets}")
if [[ ! -d "${nas_parent}" ]] && command -v gio >/dev/null 2>&1; then
  gio mount smb://tnas-98b9.local/vault >/dev/null 2>&1 || true
fi
if [[ ! -d "${nas_parent}" || ! -d "${secrets_parent}" ]]; then
  echo "TNAS vault is not mounted; leaving the local production backup intact." >&2
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
echo "Synchronized BinderLedger production state to TNAS."
