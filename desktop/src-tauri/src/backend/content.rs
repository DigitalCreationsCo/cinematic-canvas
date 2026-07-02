//! HTTP content client for lore-server's content-addressed blob storage.
//!
//! lore-server exposes a REST content API:
//!   PUT /v1/repository/{repository_id}/content/   — upload blob
//!   GET /v1/repository/{repository_id}/content/{address} — download blob
//!
//! All blobs are addressed by their BLAKE3 hash (hex-encoded, lowercase).
//! The client uses reqwest and can be configured with a JWT auth token.

use std::sync::OnceLock;

/// The lore-server HTTP base URL (e.g., "http://localhost:41339").
static HTTP_BASE: OnceLock<String> = OnceLock::new();

/// The JWT auth token for lore-server HTTP requests.
static AUTH_TOKEN: OnceLock<String> = OnceLock::new();

/// Initialise the content client with the lore-server HTTP URL and optional token.
///
/// TODO(medium): Uses `OnceLock` which silently ignores subsequent calls.
/// If the lore-server URL or auth token changes at runtime, re-init will be
/// silently ignored. Consider using `std::sync::RwLock` instead if re-init
/// is needed, or guard against double-call at the call site.
pub fn init_content_client(http_url: &str, auth_token: Option<&str>) {
    HTTP_BASE.set(http_url.to_string()).ok();
    if let Some(token) = auth_token {
        AUTH_TOKEN.set(token.to_string()).ok();
    }
}

/// Build a reqwest client with auth headers (if configured).
fn client() -> reqwest::Client {
    reqwest::Client::new()
}

/// Build auth headers if a token is set.
fn auth_header() -> Option<(String, String)> {
    AUTH_TOKEN.get().map(|token| {
        ("Authorization".to_string(), format!("Bearer {}", token))
    })
}

/// Upload content to lore-server's content-addressed store.
///
/// Returns the BLAKE3 content address (hex string) on success.
/// The hash is computed client-side to match what lore-server would compute.
pub async fn put_content(repo_id: &str, data: &[u8]) -> Result<String, ContentError> {
    let base = HTTP_BASE
        .get()
        .ok_or_else(|| ContentError::NotInitialized("HTTP base URL not set".into()))?;

    // Compute the BLAKE3 hash client-side — matches lore-server's scheme
    let hash = blake3::hash(data);
    let address = hash.to_hex().to_string();

    let url = format!("{}/v1/repository/{}/content/", base, repo_id);

    let mut req = client().put(&url).body(data.to_vec());
    if let Some((key, val)) = auth_header() {
        req = req.header(&key, &val);
    }

    let resp = req.send().await.map_err(|e| ContentError::Http(e.to_string()))?;

    let status = resp.status();
    if !status.is_success() {
        // TODO(medium): If reading the response body fails, the error
        // message shows an empty string. Consider logging the failure
        // separately or including a fallback message.
        let body = resp.text().await.unwrap_or_default();
        return Err(ContentError::Server(status.as_u16(), body));
    }

    Ok(address)
}

/// Download content from lore-server's content-addressed store by address.
pub async fn get_content(repo_id: &str, address: &str) -> Result<Vec<u8>, ContentError> {
    let base = HTTP_BASE
        .get()
        .ok_or_else(|| ContentError::NotInitialized("HTTP base URL not set".into()))?;

    let url = format!(
        "{}/v1/repository/{}/content/{}",
        base, repo_id, address
    );

    let mut req = client().get(&url);
    if let Some((key, val)) = auth_header() {
        req = req.header(&key, &val);
    }

    let resp = req.send().await.map_err(|e| ContentError::Http(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(ContentError::NotFound(address.to_string()));
    }

    let bytes = resp.bytes().await.map_err(|e| ContentError::Http(e.to_string()))?;
    Ok(bytes.to_vec())
}

// ─── Error type ───

#[derive(Debug, thiserror::Error)]
pub enum ContentError {
    #[error("Content client not initialised: {0}")]
    NotInitialized(String),

    #[error("HTTP request failed: {0}")]
    Http(String),

    #[error("Server returned {0}: {1}")]
    Server(u16, String),

    #[error("Content not found: {0}")]
    NotFound(String),
}
