import { build as viteBuild } from "vite";
import path from "path";
import { rm, readdir, readFile, writeFile } from "fs/promises";
import { spawn } from "child_process";

const root = process.cwd();
const dist = path.resolve(root, "dist");

/**
 * Alias → path relative to the dist root.
 * Vite resolves its own aliases at bundle time, so these only apply
 * to the Node.js targets compiled by tsc.
 *
 * Add new aliases here — no other changes needed.
 */
const ALIAS_MAP: Record<string, string> = {
  "#shared": "shared",
  "#server": "server",
  "#client": "client/src",
};

/**
 * Directories whose contents Vite already bundled.
 * Alias rewriting must never touch these — Vite handles them.
 */
const VITE_OUTPUT_DIRS = new Set([
  path.resolve(dist, "server/public"),
]);

/** True when a file path lives inside one of Vite's output trees. */
function isViteOutput(filePath: string): boolean {
  for (const dir of VITE_OUTPUT_DIRS) {
    if (filePath === dir || filePath.startsWith(dir + path.sep)) return true;
  }
  return false;
}

/**
 * Rewrite every `#alias/rest` import in a compiled JS file with the
 * correct *relative* path from that file to the aliased module.
 *
 * Using path.relative() means the result is correct regardless of
 * how deeply nested the source file is — no more hardcoded `../`.
 */
async function rewriteFile(filePath: string): Promise<void> {
  if (isViteOutput(filePath)) return;
  if (!filePath.endsWith(".js")) return;

  try {
    let content = await readFile(filePath, "utf-8");
    let dirty = false;
    const fileDir = path.dirname(filePath);

    for (const [alias, distRelTarget] of Object.entries(ALIAS_MAP)) {
      const absTarget = path.resolve(dist, distRelTarget);

      // Escape any regex-special chars in the alias (e.g. `#` is safe but
      // future aliases might not be).
      const safeAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(
        `((?:from|import)\\s+["'])${safeAlias}/([^"']+)(["'])`,
        "g"
      );

      content = content.replace(pattern, (_match, prefix, rest, suffix) => {
        dirty = true;
        // Compute the path from this file's directory to the resolved module.
        let rel = path
          .relative(fileDir, path.join(absTarget, rest))
          .replace(/\\/g, "/"); // normalise on Windows
        if (!rel.startsWith(".")) rel = "./" + rel;
        return `${prefix}${rel}${suffix}`;
      });
    }

    if (dirty) {
      await writeFile(filePath, content, "utf-8");
      console.log(`  ✓ ${path.relative(root, filePath)}`);
    }
  } catch {
    /* skip unreadable / binary files */
  }
}

/** Recursively walk a directory, rewriting aliases in every .js file. */
async function rewriteInDir(dir: string): Promise<void> {
  if (isViteOutput(dir)) return; // never descend into Vite output

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? rewriteInDir(full) : rewriteFile(full);
      })
    );
  } catch {
    /* skip inaccessible dirs */
  }
}

/**
 * Only the Node.js targets need alias rewriting — the tsc compiler
 * preserves bare specifiers, so we fix them up here post-compilation.
 *
 * "server" is included so that Express-side code gets rewritten, but
 * server/public (Vite's output) is automatically excluded via
 * isViteOutput().
 */
async function rewritePathAliases(): Promise<void> {
  const nodeDirs = ["pipeline", "server", "worker", "shared"];
  await Promise.all([
    ...nodeDirs.map((t) => rewriteInDir(path.join(dist, t))),
    // monolith.js sits at the dist root, not in a subdirectory
    rewriteFile(path.join(dist, "monolith.js")),
  ]);
}

/**
 * Run tsc using the local binary (avoids npx resolution overhead on every
 * build) and stream its output to the terminal exactly like execSync did.
 * Returns a promise so it can run concurrently with viteBuild.
 */
function runTsc(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Prefer the project-local tsc; fall back to whatever is on PATH.
    const tscBin = path.resolve(root, "node_modules/.bin/tsc");
    const proc = spawn(tscBin, ["-b"], {
      cwd: root,
      stdio: "inherit",
      // On Windows the .bin shim is a .cmd file, so we need shell: true.
      shell: process.platform === "win32",
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tsc exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

async function buildAll(): Promise<void> {
  await rm(dist, { recursive: true, force: true });

  // ── 1. Client (Vite) and Node.js targets (tsc) run in parallel ──────────
  //
  // These are completely independent:
  //   • Vite writes to  dist/server/public  (client bundle)
  //   • tsc  writes to  dist/{server,pipeline,worker,shared} + monolith.js
  //
  // Running them concurrently cuts wall-clock time roughly in half.
  console.log("🎨 Building client (Vite + React) & ⚙️  compiling TypeScript in parallel…");
  try {
    await Promise.all([
      viteBuild({
        configFile: path.resolve(root, "src/server/vite.config.ts"),
        build: {
          outDir: path.resolve(dist, "server/public"),
          emptyOutDir: false,
        },
      }),
      runTsc(),
    ]);
  } catch (err) {
    console.error("❌ Build failed:", err);
    process.exit(1);
  }

  // ── 2. Fix alias specifiers in Node.js output only ──────────────────────
  // Vite output (server/public) is excluded automatically via isViteOutput().
  console.log("🔄 Rewriting path aliases in Node.js targets…");
  await rewritePathAliases();

  console.log("✅ Build complete!");
}

buildAll();