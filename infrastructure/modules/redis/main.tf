locals {
  # Generate a unique name for the Redis cache with proper formatting and length constraints
  redis_name = lower(substr("${var.project_name}-${var.environment}-redis", 0, 50))
  
  # Default Redis configuration
  default_redis_config = {
    maxmemory_policy                 = "allkeys-lru"
    maxmemory_reserved              = 2
    maxfragmentationmemory_reserved = 2
    maxmemory_delta                 = 2
    notify_keyspace_events          = "KExg"
    enable_authentication           = true
  }
  
  # Merge default configuration with user-provided configuration
  merged_redis_config = merge(local.default_redis_config, var.redis_configuration)
  
  # Determine if we should create private endpoint
  create_private_endpoint = var.enable_private_endpoint && var.subnet_id != null
  
  # Determine the private endpoint subnet ID
  private_endpoint_subnet_id = coalesce(var.private_endpoint_subnet_id, var.subnet_id)
  
  # Generate a default private endpoint name if not provided
  private_endpoint_name = coalesce(var.private_endpoint_name, "${local.redis_name}-pe")
  
  # Add standard tags
  default_tags = merge(
    {
      Environment = var.environment
      ManagedBy   = "Terraform"
      Project     = var.project_name
    },
    var.tags
  )
}

resource "azurerm_redis_cache" "main" {
  name                          = local.redis_name
  location                     = var.location
  resource_group_name          = var.resource_group_name
  capacity                     = var.sku_capacity
  family                       = var.sku_family
  sku_name                     = var.sku_name
  enable_non_ssl_port          = var.enable_non_ssl_port
  minimum_tls_version          = var.minimum_tls_version
  subnet_id                    = var.subnet_id
  private_static_ip_address    = var.private_static_ip_address
  public_network_access_enabled = var.public_network_access_enabled
  shard_count                  = var.sku_name == "Premium" ? var.shard_count : null
  replicas_per_master          = var.sku_name == "Premium" ? var.replicas_per_master : null
  zones                        = var.zones
  
  # Configure Redis settings
  redis_configuration {
    for k, v in local.merged_redis_config : k => tostring(v) if k != "rdb_backup_enabled" && k != "aof_backup_enabled"
    
    # Handle RDB backup configuration if enabled
    rdb_backup_enabled            = lookup(local.merged_redis_config, "rdb_backup_enabled", false)
    rdb_backup_frequency         = lookup(local.merged_redis_config, "rdb_backup_frequency", 60)
    rdb_backup_max_snapshot_count = lookup(local.merged_redis_config, "rdb_backup_max_snapshot_count", 1)
    rdb_storage_connection_string = lookup(local.merged_redis_config, "rdb_storage_connection_string", null)
    
    # Handle AOF backup configuration if enabled
    aof_backup_enabled            = lookup(local.merged_redis_config, "aof_backup_enabled", false)
    aof_storage_connection_string_0 = lookup(local.merged_redis_config, "aof_storage_connection_string_0", null)
    aof_storage_connection_string_1 = lookup(local.merged_redis_config, "aof_storage_connection_string_1", null)
  }
  
  # Configure patch schedules if provided
  dynamic "patch_schedule" {
    for_each = var.patch_schedules
    content {
      day_of_week    = patch_schedule.value.day_of_week
      start_hour_utc = patch_schedule.value.start_hour_utc
    }
  }
  
  # Configure identity
  identity {
    type         = var.identity_type == "" ? null : var.identity_type
    identity_ids = var.user_assigned_identity_ids
  }
  
  # Configure customer managed key if provided
  dynamic "customer_managed_key" {
    for_each = var.customer_managed_key != null ? [1] : []
    content {
      key_vault_key_id   = var.customer_managed_key.key_vault_key_id
      identity_client_id = var.customer_managed_key.identity_client_id
    }
  }
  
  tags = local.default_tags
}

# Create firewall rules if provided
resource "azurerm_redis_firewall_rule" "main" {
  for_each = { for rule in var.firewall_rules : rule.name => rule }
  
  name                = each.value.name
  redis_cache_name    = azurerm_redis_cache.main.name
  resource_group_name = var.resource_group_name
  start_ip            = each.value.start_ip_address
  end_ip              = each.value.end_ip_address
  
  depends_on = [azurerm_redis_cache.main]
}

# Create private endpoint if enabled
resource "azurerm_private_endpoint" "redis" {
  count               = local.create_private_endpoint ? 1 : 0
  name                = local.private_endpoint_name
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = local.private_endpoint_subnet_id
  
  private_service_connection {
    name                           = "${local.redis_name}-psc"
    private_connection_resource_id = azurerm_redis_cache.main.id
    is_manual_connection           = false
    subresource_names              = ["redisCache"]
  }
  
  tags = local.default_tags
  
  depends_on = [azurerm_redis_cache.main]
}

