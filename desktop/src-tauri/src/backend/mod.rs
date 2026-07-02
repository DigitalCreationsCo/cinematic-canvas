//! Backend transport layer for lore-server communication.
//!
//! Two sub-modules:
//! - `local_vcs` — local VcsBackend implementation that stores VCS state
//!   in `.nap/` directory and syncs content with lore-server via HTTP.
//! - `content` — HTTP client for lore-server's REST content API (asset
//!   get/put). Uses reqwest.

pub mod content;
pub mod local_vcs;
