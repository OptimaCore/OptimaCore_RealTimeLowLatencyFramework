locals {
  # Storage account name must be unique globally and between 3-24 characters
  # Only lowercase letters and numbers are allowed
  storage_account_name = lower(replace("${var.project_name}${var.environment}sa", "-", ""))
  
  # Default network rules
  default_network_rules = {
    bypass                     = ["AzureServices"]
    default_action             = "Deny"
    ip_rules                   = []
    virtual_network_subnet_ids = []
  }
  
  # Merge default network rules with custom rules
  network_rules = merge(local.default_network_rules, var.network_rules)
  
  # Default blob properties
  default_blob_properties = {
    versioning_enabled       = true
    change_feed_enabled      = true
    default_service_version  = "2020-06-12"
    last_access_time_enabled = true
  }
  
  # Merge default blob properties with custom properties
  blob_properties = merge(local.default_blob_properties, var.blob_properties)
}

# Storage Account
resource "azurerm_storage_account" "main" {
  name                     = substr(local.storage_account_name, 0, 24)
  resource_group_name      = var.resource_group_name
  location                = var.location
  account_tier             = var.account_tier
  account_replication_type = var.account_replication_type
  account_kind             = var.account_kind
  
  # Enable HTTPS traffic only
  enable_https_traffic_only = true
  
  # Allow blob public access
  allow_nested_items_to_be_public = false
  
  # Enable infrastructure encryption
  infrastructure_encryption_enabled = true
  
  # Enable blob versioning
  blob_properties {
    versioning_enabled       = local.blob_properties.versioning_enabled
    change_feed_enabled      = local.blob_properties.change_feed_enabled
    default_service_version  = local.blob_properties.default_service_version
    
    # Enable last access time tracking
    dynamic "last_access_time_enabled" {
      for_each = local.blob_properties.last_access_time_enabled ? [1] : []
      content {
        enabled = true
      }
    }
    
    # Configure container delete retention policy
    container_delete_retention_policy {
      days = var.container_delete_retention_days
    }
    
    # Configure delete retention policy
    delete_retention_policy {
      days = var.delete_retention_days
    }
  }
  
  # Network rules
  dynamic "network_rules" {
    for_each = [local.network_rules]
    content {
      bypass                     = network_rules.value.bypass
      default_action             = network_rules.value.default_action
      ip_rules                   = network_rules.value.ip_rules
      virtual_network_subnet_ids = network_rules.value.virtual_network_subnet_ids
    }
  }
  
  # Enable blob soft delete
  blob_properties {
    delete_retention_policy {
      days = var.soft_delete_retention
    }
  }
  
  # Enable change feed
  blob_properties {
    change_feed_enabled = true
  }
  
  # Enable container delete retention policy
  blob_properties {
    container_delete_retention_policy {
      days = 30
    }
  }
  
  # Enable static website if specified
  dynamic "static_website" {
    for_each = var.enable_static_website ? [1] : []
    content {
      index_document     = var.static_website_index_document
      error_404_document = var.static_website_error_404_document
    }
  }
  
  # Enable private endpoint if specified
  dynamic "private_endpoint" {
    for_each = var.enable_private_endpoint ? [1] : []
    content {
      name                           = "${local.storage_account_name}-pe"
      location                      = var.location
      resource_group_name           = var.resource_group_name
      subnet_id                     = var.private_endpoint_subnet_id
      private_service_connection {
        name                           = "${local.storage_account_name}-psc"
        private_connection_resource_id = azurerm_storage_account.main.id
        is_manual_connection           = false
        subresource_names              = ["blob"]
      }
      
      private_dns_zone_group {
        name                 = "default"
        private_dns_zone_ids = var.private_dns_zone_ids
      }
      
      tags = var.tags
    }
  }
  
  tags = merge(var.tags, {
    component = "storage"
  })
  
  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      tags
    ]
  }
}

# Storage Containers
resource "azurerm_storage_container" "containers" {
  for_each              = toset(var.containers)
  name                  = each.value
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = var.container_access_type
  
  depends_on = [azurerm_storage_account_network_rules.main]
}

# Storage Account Network Rules
resource "azurerm_storage_account_network_rules" "main" {
  storage_account_id = azurerm_storage_account.main.id
  
  bypass                     = local.network_rules.bypass
  default_action             = local.network_rules.default_action
  ip_rules                   = local.network_rules.ip_rules
  virtual_network_subnet_ids = local.network_rules.virtual_network_subnet_ids
  
  # Allow trusted Microsoft services to bypass the network rules
  bypass = ["AzureServices"]
  
  depends_on = [azurerm_storage_account.main]
}

# Diagnostic Settings
resource "azurerm_monitor_diagnostic_setting" "storage" {
  count                      = var.enable_diagnostic_settings ? 1 : 0
  name                       = "${local.storage_account_name}-diag"
  target_resource_id         = azurerm_storage_account.main.id
  log_analytics_workspace_id = var.log_analytics_workspace_id
  
  dynamic "enabled_log" {
    for_each = ["StorageRead", "StorageWrite", "StorageDelete"]
    content {
      category = enabled_log.value
    }
  }
  
  metric {
    category = "Transaction"
    enabled  = true
  }
  
  metric {
    category = "Capacity"
    enabled  = true
  }
  
  lifecycle {
    ignore_changes = [log_analytics_workspace_id]
  }
}
