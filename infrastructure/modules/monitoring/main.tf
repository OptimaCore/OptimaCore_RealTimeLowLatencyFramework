locals {
  # Generate a unique name for the Log Analytics workspace
  workspace_name = "${var.project_name}-${var.environment}-loganalytics"
  
  # Generate a unique name for the Application Insights resource
  app_insights_name = "${var.project_name}-${var.environment}-appinsights"
  
  # Default tags
  default_tags = merge(var.tags, {
    environment = var.environment
    managed_by  = "terraform"
    component   = "monitoring"
  })
}

# Log Analytics Workspace
resource "azurerm_log_analytics_workspace" "main" {
  name                = local.workspace_name
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = var.log_analytics_sku
  retention_in_days   = var.log_retention_in_days
  
  # Enable daily quota
  daily_quota_gb = var.daily_quota_gb
  
  # Enable internet ingestion and querying
  internet_ingestion_enabled = var.internet_ingestion_enabled
  internet_query_enabled    = var.internet_query_enabled
  
  tags = local.default_tags
}

# Application Insights
resource "azurerm_application_insights" "main" {
  name                = local.app_insights_name
  location            = var.location
  resource_group_name = var.resource_group_name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = var.application_insights_type
  
  # Enable sampling if configured
  sampling_percentage = var.sampling_percentage
  
  # Enable or disable IP masking
  disable_ip_masking = var.disable_ip_masking
  
  # Retention in days (30 to 730)
  retention_in_days = var.app_insights_retention_days
  
  # Daily data cap in GB
  daily_data_cap_in_gb = var.daily_data_cap_in_gb
  
  # Disable notification emails for data cap
  daily_data_cap_notifications_disabled = var.daily_data_cap_notifications_disabled
  
  tags = local.default_tags
}

# Action Group for Alerts
resource "azurerm_monitor_action_group" "main" {
  name                = "${var.project_name}-${var.environment}-ag"
  resource_group_name = var.resource_group_name
  short_name          = substr("${var.project_name}-${var.environment}", 0, 12)
  
  # Email receiver
  dynamic "email_receiver" {
    for_each = var.email_receivers
    content {
      name                    = email_receiver.value.name
      email_address           = email_receiver.value.email_address
      use_common_alert_schema = lookup(email_receiver.value, "use_common_alert_schema", true)
    }
  }
  
  # SMS receiver
  dynamic "sms_receiver" {
    for_each = var.sms_receivers
    content {
      name         = sms_receiver.value.name
      country_code = sms_receiver.value.country_code
      phone_number = sms_receiver.value.phone_number
    }
  }
  
  # Webhook receiver
  dynamic "webhook_receiver" {
    for_each = var.webhook_receivers
    content {
      name                    = webhook_receiver.value.name
      service_uri             = webhook_receiver.value.service_uri
      use_common_alert_schema = lookup(webhook_receiver.value, "use_common_alert_schema", true)
    }
  }
  
  # Azure App Push receiver
  dynamic "azure_app_push_receiver" {
    for_each = var.azure_app_push_receivers
    content {
      name          = azure_app_push_receiver.value.name
      email_address = azure_app_push_receiver.value.email_address
    }
  }
  
  # ITSM receiver
  dynamic "itsm_receiver" {
    for_each = var.itsm_receivers
    content {
      name                 = itsm_receiver.value.name
      workspace_id         = itsm_receiver.value.workspace_id
      connection_id        = itsm_receiver.value.connection_id
      ticket_configuration = itsm_receiver.value.ticket_configuration
      region               = itsm_receiver.value.region
    }
  }
  
  # Automation Runbook receiver
  dynamic "automation_runbook_receiver" {
    for_each = var.automation_runbook_receivers
    content {
      name                    = automation_runbook_receiver.value.name
      automation_account_id   = automation_runbook_receiver.value.automation_account_id
      runbook_name            = automation_runbook_receiver.value.runbook_name
      webhook_resource_id     = automation_runbook_receiver.value.webhook_resource_id
      is_global_runbook       = lookup(automation_runbook_receiver.value, "is_global_runbook", false)
      service_uri             = automation_runbook_receiver.value.service_uri
      use_common_alert_schema = lookup(automation_runbook_receiver.value, "use_common_alert_schema", true)
    }
  }
  
  # Azure Function receiver
  dynamic "azure_function_receiver" {
    for_each = var.azure_function_receivers
    content {
      name                     = azure_function_receiver.value.name
      function_app_resource_id = azure_function_receiver.value.function_app_resource_id
      function_name            = azure_function_receiver.value.function_name
      http_trigger_url         = azure_function_receiver.value.http_trigger_url
      use_common_alert_schema  = lookup(azure_function_receiver.value, "use_common_alert_schema", true)
    }
  }
  
  # Logic App receiver
  dynamic "logic_app_receiver" {
    for_each = var.logic_app_receivers
    content {
      name                    = logic_app_receiver.value.name
      resource_id             = logic_app_receiver.value.resource_id
      callback_url            = logic_app_receiver.value.callback_url
      use_common_alert_schema = lookup(logic_app_receiver.value, "use_common_alert_schema", true)
    }
  }
  
  # Voice receiver
  dynamic "voice_receiver" {
    for_each = var.voice_receivers
    content {
      name         = voice_receiver.value.name
      country_code = voice_receiver.value.country_code
      phone_number = voice_receiver.value.phone_number
    }
  }
  
  # ARM Role receiver
  dynamic "arm_role_receiver" {
    for_each = var.arm_role_receivers
    content {
      name                    = arm_role_receiver.value.name
      role_id                = arm_role_receiver.value.role_id
      use_common_alert_schema = lookup(arm_role_receiver.value, "use_common_alert_schema", true)
    }
  }
  
  tags = local.default_tags
}

# Diagnostic Settings for the Log Analytics Workspace
resource "azurerm_monitor_diagnostic_setting" "log_analytics" {
  count                      = var.enable_diagnostic_settings ? 1 : 0
  name                       = "${local.workspace_name}-diag"
  target_resource_id         = azurerm_log_analytics_workspace.main.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  
  dynamic "enabled_log" {
    for_each = ["Audit", "AzureActivity", "Operational"]
    content {
      category = enabled_log.value
    }
  }
  
  metric {
    category = "AllMetrics"
    enabled  = true
  }
}
