#!/usr/bin/env bash
# =============================================================================
# docker-buildx-lore.sh — Multi-Arch Build & Push for Lore Server Images
# =============================================================================
#
# Builds and pushes multi-architecture Docker images for:
#   - portalshq/lore-server-base  (compiled loreserver binary + AWS plugin)
#   - portalshq/lore-server       (Portals runtime config on top of base)
#
# Target platforms: linux/amd64 (cloud production) and linux/arm64 (Graviton,
# Apple Silicon, modern edge).
#
# Usage:
#   ./scripts/docker-buildx-lore.sh          # tags :latest only
#   ./scripts/docker-buildx-lore.sh 0.8.5    # tags :0.8.5 and :latest
#   ./scripts/docker-buildx-lore.sh 0.8.5-nightly
#
# Prerequisites:
#   - Docker >= 19.03 with buildx plugin
#   - Logged into the target registry (docker login)
#   - QEMU binfmt registered for cross-platform builds:
#       docker run --privileged --rm tonistiigi/binfmt --install all
#
# Safety:
#   - Builder creation is idempotent — safe for concurrent CI runners
#   --push is used (not --load) so the multi-arch manifest goes directly
#   to the registry, bypassing the local Docker daemon's single-arch limit
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

VERSION="${1:-latest}"
BASE_IMAGE="portalshq/lore-server-base"
SERVER_IMAGE="portalshq/lore-server"
PLATFORMS="linux/amd64,linux/arm64"
BUILDER_NAME="lore-builder"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { printf "${GREEN}[INFO]${NC}  %s\n" "$*"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
error() { printf "${RED}[ERROR]${NC} %s\n" "$*"; exit 1; }
step()  { printf "\n${BLUE}═══════════════════════════════════════════════════════════════════${NC}\n"; printf "${BLUE}  %s${NC}\n" "$*"; printf "${BLUE}═══════════════════════════════════════════════════════════════════${NC}\n"; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
step "Pre-flight Checks"

command -v docker >/dev/null 2>&1 || error "Docker is not installed."
info "Docker found: $(docker --version)"

docker buildx version >/dev/null 2>&1 || error "Docker buildx plugin is not available."
info "Buildx found: $(docker buildx version 2>&1 | head -1)"

# ---------------------------------------------------------------------------
# Idempotent builder setup
# ---------------------------------------------------------------------------
step "Buildx Builder Setup"

if docker buildx inspect "${BUILDER_NAME}" >/dev/null 2>&1; then
    info "Builder '${BUILDER_NAME}' already exists — reusing (idempotent)."
    docker buildx use "${BUILDER_NAME}"
else
    info "Creating and bootstrapping builder '${BUILDER_NAME}'..."
    docker buildx create --use --name "${BUILDER_NAME}" --bootstrap
fi

info "Active builder: $(docker buildx inspect --bootstrap 2>/dev/null | grep -i 'name:' | head -1)"
info "Available platforms:"
docker buildx ls 2>/dev/null | grep -E "(NAME|${BUILDER_NAME}|\*)" || true

# Verify QEMU support for arm64 builds
if ! docker buildx ls 2>/dev/null | grep -q "linux/arm64"; then
    warn "linux/arm64 not listed in buildx platforms."
    warn "Run: docker run --privileged --rm tonistiigi/binfmt --install all"
    warn "Then re-run this script."
fi

cd "${REPO_ROOT}"

# ---------------------------------------------------------------------------
# 1. Build & Push: lore-server-base
# ---------------------------------------------------------------------------
step "Building & Pushing: ${BASE_IMAGE}"

info "Platforms: ${PLATFORMS}"
info "Tags:      ${BASE_IMAGE}:${VERSION}, ${BASE_IMAGE}:latest"
info "Context:   infra/lore/lore"

docker buildx build \
    --platform "${PLATFORMS}" \
    -f infra/lore/Dockerfile.loreserver.base \
    -t "${BASE_IMAGE}:${VERSION}" \
    -t "${BASE_IMAGE}:latest" \
    --cache-to=type=inline \
    --cache-from=type=registry,ref="${BASE_IMAGE}:cache" \
    --push \
    infra/lore/lore

info "✓ Successfully pushed ${BASE_IMAGE}:${VERSION} (multi-arch: ${PLATFORMS})"

# ---------------------------------------------------------------------------
# 2. Build & Push: lore-server (Portals runtime)
# ---------------------------------------------------------------------------
step "Building & Pushing: ${SERVER_IMAGE}"

info "Platforms: ${PLATFORMS}"
info "Tags:      ${SERVER_IMAGE}:${VERSION}, ${SERVER_IMAGE}:latest"
info "Context:   . (project root)"
info "Base:      ${BASE_IMAGE}:latest (must already exist in registry as multi-arch)"

# Verify the base image multi-arch manifest exists before proceeding
if ! docker buildx imagetools inspect "${BASE_IMAGE}:latest" >/dev/null 2>&1; then
    error "Base image ${BASE_IMAGE}:latest not found in registry. Build and push base first."
fi
info "Base image verification passed — ${BASE_IMAGE}:latest exists in registry."

docker buildx build \
    --platform "${PLATFORMS}" \
    -f infra/lore/Dockerfile.loreserver \
    -t "${SERVER_IMAGE}:${VERSION}" \
    -t "${SERVER_IMAGE}:latest" \
    --cache-to=type=inline \
    --cache-from=type=registry,ref="${SERVER_IMAGE}:cache" \
    --push \
    .

info "✓ Successfully pushed ${SERVER_IMAGE}:${VERSION} (multi-arch: ${PLATFORMS})"

# ---------------------------------------------------------------------------
# 3. Verification
# ---------------------------------------------------------------------------
step "Verification — Multi-Arch Manifests"

info "Inspecting ${BASE_IMAGE}:${VERSION} ..."
docker buildx imagetools inspect "${BASE_IMAGE}:${VERSION}"

info "Inspecting ${SERVER_IMAGE}:${VERSION} ..."
docker buildx imagetools inspect "${SERVER_IMAGE}:${VERSION}"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
step "Build & Push Complete"

printf "  ${GREEN}✓${NC} ${BASE_IMAGE}:${VERSION}  → multi-arch: ${PLATFORMS}\n"
printf "  ${GREEN}✓${NC} ${BASE_IMAGE}:latest      → multi-arch: ${PLATFORMS}\n"
printf "  ${GREEN}✓${NC} ${SERVER_IMAGE}:${VERSION}  → multi-arch: ${PLATFORMS}\n"
printf "  ${GREEN}✓${NC} ${SERVER_IMAGE}:latest      → multi-arch: ${PLATFORMS}\n"
printf "\n"
printf "  Builder:  ${BUILDER_NAME}\n"
printf "  Cache:    inline (embedded in image manifests)\n"
printf "\n"
