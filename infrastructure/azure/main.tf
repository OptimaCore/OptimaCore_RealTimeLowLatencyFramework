# Configure the Azure provider
provider "azurerm" {
  features {}
  
  # It's recommended to use environment variables for authentication
  # AZURE_SUBSCRIPTION_ID
  # AZURE_CLIENT_ID
  # AZURE_CLIENT_SECRET
  # AZURE_TENANT_ID
}

# Create a resource group
resource "azurerm_resource_group" "main" {
  name     = "${var.app_name}-rg"
  location = var.location
  
  tags = {
    environment = var.environment
    application = var.app_name
  }
}

# Create an App Service Plan
resource "azurerm_service_plan" "main" {
  name                = "${var.app_name}-asp"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  os_type             = "Linux"
  sku_name            = var.app_service_plan_sku
  
  tags = {
    environment = var.environment
    application = var.app_name
  }
}

# Create the web app
resource "azurerm_linux_web_app" "main" {
  name                = "${var.app_name}-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  service_plan_id     = azurerm_service_plan.main.id
  
  site_config {
    always_on = true
    
    application_stack {
      node_version = "18-lts"
    }
    
    # Health check settings
    health_check_path = "/health"
  }
  
  # Application settings
  app_settings = {
    "WEBSITE_NODE_DEFAULT_VERSION" = "~18"
    "NODE_ENV"                    = var.environment
    "PORT"                        = "8080"
    "HOST"                        = "0.0.0.0"
    "ENABLE_METRICS"              = "true"
    "ENABLE_REQUEST_LOGGING"      = var.environment == "production" ? "false" : "true"
    "TRUST_PROXY"                 = "true"
    "MAX_MEMORY_THRESHOLD"        = "0.9"
    
    # These would typically come from Key Vault in production
    "APP_INSIGHTS_INSTRUMENTATION_KEY" = var.app_insights_instrumentation_key
    "APP_INSIGHTS_CONNECTION_STRING"   = var.app_insights_connection_string
    
    # Database and other service connections would go here
    # "DATABASE_URL" = var.database_connection_string
    # "REDIS_URL"    = var.redis_connection_string
  }
  
  # Enable application logs
  logs {
    application_logs {
      file_system_level = var.environment == "production" ? "Error" : "Information"
    }
    
    http_logs {
      file_system {
        retention_in_days = 7
        retention_in_mb   = 100
      }
    }
  }
  
  identity {
    type = "SystemAssigned"
  }
  
  tags = {
    environment = var.environment
    application = var.app_name
  }
  
  lifecycle {
    ignore_changes = [
      site_config[0].application_stack[0].docker_image,
      site_config[0].application_stack[0].docker_image_tag
    ]
  }
}

# Output the web app URL
output "app_url" {
  value = "https://${azurerm_linux_web_app.main.default_hostname}"
}

# Output the app insights instrumentation key
output "app_insights_instrumentation_key" {
  value     = var.app_insights_instrumentation_key
  sensitive = true
}

# Output the app insights connection string
output "app_insights_connection_string" {
  value     = var.app_insights_connection_string
  sensitive = true
}
