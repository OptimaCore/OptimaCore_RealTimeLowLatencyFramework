output "redis_connection_strings" {
  description = "The Redis connection strings (sensitive)"
  value       = module.redis.redis_connection_strings
  sensitive   = true
}

output "redis_public_network_access_enabled" {
  description = "Whether public network access is enabled for the Redis instance"
  value       = module.redis.redis_public_network_access_enabled
}

output "redis_private_endpoint_connections" {
  description = "The private endpoint connections for the Redis instance"
  value       = module.redis.private_endpoint_connections
}

output "redis_configuration" {
  description = "The Redis configuration"
  value       = module.redis.redis_configuration
}

output "redis_sku" {
  description = "The Redis SKU details"
  value       = module.redis.redis_sku
}

output "resource_group_name" {
  description = "The name of the resource group"
  value       = azurerm_resource_group.this.name
}

output "virtual_network_name" {
  description = "The name of the virtual network"
  value       = azurerm_virtual_network.this.name
}

output "key_vault_id" {
  description = "The ID of the Key Vault used for customer-managed keys"
  value       = azurerm_key_vault.this.id
}

output "log_analytics_workspace_id" {
  description = "The ID of the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.this.id
}

output "storage_account_name" {
  description = "The name of the storage account used for backups"
  value       = azurerm_storage_account.backup.name
}

output "user_assigned_identity_id" {
  description = "The ID of the user-assigned managed identity"
  value       = azurerm_user_assigned_identity.redis.id
}
