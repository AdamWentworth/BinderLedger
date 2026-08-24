#!/usr/bin/env bash
set -u

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
root_dir=$(cd -- "$script_dir/../../.." && pwd)
project_dir="$root_dir/tools/justtcg-audit"
manifest="$project_dir/output/kanto-collection.json"
timer=pokemon-card-kanto-collection.timer

cd "$project_dir" || exit 1

npm run collect-machamp
machamp_status=$?
if [[ $machamp_status -eq 2 ]]; then
  exit 0
fi
if [[ $machamp_status -ne 0 ]]; then
  exit "$machamp_status"
fi

status=0
if ! [[ -f "$manifest" ]] || ! jq -e '.status == "complete"' "$manifest" >/dev/null; then
  npm run collect-kanto
  status=$?
fi

if [[ $status -eq 0 || $status -eq 2 ]]; then
  cd "$root_dir" || exit 1
  go run ./cmd/import-justtcg || exit $?
fi

if [[ -f "$manifest" ]] && jq -e '.status == "complete"' "$manifest" >/dev/null; then
  systemctl --user disable --now "$timer" >/dev/null 2>&1 || true
fi

# Exit 2 means the free daily allowance paused an otherwise healthy run.
if [[ $status -eq 0 || $status -eq 2 ]]; then
  exit 0
fi
exit "$status"