# Configure diagnostic settings if enabled
resource "azurerm_monitor_diagnostic_setting" "redis" {
  count                      = var.enable_diagnostic_setting ? 1 : 0
  name                       = "${local.redis_name}-diag"
  target_resource_id         = azurerm_redis_cache.main.id
  log_analytics_workspace_id = var.log_analytics_workspace_id
  eventhub_name             = var.eventhub_name
  storage_account_id        = var.storage_account_id
  
  enabled_log {
    category = "ConnectedClientList"
  }
  
  enabled_log {
    category = "RedisAuditLogs"
  }
  
  metric {
    category = "AllMetrics"
    enabled  = true
    
    retention_policy {
      enabled = true
      days    = 30
    }
  }
  
  # Only set these if the corresponding targets are provided
  dynamic "enabled_log" {
    for_each = var.log_analytics_workspace_id != null || var.eventhub_name != null ? [1] : []
    content {
      category = "RedisAuditLogs"
      
      retention_policy {
        enabled = true
        days    = 30
      }
    }
  }
  
  lifecycle {
    ignore_changes = [log_analytics_destination_type] # Required for AzureRM 2.0+
  }
  
  depends_on = [azurerm_redis_cache.main]
}

# Create Redis modules if provided (Premium SKU only)
resource "azurerm_redis_enterprise_database" "main" {
  count               = var.sku_name == "Premium" && length(var.redis_modules) > 0 ? 1 : 0
  name                = "default"
  resource_group_name = var.resource_group_name
  cluster_id          = azurerm_redis_cache.main.id
  
  dynamic "module" {
    for_each = var.redis_modules
    content {
      name    = module.value.name
      version = module.value.version
    }
  }
  
  depends_on = [azurerm_redis_cache.main]
}

# Output the Redis connection strings and other useful information
output "redis_hostname" {
  description = "The hostname of the Redis instance"
  value       = azurerm_redis_cache.main.hostname
}

output "redis_ssl_port" {
  description = "The SSL port of the Redis instance"
  value       = azurerm_redis_cache.main.ssl_port
}

output "redis_primary_access_key" {
  description = "The primary access key for the Redis instance"
  value       = azurerm_redis_cache.main.primary_access_key
  sensitive   = true
}

output "redis_secondary_access_key" {
  description = "The secondary access key for the Redis instance"
  value       = azurerm_redis_cache.main.secondary_access_key
  sensitive   = true
}

output "redis_connection_strings" {
  description = "Connection strings for the Redis instance"
  value = {
    primary = "rediss://:${azurerm_redis_cache.main.primary_access_key}@${azurerm_redis_cache.main.hostname}:${azurerm_redis_cache.main.ssl_port}"
    secondary = "rediss://:${azurerm_redis_cache.main.secondary_access_key}@${azurerm_redis_cache.main.hostname}:${azurerm_redis_cache.main.ssl_port}"
  }
  sensitive = true
}

output "private_endpoint_ip_addresses" {
  description = "The private IP addresses of the private endpoint"
  value       = local.create_private_endpoint ? azurerm_private_endpoint.redis[0].private_service_connection[0].private_ip_address : null
}

output "redis_id" {
  description = "The ID of the Redis instance"
  value       = azurerm_redis_cache.main.id
}

output "redis_name" {
  description = "The name of the Redis instance"
  value       = azurerm_redis_cache.main.name
}

output "redis_public_network_access_enabled" {
  description = "Whether public network access is enabled"
  value       = azurerm_redis_cache.main.public_network_access_enabled
}

output "redis_private_endpoint_connection" {
  description = "The private endpoint connection details"
  value       = local.create_private_endpoint ? azurerm_private_endpoint.redis[0].private_service_connection[0] : null
}

# Output diagnostic settings if enabled
output "diagnostic_settings_id" {
  description = "The ID of the diagnostic settings"
  value       = var.enable_diagnostic_setting ? azurerm_monitor_diagnostic_setting.redis[0].id : null
}

# Output the Redis configuration
output "redis_configuration" {
  description = "The Redis configuration"
  value       = azurerm_redis_cache.main.redis_configuration
}

# Output the Redis version
output "redis_version" {
  description = "The Redis version"
  value       = azurerm_redis_cache.main.redis_version
}

# Output the Redis instance SKU
output "redis_sku" {
  description = "The Redis SKU details"
  value = {
    name     = azurerm_redis_cache.main.sku_name
    capacity = azurerm_redis_cache.main.capacity
    family   = azurerm_redis_cache.main.family
  }
}

# Output the Redis instance tags
output "redis_tags" {
  description = "The tags assigned to the Redis instance"
  value       = azurerm_redis_cache.main.tags
}

# Output the Redis instance zones
output "redis_zones" {
  description = "The availability zones for the Redis instance"
  value       = azurerm_redis_cache.main.zones
}

# Output the Redis instance identity
output "redis_identity" {
  description = "The managed identity assigned to the Redis instance"
  value       = azurerm_redis_cache.main.identity
}

# Output the Redis instance private endpoint connections
output "private_endpoint_connections" {
  description = "The private endpoint connections for the Redis instance"
  value       = azurerm_redis_cache.main.private_static_ip_address != null ? azurerm_redis_cache.main.private_endpoint_connection : null
}
