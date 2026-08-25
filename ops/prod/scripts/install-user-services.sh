#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
prod_dir=$(cd -- "${script_dir}/.." && pwd)
unit_dir=${HOME}/.config/systemd/user
deploy_root=${BINDERLEDGER_DEPLOY_ROOT:-/srv/binderledger}

mkdir -p "${unit_dir}" "${deploy_root}/bin"
install -m 0755 "${script_dir}/backup-local.sh" "${deploy_root}/bin/backup-local.sh"
install -m 0755 "${script_dir}/backup-nas.sh" "${deploy_root}/bin/backup-nas.sh"

for unit in "${prod_dir}"/systemd/*; do
  install -m 0644 "${unit}" "${unit_dir}/$(basename "${unit}")"
done

systemctl --user daemon-reload
systemctl --user enable --now \
  binderledger-justtcg-refresh.timer \
  binderledger-justtcg-history.timer \
  binderledger-backup-local.timer \
  binderledger-backup-nas.timer \
  binderledger-localhost-proxy@8081.socket

echo "BinderLedger production user services installed."
