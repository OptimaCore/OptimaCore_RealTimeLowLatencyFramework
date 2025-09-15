variable "resource_group_name" {
  description = "The name of the resource group"
  type        = string
}

variable "location" {
  description = "The Azure region where the monitoring resources will be created"
  type        = string
}

variable "environment" {
  description = "The deployment environment (e.g., dev, staging, prod)"
  type        = string
}

variable "project_name" {
  description = "The name of the project (used for resource naming)"
  type        = string
}

# Log Analytics Workspace Variables
variable "log_analytics_sku" {
  description = "The SKU of the Log Analytics workspace"
  type        = string
  default     = "PerGB2018"
  
  validation {
    condition     = contains(["Free", "PerNode", "Premium", "Standard", "Standalone", "PerGB2018", "CapacityReservation"], var.log_analytics_sku)
    error_message = "The log_analytics_sku must be one of: 'Free', 'PerNode', 'Premium', 'Standard', 'Standalone', 'PerGB2018', 'CapacityReservation'."
  }
}

variable "log_retention_in_days" {
  description = "The workspace data retention in days. Possible values are either 7 (Free Tier only) or range between 30 and 730."
  type        = number
  default     = 30
  
  validation {
    condition     = var.log_retention_in_days == 7 || (var.log_retention_in_days >= 30 && var.log_retention_in_days <= 730)
    error_message = "The log_retention_in_days must be either 7 (Free Tier only) or between 30 and 730."
  }
}

variable "daily_quota_gb" {
  description = "The workspace daily quota for ingestion in GB. Must be between 1 and 1000."
  type        = number
  default     = 1
  
  validation {
    condition     = var.daily_quota_gb >= 0.1 && var.daily_quota_gb <= 1000
    error_message = "The daily_quota_gb must be between 0.1 and 1000."
  }
}

variable "internet_ingestion_enabled" {
  description = "Should the Log Analytics Workspace support ingestion over the Public Internet?"
  type        = bool
  default     = true
}

variable "internet_query_enabled" {
  description = "Should the Log Analytics Workspace support querying over the Public Internet?"
  type        = bool
  default     = true
}

# Application Insights Variables
variable "application_insights_type" {
  description = "The type of Application Insights to create"
  type        = string
  default     = "web"
  
  validation {
    condition     = contains(["ios", "java", "MobileCenter", "Node.JS", "other", "phone", "store", "web"], var.application_insights_type)
    error_message = "The application_insights_type must be one of: 'ios', 'java', 'MobileCenter', 'Node.JS', 'other', 'phone', 'store', 'web'."
  }
}

variable "sampling_percentage" {
  description = "Percentage of data produced by the application to be sampled for Application Insights telemetry"
  type        = number
  default     = 100
  
  validation {
    condition     = var.sampling_percentage >= 0 && var.sampling_percentage <= 100
    error_message = "The sampling_percentage must be between 0 and 100."
  }
}

variable "disable_ip_masking" {
  description = "Disable IP masking for Application Insights"
  type        = bool
  default     = false
}

variable "app_insights_retention_days" {
  description = "Specifies the retention period in days. Possible values are 30, 60, 90, 120, 180, 270, 365, 550 or 730."
  type        = number
  default     = 90
  
  validation {
    condition     = contains([30, 60, 90, 120, 180, 270, 365, 550, 730], var.app_insights_retention_days)
    error_message = "The app_insights_retention_days must be one of: 30, 60, 90, 120, 180, 270, 365, 550, 730."
  }
}

variable "daily_data_cap_in_gb" {
  description = "The daily data volume cap in GB for Application Insights"
  type        = number
  default     = 100
  
  validation {
    condition     = var.daily_data_cap_in_gb >= 0.1 && var.daily_data_cap_in_gb <= 1000
    error_message = "The daily_data_cap_in_gb must be between 0.1 and 1000."
  }
}

variable "daily_data_cap_notifications_disabled" {
  description = "Disable notification when the daily data cap is reached"
  type        = bool
  default     = false
}

# Action Group Variables
variable "email_receivers" {
  description = "List of email receivers"
  type = list(object({
    name                    = string
    email_address           = string
    use_common_alert_schema = bool
  }))
  default = []
}

variable "sms_receivers" {
  description = "List of SMS receivers"
  type = list(object({
    name         = string
    country_code = string
    phone_number = string
  }))
  default = []
}

variable "webhook_receivers" {
  description = "List of webhook receivers"
  type = list(object({
    name                    = string
    service_uri             = string
    use_common_alert_schema = bool
  }))
  default = []
}

variable "azure_app_push_receivers" {
  description = "List of Azure App Push receivers"
  type = list(object({
    name          = string
    email_address = string
  }))
  default = []
}

variable "itsm_receivers" {
  description = "List of ITSM receivers"
  type = list(object({
    name                 = string
    workspace_id         = string
    connection_id        = string
    ticket_configuration = string
    region               = string
  }))
  default = []
}

variable "automation_runbook_receivers" {
  description = "List of Automation Runbook receivers"
  type = list(object({
    name                    = string
    automation_account_id   = string
    runbook_name            = string
    webhook_resource_id     = string
    is_global_runbook       = bool
    service_uri             = string
    use_common_alert_schema = bool
  }))
  default = []
}

variable "azure_function_receivers" {
  description = "List of Azure Function receivers"
  type = list(object({
    name                     = string
    function_app_resource_id = string
    function_name            = string
    http_trigger_url         = string
    use_common_alert_schema  = bool
  }))
  default = []
}

variable "logic_app_receivers" {
  description = "List of Logic App receivers"
  type = list(object({
    name                    = string
    resource_id             = string
    callback_url            = string
    use_common_alert_schema = bool
  }))
  default = []
}

variable "voice_receivers" {
  description = "List of voice receivers"
  type = list(object({
    name         = string
    country_code = string
    phone_number = string
  }))
  default = []
}

variable "arm_role_receivers" {
  description = "List of ARM Role receivers"
  type = list(object({
    name                    = string
    role_id                = string
    use_common_alert_schema = bool
  }))
  default = []
}

# Diagnostic Settings
variable "enable_diagnostic_settings" {
  description = "Enable diagnostic settings for the Log Analytics workspace"
  type        = bool
  default     = true
}

# Tags
variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}
