#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repository_root}"

git -c core.safecrlf=false diff --check

generated_files="$({
  git ls-files |
    grep -E '(^|/)(node_modules|dist|web-build|\.expo|\.venv|__pycache__)(/|$)'
} || true)"
if [[ -n "${generated_files}" ]]; then
  echo "Generated or environment-local files are tracked:" >&2
  echo "${generated_files}" >&2
  exit 1
fi

private_env_files="$({
  git ls-files |
    grep -E '(^|/)\.env($|\.)' |
    grep -vE '\.env\.example$'
} || true)"
if [[ -n "${private_env_files}" ]]; then
  echo "Private environment files are tracked:" >&2
  echo "${private_env_files}" >&2
  exit 1
fi

private_key_files="$({
  git ls-files |
    grep -Ei '\.(key|p12|pfx|pem)$'
} || true)"
if [[ -n "${private_key_files}" ]]; then
  echo "Potential private key material is tracked:" >&2
  echo "${private_key_files}" >&2
  exit 1
fi

oversized_files=""
while IFS= read -r -d '' file; do
  [[ -f "${file}" ]] || continue
  size="$(wc -c <"${file}")"
  if (( size > 5242880 )); then
    oversized_files+="${file} (${size} bytes)"$'\n'
  fi
done < <(git ls-files -z)

if [[ -n "${oversized_files}" ]]; then
  echo "Tracked files exceed the 5 MiB repository limit:" >&2
  printf '%s' "${oversized_files}" >&2
  exit 1
fi

echo "Repository hygiene checks passed."
