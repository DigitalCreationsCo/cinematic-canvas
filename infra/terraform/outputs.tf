output "lore_server_ip" {
  description = "Static external IP of the loreserver VM."
  value       = google_compute_address.lore_static_ip.address
}

output "lore_remote_url" {
  description = "Example lore:// URL for `lore repository create` / `lore clone`."
  value       = "lore://${google_compute_address.lore_static_ip.address}:41337/${var.repository_name}"
}

output "health_check_url" {
  description = "HTTP health check endpoint. Expect HTTP/1.1 200 OK with an empty body."
  value       = "http://${google_compute_address.lore_static_ip.address}:41339/health_check"
}

output "jwt_signing_key_secret_id" {
  description = "Secret Manager secret ID holding the private signing key. Grant secretmanager.secretAccessor here to whoever needs to mint tokens."
  value       = google_secret_manager_secret.jwt_signing_key.secret_id
}

output "jwt_kid" {
  description = "Key ID baked into the JWKS and expected in every minted token's header."
  value       = trimspace(data.local_file.jwt_kid.content)
}

output "ssh_command" {
  description = "How to reach the VM for debugging."
  value = var.ssh_iap_only ? (
    "gcloud compute ssh ${var.instance_name} --zone ${var.zone} --tunnel-through-iap"
  ) : "ssh to ${google_compute_address.lore_static_ip.address}"
}
