# Agent Instructions

## Git Commit Attribution

All AI-assisted commits must include attribution for the agent app and model used. This ensures transparency and traceability of AI contributions.

### Required Format

Add the following footer to every commit message when AI assistance was used:

```
AI-Assisted-By: <agent-app> (<model>)
```

### Examples

```
feat: add user authentication flow

AI-Assisted-By: opencode (nemotron-3-ultra-free)
```

```
fix: resolve race condition in data sync

AI-Assisted-By: codex (gpt-4o)
```

```
refactor: extract shared validation logic

AI-Assisted-By: devin (devin-1.0)
```

### Agent App Values

Use one of these standard identifiers:
- `opencode` - OpenCode CLI agent
- `codex` - GitHub Copilot / Codex
- `devin` - Devin AI
- `claude` - Claude Code / Claude Desktop
- `cursor` - Cursor IDE
- `windsurf` - Windsurf IDE
- `other` - Any other AI agent (specify)

### Model Values

Use the actual model identifier (e.g., `nemotron-3-ultra-free`, `gpt-4o`, `claude-3.5-sonnet`, `devin-1.0`, etc.)

### When to Apply

Apply this attribution when:
- The agent wrote, modified, or reviewed code
- The agent provided architectural guidance that was implemented
- The agent generated commit messages or PR descriptions
- Any substantial AI contribution to the change

### When NOT to Apply

Do not add attribution for:
- Purely manual commits with no AI involvement
- Commits only updating documentation written by humans
- Routine dependency updates via dependabot/renovate