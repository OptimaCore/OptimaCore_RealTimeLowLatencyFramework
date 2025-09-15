output "account_id" {
  description = "The ID of the Cosmos DB account"
  value       = azurerm_cosmosdb_account.main.id
}

output "account_name" {
  description = "The name of the Cosmos DB account"
  value       = azurerm_cosmosdb_account.main.name
}

output "endpoint" {
  description = "The endpoint used to connect to the Cosmos DB account"
  value       = azurerm_cosmosdb_account.main.endpoint
}

output "read_endpoints" {
  description = "A list of read endpoints available for the Cosmos DB account"
  value       = azurerm_cosmosdb_account.main.read_endpoints
}

output "write_endpoints" {
  description = "A list of write endpoints available for the Cosmos DB account"
  value       = azurerm_cosmosdb_account.main.write_endpoints
}

output "primary_master_key" {
  description = "The Primary master key for the Cosmos DB account"
  value       = azurerm_cosmosdb_account.main.primary_key
  sensitive   = true
}

output "secondary_master_key" {
  description = "The Secondary master key for the Cosmos DB account"
  value       = azurerm_cosmosdb_account.main.secondary_key
  sensitive   = true
}

output "primary_readonly_master_key" {
  description = "The Primary read-only master key for the Cosmos DB account"
  value       = azurerm_cosmosdb_account.main.primary_readonly_key
  sensitive   = true
}

output "secondary_readonly_master_key" {
  description = "The Secondary read-only master key for the Cosmos DB account"
  value       = azurerm_cosmosdb_account.main.secondary_readonly_key
  sensitive   = true
}

output "connection_strings" {
  description = "A list of connection strings available for the Cosmos DB account"
  value       = [
    "AccountEndpoint=${azurerm_cosmosdb_account.main.endpoint};AccountKey=${azurerm_cosmosdb_account.main.primary_key}",
    "AccountEndpoint=${azurerm_cosmosdb_account.main.endpoint};AccountKey=${azurerm_cosmosdb_account.main.secondary_key}"
  ]
  sensitive = true
}

output "databases" {
  description = "A map of database names to their IDs"
  value       = { for db in azurerm_cosmosdb_sql_database.databases : db.name => db.id }
}

output "containers" {
  description = "A map of container names to their full resource IDs"
  value       = { for container in azurerm_cosmosdb_sql_container.containers : container.name => container.id }
}

output "private_endpoint_id" {
  description = "The ID of the private endpoint (if enabled)"
  value       = var.enable_private_endpoint ? azurerm_private_endpoint.cosmos[0].id : null
}

output "private_endpoint_fqdn" {
  description = "The FQDN of the private endpoint (if enabled)"
  value       = var.enable_private_endpoint ? azurerm_private_endpoint.cosmos[0].private_dns_zone_configs[0].record_sets[0].fqdn : null
}

output "account_configuration" {
  description = "The configuration of the Cosmos DB account"
  value = {
    consistency_level = azurerm_cosmosdb_account.main.consistency_policy[0].consistency_level
    geo_redundancy   = var.enable_geo_redundancy
    multiple_write_locations = var.enable_multiple_write_locations
    automatic_failover = var.enable_automatic_failover
    vnet_filtering = var.enable_vnet_filter
  }
}
