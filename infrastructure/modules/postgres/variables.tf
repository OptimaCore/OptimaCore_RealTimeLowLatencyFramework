variable "resource_group_name" {
  description = "The name of the resource group"
  type        = string
}

variable "location" {
  description = "The Azure region where the PostgreSQL server will be created"
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
  description = "The ID of the subnet where the PostgreSQL server will be deployed"
  type        = string
}

variable "postgres_version" {
  description = "The version of PostgreSQL to deploy"
  type        = string
  default     = "13"
  
  validation {
    condition     = contains(["11", "12", "13", "14"], var.postgres_version)
    error_message = "The postgres_version must be one of: '11', '12', '13', '14'."
  }
}

variable "sku_name" {
  description = "The SKU name for the PostgreSQL flexible server (e.g., B_Standard_B1ms, GP_Standard_D2s_v3, MO_Standard_E2s_v3)"
  type        = string
  default     = "GP_Standard_D2s_v3"
}

variable "storage_mb" {
  description = "The max storage allowed for the PostgreSQL flexible server in MB"
  type        = number
  default     = 32768
  
  validation {
    condition     = var.storage_mb >= 32768 && var.storage_mb <= 16777216
    error_message = "The storage_mb must be between 32768 and 16777216 (16TB)."
  }
}

variable "administrator_password" {
  description = "The administrator password for the PostgreSQL server. If not provided, a random password will be generated."
  type        = string
  sensitive   = true
  default     = ""
}

variable "databases" {
  description = "List of database names to be created"
  type        = list(string)
  default     = ["appdb"]
}

variable "database_charset" {
  description = "The charset for all databases"
  type        = string
  default     = "UTF8"
}

variable "database_collation" {
  description = "The collation for all databases"
  type        = string
  default     = "en_US.UTF8"
}

variable "backup_retention_days" {
  description = "Backup retention days for the server, supported values are between 7 and 35 days"
  type        = number
  default     = 7
  
  validation {
    condition     = var.backup_retention_days >= 7 && var.backup_retention_days <= 35
    error_message = "The backup_retention_days must be between 7 and 35 days."
  }
}

variable "high_availability_mode" {
  description = "The high availability mode for the server. Possible values are 'SameZone' or 'ZoneRedundant'"
  type        = string
  default     = "ZoneRedundant"
  
  validation {
    condition     = contains(["SameZone", "ZoneRedundant", ""], var.high_availability_mode)
    error_message = "The high_availability_mode must be either 'SameZone', 'ZoneRedundant', or empty string for no HA."
  }
}

variable "maintenance_window" {
  description = "The maintenance window for the server"
  type = object({
    day_of_week  = number
    start_hour   = number
    start_minute = number
  })
  
  default = {
    day_of_week  = 0
    start_hour   = 0
    start_minute = 0
  }
}

variable "firewall_rules" {
  description = "List of firewall rules to apply to the PostgreSQL server"
  type = list(object({
    name      = string
    start_ip  = string
    end_ip    = string
  }))
  
  default = [
    {
      name      = "allow-azure-services"
      start_ip  = "0.0.0.0"
      end_ip    = "0.0.0.0"
    }
  ]
}

variable "private_dns_zone_id" {
  description = "The ID of the private DNS zone for the PostgreSQL server"
  type        = string
  default     = ""
}

variable "virtual_network_id" {
  description = "The ID of the virtual network for the private DNS zone link"
  type        = string
  default     = ""
}

variable "log_analytics_workspace_id" {
  description = "The ID of the Log Analytics workspace for diagnostics"
  type        = string
  default     = ""
}

variable "enable_diagnostic_settings" {
  description = "Enable diagnostic settings for PostgreSQL"
  type        = bool
  default     = true
}

variable "postgres_config" {
  description = "Map of PostgreSQL server configuration"
  type        = map(any)
  default     = {}
}

variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}
