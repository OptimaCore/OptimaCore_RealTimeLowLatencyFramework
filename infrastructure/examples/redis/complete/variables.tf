variable "location" {
  description = "The Azure region where resources will be created"
  type        = string
  default     = "eastus"
}

variable "environment" {
  description = "The deployment environment (e.g., dev, test, prod)"
  type        = string
  default     = "test"
  
  validation {
    condition     = contains(["dev", "test", "prod"], lower(var.environment))
    error_message = "Environment must be one of: dev, test, prod"
  }
}

variable "tags" {
  description = "A mapping of tags to assign to all resources"
  type        = map(string)
  default = {
    Environment = "Test"
    ManagedBy   = "Terraform"
    Project     = "RedisExample"
  }
}
