//! Application-wide managed state.
//!
//! ## Managed state
//!
//! | Type             | Description                                    | Scope        |
//! |------------------|------------------------------------------------|--------------|
//! | `SharedResolver` | NAP resolver (nap-core) — nap:// URI → manifest | Read-only    |
//! | `LorePath`       | Base path under which universe repos live      | Read-only    |
//! | `ApiBaseUrl`     | FastAPI remote endpoint URL                    | Read-only    |
//!
//! The resolver uses `DesktopLoreBackend` — a local VCS backend that
//! stores commit history in `.nap/objects/` and syncs content blobs
//! with lore-server via HTTP.

use std::path::PathBuf;
use std::sync::Arc;

use nap_core::vcs::VcsBackend;
use nap_core::Resolver;

use crate::backend::local_vcs::DesktopLoreBackend;

/// Managed state: the NAP resolver (thread-safe, read-only).
pub type SharedResolver = Arc<Resolver>;

/// Newtype wrapper so the type system distinguishes `lore_path` from
/// other `PathBuf` values in Tauri's managed state.
#[derive(Clone)]
#[allow(dead_code)]
pub struct LorePath(pub PathBuf);

/// Newtype wrapper for the remote FastAPI base URL.
#[derive(Clone)]
#[allow(dead_code)]
pub struct ApiBaseUrl(pub String);

/// VCS backend factory: creates a new `DesktopLoreBackend` per repo.
fn vcs_factory() -> Box<dyn VcsBackend> {
    Box::new(DesktopLoreBackend::new())
}

/// Create a shared Resolver pointed at the repos root directory.
///
/// The repos root is `{lore_path}/repos/`. Each subdirectory represents
/// a universe (e.g. `starwars/`, `toystory/`).
///
/// Call once at app startup and pass to `.manage()`.
pub fn create_resolver(lore_path: &std::path::Path) -> SharedResolver {
    let repos_root = lore_path.join("repos");
    Arc::new(Resolver::with_vcs_factory(&repos_root, vcs_factory))
}
