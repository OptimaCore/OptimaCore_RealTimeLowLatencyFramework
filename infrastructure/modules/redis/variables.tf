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
  
  validation {
    condition     = contains(["dev", "staging", "prod"], lower(var.environment))
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "project_name" {
  description = "The name of the project (used for resource naming)"
  type        = string
  
  validation {
    condition     = can(regex("^[a-zA-Z0-9-]{1,24}$", var.project_name))
    error_message = "Project name must be 1-24 characters, alphanumeric and hyphens only"
  }
}

variable "subnet_id" {
  description = "The ID of the subnet where the Redis cache will be deployed"
  type        = string
  default     = null
}

variable "private_endpoint_subnet_id" {
  description = "The ID of the subnet for the private endpoint (if different from Redis subnet)"
  type        = string
  default     = null
}

variable "sku_name" {
  description = "The SKU of Redis to use (e.g., Basic, Standard, Premium)"
  type        = string
  default     = "Premium"
  
  validation {
    condition     = contains(["Basic", "Standard", "Premium"], title(var.sku_name))
    error_message = "SKU must be one of: Basic, Standard, Premium"
  }
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
  
  validation {
    condition     = var.sku_capacity >= 0 && var.sku_capacity <= 6
    error_message = "SKU capacity must be between 0 and 6"
  }
}

variable "shard_count" {
  description = "The number of shards to create on the Redis cluster (Premium SKU only)"
  type        = number
  default     = 1
  
  validation {
    condition     = var.shard_count >= 1 && var.shard_count <= 10
    error_message = "Shard count must be between 1 and 10"
  }
}

variable "enable_non_ssl_port" {
  description = "Enable the non-SSL port (6379) for Redis"
  type        = bool
  default     = false
}

variable "minimum_tls_version" {
  description = "The minimum TLS version for Redis connections"
  type        = string
  default     = "1.2"
  
  validation {
    condition     = contains(["1.0", "1.1", "1.2"], var.minimum_tls_version)
    error_message = "Minimum TLS version must be one of: 1.0, 1.1, 1.2"
  }
}

variable "public_network_access_enabled" {
  description = "Whether or not public network access is allowed for this Redis Cache"
  type        = bool
  default     = false
}

variable "private_static_ip_address" {
  description = "The Static IP Address to assign to the Redis Cache when hosted inside the Virtual Network"
  type        = string
  default     = null
}

variable "redis_configuration" {
  description = "Redis configuration settings"
  type = object({
    maxmemory_policy                 = optional(string, "allkeys-lru")
    maxmemory_reserved               = optional(number, 2)
    maxfragmentationmemory_reserved  = optional(number, 2)
    maxmemory_delta                  = optional(number, 2)
    notify_keyspace_events           = optional(string, "KExg")
    rdb_backup_enabled               = optional(bool, false)
    rdb_backup_frequency             = optional(number, 60)
    rdb_backup_max_snapshot_count    = optional(number, 1)
    rdb_storage_connection_string    = optional(string, "")
    enable_authentication            = optional(bool, true)
    aof_backup_enabled               = optional(bool, false)
    aof_storage_connection_string_0  = optional(string, "")
    aof_storage_connection_string_1  = optional(string, "")
  })
  default = {}
}

variable "patch_schedules" {
  description = "List of patch schedules for the Redis Cache"
  type = list(object({
    day_of_week    = string
    start_hour_utc = number
  }))
  default = []
}

variable "tags" {
  description = "A mapping of tags to assign to the resource"
  type        = map(string)
  default     = {}
}

# Monitoring and Diagnostics
variable "enable_diagnostic_setting" {
  description = "Enable diagnostic settings for the Redis Cache"
  type        = bool
  default     = true
}

variable "log_analytics_workspace_id" {
  description = "The ID of the Log Analytics Workspace to send diagnostics to"
  type        = string
  default     = null
}

variable "eventhub_name" {
  description = "The name of the Event Hub to send diagnostics to"
  type        = string
  default     = null
}

variable "storage_account_id" {
  description = "The ID of the Storage Account to send diagnostics to"
  type        = string
  default     = null
}

# Private Endpoint
variable "enable_private_endpoint" {
  description = "Enable private endpoint for the Redis Cache"
  type        = bool
  default     = true
}

variable "private_endpoint_name" {
  description = "The name of the private endpoint"
  type        = string
  default     = ""
}

# Firewall Rules
variable "firewall_rules" {
  description = "List of firewall rules to apply to the Redis Cache"
  type = list(object({
    name             = string
    start_ip_address = string
    end_ip_address   = string
  }))
  default = []
}

# Redis Modules
variable "redis_modules" {
  description = "List of Redis modules to enable"
  type = list(object({
    name    = string
    version = string
  }))
  default = []
}

# Replicas per Master (Premium only)
variable "replicas_per_master" {
  description = "The number of replicas to be created per master (Premium SKU only)"
  type        = number
  default     = 1
  
  validation {
    condition     = var.replicas_per_master >= 1 && var.replicas_per_master <= 3
    error_message = "Replicas per master must be between 1 and 3"
  }
}

# Zones (Premium SKU with availability zones)
variable "zones" {
  description = "A list of availability zones for the Redis Cache (Premium SKU only)"
  type        = list(string)
  default     = []
}

# Customer Managed Key
variable "customer_managed_key" {
  description = "Customer managed key settings for encryption at rest"
  type = object({
    key_vault_key_id   = string
    identity_client_id = string
  })
  default = null
}

# Identity
variable "identity_type" {
  description = "The type of Managed Identity to assign to the Redis Cache"
  type        = string
  default     = "SystemAssigned"
  
  validation {
    condition     = contains(["SystemAssigned", "UserAssigned", "SystemAssigned, UserAssigned", ""], var.identity_type)
    error_message = "Identity type must be one of: 'SystemAssigned', 'UserAssigned', 'SystemAssigned, UserAssigned', or empty string"
  }
}

variable "user_assigned_identity_ids" {
  description = "A list of User Assigned Managed Identity IDs to be assigned to the Redis Cache"
  type        = list(string)
  default     = []
}
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
