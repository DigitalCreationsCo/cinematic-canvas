//! Tauri commands for repository and entity operations.
//!
//! Each command is async and dispatches synchronous nap-core / VCS
//! work via `tokio::task::spawn_blocking` to avoid hogging the async
//! executor.
//!
//! nap-core reference:
//!   - Resolver:    URI → manifest resolution
//!   - Repository:  filesystem entity CRUD (uses VcsBackend internally)
//!   - VcsBackend:  low-level VCS ops (commit, push, pull, branches)

use std::path::PathBuf;
use std::sync::Arc;

use nap_core::vcs::VcsBackend;
use nap_core::{NapUri, Repository, ResolveOptions};
use serde::{Deserialize, Serialize};
use tauri::{command, State};

use crate::backend::local_vcs::DesktopLoreBackend;
use crate::error::CommandError;
use crate::state::SharedResolver;

// ─── Cross-IPC types ───────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct RepoInfo {
    pub path: String,
    pub universe: String,
    pub current_branch: String,
    pub head: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EntitySummary {
    pub uri: String,
    pub name: String,
    pub entity_type: String,
    pub version: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Entity {
    pub uri: String,
    pub name: String,
    pub entity_type: String,
    pub version: u64,
    pub properties: serde_json::Value,
    pub references: serde_json::Value,
    pub representations: serde_json::Value,
    pub head: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PullResult {
    pub commit_hash: String,
    pub changes: Vec<Change>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Change {
    pub path: String,
    pub action: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RepoStatus {
    pub current_branch: String,
    pub head: String,
    pub branches: Vec<String>,
    pub tags: Vec<String>,
}

// ─── Helpers ───────────────────────────────────────────────────────

/// Open a nap-core Repository at `repo_root` using DesktopLoreBackend.
fn open_repo(repo_root: &str) -> Result<Repository, CommandError> {
    let path = PathBuf::from(repo_root);
    let vcs: Box<dyn VcsBackend> = Box::new(DesktopLoreBackend::new());
    Repository::open(&path, vcs).map_err(CommandError::from)
}

// ─── Commands ──────────────────────────────────────────────────────

/// Initialise a new NAP repository for the given universe.
#[command]
pub async fn nap_init_repo(
    repo_root: String,
    universe: String,
) -> Result<RepoInfo, CommandError> {
    let root = repo_root.clone();
    let uni = universe.clone();

    let info = tokio::task::spawn_blocking(move || -> Result<RepoInfo, CommandError> {
        let path = PathBuf::from(&root);
        let vcs: Box<dyn VcsBackend> = Box::new(DesktopLoreBackend::new());
        let repo = Repository::init(&path, &uni, vcs)?;
        let branch = repo.vcs().current_branch(&repo.root)?;
        let head = repo.vcs().head_hash(&repo.root)?;

        Ok(RepoInfo {
            path: repo.root.to_string_lossy().to_string(),
            universe: repo.universe,
            current_branch: branch,
            head,
        })
    })
    .await
    .map_err(|e| CommandError::Other(format!("Task join error: {}", e)))??;

    Ok(info)
}

/// Open an existing NAP repository.
///
/// TODO(low): `_universe` parameter is accepted but never validated against the
/// repo on disk. Consider removing it since the universe is embedded in the
/// repository's config and returned via RepoInfo.universe.
#[command]
pub async fn nap_open_repo(
    repo_root: String,
    _universe: String,
) -> Result<RepoInfo, CommandError> {
    let root = repo_root.clone();

    let info = tokio::task::spawn_blocking(move || -> Result<RepoInfo, CommandError> {
        let repo = open_repo(&root)?;
        let branch = repo.vcs().current_branch(&repo.root)?;
        let head = repo.vcs().head_hash(&repo.root)?;

        Ok(RepoInfo {
            path: repo.root.to_string_lossy().to_string(),
            universe: repo.universe,
            current_branch: branch,
            head,
        })
    })
    .await
    .map_err(|e| CommandError::Other(format!("Task join error: {}", e)))??;

    Ok(info)
}

/// List all entities in a universe, optionally filtered by entity_type.
#[command]
pub async fn nap_list_entities(
    repo_root: String,
    universe: String,
    entity_type: Option<String>,
) -> Result<Vec<EntitySummary>, CommandError> {
    use nap_core::EntityType;

    let root = repo_root.clone();

    let entities = tokio::task::spawn_blocking(move || -> Result<Vec<EntitySummary>, CommandError> {
        let repo = open_repo(&root)?;

        // Validate universe matches
        if repo.universe != universe {
            return Err(CommandError::NotFound(format!(
                "Universe '{}' not found at path '{}'",
                universe, root
            )));
        }

        // Determine which entity types to list
        let types: Vec<EntityType> = match entity_type.as_deref() {
            Some(t) => {
                let et = t.parse::<EntityType>()
                    .map_err(|_| CommandError::Repo(format!("Invalid entity type: {}", t)))?;
                vec![et]
            }
            None => EntityType::subdirectory_types().to_vec(),
        };

        let mut summaries = Vec::new();

        for et in &types {
            let ids = repo.list_entities(*et)?;
            for id in ids {
                // Try to read minimal info from the manifest
                if let Ok(manifest) = repo.read_manifest(*et, &id) {
                    summaries.push(EntitySummary {
                        uri: manifest.id.clone(),
                        name: manifest.name.clone(),
                        entity_type: et.to_string(),
                        version: manifest.version as u32,
                    });
                } else {
                    summaries.push(EntitySummary {
                        uri: format!("nap://{}/{}/{}", universe, et.directory_name(), id),
                        name: id.clone(),
                        entity_type: et.to_string(),
                        version: 0,
                    });
                }
            }
        }

        Ok(summaries)
    })
    .await
    .map_err(|e| CommandError::Other(format!("Task join error: {}", e)))??;

    Ok(entities)
}

/// Read a single entity by its `nap://` URI.
#[command]
pub async fn nap_read_entity(
    resolver: State<'_, SharedResolver>,
    uri: String,
) -> Result<Entity, CommandError> {
    let resolver = Arc::clone(&resolver);
    let uri_clone = uri.clone();

    let entity = tokio::task::spawn_blocking(move || -> Result<Entity, CommandError> {
        let result = resolver.resolve(&uri_clone, &ResolveOptions::default())?;
        match result {
            nap_core::resolver::ResolveResult::Full(manifest) => {
                let properties = serde_json::to_value(&manifest.properties).map_err(|e| {
                    CommandError::Other(format!("Failed to serialize entity properties: {}", e))
                })?;
                let references = serde_json::to_value(&manifest.references).map_err(|e| {
                    CommandError::Other(format!("Failed to serialize entity references: {}", e))
                })?;
                let representations = serde_json::to_value(&manifest.representations).map_err(
                    |e| CommandError::Other(format!("Failed to serialize entity representations: {}", e)),
                )?;
                Ok(Entity {
                    uri: uri_clone,
                    name: manifest.name.clone(),
                    entity_type: manifest.entity_type.to_string(),
                    version: manifest.version,
                    properties,
                    references,
                    representations,
                    head: manifest.head.clone(),
                })
            }
            nap_core::resolver::ResolveResult::Subtree(value) => Ok(Entity {
                uri: uri_clone,
                name: "subtree".into(),
                entity_type: "query".into(),
                version: 0,
                properties: value,
                references: serde_json::Value::Null,
                representations: serde_json::Value::Null,
                head: None,
            }),
        }
    })
    .await
    .map_err(|e| CommandError::Other(format!("Task join error: {}", e)))??;

    Ok(entity)
}

/// Write (create or update) an entity manifest in the working tree.
/// Changes remain uncommitted until `nap_commit` is called.
///
/// TODO(low): `_universe` parameter is accepted but never validated against the
/// repo on disk. Consider removing it since the universe is embedded in the
/// entity's URI and inferred from the repository config.
#[command]
pub async fn nap_write_entity(
    repo_root: String,
    _universe: String,
    entity: Entity,
) -> Result<(), CommandError> {
    let root = repo_root.clone();
    // Parse the URI to get entity type and id
    let uri = entity.uri.clone();

    tokio::task::spawn_blocking(move || -> Result<(), CommandError> {
        let repo = open_repo(&root)?;

        // Parse the nap:// URI to get entity type + id
        let nap_uri: NapUri = uri.parse()
            .map_err(|e| CommandError::Other(format!("Invalid URI: {}", e)))?;

        // Construct a Manifest from the Entity data
        // Read existing manifest if it exists, otherwise create new
        let mut manifest = match repo.read_manifest(nap_uri.entity_type, &nap_uri.entity_id) {
            Ok(m) => m,
            Err(_) => {
                nap_core::Manifest::new(
                    &nap_uri.universe,
                    nap_uri.entity_type,
                    &nap_uri.entity_id,
                    &entity.name,
                )
            }
        };

        // Apply properties from the incoming entity (JSON → YAML)
        if let serde_json::Value::Object(props) = &entity.properties {
            for (key, val) in props {
                // JSON → string → YAML round-trip is safe because JSON is valid YAML.
                let json_str = serde_json::to_string(val).map_err(|e| {
                    CommandError::Other(format!(
                        "Failed to serialize property '{}': {}",
                        key, e
                    ))
                })?;
                let yaml_val: serde_yaml::Value = serde_yaml::from_str(&json_str).map_err(|e| {
                    CommandError::Other(format!(
                        "Failed to convert property '{}' to YAML: {}",
                        key, e
                    ))
                })?;
                manifest.set_property(key, yaml_val);
            }
        }

        // Apply references
        if let serde_json::Value::Object(refs) = &entity.references {
            for (key, val) in refs {
                let json_str = serde_json::to_string(val).map_err(|e| {
                    CommandError::Other(format!(
                        "Failed to serialize reference '{}': {}",
                        key, e
                    ))
                })?;
                let yaml_val: serde_yaml::Value = serde_yaml::from_str(&json_str).map_err(|e| {
                    CommandError::Other(format!(
                        "Failed to convert reference '{}' to YAML: {}",
                        key, e
                    ))
                })?;
                manifest.add_reference(key, yaml_val);
            }
        }

        // Write manifest to working tree (no commit)
        repo.write_manifest(&manifest)?;

        Ok(())
    })
    .await
    .map_err(|e| CommandError::Other(format!("Task join error: {}", e)))??;

    Ok(())
}

/// Commit all working-tree changes. Returns the BLAKE3 commit hash.
#[command]
pub async fn nap_commit(
    repo_root: String,
    message: String,
) -> Result<String, CommandError> {
    let root = repo_root.clone();
    let msg = message.clone();

    let hash = tokio::task::spawn_blocking(move || -> Result<String, CommandError> {
        let repo = open_repo(&root)?;
        let commit_hash = repo.vcs().commit(&repo.root, &msg, "desktop-user")?;
        Ok(commit_hash)
    })
    .await
    .map_err(|e| CommandError::Other(format!("Task join error: {}", e)))??;

    Ok(hash)
}

/// Pull content objects from lore-server.
///
/// Uses the VCS backend's `pull` method which downloads content objects
/// from lore-server's content-addressed store.
#[command]
pub async fn nap_pull(
    repo_root: String,
) -> Result<PullResult, CommandError> {
    let root = repo_root.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<PullResult, CommandError> {
        let repo = open_repo(&root)?;
        // TODO(medium): `.ok()` silently discards head_hash errors. If the repo
        // is corrupted, the user gets an empty commit_hash with no error feedback.
        let _head_before = repo.vcs().head_hash(&repo.root).ok();
        repo.vcs().pull(&repo.root, None, None)?;
        // TODO(medium): Same silent discard as above.
        let head_after = repo.vcs().head_hash(&repo.root).ok();

        Ok(PullResult {
            commit_hash: head_after.unwrap_or_default(),
            changes: vec![],
        })
    })
    .await
    .map_err(|e| CommandError::Other(format!("Task join error: {}", e)))??;

    Ok(result)
}

/// Push local content objects to lore-server.
///
/// Uses the VCS backend's `push` method which uploads local objects
/// to lore-server's content-addressed store.
#[command]
pub async fn nap_push(
    repo_root: String,
) -> Result<String, CommandError> {
    let root = repo_root.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, CommandError> {
        let repo = open_repo(&root)?;
        repo.vcs().push(&repo.root, None, None)?;
        Ok("pushed".to_string())
    })
    .await
    .map_err(|e| CommandError::Other(format!("Task join error: {}", e)))??;

    Ok(result)
}

/// Show repository status — current branch, HEAD, branches, tags.
#[command]
pub async fn nap_status(
    repo_root: String,
) -> Result<RepoStatus, CommandError> {
    let root = repo_root.clone();

    let status = tokio::task::spawn_blocking(move || -> Result<RepoStatus, CommandError> {
        let repo = open_repo(&root)?;
        let branch = repo.vcs().current_branch(&repo.root)?;
        let head = repo.vcs().head_hash(&repo.root)?;
        let branches = repo.vcs().list_branches(&repo.root)?;
        let tags = repo.vcs().list_tags(&repo.root)?;

        Ok(RepoStatus {
            current_branch: branch,
            head,
            branches,
            tags,
        })
    })
    .await
    .map_err(|e| CommandError::Other(format!("Task join error: {}", e)))??;

    Ok(status)
}
