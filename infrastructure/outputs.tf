# Resource Group Outputs
output "resource_group_name" {
  description = "The name of the resource group"
  value       = azurerm_resource_group.main.name
}

# Network Outputs
output "virtual_network_id" {
  description = "The ID of the virtual network"
  value       = module.network.virtual_network_id
}

# Redis Outputs
output "redis_hostname" {
  description = "The hostname of the Redis instance"
  value       = var.enable_redis ? module.redis[0].hostname : null
}

# PostgreSQL Outputs
output "postgresql_server_name" {
  description = "The name of the PostgreSQL server"
  value       = var.enable_postgres ? module.postgres[0].server_name : null
}

# Cosmos DB Outputs
output "cosmosdb_endpoint" {
  description = "The endpoint of the Cosmos DB account"
  value       = var.enable_cosmos ? module.cosmos[0].endpoint : null
  sensitive   = true
}

# Storage Outputs
output "storage_account_name" {
  description = "The name of the storage account"
  value       = var.enable_blob ? module.storage[0].account_name : null
}

# Monitoring Outputs
output "log_analytics_workspace_id" {
  description = "The ID of the Log Analytics workspace"
  value       = module.monitoring.log_analytics_workspace_id
}

# Budget Outputs
output "budget_id" {
  description = "The ID of the budget"
  value       = module.budget.budget_id
}

# Web App Outputs
output "webapp_url" {
  description = "The URL of the web application"
  value       = var.enable_app_service ? "https://${module.app_service[0].default_site_hostname}" : null
}

# API Outputs
output "api_url" {
  description = "The URL of the API"
  value       = var.enable_function_app ? module.function_app[0].default_hostname : null
}
