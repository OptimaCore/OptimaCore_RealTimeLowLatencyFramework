variable "resource_group_name" {
  description = "The name of the resource group"
  type        = string
}

variable "location" {
  description = "The Azure region where the storage account will be created"
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

variable "account_tier" {
  description = "The tier of the storage account (Standard or Premium)"
  type        = string
  default     = "Standard"
  
  validation {
    condition     = contains(["Standard", "Premium"], var.account_tier)
    error_message = "The account_tier must be either 'Standard' or 'Premium'."
  }
}

variable "account_replication_type" {
  description = "The type of replication to use for the storage account"
  type        = string
  default     = "GRS"
  
  validation {
    condition     = contains(["LRS", "GRS", "RAGRS", "ZRS", "GZRS", "RAGZRS"], var.account_replication_type)
    error_message = "The account_replication_type must be one of: 'LRS', 'GRS', 'RAGRS', 'ZRS', 'GZRS', 'RAGZRS'."
  }
}

variable "account_kind" {
  description = "The kind of storage account"
  type        = string
  default     = "StorageV2"
  
  validation {
    condition     = contains(["Storage", "StorageV2", "BlobStorage", "FileStorage", "BlockBlobStorage"], var.account_kind)
    error_message = "The account_kind must be one of: 'Storage', 'StorageV2', 'BlobStorage', 'FileStorage', 'BlockBlobStorage'."
  }
}

variable "containers" {
  description = "List of container names to create in the storage account"
  type        = list(string)
  default     = ["data"]
}

variable "container_access_type" {
  description = "The access level configured for the container"
  type        = string
  default     = "private"
  
  validation {
    condition     = contains(["private", "blob", "container"], var.container_access_type)
    error_message = "The container_access_type must be one of: 'private', 'blob', 'container'."
  }
}

variable "network_rules" {
  description = "Network rules for the storage account"
  type = object({
    bypass                     = list(string)
    default_action             = string
    ip_rules                   = list(string)
    virtual_network_subnet_ids = list(string)
  })
  
  default = {
    bypass                     = ["AzureServices"]
    default_action             = "Deny"
    ip_rules                   = []
    virtual_network_subnet_ids = []
  }
}

variable "blob_properties" {
  description = "Properties for the blob service"
  type = object({
    versioning_enabled       = bool
    change_feed_enabled      = bool
    default_service_version  = string
    last_access_time_enabled = bool
  })
  
  default = {
    versioning_enabled       = true
    change_feed_enabled      = true
    default_service_version  = "2020-06-12"
    last_access_time_enabled = true
  }
}

variable "delete_retention_days" {
  description = "The number of days to retain deleted blobs"
  type        = number
  default     = 30
}

variable "container_delete_retention_days" {
  description = "The number of days to retain deleted containers"
  type        = number
  default     = 30
}

variable "soft_delete_retention" {
  description = "The number of days to retain soft-deleted blobs"
  type        = number
  default     = 30
}

variable "enable_static_website" {
  description = "Enable static website hosting"
  type        = bool
  default     = false
}

variable "static_website_index_document" {
  description = "The name of the index document for the static website"
  type        = string
  default     = "index.html"
}

variable "static_website_error_404_document" {
  description = "The name of the 404 error document for the static website"
  type        = string
  default     = "404.html"
}

variable "enable_private_endpoint" {
  description = "Enable private endpoint for the storage account"
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
  description = "Enable diagnostic settings for the storage account"
  type        = bool
  default     = true
}

variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}
