output "redis_id" {
  description = "The ID of the Redis instance"
  value       = azurerm_redis_cache.main.id
}

output "redis_name" {
  description = "The name of the Redis instance"
  value       = azurerm_redis_cache.main.name
}

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

output "redis_public_network_access_enabled" {
  description = "Whether public network access is enabled"
  value       = azurerm_redis_cache.main.public_network_access_enabled
}

output "redis_configuration" {
  description = "The Redis configuration"
  value       = azurerm_redis_cache.main.redis_configuration
}

output "redis_version" {
  description = "The Redis version"
  value       = azurerm_redis_cache.main.redis_version
}

output "redis_sku" {
  description = "The Redis SKU details"
  value = {
    name     = azurerm_redis_cache.main.sku_name
    capacity = azurerm_redis_cache.main.capacity
    family   = azurerm_redis_cache.main.family
  }
}

output "redis_tags" {
  description = "The tags assigned to the Redis instance"
  value       = azurerm_redis_cache.main.tags
}

output "redis_zones" {
  description = "The availability zones for the Redis instance"
  value       = azurerm_redis_cache.main.zones
}

output "redis_identity" {
  description = "The managed identity assigned to the Redis instance"
  value       = azurerm_redis_cache.main.identity
}

output "private_endpoint_connections" {
  description = "The private endpoint connections for the Redis instance"
  value       = azurerm_redis_cache.main.private_static_ip_address != null ? azurerm_redis_cache.main.private_endpoint_connection : null
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
