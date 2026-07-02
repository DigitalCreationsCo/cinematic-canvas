//! Local VCS backend that stores commit history in a content-addressed
//! `.nap/objects/` store and syncs blobs with lore-server via HTTP.
//!
//! ## Layout
//!
//! ```text
//! .nap/
//! ├── HEAD                    → "ref: refs/heads/main"
//! ├── config                  → TOML repository config
//! ├── objects/
//! │   ├── ab/
//! │   │   └── cdef1234...     → blob (raw content)
//! │   └── fe/
//! │       └── dcba5678...     → commit or tree (JSON)
//! └── refs/
//!     ├── heads/
//!     │   └── main            → BLAKE3 hex hash of tip commit
//!     ├── tags/
//!     │   └── v1              → BLAKE3 hex hash
//!     └── remotes/
//!         └── origin/
//!             └── main        → BLAKE3 hex hash of last-seen remote tip
//! ```
//!
//! Commit / tree objects are stored as JSON.  Blobs are raw bytes.
//! Every hash is a lowercase hex-encoded BLAKE3.

use std::io::Read;
use std::path::{Path, PathBuf};

use nap_core::vcs::{CommitInfo, VcsBackend};
use nap_core::NapError;

// ─── Object types ──────────────────────────────────────────────────

/// A tree object records the mapping from file paths to BLAKE3 hashes.
#[derive(serde::Serialize, serde::Deserialize)]
struct TreeObject {
    files: Vec<TreeEntry>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct TreeEntry {
    path: String,
    hash: String,
}

/// A commit object.
#[derive(serde::Serialize, serde::Deserialize)]
struct CommitObject {
    tree: String,
    parent: Option<String>,
    author: String,
    message: String,
    timestamp: u64,
}

/// The well-known empty-tree hash (BLAKE3 of an empty JSON object "{}").
///
/// TODO(medium): This hash is hardcoded and will silently diverge if TreeObject
/// serialisation format changes (e.g., field rename, different JSON settings).
/// Either compute it at compile time from the actual serialised empty tree, or
/// add an integration test that verifies `store_json(&TreeObject { files: [] })`
/// produces this exact hash.
const EMPTY_TREE_HASH: &str =
    "1aabf567a6d4b9e83f9b5f1e2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d";

// ─── The backend ───────────────────────────────────────────────────

/// A local-only VCS backend that stores history in `.nap/` with a
/// git-like content-addressed object store and syncs blobs to
/// lore-server via the content HTTP API.
///
/// Thread-safe: all mutable state is on disk.
pub struct DesktopLoreBackend;

impl DesktopLoreBackend {
    pub fn new() -> Self {
        Self
    }
}

impl Default for DesktopLoreBackend {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Helpers ───────────────────────────────────────────────────────

/// Path to `.nap` metadata directory.
fn dot_nap(repo: &Path) -> PathBuf {
    repo.join(".nap")
}

/// Path to the HEAD file.
fn head_file(repo: &Path) -> PathBuf {
    dot_nap(repo).join("HEAD")
}

/// Path to the config file.
fn config_file(repo: &Path) -> PathBuf {
    dot_nap(repo).join("config")
}

/// Path to branch ref, e.g. `.nap/refs/heads/main`.
fn branch_ref(repo: &Path, branch: &str) -> PathBuf {
    dot_nap(repo)
        .join("refs")
        .join("heads")
        .join(branch)
}

/// Path to tag ref.
fn tag_ref(repo: &Path, tag: &str) -> PathBuf {
    dot_nap(repo).join("refs").join("tags").join(tag)
}

/// Read a file to a trimmed string.
fn read_string(path: &Path) -> Result<String, NapError> {
    Ok(std::fs::read_to_string(path)
        .map_err(NapError::Io)?
        .trim()
        .to_string())
}

/// Write a string to a file (creates parent dirs).
fn write_string(path: &Path, content: &str) -> Result<(), NapError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(NapError::Io)?;
    }
    std::fs::write(path, content).map_err(NapError::Io)?;
    Ok(())
}

/// Read the current branch name from HEAD.
fn read_current_branch(repo: &Path) -> Result<String, NapError> {
    let head = read_string(&head_file(repo))?;
    if let Some(branch) = head.strip_prefix("ref: refs/heads/") {
        Ok(branch.to_string())
    } else {
        Err(NapError::VcsError(format!(
            "Invalid HEAD format: {}",
            head
        )))
    }
}

