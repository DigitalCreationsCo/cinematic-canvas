//! Tauri commands for asset import and resolution via lore-server's HTTP
//! content-addressed store.
//!
//! Assets are stored as content-addressed blobs in lore-server:
//!   - `nap_import_asset` → HTTP PUT  → returns BLAKE3 content hash
//!   - `nap_resolve_asset` → HTTP GET → writes to local path, returns path

use serde::{Deserialize, Serialize};
use tauri::command;

use crate::backend::content;
use crate::error::CommandError;

// ─── Cross-IPC types ───────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct AssetImportResult {
    /// BLAKE3 content hash (hex), used as the content address.
    pub blake3: String,
    /// Size in bytes.
    pub size_bytes: u64,
}

// ─── Commands ──────────────────────────────────────────────────────

/// Import an asset from the local filesystem into lore-server's
/// content-addressed store.
///
/// 1. Reads the file from `source_path`.
/// 2. Computes BLAKE3 hash client-side (matching lore-server's scheme).
/// 3. Uploads the content to lore-server via HTTP PUT.
/// 4. Returns the hash + metadata so the frontend can create NAP entity
///    references pointing at the asset.
#[command]
pub async fn nap_import_asset(
    repo_root: String,
    source_path: String,
) -> Result<AssetImportResult, CommandError> {
    let src = std::path::PathBuf::from(&source_path);

    if !src.exists() {
        return Err(CommandError::NotFound(format!(
            "Source file not found: {}",
            source_path
        )));
    }

    // Read file
    let contents = tokio::fs::read(&src)
        .await
        .map_err(|e| CommandError::Io(e.to_string()))?;

    // Compute BLAKE3 hash client-side (matches lore-server scheme)
    let hash = blake3::hash(&contents);
    let hash_hex = hash.to_hex().to_string();
    let file_len = contents.len() as u64;

    // Derive repo_id from repo_root (last path component)
    let repo_id = std::path::Path::new(&repo_root)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("default");

    // Upload to lore-server content store
    content::put_content(repo_id, &contents).await?;

    // Also write a local working copy under assets/ for quick access
    let assets_dir = std::path::PathBuf::from(&repo_root).join("assets");
    tokio::fs::create_dir_all(&assets_dir)
        .await
        .map_err(|e| CommandError::Io(e.to_string()))?;

    let dest_path = assets_dir.join(&hash_hex);
    tokio::fs::write(&dest_path, &contents)
        .await
        .map_err(|e| CommandError::Io(e.to_string()))?;

    Ok(AssetImportResult {
        blake3: hash_hex,
        size_bytes: file_len,
    })
}

/// Resolve an asset by its BLAKE3 content address.
///
/// First checks the local `assets/` directory in the repo; if not found,
/// downloads from lore-server's content API and caches locally.
/// Returns the local filesystem path to the resolved asset.
#[command]
pub async fn nap_resolve_asset(
    repo_root: String,
    hash: String,
) -> Result<String, CommandError> {
    let assets_dir = std::path::PathBuf::from(&repo_root).join("assets");
    let local_path = assets_dir.join(&hash);

    // Check local cache first
    if local_path.exists() {
        return Ok(local_path.to_string_lossy().to_string());
    }

    // Derive repo_id from repo_root
    let repo_id = std::path::Path::new(&repo_root)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("default");

    // Download from lore-server
    let data = content::get_content(repo_id, &hash).await?;

    // Cache locally
    tokio::fs::create_dir_all(&assets_dir)
        .await
        .map_err(|e| CommandError::Io(e.to_string()))?;
    tokio::fs::write(&local_path, &data)
        .await
        .map_err(|e| CommandError::Io(e.to_string()))?;

    Ok(local_path.to_string_lossy().to_string())
}
