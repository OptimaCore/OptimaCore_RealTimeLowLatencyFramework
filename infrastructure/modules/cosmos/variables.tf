variable "resource_group_name" {
  description = "The name of the resource group"
  type        = string
}

variable "location" {
  description = "The Azure region where the Cosmos DB account will be created"
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

variable "consistency_level" {
  description = "The consistency level to use for the Cosmos DB account"
  type        = string
  default     = "Session"
  
  validation {
    condition     = contains(["Eventual", "ConsistentPrefix", "Session", "BoundedStaleness", "Strong"], var.consistency_level)
    error_message = "The consistency_level must be one of: 'Eventual', 'ConsistentPrefix', 'Session', 'BoundedStaleness', 'Strong'."
  }
}

variable "consistency_policy" {
  description = "The consistency policy for the Cosmos DB account"
  type = object({
    max_interval_in_seconds = number
    max_staleness_prefix    = number
  })
  
  default = {
    max_interval_in_seconds = 300
    max_staleness_prefix    = 100000
  }
}

variable "enable_geo_redundancy" {
  description = "Enable geo-redundancy for the Cosmos DB account"
  type        = bool
  default     = false
}

variable "enable_zone_redundancy" {
  description = "Enable zone redundancy for the Cosmos DB account"
  type        = bool
  default     = false
}

variable "enable_automatic_failover" {
  description = "Enable automatic failover for the Cosmos DB account"
  type        = bool
  default     = true
}

variable "enable_multiple_write_locations" {
  description = "Enable multiple write locations for the Cosmos DB account"
  type        = bool
  default     = false
}

variable "failover_location" {
  description = "The failover location for the Cosmos DB account"
  type        = string
  default     = ""
}

variable "enable_vnet_filter" {
  description = "Enable virtual network filtering for the Cosmos DB account"
  type        = bool
  default     = false
}

variable "allowed_ips" {
  description = "List of allowed IP addresses for the Cosmos DB account"
  type        = list(string)
  default     = []
}

variable "backup" {
  description = "Backup configuration for the Cosmos DB account"
  type = object({
    type                = string
    interval_in_minutes = number
    retention_in_hours  = number
  })
  
  default = {
    type                = "Periodic"
    interval_in_minutes = 240
    retention_in_hours  = 8
  }
}

variable "additional_capabilities" {
  description = "Additional capabilities for the Cosmos DB account"
  type        = list(string)
  default     = []
}

variable "databases" {
  description = "List of Cosmos DB SQL databases and their containers"
  type = list(object({
    name                  = string
    throughput           = number
    autoscale_max_throughput = number
    containers = list(object({
      name                  = string
      partition_key_path    = string
      partition_key_version = number
      throughput           = number
      autoscale_max_throughput = number
      unique_keys = list(object({
        paths = list(string)
      }))
      indexing_policy = object({
        indexing_mode = string
        included_paths = list(object({
          path = string
        }))
        excluded_paths = list(object({
          path = string
        }))
      })
      default_ttl = number
    }))
  }))
  
  default = [
    {
      name                  = "appdb"
      throughput           = 400
      autoscale_max_throughput = 1000
      containers = [
        {
          name                  = "items"
          partition_key_path    = "/id"
          partition_key_version = 1
          throughput           = 400
          autoscale_max_throughput = 1000
          unique_keys = [
            {
              paths = ["/id"]
            }
          ]
          indexing_policy = {
            indexing_mode = "consistent"
            included_paths = [
              {
                path = "/*"
              }
            ]
            excluded_paths = [
              {
                path = "/_etag/?"
              }
            ]
          }
          default_ttl = -1
        }
      ]
    }
  ]
}

variable "enable_private_endpoint" {
  description = "Enable private endpoint for Cosmos DB"
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

variable "log_analytics_workspace_id" {
  description = "The ID of the Log Analytics workspace for diagnostics"
  type        = string
  default     = ""
}

variable "enable_diagnostic_settings" {
  description = "Enable diagnostic settings for Cosmos DB"
  type        = bool
  default     = true
}

variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}