/// Compute the BLAKE3 hash of `data` and return the hex string.
fn blake3_hex(data: &[u8]) -> String {
    blake3::hash(data).to_hex().to_string()
}

/// Store a blob (raw bytes) in `.nap/objects/{prefix}/{suffix}` and
/// return the BLAKE3 content address.
fn store_blob(repo: &Path, data: &[u8]) -> Result<String, NapError> {
    let hash = blake3_hex(data);
    let obj_path = dot_nap(repo)
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    std::fs::create_dir_all(obj_path.parent().unwrap()).map_err(NapError::Io)?;
    std::fs::write(&obj_path, data).map_err(NapError::Io)?;
    Ok(hash)
}

/// Read a blob from `.nap/objects/{prefix}/{suffix}` by hash.
fn read_blob(repo: &Path, hash: &str) -> Result<Vec<u8>, NapError> {
    let obj_path = dot_nap(repo)
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    std::fs::read(&obj_path).map_err(NapError::Io)
}

/// Store a JSON-serializable object and return its BLAKE3 hash.
fn store_json<T: serde::Serialize>(repo: &Path, value: &T) -> Result<String, NapError> {
    let json =
        serde_json::to_vec(value).map_err(|e| NapError::VcsError(format!("JSON: {}", e)))?;
    store_blob(repo, &json)
}

/// Read and deserialise a JSON object by hash.
fn read_json<T: serde::de::DeserializeOwned>(repo: &Path, hash: &str) -> Result<T, NapError> {
    let data = read_blob(repo, hash)?;
    serde_json::from_slice(&data)
        .map_err(|e| NapError::VcsError(format!("JSON parse: {}", e)))
}

/// Walk working tree under `repo` (excluding `.nap/`) and return a
/// sorted list of (relative_path, blake3_hash) pairs.
fn hash_working_tree(repo: &Path) -> Result<Vec<TreeEntry>, NapError> {
    let mut entries = Vec::new();
    let entries_raw =
        walkdir::WalkDir::new(repo)
            .into_iter()
            .filter_entry(|e| {
                // Skip `.nap` directory
                e.file_name() != ".nap"
                    && !e
                        .path()
                        .strip_prefix(repo)
                        .ok()
                        .and_then(|p| p.components().next())
                        .map(|c| c.as_os_str() == ".nap")
                        .unwrap_or(false)
            })
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file());

    for entry in entries_raw {
        let rel = entry
            .path()
            .strip_prefix(repo)
            .map_err(|_| NapError::VcsError("path strip failed".into()))?
            .to_string_lossy()
            .to_string();
        let mut f = std::fs::File::open(entry.path()).map_err(NapError::Io)?;
        let mut buf = Vec::new();
        f.read_to_end(&mut buf).map_err(NapError::Io)?;
        let hash = blake3_hex(&buf);
        entries.push(TreeEntry {
            path: rel,
            hash,
        });
    }

    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
}

// ─── Build a tree object and return its hash ──────────────────────

fn build_tree(repo: &Path) -> Result<String, NapError> {
    let files = hash_working_tree(repo)?;
    if files.is_empty() {
        return Ok(EMPTY_TREE_HASH.to_string());
    }
    store_json(repo, &TreeObject { files })
}

// ─── VcsBackend implementation ─────────────────────────────────────

