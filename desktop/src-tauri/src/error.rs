//! Typed error type for all Tauri commands.
//! Maps errors from nap-core, reqwest, I/O, and the content client
//! into a serializable form that crosses the IPC boundary.

use serde::Serialize;
use serde::Serializer;

/// Unified error type returned by every Tauri command.
///
/// Variants map to distinct error categories the frontend can
/// handle differently (e.g., showing a "repo not found" vs
/// "network error" vs "auth required" message).
#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("Repository error: {0}")]
    Repo(String),

    #[error("Asset error: {0}")]
    Asset(String),

    #[error("VCS error: {0}")]
    Vcs(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("I/O error: {0}")]
    Io(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("{0}")]
    Other(String),
}

// ---- Serialize for Tauri IPC ----
// Tauri requires command errors to implement Serialize.
// We serialize as a plain string for the frontend.

impl Serialize for CommandError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

// ---- Conversion from nap_core errors ----
// These blanket impls let Tauri commands use `?` to propagate
// nap-core errors directly into CommandError.

impl From<nap_core::NapError> for CommandError {
    fn from(e: nap_core::NapError) -> Self {
        match e {
            nap_core::NapError::RepositoryNotFound(path) => {
                CommandError::NotFound(format!("Repository not found: {}", path))
            }
            nap_core::NapError::RepositoryAlreadyExists(path) => {
                CommandError::Repo(format!("Repository already exists: {}", path))
            }
            nap_core::NapError::UniverseNotFound(name) => {
                CommandError::NotFound(format!("Universe not found: {}", name))
            }
            nap_core::NapError::ManifestNotFound(path) => {
                CommandError::NotFound(format!("Manifest not found: {}", path))
            }
            nap_core::NapError::VcsError(msg) => CommandError::Vcs(msg),
            nap_core::NapError::Io(inner) => CommandError::Io(inner.to_string()),
            nap_core::NapError::MergeConflict { path, details } => {
                CommandError::Conflict(format!("Merge conflict at {}: {}", path, details))
            }
            nap_core::NapError::InvalidUri { uri, reason } => {
                CommandError::Repo(format!("Invalid URI '{}': {}", uri, reason))
            }
            nap_core::NapError::ContentHashMismatch { expected, actual } => {
                CommandError::Asset(format!(
                    "Content hash mismatch: expected {}, got {}",
                    expected, actual
                ))
            }
            nap_core::NapError::PermissionDenied(msg) => {
                CommandError::Other(format!("Permission denied: {}", msg))
            }
            other => CommandError::Other(other.to_string()),
        }
    }
}

impl From<std::io::Error> for CommandError {
    fn from(e: std::io::Error) -> Self {
        CommandError::Io(e.to_string())
    }
}

impl From<reqwest::Error> for CommandError {
    fn from(e: reqwest::Error) -> Self {
        CommandError::Network(format!("HTTP request failed: {}", e))
    }
}

impl From<serde_json::Error> for CommandError {
    fn from(e: serde_json::Error) -> Self {
        CommandError::Other(format!("JSON error: {}", e))
    }
}

impl From<crate::backend::content::ContentError> for CommandError {
    fn from(e: crate::backend::content::ContentError) -> Self {
        match e {
            crate::backend::content::ContentError::NotInitialized(msg) => {
                CommandError::Other(format!("Content client not initialised: {}", msg))
            }
            crate::backend::content::ContentError::Http(msg) => {
                CommandError::Network(format!("Content HTTP error: {}", msg))
            }
            crate::backend::content::ContentError::Server(status, body) => {
                CommandError::Network(format!(
                    "Content server error ({}): {}",
                    status, body
                ))
            }
            crate::backend::content::ContentError::NotFound(addr) => {
                CommandError::NotFound(format!("Content not found: {}", addr))
            }
        }
    }
}
