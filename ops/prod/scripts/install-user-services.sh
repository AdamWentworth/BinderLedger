#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
prod_dir=$(cd -- "${script_dir}/.." && pwd)
unit_dir=${HOME}/.config/systemd/user
deploy_root=${BINDERLEDGER_DEPLOY_ROOT:-/srv/binderledger}

mkdir -p "${unit_dir}" "${deploy_root}/bin"
install -m 0755 "${script_dir}/backup-local.sh" "${deploy_root}/bin/backup-local.sh"
if BINDERLEDGER_DEPLOY_ROOT="${deploy_root}" \
  "${script_dir}/backup-nas.sh" --configure-only; then
  install -m 0755 "${script_dir}/backup-nas.sh" "${deploy_root}/bin/backup-nas.sh"
elif [[ -x "${deploy_root}/bin/backup-nas.sh" ]]; then
  echo "Private NAS locations were not discovered; preserving the installed backup script." >&2
else
  echo "Private NAS locations were not discovered; configure ${deploy_root}/backup.env before enabling NAS backup." >&2
fi
systemctl --user disable --now binderledger-deploy-pull.timer 2>/dev/null || true
systemctl --user stop binderledger-deploy-pull.service 2>/dev/null || true
rm -f \
  "${unit_dir}/binderledger-deploy-pull.service" \
  "${unit_dir}/binderledger-deploy-pull.timer" \
  "${deploy_root}/bin/deploy-pull.sh"

for unit in "${prod_dir}"/systemd/*; do
  install -m 0644 "${unit}" "${unit_dir}/$(basename "${unit}")"
done

systemctl --user daemon-reload
enabled_units=(
  binderledger-justtcg-refresh.timer
  binderledger-justtcg-history.timer
  binderledger-backup-local.timer
  binderledger-localhost-proxy@8081.socket
)
if [[ -x "${deploy_root}/bin/backup-nas.sh" ]]; then
  enabled_units+=(binderledger-backup-nas.timer)
else
  systemctl --user disable --now binderledger-backup-nas.timer 2>/dev/null || true
fi
systemctl --user enable --now "${enabled_units[@]}"

echo "BinderLedger production user services installed."
