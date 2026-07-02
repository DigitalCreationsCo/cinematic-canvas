resource "google_service_account" "lore_server" {
  account_id   = "${var.instance_name}-sa"
  display_name = "Lore Server VM service account"
  depends_on   = [google_project_service.required]
}

# Scoped to the one bucket, not project-wide storage access.
resource "google_storage_bucket_iam_member" "lore_bucket_access" {
  bucket = google_storage_bucket.lore_immutable_store.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.lore_server.email}"
}

resource "google_project_iam_member" "lore_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.lore_server.email}"
}

resource "google_project_iam_member" "lore_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.lore_server.email}"
}

# Deliberately NOT granted: secretmanager.secretAccessor. The VM never
# needs the JWT private key -- only its public half (baked in as a
# JWKS file at boot via instance metadata). Keeping the signing key
# off the server entirely means a server compromise can't be used to
# mint valid tokens.
