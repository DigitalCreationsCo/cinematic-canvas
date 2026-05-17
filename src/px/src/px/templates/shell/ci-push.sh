#!/usr/bin/env bash
# ci-push.sh
#
# PURPOSE
#   Push (upsert) Portals flow JSON files to a remote Portals instance
#   using `px push`.  Stable flow IDs mean re-running always converges.
#
# USAGE
#   chmod +x ci-push.sh
#   export PORTALS_URL=https://staging.portals.example.com
#   export PORTALS_API_KEY=<your-api-key>
#   ./ci-push.sh
#
# ENVIRONMENT VARIABLES — connection (pick one approach)
#
#   Approach A: direct URL + key (simplest)
#     PORTALS_URL        URL of the target Portals instance.
#     PORTALS_API_KEY    API key for that instance.
#
#   Approach B: named environment from a TOML config
#     PORTALS_ENV                 Name of the environment block.
#                                  e.g. staging  or  production
#     PORTALS_ENVIRONMENTS_FILE   Path to environments TOML.
#                                  Default: portals-environments.toml
#     <api_key_env var>            The env var named in api_key_env inside the
#                                  TOML block.  Must be exported separately.
#
#   The TOML format:
#
#     [environments.staging]
#     url         = "https://staging.portals.example.com"
#     api_key_env  = "PORTALS_STAGING_API_KEY"
#
#     [environments.production]
#     url         = "https://portals.example.com"
#     api_key_env  = "PORTALS_PROD_API_KEY"
#
# ENVIRONMENT VARIABLES — behaviour
#   FLOWS_DIR            Directory containing flow JSON files.
#                        Default: flows/
#   PORTALS_PROJECT     Project (folder) name on the remote instance.
#                        Default: (no project — flows go to the default folder)
#   PORTALS_PROJECT_ID  Project UUID.  Takes precedence over PORTALS_PROJECT.
#   DRY_RUN              Set to "true" to show what would be pushed without
#                        making any changes.  Default: false
#   PX_VERSION          px PEP 508 version specifier suffix appended directly
#                        to the package name, e.g. ">=0.4,<1" or "==1.2.3".
#                        Default: installs latest.
#
# EXIT CODES
#   0  All flows pushed (or dry-run completed) successfully
#   1  One or more flows failed to push
#
# INTEGRATIONS
#   Jenkins:          sh 'ci-push.sh'
#   CircleCI:         - run: bash ci-push.sh
#   Bitbucket:        - bash ci-push.sh
#   Azure Pipelines:  - script: bash ci-push.sh

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────── #

FLOWS_DIR="${FLOWS_DIR:-flows/}"
PORTALS_ENV="${PORTALS_ENV:-}"
PORTALS_ENVIRONMENTS_FILE="${PORTALS_ENVIRONMENTS_FILE:-portals-environments.toml}"
PORTALS_URL="${PORTALS_URL:-}"
PORTALS_API_KEY="${PORTALS_API_KEY:-}"
PORTALS_PROJECT="${PORTALS_PROJECT:-}"
PORTALS_PROJECT_ID="${PORTALS_PROJECT_ID:-}"
DRY_RUN="${DRY_RUN:-false}"
PX_VERSION="${PX_VERSION:-}"

# Normalise PX_VERSION: if it looks like a bare version (starts with a digit),
# prepend "==" so the pip specifier is valid.
if [[ -n "${PX_VERSION}" && "${PX_VERSION}" =~ ^[0-9] ]]; then
  PX_VERSION="==${PX_VERSION}"
fi

# ── Install px ───────────────────────────────────────────────────────────── #

echo "==> Installing px${PX_VERSION:+ ${PX_VERSION}} ..."
pip install --quiet "px${PX_VERSION}" portals-sdk

# ── Build environments file if using Approach B ───────────────────────────── #

if [[ -n "${PORTALS_ENV}" && ! -f "${PORTALS_ENVIRONMENTS_FILE}" ]]; then
  ENV_UPPER="${PORTALS_ENV^^}"
  ENV_UPPER="${ENV_UPPER//-/_}"
  URL_VAR="PORTALS_${ENV_UPPER}_URL"
  KEY_VAR="PORTALS_${ENV_UPPER}_API_KEY"

  echo "==> Writing ${PORTALS_ENVIRONMENTS_FILE} for environment '${PORTALS_ENV}' ..."
  printf '[environments.%s]\nurl = "%s"\napi_key_env = "%s"\n' \
    "${PORTALS_ENV}" \
    "${!URL_VAR:-}" \
    "${KEY_VAR}" \
    > "${PORTALS_ENVIRONMENTS_FILE}"
  export PORTALS_ENVIRONMENTS_FILE
fi

# ── Build px push command ────────────────────────────────────────────────── #

PUSH_CMD=(px push --dir "${FLOWS_DIR}")

if [[ -n "${PORTALS_ENV}" ]]; then
  PUSH_CMD+=(--env "${PORTALS_ENV}")
elif [[ -n "${PORTALS_URL}" ]]; then
  PUSH_CMD+=(--target "${PORTALS_URL}")
  [[ -n "${PORTALS_API_KEY}" ]] && PUSH_CMD+=(--api-key "${PORTALS_API_KEY}")
else
  echo "ERROR: set PORTALS_ENV (Approach B) or PORTALS_URL (Approach A)" >&2
  exit 1
fi

if [[ -n "${PORTALS_PROJECT_ID}" ]]; then
  PUSH_CMD+=(--project-id "${PORTALS_PROJECT_ID}")
elif [[ -n "${PORTALS_PROJECT}" ]]; then
  PUSH_CMD+=(--project "${PORTALS_PROJECT}")
fi

[[ "${DRY_RUN}" == "true" ]] && PUSH_CMD+=(--dry-run)

# ── Push ──────────────────────────────────────────────────────────────────── #

echo "==> Pushing flows from ${FLOWS_DIR} ..."
[[ "${DRY_RUN}" == "true" ]] && echo "    (dry run — no changes will be made)"
echo "==> Running: ${PUSH_CMD[*]}"
"${PUSH_CMD[@]}"

echo "==> Done."
