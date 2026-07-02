# Dedicated VPC rather than relying on a project's "default" network,
# which may not exist (some orgs disable auto-created default networks).

resource "google_compute_network" "lore_vpc" {
  name                    = "${var.instance_name}-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.required]
}

resource "google_compute_subnetwork" "lore_subnet" {
  name          = "${var.instance_name}-subnet"
  ip_cidr_range = "10.20.0.0/24"
  region        = var.region
  network       = google_compute_network.lore_vpc.id
}

resource "google_compute_address" "lore_static_ip" {
  name       = "${var.instance_name}-ip"
  region     = var.region
  depends_on = [google_project_service.required]
}

# QUIC (UDP) + gRPC (TCP), both on 41337, plus the HTTP health-check
# port -- all open to the internet, since this is how clients reach
# the server. Client auth is enforced by the server's JWT check, not
# by network restriction.
resource "google_compute_firewall" "lore_client_ports" {
  name    = "${var.instance_name}-allow-lore-client"
  network = google_compute_network.lore_vpc.id

  allow {
    protocol = "tcp"
    ports    = ["41337", "41339"]
  }

  allow {
    protocol = "udp"
    ports    = ["41337"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["lore-server"]
}

# SSH only via IAP's fixed forwarding range -- not the public internet.
# Whoever needs to SSH in still needs roles/iap.tunnelResourceAccessor
# (and OS Login set up) granted on their own identity; that's a
# per-person IAM grant outside the scope of this VM-focused config.
resource "google_compute_firewall" "lore_iap_ssh" {
  count   = var.ssh_iap_only ? 1 : 0
  name    = "${var.instance_name}-allow-iap-ssh"
  network = google_compute_network.lore_vpc.id

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["lore-server"]
}
