#!/usr/bin/env bash
set -Eeuo pipefail

umask 027

deploy_root=${BINDERLEDGER_DEPLOY_ROOT:-/srv/binderledger}
storage_mount=${BINDERLEDGER_STORAGE_MOUNT:-/mnt/storage}
storage_root=${BINDERLEDGER_STORAGE_ROOT:-${storage_mount}/binderledger}
source_dir=${BINDERLEDGER_SOURCE_DIR:?BINDERLEDGER_SOURCE_DIR is required}
target_sha=${BINDERLEDGER_TARGET_SHA:?BINDERLEDGER_TARGET_SHA is required}
deploy_run_id=${BINDERLEDGER_DEPLOY_RUN_ID:-manual}
env_file=${deploy_root}/.env
images_file=${deploy_root}/images.env
compose_file=${deploy_root}/docker-compose.yml
deployment_file=${deploy_root}/deployments/current.json
lock_file=${deploy_root}/deployments/deploy.lock

if [[ ! "${target_sha}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid deployment commit SHA." >&2
  exit 1
fi
checked_out_sha=$(git -C "${source_dir}" rev-parse HEAD)
if [[ "${checked_out_sha}" != "${target_sha}" ]]; then
  echo "Checked out ${checked_out_sha}, expected ${target_sha}." >&2
  exit 1
fi

mkdir -p "${deploy_root}/deployments"
exec 9>"${lock_file}"
if ! flock -n 9; then
  echo "Another BinderLedger deployment is already running." >&2
  exit 1
fi

if ! findmnt "${storage_mount}" >/dev/null 2>&1; then
  echo "${storage_mount} is not mounted; refusing to deploy." >&2
  exit 1
fi
if [[ ! -f "${env_file}" ]]; then
  echo "Missing server environment: ${env_file}" >&2
  exit 1
fi
for key in POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD BINDERLEDGER_BIND_HOST; do
  if ! grep -qE "^${key}=.+" "${env_file}"; then
    echo "Missing ${key} in ${env_file}" >&2
    exit 1
  fi
done
password=$(sed -n 's/^POSTGRES_PASSWORD=//p' "${env_file}" | tail -1)
if [[ ! "${password}" =~ ^[A-Za-z0-9._~-]+$ ]]; then
  echo "POSTGRES_PASSWORD must be URL-safe." >&2
  exit 1
fi

current_sha=""
if [[ -f "${deployment_file}" ]]; then
  current_sha=$(python3 -c '
import json
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        print(json.load(handle).get("gitSha", ""))
except (OSError, ValueError):
    pass
' "${deployment_file}")
fi

image_tag="sha-${target_sha}"
core_image="ghcr.io/adamwentworth/binderledger-core:${image_tag}"
vision_image="ghcr.io/adamwentworth/binderledger-vision:${image_tag}"
web_image="ghcr.io/adamwentworth/binderledger-web:${image_tag}"
collector_image="ghcr.io/adamwentworth/binderledger-collector:${image_tag}"

for image in "${core_image}" "${vision_image}" "${web_image}" "${collector_image}"; do
  docker pull "${image}"
done

mkdir -p \
  "${storage_root}"/{postgres,card-images,scan-images,backups/daily} \
  "${storage_root}/justtcg-collector"/{output,cache}

new_images=$(mktemp "${deploy_root}/images.env.XXXXXX")
cat >"${new_images}" <<EOF
BINDERLEDGER_BUILD_SHA=${target_sha}
BINDERLEDGER_CORE_IMAGE=${core_image}
BINDERLEDGER_VISION_IMAGE=${vision_image}
BINDERLEDGER_WEB_IMAGE=${web_image}
BINDERLEDGER_COLLECTOR_IMAGE=${collector_image}
EOF
chmod 0640 "${new_images}"

docker compose \
  --project-directory "${deploy_root}" \
  -f "${source_dir}/ops/prod/docker-compose.yml" \
  --env-file "${env_file}" \
  --env-file "${new_images}" \
  config >/dev/null

previous_compose="${deploy_root}/deployments/previous-docker-compose.yml"
previous_images="${deploy_root}/deployments/previous-images.env"
if [[ -f "${compose_file}" ]]; then
  cp "${compose_file}" "${previous_compose}"
fi
if [[ -f "${images_file}" ]]; then
  cp "${images_file}" "${previous_images}"
fi

switched=0
compose() {
  docker compose \
    --project-directory "${deploy_root}" \
    -f "${compose_file}" \
    --env-file "${env_file}" \
    --env-file "${images_file}" \
    "$@"
}
rollback() {
  exit_code=$?
  trap - ERR
  set +e
  echo "Deployment failed; collecting diagnostics." >&2
  docker ps -a --filter 'name=binderledger_' >&2
  for service in api vision web; do
    compose logs --tail 200 "${service}" >&2 || true
  done
  if [[ "${switched}" -eq 1 ]]; then
    echo "Restoring the previous Compose and image selection." >&2
    [[ -f "${previous_compose}" ]] && cp "${previous_compose}" "${compose_file}"
    [[ -f "${previous_images}" ]] && cp "${previous_images}" "${images_file}"
    compose up -d --no-deps --force-recreate api vision web || true
  fi
  exit "${exit_code}"
}
trap rollback ERR

install -m 0644 "${source_dir}/ops/prod/docker-compose.yml" "${compose_file}"
mv "${new_images}" "${images_file}"
switched=1

compose up -d db
compose --profile tools run --rm migrate
compose up -d --no-deps --force-recreate api

bind_host=$(sed -n 's/^BINDERLEDGER_BIND_HOST=//p' "${env_file}" | tail -1)
api_port=$(sed -n 's/^BINDERLEDGER_API_PORT=//p' "${env_file}" | tail -1)
web_port=$(sed -n 's/^BINDERLEDGER_WEB_PORT=//p' "${env_file}" | tail -1)
api_port=${api_port:-4000}
web_port=${web_port:-8081}

api_ok=0
for _ in $(seq 1 45); do
  if health=$(curl -fsS "http://${bind_host}:${api_port}/api/health") && \
     python3 -c 'import json,sys; assert json.load(sys.stdin).get("buildSha") == sys.argv[1]' \
       "${target_sha}" <<<"${health}"; then
    api_ok=1
    break
  fi
  sleep 2
done
if [[ "${api_ok}" -ne 1 ]]; then
  false
fi

compose up -d --no-deps --force-recreate vision web
web_ok=0
for _ in $(seq 1 30); do
  if curl -fsS "http://${bind_host}:${web_port}/" >/dev/null; then
    web_ok=1
    break
  fi
  sleep 2
done
if [[ "${web_ok}" -ne 1 ]]; then
  false
fi

vision_ok=0
for _ in $(seq 1 45); do
  if compose logs --no-color vision 2>&1 | grep -q 'worker ready'; then
    vision_ok=1
    break
  fi
  sleep 2
done
if [[ "${vision_ok}" -ne 1 ]]; then
  false
fi

curl -fsS "http://${bind_host}:${api_port}/api/catalog/sets" | python3 -m json.tool >/dev/null
curl -fsS "http://${bind_host}:${web_port}/scan" >/dev/null
for container in binderledger_db binderledger_api binderledger_vision binderledger_web; do
  [[ "$(docker inspect --format '{{.State.Status}}' "${container}")" == "running" ]]
done

BINDERLEDGER_DEPLOY_ROOT="${deploy_root}" \
  BINDERLEDGER_STORAGE_ROOT="${storage_root}" \
  bash "${source_dir}/ops/prod/scripts/install-user-services.sh"

cat >"${deployment_file}" <<EOF
{
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "gitSha": "${target_sha}",
  "imageTag": "${image_tag}",
  "deploymentSource": "github-self-hosted-runner",
  "runId": "${deploy_run_id}"
}
EOF
chmod 0640 "${deployment_file}"

switched=0
trap - ERR
docker image prune --force --filter 'until=168h' >/dev/null
for repository_name in \
  ghcr.io/adamwentworth/binderledger-core \
  ghcr.io/adamwentworth/binderledger-vision \
  ghcr.io/adamwentworth/binderledger-web \
  ghcr.io/adamwentworth/binderledger-collector; do
  while IFS= read -r tag; do
    [[ "${tag}" == sha-* ]] || continue
    [[ "${tag}" == "${image_tag}" ]] && continue
    [[ -n "${current_sha}" && "${tag}" == "sha-${current_sha}" ]] && continue
    docker image rm "${repository_name}:${tag}" >/dev/null 2>&1 || true
  done < <(docker image ls "${repository_name}" --format '{{.Tag}}')
done
echo "Deployed BinderLedger ${target_sha} from CI-published GHCR images."
