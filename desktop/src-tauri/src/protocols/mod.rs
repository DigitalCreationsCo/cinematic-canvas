//! URI scheme protocol handlers.
//!
//! Both `asset://` and `nap://` protocol handlers have been removed.
//! Assets and NAP URIs are now handled exclusively through typed Tauri
//! commands (`invoke()`) rather than URI interception.
//!
//! See commands::repo and commands::asset for the replacement.
