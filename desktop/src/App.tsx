import { useState } from "react";
import { useNap, type RepoInfo } from "./hooks/useNap";
import "./App.css";

function App() {
  const nap = useNap();
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [repoPath, setRepoPath] = useState("");
  const [universe, setUniverse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpenRepo = async () => {
    try {
      setError(null);
      setLoading(true);
      const info = await nap.openRepo(repoPath, universe);
      setRepo(info);
    } catch (e) {
      setError(String(e));
      setRepo(null);
    } finally {
      setLoading(false);
    }
  };

  const handleInitRepo = async () => {
    try {
      setError(null);
      setLoading(true);
      const info = await nap.initRepo(repoPath, universe);
      setRepo(info);
    } catch (e) {
      setError(String(e));
      setRepo(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <header>
        <h1>Portals Desktop</h1>
      </header>

      <section className="repo-section">
        <h2>Repository</h2>
        <div className="repo-input">
          <input
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="Path to NAP repository..."
          />
          <input
            value={universe}
            onChange={(e) => setUniverse(e.target.value)}
            placeholder="Universe name (e.g. starwars)"
          />
          <button onClick={handleOpenRepo} disabled={loading || !repoPath || !universe}>
            {loading ? "Opening…" : "Open"}
          </button>
          <button onClick={handleInitRepo} disabled={loading || !repoPath || !universe}>
            Init New
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {repo && (
          <div className="repo-info">
            <table>
              <tbody>
                <tr><td>Path</td><td>{repo.path}</td></tr>
                <tr><td>Universe</td><td>{repo.universe}</td></tr>
                <tr><td>Branch</td><td>{repo.current_branch}</td></tr>
                <tr><td>HEAD</td><td><code>{repo.head.slice(0, 16)}…</code></td></tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="docs-section">
        <h2>Asset Resolution</h2>
        <p>
          Render locally-resolved assets by calling <code>nap_resolve_asset</code>
          {' '}and converting the result with <code>convertFileSrc</code>:
        </p>
        <pre>{`import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

const path: string = await invoke("nap_resolve_asset", {
  repo_root: "/path/to/repo",
  hash: "abc123..."
});
const url = convertFileSrc(path);
// Use url as <img src={url} />`}</pre>
      </section>
    </main>
  );
}

export default App;
