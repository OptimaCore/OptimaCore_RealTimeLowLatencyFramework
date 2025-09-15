# Log Analytics Workspace Outputs
output "log_analytics_workspace_id" {
  description = "The ID of the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.workspace_id
}

output "log_analytics_workspace_key" {
  description = "The primary shared key for the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.primary_shared_key
  sensitive   = true
}

output "log_analytics_workspace_name" {
  description = "The name of the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.name
}

output "log_analytics_workspace_primary_shared_key" {
  description = "The primary shared key for the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.primary_shared_key
  sensitive   = true
}

output "log_analytics_workspace_secondary_shared_key" {
  description = "The secondary shared key for the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.secondary_shared_key
  sensitive   = true
}

output "log_analytics_workspace_portal_url" {
  description = "The workspace portal URL"
  value       = azurerm_log_analytics_workspace.main.portal_url
}

# Application Insights Outputs
output "app_insights_id" {
  description = "The ID of the Application Insights resource"
  value       = azurerm_application_insights.main.id
}

output "app_insights_name" {
  description = "The name of the Application Insights resource"
  value       = azurerm_application_insights.main.name
}

output "app_insights_app_id" {
  description = "The App ID of the Application Insights resource"
  value       = azurerm_application_insights.main.app_id
}

output "app_insights_instrumentation_key" {
  description = "The Instrumentation Key for the Application Insights resource"
  value       = azurerm_application_insights.main.instrumentation_key
  sensitive   = true
}

output "app_insights_connection_string" {
  description = "The Connection String for the Application Insights resource"
  value       = azurerm_application_insights.main.connection_string
  sensitive   = true
}

# Action Group Outputs
output "action_group_id" {
  description = "The ID of the Action Group"
  value       = azurerm_monitor_action_group.main.id
}

output "action_group_name" {
  description = "The name of the Action Group"
  value       = azurerm_monitor_action_group.main.name
}

output "action_group_short_name" {
  description = "The short name of the Action Group"
  value       = azurerm_monitor_action_group.main.short_name
}

# Diagnostic Settings Outputs
output "log_analytics_diagnostic_setting_id" {
  description = "The ID of the Log Analytics diagnostic setting"
  value       = var.enable_diagnostic_settings ? azurerm_monitor_diagnostic_setting.log_analytics[0].id : null
}

# Combined Outputs
output "monitoring_resources" {
  description = "A map of all monitoring resources"
  value = {
    log_analytics_workspace = {
      id            = azurerm_log_analytics_workspace.main.id
      name          = azurerm_log_analytics_workspace.main.name
      workspace_id  = azurerm_log_analytics_workspace.main.workspace_id
      portal_url    = azurerm_log_analytics_workspace.main.portal_url
      sku           = azurerm_log_analytics_workspace.main.sku
      retention_days = azurerm_log_analytics_workspace.main.retention_in_days
    }
    application_insights = {
      id                   = azurerm_application_insights.main.id
      name                 = azurerm_application_insights.main.name
      app_id               = azurerm_application_insights.main.app_id
      instrumentation_key  = azurerm_application_insights.main.instrumentation_key
      connection_string    = azurerm_application_insights.main.connection_string
      app_type             = azurerm_application_insights.main.application_type
    }
    action_group = {
      id          = azurerm_monitor_action_group.main.id
      name        = azurerm_monitor_action_group.main.name
      short_name  = azurerm_monitor_action_group.main.short_name
    }
  }
  sensitive = true
}
