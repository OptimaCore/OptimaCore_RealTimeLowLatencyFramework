variable "resource_group_name" {
  description = "The name of the resource group"
  type        = string
}

variable "location" {
  description = "The Azure region where the Redis cache will be created"
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

variable "subnet_id" {
  description = "The ID of the subnet where the Redis cache will be deployed"
  type        = string
}

variable "sku_name" {
  description = "The SKU of Redis to use (e.g., Basic, Standard, Premium)"
  type        = string
  default     = "Premium"
}

variable "sku_family" {
  description = "The SKU family to use (C for Basic/Standard, P for Premium)"
  type        = string
  default     = "P"
  
  validation {
    condition     = contains(["C", "P"], var.sku_family)
    error_message = "The sku_family must be either 'C' (Basic/Standard) or 'P' (Premium)."
  }
}

variable "sku_capacity" {
  description = "The size of the Redis cache to deploy (1, 2, 3, 4, 5, 6 for Premium, 0, 1, 2, 3, 4, 5 for Standard)"
  type        = number
  default     = 1
}

variable "enable_non_ssl_port" {
  description = "Enable the non-SSL port (6379) for Redis"
  type        = bool
  default     = false
}

variable "minimum_tls_version" {
  description = "The minimum TLS version for Redis"
  type        = string
  default     = "1.2"
  
  validation {
    condition     = contains(["1.0", "1.1", "1.2"], var.minimum_tls_version)
    error_message = "The minimum_tls_version must be one of: '1.0', '1.1', '1.2'."
  }
}

variable "redis_configuration" {
  description = "Redis configuration options"
  type        = map(any)
  default     = {}
}

variable "patch_schedules" {
  description = "List of patch schedules for Redis maintenance"
  type = list(object({
    day_of_week    = string
    start_hour_utc = number
  }))
  default = []
}

variable "enable_private_endpoint" {
  description = "Enable private endpoint for Redis"
  type        = bool
  default     = true
}

variable "private_endpoint_subnet_id" {
  description = "The ID of the subnet for the private endpoint"
  type        = string
  default     = ""
}

variable "private_dns_zone_ids" {
  description = "List of private DNS zone IDs for the private endpoint"
  type        = list(string)
  default     = []
}

variable "private_ip_address" {
  description = "The Static IP Address to assign to the Redis Cache when hosted inside the Virtual Network"
  type        = string
  default     = null
}

variable "public_network_access_enabled" {
  description = "Whether or not public network access is allowed for this Redis Cache"
  type        = bool
  default     = false
}

variable "enable_data_persistence" {
  description = "Enable data persistence for Redis"
  type        = bool
  default     = false
}

variable "rdb_backup_frequency" {
  description = "The backup frequency in minutes"
  type        = number
  default     = 15
}

variable "rdb_backup_max_snapshot_count" {
  description = "The maximum number of snapshots to keep"
  type        = number
  default     = 1
}

variable "rdb_storage_connection_string" {
  description = "The connection string to the storage account for backups"
  type        = string
  default     = ""
  sensitive   = true
}

variable "log_analytics_workspace_id" {
  description = "The ID of the Log Analytics workspace for diagnostics"
  type        = string
  default     = ""
}

variable "enable_diagnostic_settings" {
  description = "Enable diagnostic settings for Redis"
  type        = bool
  default     = true
}

variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}
