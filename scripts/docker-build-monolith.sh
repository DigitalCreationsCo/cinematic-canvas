#!/bin/bash
set -e

DOCKERFILE="Dockerfile.monolith"
IMAGE_NAME="cinematic-canvas:monolith"
ENV_FILE="${1:-.env}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

load_env_file() {
    local env_file="$1"
    if [[ ! -f "$env_file" ]]; then
        echo -e "${RED}Error: $env_file not found${NC}"
        exit 1
    fi
    export "$(grep -v '^#' "$env_file" | grep -v '^$' | xargs)"
}

build_image() {
    echo -e "${GREEN}Building $IMAGE_NAME from $DOCKERFILE...${NC}"
    
    local -a build_args=(--build-arg NODE_ENV=production)
    
    [[ -n "$GOOGLE_CLOUD_PROJECT" ]] && build_args+=(--build-arg GOOGLE_CLOUD_PROJECT="$GOOGLE_CLOUD_PROJECT")
    [[ -n "$GOOGLE_CLOUD_BUCKET" ]] && build_args+=(--build-arg GOOGLE_CLOUD_BUCKET="$GOOGLE_CLOUD_BUCKET")
    [[ -n "$GOOGLE_CLOUD_REGION" ]] && build_args+=(--build-arg GOOGLE_CLOUD_REGION="$GOOGLE_CLOUD_REGION")
    [[ -n "$GOOGLE_CLOUD_LOCATION" ]] && build_args+=(--build-arg GOOGLE_CLOUD_LOCATION="$GOOGLE_CLOUD_LOCATION")
    [[ -n "$INTERNAL_API_KEY" ]] && build_args+=(--build-arg INTERNAL_API_KEY="$INTERNAL_API_KEY")
    [[ -n "$PROMPTLAYER_API_KEY" ]] && build_args+=(--build-arg PROMPTLAYER_API_KEY="$PROMPTLAYER_API_KEY")
    [[ -n "$POSTGRES_URL" ]] && build_args+=(--build-arg POSTGRES_URL="$POSTGRES_URL")
    [[ -n "$VITE_SUPABASE_URL" ]] && build_args+=(--build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL")
    [[ -n "$VITE_SUPABASE_ANON_KEY" ]] && build_args+=(--build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY")
    [[ -n "$SUPABASE_SERVICE_ROLE_KEY" ]] && build_args+=(--build-arg SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY")
    [[ -n "$LTX_API_ENDPOINT" ]] && build_args+=(--build-arg LTX_API_ENDPOINT="$LTX_API_ENDPOINT")
    [[ -n "$LTX_API_KEY" ]] && build_args+=(--build-arg LTX_API_KEY="$LTX_API_KEY")
    
    echo -e "${YELLOW}Build args:${NC} ${build_args[*]}"
    
    docker build -f "$DOCKERFILE" -t "$IMAGE_NAME" "${build_args[@]}" .
    
    echo -e "${GREEN}Build complete: $IMAGE_NAME${NC}"
}

run_container() {
    echo -e "${GREEN}Running $IMAGE_NAME...${NC}"
    
    local -a env_flags=()
    while IFS='=' read -r key value; do
        [[ "$key" =~ ^# ]] && continue
        [[ -z "$key" ]] && continue
        value="${value%\"}"
        value="${value#\"}"
        env_flags+=(-e "$key=$value")
    done < "$ENV_FILE"
    
    docker run --rm "${env_flags[@]}" -p 8000:8000 "$IMAGE_NAME"
}

main() {
    local command="${2:-build}"
    
    load_env_file "$ENV_FILE"
    
    case "$command" in
        build)
            build_image
            ;;
        run)
            build_image
            run_container
            ;;
        *)
            echo "Usage: $0 [.env file] [build|run]"
            echo "  build - only build the image (default)"
            echo "  run   - build and run the container"
            exit 1
            ;;
    esac
}

main "$@"