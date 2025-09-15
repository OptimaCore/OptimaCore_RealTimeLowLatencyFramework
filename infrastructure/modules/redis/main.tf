locals {
  redis_name = lower("${var.project_name}${var.environment}redis")
  
  # Default Redis configuration
  default_redis_configuration = {
    maxmemory_policy       = "allkeys-lru"
    maxmemory_reserved     = 2
    maxfragmentationmemory_reserved = 2
    maxmemory_delta        = 2
  }
}

resource "azurerm_redis_cache" "main" {
  name                          = substr(local.redis_name, 0, 50) # Max 50 chars for Redis name
  location                     = var.location
  resource_group_name          = var.resource_group_name
  capacity                     = var.sku_capacity
  family                       = var.sku_family
  sku_name                     = var.sku_name
  enable_non_ssl_port          = false
  minimum_tls_version          = "1.2"
  subnet_id                    = var.subnet_id
  private_static_ip_address    = var.private_ip_address
  public_network_access_enabled = var.public_network_access_enabled
  
  # Merge default configuration with custom configuration
  redis_configuration {
    for k, v in merge(local.default_redis_configuration, var.redis_configuration)
    : k => tostring(v)
  }
  
  # Enable data persistence if configured
  dynamic "patch_schedule" {
    for_each = var.patch_schedules
    content {
      day_of_week    = patch_schedule.value.day_of_week
      start_hour_utc = patch_schedule.value.start_hour_utc
    }
  }
  
  # Enable data persistence if configured
  dynamic "redis_configuration" {
    for_each = var.enable_data_persistence ? [1] : []
    content {
      rdb_backup_enabled = true
      rdb_backup_frequency = var.rdb_backup_frequency
      rdb_backup_max_snapshot_count = var.rdb_backup_max_snapshot_count
      rdb_storage_connection_string = var.rdb_storage_connection_string
    }
  }
  
  tags = merge(var.tags, {
    component = "redis"
  })
  
  lifecycle {
    ignore_changes = [
      redis_configuration[0].rdb_storage_connection_string,
    ]
  }
}

# Private Endpoint for Redis
resource "azurerm_private_endpoint" "redis" {
  count               = var.enable_private_endpoint ? 1 : 0
  name                = "${azurerm_redis_cache.main.name}-pe"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.private_endpoint_subnet_id != "" ? var.private_endpoint_subnet_id : var.subnet_id
  
  private_service_connection {
    name                           = "${azurerm_redis_cache.main.name}-psc"
    private_connection_resource_id = azurerm_redis_cache.main.id
    is_manual_connection           = false
    subresource_names              = ["redisCache"]
  }
  
  private_dns_zone_group {
    name                 = "default"
    private_dns_zone_ids = var.private_dns_zone_ids
  }
  
  tags = var.tags
}

# Diagnostic Settings
resource "azurerm_monitor_diagnostic_setting" "redis" {
  count                      = var.enable_diagnostic_settings ? 1 : 0
  name                       = "${azurerm_redis_cache.main.name}-diag"
  target_resource_id         = azurerm_redis_cache.main.id
  log_analytics_workspace_id = var.log_analytics_workspace_id
  
  enabled_log {
    category = "ConnectedClientList"
  }
  
  enabled_log {
    category = "RedisAudit"
  }
  
  metric {
    category = "AllMetrics"
    enabled  = true
  }
  
  lifecycle {
    ignore_changes = [log_analytics_workspace_id]
  }
}
