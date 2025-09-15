# Container App Environment Outputs
output "container_app_environment_id" {
  description = "The ID of the Container App Environment"
  value       = azurerm_container_app_environment.main.id
}

output "container_app_environment_name" {
  description = "The name of the Container App Environment"
  value       = azurerm_container_app_environment.main.name
}

output "container_app_environment_default_domain" {
  description = "The default domain of the Container App Environment"
  value       = azurerm_container_app_environment.main.default_domain
}

output "container_app_environment_static_ip_address" {
  description = "The static IP address of the Container App Environment"
  value       = azurerm_container_app_environment.main.static_ip_address
}

# Container App Outputs
output "container_app_id" {
  description = "The ID of the Container App"
  value       = azurerm_container_app.main.id
}

output "container_app_name" {
  description = "The name of the Container App"
  value       = azurerm_container_app.main.name
}

output "container_app_fqdn" {
  description = "The FQDN of the Container App"
  value       = azurerm_container_app.main.latest_revision_fqdn
}

output "container_app_ingress_fqdn" {
  description = "The FQDN of the Container App's ingress"
  value       = azurerm_container_app.main.ingress[0].fqdn
}

output "container_app_identity" {
  description = "The identity block of the Container App"
  value       = azurerm_container_app.main.identity
  sensitive   = true
}

output "container_app_secrets" {
  description = "The secrets of the Container App"
  value       = azurerm_container_app.main.secrets
  sensitive   = true
}

# Custom Domain Outputs
output "custom_domain_fqdn" {
  description = "The FQDN of the custom domain (if configured)"
  value       = var.custom_domain != null ? azurerm_container_app_custom_domain.main[0].fqdn : null
}

output "custom_domain_id" {
  description = "The ID of the custom domain (if configured)"
  value       = var.custom_domain != null ? azurerm_container_app_custom_domain.main[0].id : null
}

# Combined Outputs
output "container_app_resources" {
  description = "A map of all container app resources"
  value = {
    environment = {
      id                = azurerm_container_app_environment.main.id
      name              = azurerm_container_app_environment.main.name
      default_domain    = azurerm_container_app_environment.main.default_domain
      static_ip_address = azurerm_container_app_environment.main.static_ip_address
    }
    app = {
      id       = azurerm_container_app.main.id
      name     = azurerm_container_app.main.name
      fqdn     = azurerm_container_app.main.latest_revision_fqdn
      revision = azurerm_container_app.main.latest_revision_name
      ingress = {
        fqdn       = azurerm_container_app.main.ingress[0].fqdn
        external   = azurerm_container_app.main.ingress[0].external_enabled
        target_port = azurerm_container_app.main.ingress[0].target_port
      }
      identity = azurerm_container_app.main.identity
    }
    custom_domain = var.custom_domain != null ? {
      fqdn = azurerm_container_app_custom_domain.main[0].fqdn
      id   = azurerm_container_app_custom_domain.main[0].id
    } : null
  }
  sensitive = true
}
