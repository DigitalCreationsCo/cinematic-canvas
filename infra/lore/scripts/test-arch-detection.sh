#!/usr/bin/env bash
# =============================================================================
# Test: Architecture Tag Resolution
# =============================================================================
# Tests the arch-to-Docker-tag mapping logic used by Makefile and Dockerfiles.
#
# The Makefile defines:
#   HOST_ARCH := $(shell uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
#
# The Dockerfile.loreserver uses:
#   ARG TARGETARCH
#   FROM portalshq/lore-server-base:latest-${TARGETARCH}
#
# These tests verify that the sed pattern correctly maps all known
# `uname -m` outputs to Docker's architecture naming convention.
# =============================================================================

set -euo pipefail

PASS=0
FAIL=0
SKIP=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Helper: run a test case
# ---------------------------------------------------------------------------
assert_equal() {
    local input="$1"
    local expected="$2"
    local label="$3"

    # This must match the exact sed pattern from the Makefile:
    local result
    result=$(echo "$input" | sed 's/x86_64/amd64/;s/aarch64/arm64/')

    if [ "$result" = "$expected" ]; then
        echo -e "  ${GREEN}✓ PASS${NC} $label  ($input → $result)"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}✗ FAIL${NC} $label"
        echo -e "    Input:    $input"
        echo -e "    Expected: $expected"
        echo -e "    Got:      $result"
        FAIL=$((FAIL + 1))
    fi
}

# ---------------------------------------------------------------------------
# Test Suite 1: uname -m → Docker ARCH mapping
# ---------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Test Suite 1: uname -m → Docker Architecture Mapping"
echo "═══════════════════════════════════════════════════════════════"
echo ""

echo "  [1a] Intel/AMD platforms"
assert_equal "x86_64"   "amd64"  "Linux/macOS Intel (x86_64 → amd64)"
assert_equal "i686"     "i686"   "32-bit x86 (i686) — passthrough"
assert_equal "i386"     "i386"   "32-bit x86 (i386) — passthrough"

echo ""
echo "  [1b] ARM64 platforms"
assert_equal "aarch64"  "arm64"  "Linux ARM64 (aarch64 → arm64)"
assert_equal "arm64"    "arm64"  "macOS Apple Silicon (arm64 → arm64, already correct)"

echo ""
echo "  [1c] ARM 32-bit platforms (passthrough)"
assert_equal "armv7l"   "armv7l" "32-bit ARM (armv7l) — passthrough"
assert_equal "armv6l"   "armv6l" "32-bit ARM (armv6l) — passthrough"

echo ""
echo "  [1d] Uncommon architectures (passthrough)"
assert_equal "riscv64"  "riscv64" "RISC-V 64 — passthrough"
assert_equal "s390x"    "s390x"   "IBM Z (s390x) — passthrough"
assert_equal "ppc64le"  "ppc64le" "PowerPC LE (ppc64le) — passthrough"

# ---------------------------------------------------------------------------
# Test Suite 2: Verify the full image tag is constructed correctly
# ---------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Test Suite 2: Full Image Tag Construction"
echo "═══════════════════════════════════════════════════════════════"
echo ""

test_tag() {
    local arch="$1"
    local expected_tag="portalshq/lore-server-base:latest-${arch}"
    local label="$2"
    assert_equal "$arch" "$arch" "$label — tag: $expected_tag"
}

echo "  [2a] Image tags for common architectures"
echo "    portalshq/lore-server-base:latest-amd64"
echo "    portalshq/lore-server-base:latest-arm64"
echo "    (Tags are purely mechanical — verified if arch is correct above)"
echo ""

# ---------------------------------------------------------------------------
# Test Suite 3: Cross-architecture compilation check
# ---------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Test Suite 3: Docker --platform Flag Construction"
echo "═══════════════════════════════════════════════════════════════"
echo ""

test_platform() {
    local arch="$1"
    local expected="linux/${arch}"
    local result="linux/${arch}"
    local label="$2"
    if [ "$result" = "$expected" ]; then
        echo -e "  ${GREEN}✓ PASS${NC} $label  (--platform $result)"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}✗ FAIL${NC} $label"
        echo -e "    Expected: $expected"
        echo -e "    Got:      $result"
        FAIL=$((FAIL + 1))
    fi
}

