variable "resource_group_name" {
  description = "The name of the resource group"
  type        = string
}

variable "location" {
  description = "The Azure region where the Container App will be created"
  type        = string
}

variable "environment" {
  description = "The deployment environment (e.g., dev, staging, prod)"
  type        = string
}

variable "project_name" {
  description = "The name of the project (used for resource naming)"
  type        = string
}

# Container App Environment Variables
variable "log_analytics_workspace_id" {
  description = "The ID of the Log Analytics workspace to use for the Container App Environment"
  type        = string
}

variable "infrastructure_subnet_id" {
  description = "The ID of the subnet to deploy the Container App Environment to"
  type        = string
}

variable "internal_load_balancer_enabled" {
  description = "Should the Container App Environment use an internal load balancer?"
  type        = bool
  default     = false
}

variable "network_configuration" {
  description = "Network configuration for the Container App Environment"
  type = object({
    infrastructure_subnet_id     = string
    internal_load_balancer_enabled = bool
  })
  default = null
}

# Container App Variables
variable "revision_mode" {
  description = "The revision mode of the Container App. Can be 'Single' or 'Multiple'"
  type        = string
  default     = "Single"
  
  validation {
    condition     = contains(["Single", "Multiple"], var.revision_mode)
    error_message = "The revision_mode must be either 'Single' or 'Multiple'."
  }
}

variable "identity_type" {
  description = "The type of managed identity to assign to the Container App. Can be 'SystemAssigned', 'UserAssigned', or 'SystemAssigned, UserAssigned'"
  type        = string
  default     = "SystemAssigned"
  
  validation {
    condition     = contains(["SystemAssigned", "UserAssigned", "SystemAssigned, UserAssigned"], var.identity_type)
    error_message = "The identity_type must be one of: 'SystemAssigned', 'UserAssigned', 'SystemAssigned, UserAssigned'."
  }
}

variable "container_app_config" {
  description = "Configuration for the Container App"
  type = object({
    cpu                     = number
    memory                  = string
    min_replicas           = number
    max_replicas           = number
    external_ingress       = bool
    allow_insecure_connect = bool
  })
  
  default = {
    cpu                     = 0.5
    memory                  = "1Gi"
    min_replicas           = 1
    max_replicas           = 10
    external_ingress       = true
    allow_insecure_connect = false
  }
}

# Container Variables
variable "container_name" {
  description = "The name of the container"
  type        = string
  default     = "app"
}

variable "container_image" {
  description = "The container image to deploy"
  type        = string
}

variable "container_args" {
  description = "The arguments to pass to the container"
  type        = list(string)
  default     = []
}

variable "container_command" {
  description = "The command to run in the container"
  type        = list(string)
  default     = []
}

variable "target_port" {
  description = "The port that the container is listening on"
  type        = number
  default     = 80
}

# Environment Variables
variable "environment_variables" {
  description = "A map of environment variables to set in the container"
  type        = map(string)
  default     = {}
}

variable "secret_environment_variables" {
  description = "A map of secret environment variables to set in the container"
  type = map(object({
    secret_name = string
    value       = string
  }))
  default = {}
}

# Probe Variables
variable "liveness_probe" {
  description = "Liveness probe configuration"
  type = object({
    port                    = number
    path                    = string
    host                    = string
    initial_delay           = number
    interval_seconds        = number
    timeout                 = number
    failure_count_threshold = number
    success_count_threshold = number
    headers = list(object({
      name  = string
      value = string
    }))
  })
  default = null
}

variable "readiness_probe" {
  description = "Readiness probe configuration"
  type = object({
    port                    = number
    path                    = string
    host                    = string
    interval_seconds        = number
    timeout                 = number
    failure_count_threshold = number
    success_count_threshold = number
    headers = list(object({
      name  = string
      value = string
    }))
  })
  default = null
}

# Volume Variables
variable "volumes" {
  description = "List of volumes to mount in the container"
  type = list(object({
    name         = string
    storage_name = string
    storage_type = string
  }))
  default = []
}

variable "volume_mounts" {
  description = "List of volume mounts for the container"
  type = list(object({
    name = string
    path = string
  }))
  default = []
}

# Scale Rules
variable "scale_rules" {
  description = "Scale rules for the Container App"
  type = list(object({
    http = object({
      concurrent_requests = number
      name               = string
      authentication = object({
        secret_name       = string
        trigger_parameter = string
      })
    })
    eventhub = object({
      name              = string
      threshold         = number
      auth_trigger_name = string
      authentication = object({
        secret_name       = string
        trigger_parameter = string
      })
    })
    servicebus = object({
      name              = string
      queue_name        = string
      message_count     = number
      auth_trigger_name = string
      authentication = object({
        secret_name       = string
        trigger_parameter = string
      })
    })
  }))
  default = []
}

# Dapr Configuration
variable "enable_dapr" {
  description = "Enable Dapr sidecar for the Container App"
  type        = bool
  default     = false
}

variable "dapr_app_id" {
  description = "The Dapr application identifier"
  type        = string
  default     = ""
}

variable "dapr_app_protocol" {
  description = "The protocol Dapr uses to talk to the application. Valid options are http and grpc"
  type        = string
  default     = "http"
  
  validation {
    condition     = contains(["http", "grpc"], var.dapr_app_protocol)
    error_message = "The dapr_app_protocol must be either 'http' or 'grpc'."
  }
}

# Secrets
variable "secrets" {
  description = "List of secrets to make available to the Container App"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

# IP Security Restrictions
variable "ip_security_restrictions" {
  description = "List of IP security restrictions for the Container App"
  type = list(object({
    name             = string
    ip_address_range = string
    action          = string
    description     = string
  }))
  default = []
}

# Custom Domain
variable "custom_domain" {
  description = "Custom domain configuration for the Container App"
  type = object({
    name                    = string
    certificate_blob_base64 = string
    certificate_password    = string
    dns_zone_id            = string
  })
  default = null
}

# Diagnostic Settings
variable "enable_diagnostic_settings" {
  description = "Enable diagnostic settings for the Container App"
  type        = bool
  default     = true
}

# Tags
variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}
