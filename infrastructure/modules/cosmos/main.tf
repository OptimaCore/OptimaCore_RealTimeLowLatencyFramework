locals {
  account_name = lower("${var.project_name}${var.environment}cosmos")
  
  # Default consistency level
  default_consistency_level = var.consistency_level == "" ? "Session" : var.consistency_level
  
  # Default failover locations
  default_failover_locations = [{
    location          = var.failover_location != "" ? var.failover_location : var.location
    failover_priority = 0
  }]
  
  # Enable multiple write locations if geo-redundancy is enabled
  enable_multiple_write_locations = var.enable_geo_redundancy && var.enable_multiple_write_locations
  
  # Default capabilities
  default_capabilities = ["EnableServerless"]
  
  # Default backup settings
  default_backup = {
    type                = "Periodic"
    interval_in_minutes = 240
    retention_in_hours  = 8
  }
  
  # Merge default backup with custom settings
  backup = merge(local.default_backup, var.backup)
}

# Cosmos DB Account
resource "azurerm_cosmosdb_account" "main" {
  name                = local.account_name
  location            = var.location
  resource_group_name = var.resource_group_name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"
  
  # Consistency
  consistency_policy {
    consistency_level       = local.default_consistency_level
    max_interval_in_seconds = var.consistency_policy.max_interval_in_seconds
    max_staleness_prefix    = var.consistency_policy.max_staleness_prefix
  }
  
  # Geo-redundancy and failover
  geo_location {
    location          = var.location
    failover_priority = 0
    zone_redundant   = var.enable_zone_redundancy
  }
  
  # Add failover locations if geo-redundancy is enabled
  dynamic "geo_location" {
    for_each = var.enable_geo_redundancy ? local.default_failover_locations : []
    content {
      location          = geo_location.value.location
      failover_priority = geo_location.value.failover_priority
      zone_redundant   = var.enable_zone_redundancy
    }
  }
  
  # Network
  is_virtual_network_filter_enabled = var.enable_vnet_filter
  ip_range_filter                  = join(",", var.allowed_ips)
  
  # Backup
  backup {
    type                = local.backup.type
    interval_in_minutes = local.backup.interval_in_minutes
    retention_in_hours  = local.backup.retention_in_hours
  }
  
  # Capabilities
  dynamic "capabilities" {
    for_each = concat(local.default_capabilities, var.additional_capabilities)
    content {
      name = capabilities.value
    }
  }
  
  # Features
  enable_automatic_failover = var.enable_automatic_failover
  enable_multiple_write_locations = local.enable_multiple_write_locations
  
  # Identity
  identity {
    type = "SystemAssigned"
  }
  
  tags = merge(var.tags, {
    component = "cosmosdb"
  })
  
  lifecycle {
    ignore_changes = [
      capabilities,
      geo_location
    ]
  }
}

# Cosmos DB SQL Database
resource "azurerm_cosmosdb_sql_database" "databases" {
  for_each            = { for db in var.databases : db.name => db }
  
  name                = each.value.name
  resource_group_name = var.resource_group_name
  account_name        = azurerm_cosmosdb_account.main.name
  throughput          = each.value.throughput
  
  autoscale_settings {
    max_throughput = each.value.autoscale_max_throughput
  }
}

# Cosmos DB SQL Containers
resource "azurerm_cosmosdb_sql_container" "containers" {
  for_each = { 
    for container in local.containers : 
    "${container.database_name}.${container.name}" => container 
  }
  
  name                  = each.value.name
  resource_group_name   = var.resource_group_name
  account_name         = azurerm_cosmosdb_account.main.name
  database_name        = each.value.database_name
  partition_key_path   = each.value.partition_key_path
  partition_key_version = each.value.partition_key_version
  throughput          = each.value.throughput
  
  dynamic "autoscale_settings" {
    for_each = each.value.autoscale_max_throughput != null ? [1] : []
    content {
      max_throughput = each.value.autoscale_max_throughput
    }
  }
  
  dynamic "unique_key" {
    for_each = each.value.unique_keys
    content {
      paths = unique_key.value.paths
    }
  }
  
  indexing_policy {
    indexing_mode = each.value.indexing_policy.indexing_mode
    
    dynamic "included_path" {
      for_each = each.value.indexing_policy.included_paths
      content {
        path = included_path.value.path
      }
    }
    
    dynamic "excluded_path" {
      for_each = each.value.indexing_policy.excluded_paths
      content {
        path = excluded_path.value.path
      }
    }
  }
  
  # Default TTL in seconds (0 = disabled)
  default_ttl = each.value.default_ttl
}

# Private Endpoint for Cosmos DB
resource "azurerm_private_endpoint" "cosmos" {
  count               = var.enable_private_endpoint ? 1 : 0
  name                = "${azurerm_cosmosdb_account.main.name}-pe"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.private_endpoint_subnet_id
  
  private_service_connection {
    name                           = "${azurerm_cosmosdb_account.main.name}-psc"
    private_connection_resource_id = azurerm_cosmosdb_account.main.id
    is_manual_connection           = false
    subresource_names              = ["Sql"]
  }
  
  private_dns_zone_group {
    name                 = "default"
    private_dns_zone_ids = var.private_dns_zone_ids
  }
  
  tags = var.tags
}

# Diagnostic Settings
resource "azurerm_monitor_diagnostic_setting" "cosmos" {
  count                      = var.enable_diagnostic_settings ? 1 : 0
  name                       = "${azurerm_cosmosdb_account.main.name}-diag"
  target_resource_id         = azurerm_cosmosdb_account.main.id
  log_analytics_workspace_id = var.log_analytics_workspace_id
  
  enabled_log {
    category = "DataPlaneRequests"
  }
  
  enabled_log {
    category = "QueryRuntimeStatistics"
  }
  
  enabled_log {
    category = "PartitionKeyStatistics"
  }
  
  enabled_log {
    category = "PartitionKeyRUConsumption"
  }
  
  metric {
    category = "Requests"
    enabled  = true
  }
  
  metric {
    category = "DataUsage"
    enabled  = true
  }
  
  lifecycle {
    ignore_changes = [log_analytics_workspace_id]
  }
}
