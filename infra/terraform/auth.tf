# Generates the RSA keypair Lore tokens are signed with (see
# scripts/generate_jwt_keys.py for why this exists and how it stays
# idempotent across re-applies).
resource "null_resource" "jwt_keypair" {
  provisioner "local-exec" {
    command = "python3 ${path.module}/scripts/generate_jwt_keys.py ${path.module}/generated"
  }

  triggers = {
    # The script is idempotent (skips generation if files already
    # exist) -- this just makes sure it's checked on every apply.
    check = timestamp()
  }
}

# Reading these as data sources (rather than `file()` directly) with
# explicit depends_on defers the read until after local-exec has run,
# which is what lets a from-scratch `terraform apply` work in one pass.
data "local_file" "jwt_public_jwks" {
  filename   = "${path.module}/generated/jwks.json"
  depends_on = [null_resource.jwt_keypair]
}

data "local_file" "jwt_kid" {
  filename   = "${path.module}/generated/kid.txt"
  depends_on = [null_resource.jwt_keypair]
}

resource "google_secret_manager_secret" "jwt_signing_key" {
  secret_id = "${var.instance_name}-jwt-signing-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

# The private key. Only ever lives here and on whatever machine ran
# `terraform apply` (in ./generated/, gitignored) -- never on the VM.
# Whoever mints tokens needs secretmanager.secretAccessor on this
# secret (granted manually -- see README "Granting access to mint tokens").
resource "google_secret_manager_secret_version" "jwt_signing_key" {
  secret      = google_secret_manager_secret.jwt_signing_key.id
  secret_data = file("${path.module}/generated/private_key.pem")
  depends_on  = [null_resource.jwt_keypair]
}
