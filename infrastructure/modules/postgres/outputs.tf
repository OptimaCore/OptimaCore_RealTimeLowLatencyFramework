output "server_id" {
  description = "The ID of the PostgreSQL server"
  value       = azurerm_postgresql_flexible_server.main.id
}

output "server_name" {
  description = "The name of the PostgreSQL server"
  value       = azurerm_postgresql_flexible_server.main.name
}

output "fqdn" {
  description = "The FQDN of the PostgreSQL server"
  value       = azurerm_postgresql_flexible_server.main.fqdn
}

output "administrator_login" {
  description = "The administrator login for the PostgreSQL server"
  value       = azurerm_postgresql_flexible_server.main.administrator_login
}

output "administrator_password" {
  description = "The administrator password for the PostgreSQL server"
  value       = azurerm_postgresql_flexible_server.main.administrator_password
  sensitive   = true
}

output "database_names" {
  description = "List of all database names"
  value       = [for db in azurerm_postgresql_flexible_server_database.databases : db.name]
}

output "database_ids" {
  description = "Map of database names to database IDs"
  value       = { for db in azurerm_postgresql_flexible_server_database.databases : db.name => db.id }
}

output "connection_strings" {
  description = "Map of connection strings for all databases"
  value       = {
    for db in azurerm_postgresql_flexible_server_database.databases : 
    db.name => "postgresql://${azurerm_postgresql_flexible_server.main.administrator_login}:${azurerm_postgresql_flexible_server.main.administrator_password}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/${db.name}?sslmode=require"
  }
  sensitive = true
}

output "private_endpoint_fqdn" {
  description = "The FQDN of the private endpoint (if enabled)"
  value       = var.private_dns_zone_id != "" ? azurerm_private_dns_zone_virtual_network_link.vnet_link[0].name : null
}

output "firewall_rules" {
  description = "List of all firewall rules"
  value       = [for rule in azurerm_postgresql_flexible_server_firewall_rule.rules : rule.name]
}

output "server_configuration" {
  description = "The server configuration"
  value       = {
    version     = azurerm_postgresql_flexible_server.main.version
    sku_name    = azurerm_postgresql_flexible_server.main.sku_name
    storage_mb  = azurerm_postgresql_flexible_server.main.storage_mb
    backup      = {
      retention_days = azurerm_postgresql_flexible_server.main.backup_retention_days
      geo_redundant = azurerm_postgresql_flexible_server.main.geo_redundant_backup_enabled
    }
    high_availability = {
      mode = azurerm_postgresql_flexible_server.main.high_availability[0].mode
    }
  }
}
