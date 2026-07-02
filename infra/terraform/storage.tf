# Backs the immutable (content-addressed fragment) store. Mounted into
# the VM with gcsfuse at /mnt/lore-immutable -- this is the "object
# storage backend" half of the deployment.
#
# Note: stock open-source loreserver has no compiled-in plugins (see
# the config reference's "Plugin backends" section), so there is no
# native `mode = "aws"`/S3-client store backend available, even though
# GCS itself speaks an S3-compatible API. local store mode pointed at
# a gcsfuse mount is the way to get GCS-backed durability against this
# binary. A custom build with the lore-aws plugin compiled in could
# talk to GCS via its S3-interop endpoint directly and skip gcsfuse
# entirely -- worth revisiting if you ever build a custom server binary.
resource "google_storage_bucket" "lore_immutable_store" {
  name                        = var.bucket_name
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = var.bucket_force_destroy

  versioning {
    enabled = false
  }

  depends_on = [google_project_service.required]
}

# Backs the mutable store (branch pointers) plus the lock store's
# working area, TLS certs, and server config. gcsfuse can't reliably
# serve the low-latency random-access writes this needs, so it lives
# on a real persistent disk instead.
resource "google_compute_disk" "lore_data_disk" {
  name = "${var.instance_name}-data"
  type = "pd-ssd"
  zone = var.zone
  size = var.data_disk_size_gb

  depends_on = [google_project_service.required]
}
