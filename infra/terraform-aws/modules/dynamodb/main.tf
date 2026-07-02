# =============================================================================
# DynamoDB Module — Lore Fragment Index and Metadata Tables
# =============================================================================
#
# Two tables required by the lore-aws plugin's AwsImmutableStore:
#
# 1. Fragment Index — maps fragment content hashes to their repository
#    context. Enables querying all fragments by hash or by hash+context.
#    Schema: hash (B, PK) + repository_context (B, SK)
#
# 2. Fragment Metadata — stores per-fragment metadata (size, compression,
#    flags). One entry per unique fragment hash.
#    Schema: hash (B, PK), no sort key
#
# See: lore-aws/src/store/immutable_store.rs
#
# =============================================================================

# ---------------------------------------------------------------------------
# Fragment Index Table
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "fragments" {
  name         = var.fragments_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "hash"
  range_key    = "repository_context"

  attribute {
    name = "hash"
    type = "B"
  }

  attribute {
    name = "repository_context"
    type = "B"
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name        = var.fragments_table_name
    Environment = var.environment
  })
}

# ---------------------------------------------------------------------------
# Fragment Metadata Table
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "metadata" {
  name         = var.metadata_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "hash"

  attribute {
    name = "hash"
    type = "B"
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Name        = var.metadata_table_name
    Environment = var.environment
  })
}
