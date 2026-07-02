locals {
  startup_script = templatefile("${path.module}/templates/startup-script.sh.tftpl", {
    bucket_name       = google_storage_bucket.lore_immutable_store.name
    jwt_issuer        = var.jwt_issuer
    jwt_audience_toml = jsonencode(var.jwt_audience) # valid TOML array syntax too
  })
}

resource "google_compute_instance" "lore_server" {
  name         = var.instance_name
  machine_type = var.machine_type
  zone         = var.zone
  tags         = ["lore-server"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = var.boot_disk_size_gb
      type  = "pd-balanced"
    }
  }

  attached_disk {
    source      = google_compute_disk.lore_data_disk.id
    device_name = "lore-data" # matches DATA_DISK_DEVICE in the startup script
  }

  network_interface {
    network    = google_compute_network.lore_vpc.id
    subnetwork = google_compute_subnetwork.lore_subnet.id

    access_config {
      nat_ip = google_compute_address.lore_static_ip.address
    }
  }

  service_account {
    email  = google_service_account.lore_server.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    enable-oslogin = "TRUE"
    startup-script = local.startup_script
    lore-jwks      = data.local_file.jwt_public_jwks.content
  }

  # Lets `terraform apply` update metadata (e.g. a changed startup
  # script) in place via a reboot, instead of forcing instance replacement.
  allow_stopping_for_update = true

  depends_on = [google_project_service.required]
}