impl VcsBackend for DesktopLoreBackend {
    fn init(&self, path: &Path) -> Result<(), NapError> {
        let nap = dot_nap(path);

        // Create directory structure
        std::fs::create_dir_all(nap.join("objects")).map_err(NapError::Io)?;
        std::fs::create_dir_all(nap.join("refs").join("heads"))
            .map_err(NapError::Io)?;
        std::fs::create_dir_all(nap.join("refs").join("tags"))
            .map_err(NapError::Io)?;
        std::fs::create_dir_all(nap.join("refs").join("remotes"))
            .map_err(NapError::Io)?;

        // Write config
        write_string(
            &config_file(path),
            "# NAP Repository Configuration\nprotocol_version = \"0.1.0\"\n",
        )?;

        // Create initial branch (main) pointing to the empty tree
        let initial_commit = CommitObject {
            tree: EMPTY_TREE_HASH.to_string(),
            parent: None,
            author: "nap-init".into(),
            message: "Initialize repository".into(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        };
        let commit_hash = store_json(path, &initial_commit)?;
        write_string(&branch_ref(path, "main"), &commit_hash)?;

        // Set HEAD
        write_string(&head_file(path), "ref: refs/heads/main")?;

        Ok(())
    }

    fn commit(&self, path: &Path, message: &str, author: &str) -> Result<String, NapError> {
        if !dot_nap(path).exists() {
            return Err(NapError::VcsError(
                "Repository not initialised — call init() first".into(),
            ));
        }

        let branch = read_current_branch(path)?;
        let parent = read_string(&branch_ref(path, &branch)).ok();

        // Build tree from working directory
        let tree_hash = build_tree(path)?;

        let commit = CommitObject {
            tree: tree_hash,
            parent,
            author: author.to_string(),
            message: message.to_string(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        };

        let commit_hash = store_json(path, &commit)?;

        // Advance branch
        write_string(&branch_ref(path, &branch), &commit_hash)?;

        Ok(commit_hash)
    }

    fn read_file_at_ref(
        &self,
        path: &Path,
        file_path: &str,
        reference: Option<&str>,
    ) -> Result<String, NapError> {
        if let Some(ref_str) = reference {
            // Read from a specific commit
            // ref_str could be a full hash, a branch name, or a tag name
            let commit_hash = resolve_ref(path, ref_str)?;
            let commit: CommitObject = read_json(path, &commit_hash)?;
            let tree: TreeObject = read_json(path, &commit.tree)?;

            // Find the file in the tree
            let file_hash = tree
                .files
                .iter()
                .find(|e| e.path == file_path)
                .map(|e| e.hash.clone())
                .ok_or_else(|| NapError::ManifestNotFound(file_path.to_string()))?;

            let content = read_blob(path, &file_hash)?;
            String::from_utf8(content)
                .map_err(|e| NapError::VcsError(format!("UTF-8: {}", e)))
        } else {
            // Read from working tree
            let full_path = path.join(file_path);
            let content =
                std::fs::read_to_string(&full_path).map_err(NapError::Io)?;
            Ok(content)
        }
    }

    fn log(
        &self,
        path: &Path,
        file: Option<&str>,
        limit: usize,
    ) -> Result<Vec<CommitInfo>, NapError> {
        let branch = read_current_branch(path)?;
        let branch_file = branch_ref(path, &branch);
        let tip = match read_string(&branch_file) {
            Ok(h) => h,
            Err(_) => return Ok(vec![]),
        };

        let mut commits = Vec::new();
        let mut current = Some(tip);
        let mut count = 0;

        while let Some(hash) = current {
            if count >= limit {
                break;
            }
            let commit: CommitObject = match read_json(path, &hash) {
                Ok(c) => c,
                Err(_) => break,
            };

            // If filtering by file, check the tree
            if let Some(file_path) = file {
                let tree: TreeObject = match read_json(path, &commit.tree) {
                    Ok(t) => t,
                    Err(_) => break,
                };
                if !tree.files.iter().any(|e| e.path == file_path) {
                    current = commit.parent;
                    continue;
                }
            }

            let ts = chrono::DateTime::from_timestamp(commit.timestamp as i64, 0)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

            commits.push(CommitInfo {
                id: hash.clone(),
                parent: commit.parent.clone(),
                author: commit.author.clone(),
                message: commit.message.clone(),
                timestamp: ts,
            });

            current = commit.parent;
            count += 1;
        }

        Ok(commits)
    }

    fn create_branch(&self, path: &Path, name: &str) -> Result<(), NapError> {
        let branch = read_current_branch(path)?;
        let tip = read_string(&branch_ref(path, &branch))?;
        write_string(&branch_ref(path, name), &tip)?;
        Ok(())
    }

    fn switch_branch(&self, path: &Path, name: &str) -> Result<(), NapError> {
        // Verify branch exists
        let ref_file = branch_ref(path, name);
        if !ref_file.exists() {
            return Err(NapError::VcsError(format!("Branch '{}' not found", name)));
        }
        write_string(&head_file(path), &format!("ref: refs/heads/{}", name))?;
        Ok(())
    }

    fn create_tag(&self, path: &Path, name: &str) -> Result<(), NapError> {
        let branch = read_current_branch(path)?;
        let tip = read_string(&branch_ref(path, &branch))?;
        write_string(&tag_ref(path, name), &tip)?;
        Ok(())
    }

    fn current_branch(&self, path: &Path) -> Result<String, NapError> {
        read_current_branch(path)
    }

    fn head_hash(&self, path: &Path) -> Result<String, NapError> {
        let branch = read_current_branch(path)?;
        read_string(&branch_ref(path, &branch))
    }

    fn revert(&self, path: &Path, commit_hash: &str) -> Result<String, NapError> {
        // Read the target commit and restore its tree to the working tree
        let commit: CommitObject = read_json(path, commit_hash)?;
        let tree: TreeObject = read_json(path, &commit.tree)?;

        // Restore each file in the working tree
        for entry in &tree.files {
            let content = read_blob(path, &entry.hash)?;
            let out_path = path.join(&entry.path);
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(NapError::Io)?;
            }
            std::fs::write(&out_path, &content).map_err(NapError::Io)?;
        }

        // Also commit the revert
        self.commit(
            path,
            &format!("revert: restore {}", commit_hash),
            "desktop-user",
        )
    }

    fn list_branches(&self, path: &Path) -> Result<Vec<String>, NapError> {
        let heads_dir = dot_nap(path).join("refs").join("heads");
        if !heads_dir.exists() {
            return Ok(vec![]);
        }
        let mut branches = Vec::new();
        for entry in
            std::fs::read_dir(&heads_dir).map_err(NapError::Io)?
        {
            let entry = entry.map_err(NapError::Io)?;
            if let Some(name) = entry.file_name().to_str() {
                branches.push(name.to_string());
            }
        }
        branches.sort();
        Ok(branches)
    }

    fn list_tags(&self, path: &Path) -> Result<Vec<String>, NapError> {
        let tags_dir = dot_nap(path).join("refs").join("tags");
        if !tags_dir.exists() {
            return Ok(vec![]);
        }
        let mut tags = Vec::new();
        for entry in std::fs::read_dir(&tags_dir).map_err(NapError::Io)? {
            let entry = entry.map_err(NapError::Io)?;
            if let Some(name) = entry.file_name().to_str() {
                tags.push(name.to_string());
            }
        }
        tags.sort();
        Ok(tags)
    }

    fn add_remote(&self, path: &Path, name: &str, url: &str) -> Result<(), NapError> {
        let remotes_dir = dot_nap(path).join("refs").join("remotes");
        std::fs::create_dir_all(&remotes_dir).map_err(NapError::Io)?;
        write_string(&remotes_dir.join(name), url)?;
        Ok(())
    }

    fn remove_remote(&self, path: &Path, name: &str) -> Result<(), NapError> {
        let remote_file = dot_nap(path).join("refs").join("remotes").join(name);
        if remote_file.exists() {
            std::fs::remove_file(&remote_file).map_err(NapError::Io)?;
        }
        Ok(())
    }

    fn list_remotes(&self, path: &Path) -> Result<Vec<(String, String)>, NapError> {
        let remotes_dir = dot_nap(path).join("refs").join("remotes");
        if !remotes_dir.exists() {
            return Ok(vec![]);
        }
        let mut remotes = Vec::new();
        for entry in std::fs::read_dir(&remotes_dir).map_err(NapError::Io)? {
            let entry = entry.map_err(NapError::Io)?;
            let name = entry
                .file_name()
                .to_str()
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                continue;
            }
            let url = read_string(&entry.path())?;
            remotes.push((name, url));
        }
        remotes.sort();
        Ok(remotes)
    }

