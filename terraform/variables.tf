# variables.tf - Terraform Variables

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region for resources"
  type        = string
  default     = "us-central1"
}

variable "github_owner" {
  description = "GitHub repository owner/organization"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
}

variable "github_branch" {
  description = "GitHub branch to trigger builds from"
  type        = string
  default     = "main"
}

variable "hugging_face_model_id" {
  description = "Hugging Face model ID for LTX Video"
  type        = string
  default     = "Lightricks/LTX-Video"
}

variable "machine_type" {
  description = "Machine type for the endpoint"
  type        = string
  default     = "g2-standard-8"
  
  validation {
    condition     = can(regex("^(g2-standard|n1-standard|a2-highgpu)", var.machine_type))
    error_message = "Machine type must be a GPU-enabled instance."
  }
}

variable "accelerator_type" {
  description = "GPU accelerator type"
  type        = string
  default     = "NVIDIA_L4"
  
  validation {
    condition = contains([
      "NVIDIA_L4",
      "NVIDIA_TESLA_T4",
      "NVIDIA_TESLA_V100",
      "NVIDIA_A100_80GB"
    ], var.accelerator_type)
    error_message = "Must be a valid NVIDIA GPU type."
  }
}

variable "accelerator_count" {
  description = "Number of GPUs"
  type        = number
  default     = 1
  
  validation {
    condition     = var.accelerator_count >= 1 && var.accelerator_count <= 8
    error_message = "Accelerator count must be between 1 and 8."
  }
}

variable "min_replicas" {
  description = "Minimum number of endpoint replicas"
  type        = number
  default     = 0
  
  validation {
    condition     = var.min_replicas >= 0
    error_message = "Minimum replicas must be 0 or greater."
  }
}

variable "max_replicas" {
  description = "Maximum number of endpoint replicas"
  type        = number
  default     = 1
  
  validation {
    condition     = var.max_replicas >= 1 && var.max_replicas <= 10
    error_message = "Maximum replicas must be between 1 and 10."
  }
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}