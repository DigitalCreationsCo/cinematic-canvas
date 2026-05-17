#!/usr/bin/env bash
# ci-test.sh
#
# PURPOSE
#   Run pytest flow-integration tests against a live Portals instance
#   using the portals-sdk `flow_runner` fixture.
#
# USAGE
#   chmod +x ci-test.sh
#   ./ci-test.sh
#
# ENVIRONMENT VARIABLES — connection (pick one approach)
#
#   Approach A: direct URL + key (simplest)
#     PORTALS_URL        URL of the target Portals instance.
#                         e.g. https://staging.portals.example.com
#     PORTALS_API_KEY    API key for that instance.
#
#   Approach B: named environment from a TOML config
#     PORTALS_ENV                 Name of the environment block in the TOML.
#                                  e.g. staging
#     PORTALS_ENVIRONMENTS_FILE   Path to the environments TOML.
#                                  Default: portals-environments.toml
#     <api_key_env var>            The env var named in api_key_env inside the
#                                  TOML block, e.g. PORTALS_STAGING_API_KEY.
#
#   The TOML format (see also ci-push.sh):
#
#     [environments.staging]
#     url        = "https://staging.portals.example.com"
#     api_key_env = "PORTALS_STAGING_API_KEY"
#
# ENVIRONMENT VARIABLES — behaviour
#   TESTS_DIR        Directory containing test files.  Default: tests/
#   PYTEST_MARKERS   Markers to pass to -m.  Default: integration
#   PYTEST_ARGS      Extra arguments forwarded verbatim to pytest.
#   SDK_VERSION      portals-sdk PEP 508 version specifier suffix appended
#                    directly to the package name, e.g. ">=0.4,<1" or "==1.2.3".
#                    Default: installs latest.
#
# SKIPPING
#   When neither PORTALS_URL nor PORTALS_ENV is set the tests auto-skip
#   (the flow_runner fixture detects no connection).  This means the script
#   exits 0 even when run on a branch that lacks the necessary secrets.
#
# EXIT CODES
#   0  All tests passed (or skipped due to missing connection)
#   1  One or more tests failed
#
# INTEGRATIONS
#   Jenkins:          sh 'ci-test.sh'
#   CircleCI:         - run: bash ci-test.sh
#   Bitbucket:        - bash ci-test.sh
#   Azure Pipelines:  - script: bash ci-test.sh

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────── #

TESTS_DIR="${TESTS_DIR:-tests/}"
PYTEST_MARKERS="${PYTEST_MARKERS:-integration}"
PYTEST_ARGS="${PYTEST_ARGS:-}"
SDK_VERSION="${SDK_VERSION:-}"
PORTALS_ENV="${PORTALS_ENV:-}"
PORTALS_ENVIRONMENTS_FILE="${PORTALS_ENVIRONMENTS_FILE:-portals-environments.toml}"

# ── Install dependencies ───────────────────────────────────────────────────── #

# Normalise SDK_VERSION: if it looks like a bare version (starts with a digit),
# prepend "==" so the pip specifier is valid.
if [[ -n "${SDK_VERSION}" && "${SDK_VERSION}" =~ ^[0-9] ]]; then
  SDK_VERSION="==${SDK_VERSION}"
fi

echo "==> Installing portals-sdk[testing] and pytest ..."
pip install --quiet \
  "portals-sdk[testing]${SDK_VERSION}" \
  pytest

# ── Build environments file if using Approach B ───────────────────────────── #

if [[ -n "${PORTALS_ENV}" && ! -f "${PORTALS_ENVIRONMENTS_FILE}" ]]; then
  # Derive variable names from the env name (uppercased, hyphens → underscores)
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
fi

# ── Run tests ─────────────────────────────────────────────────────────────── #

# Build pytest command
PYTEST_CMD=(pytest "${TESTS_DIR}" -v --tb=short)

if [[ -n "${PYTEST_MARKERS}" ]]; then
  PYTEST_CMD+=(-m "${PYTEST_MARKERS}")
fi

if [[ -n "${PORTALS_ENV}" ]]; then
  PYTEST_CMD+=(--portals-env "${PORTALS_ENV}")
  export PORTALS_ENVIRONMENTS_FILE
elif [[ -n "${PORTALS_URL:-}" ]]; then
  PYTEST_CMD+=(--portals-url "${PORTALS_URL}")
  [[ -n "${PORTALS_API_KEY:-}" ]] && PYTEST_CMD+=(--portals-api-key "${PORTALS_API_KEY}")
fi

# Append any extra user-supplied args
# shellcheck disable=SC2206
[[ -n "${PYTEST_ARGS}" ]] && PYTEST_CMD+=(${PYTEST_ARGS})

echo "==> Running: ${PYTEST_CMD[*]}"
"${PYTEST_CMD[@]}"
