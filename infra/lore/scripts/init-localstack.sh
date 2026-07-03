#!/bin/bash
# =============================================================================
# LocalStack Init Script — creates S3 bucket and DynamoDB tables for Lore
# =============================================================================
#
# This script runs when LocalStack starts (via /etc/localstack/init/ready.d/)
# and creates the infrastructure needed by the Lore AWS immutable store.
#
# It is idempotent — safe to re-run.
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Region-agnostic init script.
#
# The AWS CLI uses AWS_DEFAULT_REGION from the container environment (set
# in docker-compose.yml via the env var of the same name).  No hardcoded
# --region flags — deploy to any region and this Just Works.
# ---------------------------------------------------------------------------
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"
export AWS_DEFAULT_REGION

echo "=== LocalStack init: Creating Lore infrastructure (region: ${AWS_DEFAULT_REGION}) ==="

AWS="aws --endpoint-url=http://localhost:4566"

# ---------------------------------------------------------------------------
# S3 Bucket — fragment payloads
# ---------------------------------------------------------------------------
BUCKET="portals-dev"
if ! $AWS s3 ls "s3://${BUCKET}" 2>/dev/null; then
    echo "Creating S3 bucket: ${BUCKET}"
    $AWS s3 mb "s3://${BUCKET}"
else
    echo "S3 bucket already exists: ${BUCKET}"
fi

# ---------------------------------------------------------------------------
# DynamoDB Tables — fragment metadata and associations
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# DynamoDB Table 1: Fragment Index
#   Partition key:  hash (Binary)  — fragment content hash (SHA-256)
#   Sort key:       repository_context (Binary) — repository + address context
#
# This table maps fragment hashes to their repository context. It enables
# querying all fragments belonging to a repository, or by hash alone.
# See: lore-aws/src/store/immutable_store.rs, struct FragmentsEntry
# ---------------------------------------------------------------------------
FRAGMENTS_TABLE="portals-fragments-dev"
if ! $AWS dynamodb describe-table --table-name "${FRAGMENTS_TABLE}" 2>/dev/null; then
    echo "Creating DynamoDB table: ${FRAGMENTS_TABLE}"
    $AWS dynamodb create-table \
        --table-name "${FRAGMENTS_TABLE}" \
        --key-schema \
            AttributeName=hash,KeyType=HASH \
            AttributeName=repository_context,KeyType=RANGE \
        --attribute-definitions \
            AttributeName=hash,AttributeType=B \
            AttributeName=repository_context,AttributeType=B \
        --billing-mode PAY_PER_REQUEST
else
    echo "DynamoDB table already exists: ${FRAGMENTS_TABLE}"
fi

# ---------------------------------------------------------------------------
# DynamoDB Table 2: Fragment Metadata
#   Partition key:  hash (Binary)  — fragment content hash (SHA-256)
#   No sort key  (each hash has at most one metadata entry)
#
# This table stores fragment metadata (size, flags, compression, etc.).
# See: lore-aws/src/store/immutable_store.rs, struct FragmentMetadataEntry
# ---------------------------------------------------------------------------
METADATA_TABLE="portals-fragment-metadata-dev"
if ! $AWS dynamodb describe-table --table-name "${METADATA_TABLE}" 2>/dev/null; then
    echo "Creating DynamoDB table: ${METADATA_TABLE}"
    $AWS dynamodb create-table \
        --table-name "${METADATA_TABLE}" \
        --key-schema \
            AttributeName=hash,KeyType=HASH \
        --attribute-definitions \
            AttributeName=hash,AttributeType=B \
        --billing-mode PAY_PER_REQUEST
else
    echo "DynamoDB table already exists: ${METADATA_TABLE}"
fi

echo "=== LocalStack init complete ==="
