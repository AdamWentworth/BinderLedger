#!/bin/sh
set -u

output_dir=${JUSTTCG_OUTPUT_DIR:-/app/output}
marker=${output_dir}/.production-imported-through
manifest=${output_dir}/legacy-collection.json

mkdir -p "${output_dir}/collections" "${JUSTTCG_CACHE_DIR:-/app/.cache}"

if node -e '
  const fs = require("node:fs");
  const manifest = process.argv[1];
  if (!fs.existsSync(manifest)) process.exit(1);
  process.exit(JSON.parse(fs.readFileSync(manifest, "utf8")).status === "complete" ? 0 : 1);
' "${manifest}"; then
  echo "Legacy JustTCG collection is already complete."
  exit 0
fi

status=0
node /app/src/cli.mjs collect-legacy || status=$?
if [ "${status}" -ne 0 ] && [ "${status}" -ne 2 ]; then
  exit "${status}"
fi

staging=$(mktemp -d)
trap 'rm -rf "${staging}"' EXIT
mkdir -p "${staging}/collections"

if [ -f "${marker}" ]; then
  find "${output_dir}/collections" -maxdepth 1 -type f \
    -name '*-pokemon.json' -newer "${marker}" \
    -exec ln -s '{}' "${staging}/collections/" ';'
else
  find "${output_dir}/collections" -maxdepth 1 -type f \
    -name '*-pokemon.json' \
    -exec ln -s '{}' "${staging}/collections/" ';'
fi

if find "${staging}/collections" -maxdepth 1 -type l | grep -q .; then
  /usr/local/bin/binderledger-import-justtcg --dir "${staging}/collections"
  temporary_marker=${marker}.$$
  : >"${temporary_marker}"
  mv "${temporary_marker}" "${marker}"
else
  echo "No newly completed JustTCG collections need importing."
fi

# Exit 2 is a healthy quota pause; systemd should not retry it as a failure.
if [ "${status}" -eq 2 ]; then
  exit 0
fi
