terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.0" }
    local  = { source = "hashicorp/local", version = "~> 2.4" }
    null   = { source = "hashicorp/null", version = "~> 3.2" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
    tls    = { source = "hashicorp/tls", version = "~> 4.0" }
  }

  # Uncomment and configure for remote state
  # backend "s3" {
  #   bucket = "YOUR_TFSTATE_BUCKET"
  #   key    = "portals/production/terraform.tfstate"
  #   region = "us-east-1"
  # }
}
