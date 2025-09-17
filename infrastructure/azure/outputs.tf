output "web_app_name" {
  description = "The name of the web app"
  value       = azurerm_linux_web_app.main.name
}

output "web_app_url" {
  description = "The URL of the web app"
  value       = "https://${azurerm_linux_web_app.main.default_hostname}"
}

output "resource_group_name" {
  description = "The name of the resource group"
  value       = azurerm_resource_group.main.name
}

output "app_service_plan_id" {
  description = "The ID of the App Service Plan"
  value       = azurerm_service_plan.main.id
}

output "web_app_identity" {
  description = "The managed identity of the web app"
  value       = azurerm_linux_web_app.main.identity
  sensitive   = true
}
