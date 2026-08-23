#!/usr/bin/env bash
set -u

project_dir=/home/adam/src/BinderLedger/tools/justtcg-audit
manifest="$project_dir/output/kanto-collection.json"
timer=pokemon-card-kanto-collection.timer

cd "$project_dir" || exit 1

if [[ -f "$manifest" ]] && jq -e '.status == "complete"' "$manifest" >/dev/null; then
  systemctl --user disable --now "$timer" >/dev/null 2>&1 || true
  exit 0
fi

npm run collect-kanto
status=$?

if [[ -f "$manifest" ]] && jq -e '.status == "complete"' "$manifest" >/dev/null; then
  systemctl --user disable --now "$timer" >/dev/null 2>&1 || true
fi

# Exit 2 means the free daily allowance paused an otherwise healthy run.
if [[ $status -eq 0 || $status -eq 2 ]]; then
  exit 0
fi
exit "$status"
