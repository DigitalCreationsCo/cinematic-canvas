# Lore Server on GCP

A reproducible, single-node production deployment of `loreserver` (the
stock open-source binary, no plugins) on a Compute Engine VM, with:

- **Object storage backend**: GCS bucket mounted via `gcsfuse`, backing
  the immutable (content-addressed fragment) store.
- **Persistent SSD**: backs the mutable store (branch pointers), the
  lock store's working state, TLS certs, and config -- this needs
  low-latency random access that a FUSE mount over GCS can't reliably give.
- **Internet-accessible**: static external IP, QUIC (UDP/41337), gRPC
  (TCP/41337), and HTTP health-check (TCP/41339) all open.
- **Self-issued JWT auth**: no third-party OIDC provider. A keypair
  Terraform generates signs tokens; the server verifies them against a
  JWKS file baked into the VM. A small script (`auth/mint_token.py`)
  is "the application" that hands tokens to users.

## Why GCS FUSE instead of a native object-storage backend

The config reference is explicit: stock `loreserver` ships with **zero
compiled-in plugins**. `immutable_store.mode = "aws"` (the only
documented object-storage-capable backend, via the `lore-aws` plugin)
fails at startup with `PluginNotFound` unless you're running a custom
binary with that plugin compiled in. Since GCS speaks an S3-compatible
API but `loreserver` itself has no generic S3 client built into the
core binary, there's no way to point the stock server at GCS object
storage directly.

`gcsfuse` + `[immutable_store.local]` pointed at the mount is the
practical workaround: GCS becomes the actual durable backing store,
loreserver just sees a local filesystem path. If you ever build a
custom server binary with `lore-aws` compiled in, you could swap this
for GCS's S3-interop endpoint and drop gcsfuse entirely -- worth
revisiting then.

## Two things the reference docs don't specify (read before relying on this)

**1. Client-side trust of the self-signed certificate.** With no
domain, the server uses a self-signed cert (regenerated only if
absent, so stable across restarts). The CLI command reference doesn't
document a flag for trusting an unrecognized CA (no `--insecure`,
`--ca-cert`, etc.), so it's untested here whether `lore` connects to
this server out of the box or rejects the cert. If it rejects it, the
standard fallback is installing `terraform/generated`'s `cert.pem`
(or fetch it live: `openssl s_client -connect <IP>:41337 -showcerts`)
into the OS trust store on every client machine. Getting a real domain
and switching to Let's Encrypt removes this problem entirely and is
the recommended next step once you have one.

**2. The exact `lore auth login --token --auth-url` wire protocol.**
The CLI reference documents the flags but not what an "auth service"
at `--auth-url` (scheme `ucs-auth://`) actually has to implement, and
the token-type strings shown as examples (`api-key`, `eg1`, `lore`)
look Epic-internal. This deployment relies on the documented
conditional: `--auth-url` is "required when logging in with --token
**outside a repository without a remote-url**" -- meaning when a
`remote-url` (ours, or the repo's already-cloned one) is present,
`--auth-url` should not be required, and the token is presumably used
directly as a bearer credential against the server's own JWT check.
**Test this against your actual CLI build before depending on it** --
if it insists on `--auth-url`, that's the one piece this deployment
can't pre-verify from documentation alone.

## Layout

```
terraform/             All infrastructure (apply this).
  scripts/
    generate_jwt_keys.py  Generates the signing keypair (idempotent).
  templates/
    startup-script.sh.tftpl  Rendered and run on first boot.
  generated/            Created by `terraform apply`. Contains the
                         private key. Gitignored -- back this up
                         somewhere safe (Secret Manager already has a
                         copy, but having a local one is convenient).
auth/
  mint_token.py          Mints tokens for users/your application.
```

## Deploying

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: project_id, bucket_name (must be globally unique)

pip install -r scripts/requirements.txt --break-system-packages   # for the local-exec keygen step
terraform init
terraform apply
```

First apply takes a few minutes (image pull, gcsfuse install, cert
generation all happen in the startup script). Check progress:

```bash
terraform output ssh_command   # run it
sudo journalctl -u google-startup-scripts -f
```

Confirm health:

```bash
curl -i "$(terraform output -raw health_check_url)"
# expect: HTTP/1.1 200 OK, empty body
```

## Minting and using a token

```bash
cd auth
pip install -r requirements.txt --break-system-packages

# Grant yourself access to the signing key once:
gcloud secrets add-iam-policy-binding lore-server-jwt-signing-key \
  --member="user:you@example.com" --role="roles/secretmanager.secretAccessor"

TOKEN=$(python3 mint_token.py --subject alex@example.com --project-id my-gcp-project)

lore login "lore://$(cd ../terraform && terraform output -raw lore_server_ip):41337/my-project" \
  --token-type api-key --token "$TOKEN"
```

If that rejects the certificate or asks for `--auth-url`, see the two
caveats above -- those are the parts to debug against your actual CLI
build.

Once authenticated:

```bash
lore repository create "lore://<IP>:41337/my-project"
lore clone "lore://<IP>:41337/my-project" ./my-project
```

## Operational notes

- **Single node.** `[topology] provider = "none"`, lock store is the
  in-process in-memory default. There's no HA here -- a VM restart is
  a brief outage, and the lock store's state doesn't survive it
  (acceptable for locks, which are meant to be re-acquired). Multi-node
  replication needs `[topology.fixed]`/`quic_internal`/`grpc_internal`
  wiring this guide doesn't cover, and a distributed lock store
  backend the stock binary doesn't have.
- **Key rotation.** Delete `terraform/generated/`, re-run `terraform
  apply` to generate a new keypair and push the new JWKS to the VM
  (it'll reboot to pick up new metadata). All previously issued tokens
  stop validating the moment the new JWKS lands -- mint fresh ones
  after rotating.
- **Cost/cleanup.** `terraform destroy` removes everything except the
  bucket's contents if `bucket_force_destroy = false` (the default) --
  intentional, so a stray `destroy` can't silently delete your data.
  Set it to `true` only when you actually want that.
- **SSH access.** IAP-tunneled only by default (`ssh_iap_only = true`),
  no public port 22. Whoever needs shell access needs
  `roles/iap.tunnelResourceAccessor` granted on their own identity --
  that's a per-person grant, intentionally outside this Terraform.
