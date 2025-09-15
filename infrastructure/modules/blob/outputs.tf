output "storage_account_id" {
  description = "The ID of the storage account"
  value       = azurerm_storage_account.main.id
}

output "storage_account_name" {
  description = "The name of the storage account"
  value       = azurerm_storage_account.main.name
}

output "primary_access_key" {
  description = "The primary access key for the storage account"
  value       = azurerm_storage_account.main.primary_access_key
  sensitive   = true
}

output "secondary_access_key" {
  description = "The secondary access key for the storage account"
  value       = azurerm_storage_account.main.secondary_access_key
  sensitive   = true
}

output "primary_connection_string" {
  description = "The primary connection string for the storage account"
  value       = azurerm_storage_account.main.primary_connection_string
  sensitive   = true
}

output "secondary_connection_string" {
  description = "The secondary connection string for the storage account"
  value       = azurerm_storage_account.main.secondary_connection_string
  sensitive   = true
}

output "primary_blob_endpoint" {
  description = "The primary blob endpoint for the storage account"
  value       = azurerm_storage_account.main.primary_blob_endpoint
}

output "secondary_blob_endpoint" {
  description = "The secondary blob endpoint for the storage account"
  value       = azurerm_storage_account.main.secondary_blob_endpoint
}

output "primary_blob_host" {
  description = "The primary blob host for the storage account"
  value       = replace(azurerm_storage_account.main.primary_blob_endpoint, "https://", "")
}

output "secondary_blob_host" {
  description = "The secondary blob host for the storage account"
  value       = replace(azurerm_storage_account.main.secondary_blob_endpoint, "https://", "")
}

output "containers" {
  description = "Map of container names to container objects"
  value       = { for container in azurerm_storage_container.containers : container.name => container }
}

output "static_website_url" {
  description = "The URL of the static website (if enabled)"
  value       = var.enable_static_website ? azurerm_storage_account.main.primary_web_host : null
}

output "private_endpoint_id" {
  description = "The ID of the private endpoint (if enabled)"
  value       = var.enable_private_endpoint ? azurerm_private_endpoint.main[0].id : null
}

output "private_endpoint_fqdn" {
  description = "The FQDN of the private endpoint (if enabled)"
  value       = var.enable_private_endpoint ? azurerm_private_endpoint.main[0].private_dns_zone_configs[0].record_sets[0].fqdn : null
}

output "network_rules" {
  description = "The network rules applied to the storage account"
  value       = azurerm_storage_account_network_rules.main
  sensitive   = true
}

output "storage_account_properties" {
  description = "The properties of the storage account"
  value = {
    account_tier             = azurerm_storage_account.main.account_tier
    account_replication_type = azurerm_storage_account.main.account_replication_type
    account_kind             = azurerm_storage_account.main.account_kind
    access_tier              = azurerm_storage_account.main.access_tier
    enable_https_traffic_only = azurerm_storage_account.main.enable_https_traffic_only
    is_hns_enabled           = azurerm_storage_account.main.is_hns_enabled
    nfsv3_enabled           = azurerm_storage_account.main.nfsv3_enabled
    allow_blob_public_access = azurerm_storage_account.main.allow_blob_public_access
    min_tls_version         = azurerm_storage_account.main.min_tls_version
  }
}
