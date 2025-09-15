output "redis_cache_id" {
  description = "The ID of the Redis instance"
  value       = azurerm_redis_cache.main.id
}

output "redis_cache_name" {
  description = "The name of the Redis instance"
  value       = azurerm_redis_cache.main.name
}

output "hostname" {
  description = "The hostname of the Redis instance"
  value       = azurerm_redis_cache.main.hostname
}

output "ssl_port" {
  description = "The SSL port of the Redis instance"
  value       = azurerm_redis_cache.main.ssl_port
}

output "non_ssl_port" {
  description = "The non-SSL port of the Redis instance"
  value       = var.enable_non_ssl_port ? azurerm_redis_cache.main.port : null
}

output "primary_access_key" {
  description = "The primary access key for the Redis instance"
  value       = azurerm_redis_cache.main.primary_access_key
  sensitive   = true
}

output "secondary_access_key" {
  description = "The secondary access key for the Redis instance"
  value       = azurerm_redis_cache.main.secondary_access_key
  sensitive   = true
}

output "primary_connection_string" {
  description = "The primary connection string for the Redis instance"
  value       = "rediss://:${azurerm_redis_cache.main.primary_access_key}@${azurerm_redis_cache.main.hostname}:${azurerm_redis_cache.main.ssl_port}"
  sensitive   = true
}

output "secondary_connection_string" {
  description = "The secondary connection string for the Redis instance"
  value       = "rediss://:${azurerm_redis_cache.main.secondary_access_key}@${azurerm_redis_cache.main.hostname}:${azurerm_redis_cache.main.ssl_port}"
  sensitive   = true
}

output "private_endpoint_id" {
  description = "The ID of the private endpoint (if enabled)"
  value       = var.enable_private_endpoint ? azurerm_private_endpoint.redis[0].id : null
}

output "private_endpoint_fqdn" {
  description = "The FQDN of the private endpoint (if enabled)"
  value       = var.enable_private_endpoint ? azurerm_private_endpoint.redis[0].private_dns_zone_configs[0].record_sets[0].fqdn : null
}

output "redis_configuration" {
  description = "The Redis configuration"
  value       = azurerm_redis_cache.main.redis_configuration
  sensitive   = true
}
