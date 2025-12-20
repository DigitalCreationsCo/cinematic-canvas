output "vertex_ai_endpoint" {
  description = "Vertex AI endpoint URL"
  value       = google_vertex_ai_endpoint_with_model_garden_deployment.ltx_endpoint.name
}

output "artifact_registry" {
  description = "Artifact registry repository"
  value       = google_artifact_registry_repository.video_gen_repo.name
}