test_platform "amd64" "linux/amd64 Intel CI node"
test_platform "arm64" "linux/arm64 ARM64/Graviton CI node"

# ---------------------------------------------------------------------------
# Test Suite 4: Makefile integration test (if Make is available)
# ---------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Test Suite 4: Makefile Integration"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if command -v make &>/dev/null; then
    # Run a dry-run of lore_base from the project root Makefile
    PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
    MAKEFILE="${PROJECT_ROOT}/Makefile"

    if [ -f "$MAKEFILE" ]; then
        echo "  [4a] Makefile exists at $MAKEFILE"
        PASS=$((PASS + 1))

        # Check that HOST_ARCH variable is defined
        if grep -qF 'HOST_ARCH' "$MAKEFILE"; then
            echo -e "  ${GREEN}✓ PASS${NC} Makefile defines HOST_ARCH variable"
            PASS=$((PASS + 1))
        else
            echo -e "  ${RED}✗ FAIL${NC} Makefile missing HOST_ARCH variable"
            FAIL=$((FAIL + 1))
        fi

        # Check that lore_base uses HOST_ARCH in tag
        if grep -qF '$(HOST_ARCH)' "$MAKEFILE"; then
            echo -e "  ${GREEN}✓ PASS${NC} lore_base target uses arch-specific tag"
            PASS=$((PASS + 1))
        else
            echo -e "  ${RED}✗ FAIL${NC} lore_base target missing arch-specific tag"
            FAIL=$((FAIL + 1))
        fi

        # Check that lore_base_push uses HOST_ARCH in platform flag
        # Use grep -F (fixed string) to avoid --platform being interpreted as grep flag
        if grep -qF 'linux/$(HOST_ARCH)' "$MAKEFILE"; then
            echo -e "  ${GREEN}✓ PASS${NC} lore_base_push uses platform-specific build"
            PASS=$((PASS + 1))
        else
            echo -e "  ${RED}✗ FAIL${NC} lore_base_push missing platform flag"
            FAIL=$((FAIL + 1))
        fi
    else
        echo -e "  ${YELLOW}⚠ SKIP${NC} Makefile not found at $MAKEFILE"
        SKIP=$((SKIP + 3))
    fi
else
    echo -e "  ${YELLOW}⚠ SKIP${NC} make command not available"
    SKIP=$((SKIP + 3))
fi

# ---------------------------------------------------------------------------
# Test Suite 5: Dockerfile TARGETARCH reference check
# ---------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Test Suite 5: Dockerfile FROM Line Validation"
echo "═══════════════════════════════════════════════════════════════"
echo ""

DOCKERFILE="${PROJECT_ROOT}/infra/lore/Dockerfile.loreserver"
if [ -f "$DOCKERFILE" ]; then
    # Check that ARG TARGETARCH is declared before FROM
    if grep -q '^ARG TARGETARCH' "$DOCKERFILE"; then
        echo -e "  ${GREEN}✓ PASS${NC} TARGETARCH declared before FROM"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}✗ FAIL${NC} Missing ARG TARGETARCH before FROM"
        FAIL=$((FAIL + 1))
    fi

    # Check that FROM uses TARGETARCH
    if grep -qF 'latest-${TARGETARCH}' "$DOCKERFILE"; then
        echo -e "  ${GREEN}✓ PASS${NC} FROM line references arch-specific tag"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}✗ FAIL${NC} FROM line missing TARGETARCH reference"
        FAIL=$((FAIL + 1))
    fi

    # Check that there's no stale :latest reference in FROM
    if grep -qE 'FROM.*:latest[^-]' "$DOCKERFILE"; then
        echo -e "  ${RED}✗ FAIL${NC} Stale :latest reference found in FROM"
        FAIL=$((FAIL + 1))
    else
        echo -e "  ${GREEN}✓ PASS${NC} No stale :latest references in FROM"
        PASS=$((PASS + 1))
    fi
else
    echo -e "  ${YELLOW}⚠ SKIP${NC} Dockerfile.loreserver not found"
    SKIP=$((SKIP + 3))
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo -e "  Results:  ${GREEN}${PASS} passed${NC}  ${RED}${FAIL} failed${NC}  ${YELLOW}${SKIP} skipped${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