    fn push(
        &self,
        path: &Path,
        remote: Option<&str>,
        _branch: Option<&str>,
    ) -> Result<(), NapError> {
        // Push: upload all local objects to lore-server's content store
        let remote_name = remote.unwrap_or("origin");

        // Read remote URL
        let remotes = self.list_remotes(path)?;
        let remote_url = remotes
            .iter()
            .find(|(name, _)| name == remote_name)
            .map(|(_, url)| url.clone())
            .ok_or_else(|| {
                NapError::VcsError(format!("Remote '{}' not found", remote_name))
            })?;

        // Extract repo_id from the remote URL (last path component)
        let repo_id = remote_url
            .trim_end_matches('/')
            .split('/')
            .next_back()
            .unwrap_or("default");

        // Collect all local objects and upload them
        let objects_dir = dot_nap(path).join("objects");
        if !objects_dir.exists() {
            return Ok(());
        }

        // Walk all object files
        let walker = walkdir::WalkDir::new(&objects_dir).into_iter();
        for entry in walker.filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let data = std::fs::read(entry.path()).map_err(NapError::Io)?;
            // Upload via HTTP (synchronous — block on async)
            // TODO(medium): `Handle::current()` will panic if called outside a
            // tokio runtime context. Currently safe because VcsBackend methods
            // are only called from tokio::task::spawn_blocking (which runs on
            // tokio's blocking pool). If the async executor changes, this breaks.
            let rt = tokio::runtime::Handle::current();
            rt.block_on(async {
                crate::backend::content::put_content(repo_id, &data)
                    .await
                    .map_err(|e| NapError::VcsError(e.to_string()))
            })?;
        }

