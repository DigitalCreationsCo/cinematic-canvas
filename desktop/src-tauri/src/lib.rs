//! Portals Desktop — Tauri Application Shell
//!
//! ### Architecture
//!
//! ```text
//! React (WebView)
//!   │  invoke('nap_command', { ...args })
//!   ▼
//! Tauri Command Handler (Rust)      ←  src/commands/
//!   │  nap_core::Resolver               (read entity manifests)
//!   │  DesktopLoreBackend               (local VCS + push/pull content)
//!   │  LoreContentClient                (HTTP content API)
//!   ▼
//! lore-server (content-addressed blob store) — HTTP REST
//! ```
//!
//! ### Managed state
//!
//! Three values are managed by Tauri:
//!   1. `SharedResolver` — Arc<nap_core::Resolver>    — nap:// URI resolution
//!   2. `LorePath`       — newtype(PathBuf)            — repos base directory
//!   3. `ApiBaseUrl`     — newtype(String)             — FastAPI remote URL
//!
//! No URI scheme protocol handlers are registered. All data flows through
//! typed `invoke()` calls.

mod backend;
mod commands;
mod error;
mod protocols;
mod state;

use state::{ApiBaseUrl, LorePath};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ── Determine repos base directory ──
    let lore_path = std::env::var("PORTALS_LORE_PATH")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .unwrap_or_default()
                .join(".nap")
                .join("lore")
        });

    // ── FastAPI remote endpoint ──
    let api_base_url = std::env::var("PORTALS_API_URL")
        .unwrap_or_else(|_| "http://localhost:8000".to_string());

    // ── lore-server HTTP content endpoint ──
    // The lore-server HTTP API runs on port 41339 by default.
    let lore_http_url = std::env::var("NAP_LORE_HTTP_URL")
        .unwrap_or_else(|_| "http://localhost:41339".to_string());

    // Optional JWT auth token for lore-server HTTP requests.
    let lore_auth_token = std::env::var("LORE_AUTH_TOKEN").ok();

    // ── Initialise content client ──
    backend::content::init_content_client(&lore_http_url, lore_auth_token.as_deref());

    // ── Initialise nap-core Resolver (DesktopLoreBackend) ──
    let resolver = state::create_resolver(&lore_path);

    // ── Build Tauri application ──
    let lore_path_for_setup = lore_path.clone();
    let api_base_url_for_setup = api_base_url.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // ── Managed state ──
        .manage(resolver)                              // SharedResolver
        .manage(LorePath(lore_path))                   // repos base dir
        .manage(ApiBaseUrl(api_base_url))              // FastAPI URL
        .setup(move |_app| {
            #[cfg(debug_assertions)]
            {
                println!("Portals Desktop — debug build");
                println!("  Lore path:     {:?}", lore_path_for_setup);
                println!("  API URL:       {}", api_base_url_for_setup);
                println!("  Lore HTTP URL: {}", lore_http_url);
            }
            Ok(())
        })

        // ── Tauri Commands (React invoke() surface) ──
        .invoke_handler(tauri::generate_handler![
            // Repository & entity operations (9 commands)
            commands::repo::nap_init_repo,
            commands::repo::nap_open_repo,
            commands::repo::nap_list_entities,
            commands::repo::nap_read_entity,
            commands::repo::nap_write_entity,
            commands::repo::nap_commit,
            commands::repo::nap_pull,
            commands::repo::nap_push,
            commands::repo::nap_status,
            // Asset operations (2 commands)
            commands::asset::nap_import_asset,
            commands::asset::nap_resolve_asset,
        ])

        // ── NOTE: No URI scheme protocol handlers ──
        // Both `asset://` and `nap://` protocol handlers have been removed.
        // Frontend uses typed invoke() calls instead of URI interception.

        // ── Launch ──
        .run(tauri::generate_context!())
        .expect("error while running Portals Desktop");
}
