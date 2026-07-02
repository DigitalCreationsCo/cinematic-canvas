terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.4"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }

  # State is local by default. For team use, create a bucket by hand
  # first (state storage can't bootstrap itself) and uncomment:
  #
  # backend "gcs" {
  #   bucket = "YOUR_TFSTATE_BUCKET"
  #   prefix = "lore-server"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}