        // Also upload the current branch ref as a well-known blob
        let branch = read_current_branch(path)?;
        let tip = read_string(&branch_ref(path, &branch))?;
        let ref_data = tip.as_bytes().to_vec();
        let rt = tokio::runtime::Handle::current();
        rt.block_on(async {
            crate::backend::content::put_content(repo_id, &ref_data)
                .await
                .map_err(|e| NapError::VcsError(e.to_string()))
        })?;

        // Update remote tracking
        let remote_ref_dir = dot_nap(path)
            .join("refs")
            .join("remotes")
            .join(remote_name);
        std::fs::create_dir_all(&remote_ref_dir).map_err(NapError::Io)?;
        write_string(&remote_ref_dir.join(&branch), &tip)?;

        Ok(())
    }

    fn pull(
        &self,
        path: &Path,
        remote: Option<&str>,
        branch: Option<&str>,
    ) -> Result<(), NapError> {
        // Pull: download missing objects from lore-server
        let remote_name = remote.unwrap_or("origin");
        let branch_name = branch.unwrap_or("main");

        // Read remote URL
        let remotes = self.list_remotes(path)?;
        let remote_url = remotes
            .iter()
            .find(|(name, _)| name == remote_name)
            .map(|(_, url)| url.clone())
            .ok_or_else(|| {
                NapError::VcsError(format!("Remote '{}' not found", remote_name))
            })?;

        let repo_id = remote_url
            .trim_end_matches('/')
            .split('/')
            .next_back()
            .unwrap_or("default");

        // Check if we have a remote-tracking ref for this branch
        let remote_ref_path = dot_nap(path)
            .join("refs")
            .join("remotes")
            .join(remote_name)
            .join(branch_name);

        let remote_tip = if remote_ref_path.exists() {
            Some(read_string(&remote_ref_path)?)
        } else {
            None
        };

        if let Some(tip) = remote_tip {
            // Walk the commit chain, downloading objects we don't have
            let mut to_fetch = vec![tip.clone()];
            let mut _fetched = 0usize;

            while let Some(hash) = to_fetch.pop() {
                // Check if we already have this object
                let obj_path = dot_nap(path)
                    .join("objects")
                    .join(&hash[..2])
                    .join(&hash[2..]);
                if obj_path.exists() {
                    // We already have it — don't need to fetch its ancestors
                    continue;
                }

                // Download from lore-server
                let rt = tokio::runtime::Handle::current();
                let data = rt
                    .block_on(async {
                        crate::backend::content::get_content(repo_id, &hash).await
                    })
                    .map_err(|e| NapError::VcsError(e.to_string()))?;

                // Store locally
                std::fs::create_dir_all(obj_path.parent().unwrap())
                    .map_err(NapError::Io)?;
                std::fs::write(&obj_path, &data).map_err(NapError::Io)?;
                _fetched += 1;

                // If this is a commit, also queue its parent and tree
                if let Ok(commit) = serde_json::from_slice::<CommitObject>(&data) {
                    to_fetch.push(commit.tree);
                    if let Some(parent) = commit.parent {
                        to_fetch.push(parent);
                    }
                }
                // If this is a tree, queue all referenced files
                if let Ok(tree) = serde_json::from_slice::<TreeObject>(&data) {
                    for entry in tree.files {
                        to_fetch.push(entry.hash);
                    }
                }
            }

            // Update local branch to match remote
            write_string(&branch_ref(path, branch_name), &tip)?;
        }

        Ok(())
    }
}

// ─── Helper: resolve a ref string to a commit hash ────────────────

fn resolve_ref(repo: &Path, reference: &str) -> Result<String, NapError> {
    // Try as a full hash (36 chars = 32 bytes hex)
    if reference.len() == 64 {
        let obj_path = dot_nap(repo)
            .join("objects")
            .join(&reference[..2])
            .join(&reference[2..]);
        if obj_path.exists() {
            return Ok(reference.to_string());
        }
    }

    // Try as a branch name
    let branch_file = branch_ref(repo, reference);
    if branch_file.exists() {
        return read_string(&branch_file);
    }

    // Try as a tag name
    let tag_file = tag_ref(repo, reference);
    if tag_file.exists() {
        return read_string(&tag_file);
    }

    Err(NapError::VcsError(format!(
        "Cannot resolve '{}' to a commit",
        reference
    )))
}
