locals {
  server_name = lower("${var.project_name}-${var.environment}-psql")
  
  # Default PostgreSQL configuration
  default_postgres_config = {
    backretention_days        = 7
    geo_redundant_backup_enabled = false
    administrator_login       = "psqladmin"
    ssl_enforcement_enabled   = true
    ssl_minimal_tls_version  = "TLS1_2"
    storage_mb               = 32768
    auto_grow_enabled        = true
  }
  
  # Merge default configuration with custom configuration
  postgres_config = merge(local.default_postgres_config, var.postgres_config)
}

# Generate random password if not provided
resource "random_password" "postgres_admin" {
  length           = 32
  special          = true
  override_special = "_%@"
}

# PostgreSQL Server
resource "azurerm_postgresql_flexible_server" "main" {
  name                   = local.server_name
  resource_group_name    = var.resource_group_name
  location              = var.location
  version               = var.postgres_version
  administrator_login    = local.postgres_config.administrator_login
  administrator_password = var.administrator_password != "" ? var.administrator_password : random_password.postgres_admin.result
  
  # Network configuration
  delegated_subnet_id    = var.subnet_id
  private_dns_zone_id   = var.private_dns_zone_id
  
  # Storage configuration
  storage_mb            = local.postgres_config.storage_mb
  auto_grow_enabled     = local.postgres_config.auto_grow_enabled
  
  # Backup configuration
  backup_retention_days        = local.postgres_config.backup_retention_days
  geo_redundant_backup_enabled = local.postgres_config.geo_redundant_backup_enabled
  
  # Security
  ssl_enforcement_enabled = local.postgres_config.ssl_enforcement_enabled
  ssl_minimal_tls_version_enforced = local.postgres_config.ssl_minimal_tls_version
  
  # Performance
  sku_name   = var.sku_name
  
  # High availability
  high_availability {
    mode = var.high_availability_mode
  }
  
  # Maintenance window
  maintenance_window {
    day_of_week  = var.maintenance_window.day_of_week
    start_hour   = var.maintenance_window.start_hour
    start_minute = var.maintenance_window.start_minute
  }
  
  tags = merge(var.tags, {
    component = "postgresql"
  })
  
  lifecycle {
    ignore_changes = [
      administrator_password,
      zone,
      high_availability.0.standby_availability_zone
    ]
  }
}

# PostgreSQL Database
resource "azurerm_postgresql_flexible_server_database" "databases" {
  for_each = toset(var.databases)
  
  name      = each.value
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = var.database_charset
  collation = var.database_collation
}

# Firewall rules
resource "azurerm_postgresql_flexible_server_firewall_rule" "rules" {
  for_each = { for rule in var.firewall_rules : rule.name => rule }
  
  name             = each.key
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = each.value.start_ip
  end_ip_address   = each.value.end_ip
}

# VNET integration
resource "azurerm_private_dns_zone_virtual_network_link" "vnet_link" {
  count = var.private_dns_zone_id != "" ? 1 : 0
  
  name                  = "${local.server_name}-vnet-link"
  private_dns_zone_id   = var.private_dns_zone_id
  virtual_network_id    = var.virtual_network_id
  registration_enabled = false
  
  depends_on = [azurerm_postgresql_flexible_server.main]
}

# Diagnostic Settings
resource "azurerm_monitor_diagnostic_setting" "postgres" {
  count                      = var.enable_diagnostic_settings ? 1 : 0
  name                       = "${local.server_name}-diag"
  target_resource_id         = azurerm_postgresql_flexible_server.main.id
  log_analytics_workspace_id = var.log_analytics_workspace_id
  
  dynamic "enabled_log" {
    for_each = ["PostgreSQLLogs", "QueryStoreRuntimeStatistics", "QueryStoreWaitStatistics"]
    content {
      category = enabled_log.value
    }
  }
  
  metric {
    category = "AllMetrics"
    enabled  = true
  }
  
  lifecycle {
    ignore_changes = [log_analytics_workspace_id]
  }
}
