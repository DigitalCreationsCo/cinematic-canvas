# CI/CD Pipeline Templates

Ready-to-use workflow files for the Flow DevOps Toolkit.
Copy the files you need into your project's CI configuration.

## GitHub Actions

| File | Trigger | Secrets needed |
|------|---------|----------------|
| [`github-actions/portals-validate.yml`](github-actions/portals-validate.yml) | PR touching `flows/**/*.json` | None |
| [`github-actions/portals-test.yml`](github-actions/portals-test.yml) | PR touching flows or tests | `PORTALS_STAGING_API_KEY` |
| [`github-actions/portals-push.yml`](github-actions/portals-push.yml) | Push to `main` touching flows | `PORTALS_PROD_API_KEY` |

### Quick start

```bash
mkdir -p .github/workflows
cp github-actions/portals-validate.yml \
   github-actions/portals-test.yml \
   github-actions/portals-push.yml \
   .github/workflows/
```

Configure these in **Settings → Environments**:

**`staging`** environment (used by `portals-test.yml`):
| Name | Type | Value |
|------|------|-------|
| `PORTALS_STAGING_URL` | Variable | `https://staging.portals.example.com` |
| `PORTALS_STAGING_API_KEY` | Secret | your staging API key |

**`production`** environment (used by `portals-push.yml`):
| Name | Type | Value |
|------|------|-------|
| `PORTALS_PROD_URL` | Variable | `https://portals.example.com` |
| `PORTALS_PROD_API_KEY` | Secret | your production API key |
| `PORTALS_PROJECT_NAME` | Variable | `Production Flows` *(optional)* |

Add **Required reviewers** to the `production` environment to gate every deploy
behind a manual approval step.

---

## GitLab CI

| File | Description |
|------|-------------|
| [`gitlab-ci/portals.yml`](gitlab-ci/portals.yml) | Three-stage template: validate → test → deploy |

### Quick start

```bash
mkdir -p .gitlab/ci
cp gitlab-ci/portals.yml .gitlab/ci/
```

Add to your `.gitlab-ci.yml`:

```yaml
include:
  - local: .gitlab/ci/portals.yml
```

Configure these in **Settings → CI/CD → Variables**:

| Variable | Protected | Masked | Description |
|----------|-----------|--------|-------------|
| `PORTALS_STAGING_URL` | ✓ | ✗ | Staging instance URL |
| `PORTALS_STAGING_API_KEY` | ✓ | ✓ | Staging API key |
| `PORTALS_PROD_URL` | ✓ | ✗ | Production instance URL |
| `PORTALS_PROD_API_KEY` | ✓ | ✓ | Production API key |
| `PORTALS_PROJECT_NAME` | ✗ | ✗ | Project folder name *(optional)* |

---

## Shell scripts (`ci/`)

The `shell/` templates (`ci-validate.sh`, `ci-test.sh`, `ci-push.sh`) work with
any CI system (Jenkins, CircleCI, Bitbucket Pipelines, Azure Pipelines, etc.).
They are copied to `ci/` by `px init`.

### Environment variables

#### `ci-validate.sh`

| Variable | Default | Description |
|----------|---------|-------------|
| `FLOWS_DIR` | `flows/` | Directory containing flow JSON files |
| `VALIDATE_LEVEL` | `4` | Validation depth (1–4) |
| `VALIDATE_FORMAT` | `text` | Output format: `text` or `json` |
| `PX_VERSION` | *(latest)* | PEP 508 version specifier for `px`, e.g. `>=0.4,<1` or `==1.2.3` |

#### `ci-test.sh`

| Variable | Default | Description |
|----------|---------|-------------|
| `PORTALS_URL` | — | URL of target Portals instance (Approach A) |
| `PORTALS_API_KEY` | — | API key for target instance (Approach A) |
| `PORTALS_ENV` | — | Environment name from config (Approach B) |
| `PORTALS_ENVIRONMENTS_FILE` | `portals-environments.toml` | Path to environments config (Approach B) |
| `TESTS_DIR` | `tests/` | Directory containing test files |
| `PYTEST_MARKERS` | `integration` | Markers passed to `pytest -m` |
| `PYTEST_ARGS` | — | Extra arguments forwarded verbatim to pytest |
| `SDK_VERSION` | *(latest)* | PEP 508 version specifier for `portals-sdk` |

#### `ci-push.sh`

| Variable | Default | Description |
|----------|---------|-------------|
| `PORTALS_URL` | — | URL of target Portals instance (Approach A) |
| `PORTALS_API_KEY` | — | API key for target instance (Approach A) |
| `PORTALS_ENV` | — | Environment name from config (Approach B) |
| `PORTALS_ENVIRONMENTS_FILE` | `portals-environments.toml` | Path to environments config (Approach B) |
| `FLOWS_DIR` | `flows/` | Directory containing flow JSON files |
| `PORTALS_PROJECT` | — | Project (folder) name on the remote instance |
| `PORTALS_PROJECT_ID` | — | Project UUID (takes precedence over `PORTALS_PROJECT`) |
| `DRY_RUN` | `false` | Set to `true` to preview without making changes |
| `PX_VERSION` | *(latest)* | PEP 508 version specifier for `px` |

---

## How it all fits together

```
PR opened
  │
  ├── portals-validate  ──── px validate flows/ --level 4
  │                           ↳ blocks merge if any flow is malformed
  │
  └── portals-test  ──────── pytest tests/ --portals-env staging
                              ↳ skips gracefully if staging is unavailable

Merge to main
  │
  └── portals-push  ──────── px push --dir flows/ --env production
                              ↳ upserts every flow by stable ID
                              ↳ idempotent: safe to re-run
```

## Writing integration tests

Install the testing extra:

```bash
pip install "portals-sdk[testing]"
```

Create `tests/test_flows.py`:

```python
def test_rag_flow(flow_runner):
    response = flow_runner("rag-endpoint", "What is Portals?")
    assert "Portals" in response.first_text_output()

async def test_async_flow(async_flow_runner):
    response = await async_flow_runner("my-endpoint", "Hello!")
    assert response.first_text_output() is not None
```

Run locally against staging:

```bash
PORTALS_URL=https://staging.portals.example.com \
PORTALS_API_KEY=<key> \
pytest tests/ -m integration
```
