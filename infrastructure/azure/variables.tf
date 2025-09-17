variable "app_name" {
  description = "The name of the application"
  type        = string
  default     = "optimacore"
}

variable "environment" {
  description = "The environment (dev, staging, production)"
  type        = string
  default     = "dev"
  
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be one of: dev, staging, production"
  }
}

variable "location" {
  description = "The Azure region where resources will be created"
  type        = string
  default     = "eastus"
}

variable "app_service_plan_sku" {
  description = "The SKU for the App Service Plan"
  type        = string
  default     = "B1"
  
  validation {
    condition     = contains(["B1", "B2", "B3", "S1", "S2", "S3", "P1V2", "P2V2", "P3V2"], var.app_service_plan_sku)
    error_message = "Invalid App Service Plan SKU. Choose from: B1, B2, B3, S1, S2, S3, P1V2, P2V2, P3V2"
  }
}

variable "app_insights_instrumentation_key" {
  description = "The instrumentation key for Application Insights"
  type        = string
  sensitive   = true
  default     = ""
}

variable "app_insights_connection_string" {
  description = "The connection string for Application Insights"
  type        = string
  sensitive   = true
  default     = ""
}

# Uncomment and use these variables when you set up a database
# variable "database_connection_string" {
#   description = "The connection string for the database"
#   type        = string
#   sensitive   = true
#   default     = ""
# }

# variable "redis_connection_string" {
#   description = "The connection string for Redis Cache"
#   type        = string
#   sensitive   = true
#   default     = ""
# }
