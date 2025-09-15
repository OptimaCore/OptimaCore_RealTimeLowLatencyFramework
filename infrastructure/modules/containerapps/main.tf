locals {
  # Generate a unique name for the Container App Environment
  environment_name = "${var.project_name}-${var.environment}-env"
  
  # Default tags
  default_tags = merge(var.tags, {
    environment = var.environment
    managed_by  = "terraform"
    component   = "container-apps"
  })
  
  # Default container app configuration
  default_container_app_config = {
    cpu                     = 0.5
    memory                  = "1Gi"
    min_replicas           = 1
    max_replicas           = 10
    external_ingress       = true
    allow_insecure_connect = false
  }
  
  # Merge default container app configuration with provided configuration
  container_app_config = merge(local.default_container_app_config, var.container_app_config)
}

# Container App Environment
resource "azurerm_container_app_environment" "main" {
  name                       = local.environment_name
  location                   = var.location
  resource_group_name        = var.resource_group_name
  log_analytics_workspace_id = var.log_analytics_workspace_id
  infrastructure_subnet_id   = var.infrastructure_subnet_id
  internal_load_balancer_enabled = var.internal_load_balancer_enabled
  
  # Network configuration
  dynamic "network" {
    for_each = var.network_configuration != null ? [var.network_configuration] : []
    content {
      infrastructure_subnet_id = network.value.infrastructure_subnet_id
      internal_load_balancer_enabled = network.value.internal_load_balancer_enabled
    }
  }
  
  # Tags
  tags = local.default_tags
}

# Container App
resource "azurerm_container_app" "main" {
  name                         = "${var.project_name}-${var.environment}-app"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = var.revision_mode
  
  # Identity configuration
  identity {
    type = var.identity_type
  }
  
  # Ingress configuration
  ingress {
    external_enabled = local.container_app_config.external_ingress
    target_port      = var.target_port
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
    
    dynamic "ip_security_restriction" {
      for_each = var.ip_security_restrictions
      content {
        name        = ip_security_restriction.value.name
        ip_address_range = ip_security_restriction.value.ip_address_range
        action      = ip_security_restriction.value.action
        description = lookup(ip_security_restriction.value, "description", null)
      }
    }
  }
  
  # Dapr configuration if enabled
  dynamic "dapr" {
    for_each = var.enable_dapr ? [1] : []
    content {
      app_id       = var.dapr_app_id != "" ? var.dapr_app_id : "${var.project_name}-${var.environment}-dapr"
      app_port     = var.target_port
      app_protocol = var.dapr_app_protocol
    }
  }
  
  # Template configuration
  template {
    container {
      name    = var.container_name
      image   = var.container_image
      args    = var.container_args
      command = var.container_command
      
      # Environment variables
      dynamic "env" {
        for_each = var.environment_variables
        content {
          name  = env.key
          value = env.value
        }
      }
      
      # Secret environment variables
      dynamic "env" {
        for_each = var.secret_environment_variables
        content {
          name = env.key
          secret_name = env.value.secret_name
          value = env.value.value
        }
      }
      
      # Resource requirements
      resources {
        cpu    = local.container_app_config.cpu
        memory = local.container_app_config.memory
      }
      
      # Liveness probe
      dynamic "liveness_probe" {
        for_each = var.liveness_probe != null ? [var.liveness_probe] : []
        content {
          port                    = liveness_probe.value.port
          path                    = lookup(liveness_probe.value, "path", "/")
          host                    = lookup(liveness_probe.value, "host", null)
          initial_delay           = lookup(liveness_probe.value, "initial_delay", 1)
          interval_seconds        = lookup(liveness_probe.value, "interval_seconds", 10)
          timeout                 = lookup(liveness_probe.value, "timeout", 5)
          failure_count_threshold = lookup(liveness_probe.value, "failure_count_threshold", 3)
          success_count_threshold = lookup(liveness_probe.value, "success_count_threshold", 1)
          
          dynamic "header" {
            for_each = lookup(liveness_probe.value, "headers", [])
            content {
              name  = header.value.name
              value = header.value.value
            }
          }
        }
      }
      
      # Readiness probe
      dynamic "readiness_probe" {
        for_each = var.readiness_probe != null ? [var.readiness_probe] : []
        content {
          port                    = readiness_probe.value.port
          path                    = lookup(readiness_probe.value, "path", "/")
          host                    = lookup(readiness_probe.value, "host", null)
          interval_seconds        = lookup(readiness_probe.value, "interval_seconds", 10)
          timeout                 = lookup(readiness_probe.value, "timeout", 5)
          failure_count_threshold = lookup(readiness_probe.value, "failure_count_threshold", 3)
          success_count_threshold = lookup(readiness_probe.value, "success_count_threshold", 1)
          
          dynamic "header" {
            for_each = lookup(readiness_probe.value, "headers", [])
            content {
              name  = header.value.name
              value = header.value.value
            }
          }
        }
      }
      
      # Volume mounts
      dynamic "volume_mounts" {
        for_each = var.volume_mounts
        content {
          name = volume_mounts.value.name
          path = volume_mounts.value.path
        }
      }
    }
    
    # Volume definitions
    dynamic "volume" {
      for_each = var.volumes
      content {
        name         = volume.value.name
        storage_name = volume.value.storage_name
        storage_type = volume.value.storage_type
      }
    }
    
    # Scale configuration
    min_replicas = local.container_app_config.min_replicas
    max_replicas = local.container_app_config.max_replicas
    
    # Scale rules
    dynamic "scale" {
      for_each = var.scale_rules
      content {
        name = scale.key
        
        # HTTP scale rule
        dynamic "http" {
          for_each = scale.value.http != null ? [scale.value.http] : []
          content {
            concurrent_requests = http.value.concurrent_requests
            name               = http.value.name
            
            dynamic "auth" {
              for_each = http.value.authentication != null ? [http.value.authentication] : []
              content {
                secret_name       = auth.value.secret_name
                trigger_parameter = auth.value.trigger_parameter
              }
            }
          }
        }
        
        # Event Hub scale rule
        dynamic "eventhub" {
          for_each = scale.value.eventhub != null ? [scale.value.eventhub] : []
          content {
            name              = eventhub.value.name
            threshold         = eventhub.value.threshold
            auth_trigger_name = eventhub.value.auth_trigger_name
            
            dynamic "auth" {
              for_each = eventhub.value.authentication != null ? [eventhub.value.authentication] : []
              content {
                secret_name       = auth.value.secret_name
                trigger_parameter = auth.value.trigger_parameter
              }
            }
          }
        }
        
        # Service Bus scale rule
        dynamic "servicebus" {
          for_each = scale.value.servicebus != null ? [scale.value.servicebus] : []
          content {
            name              = servicebus.value.name
            queue_name        = servicebus.value.queue_name
            message_count     = servicebus.value.message_count
            auth_trigger_name = servicebus.value.auth_trigger_name
            
            dynamic "auth" {
              for_each = servicebus.value.authentication != null ? [servicebus.value.authentication] : []
              content {
                secret_name       = auth.value.secret_name
                trigger_parameter = auth.value.trigger_parameter
              }
            }
          }
        }
      }
    }
  }
  
  # Secret references
  dynamic "secret" {
    for_each = var.secrets
    content {
      name  = secret.value.name
      value = secret.value.value
    }
  }
  
  # Tags
  tags = local.default_tags
  
  # Lifecycle
  lifecycle {
    ignore_changes = [
      template[0].container[0].image,
      secret
    ]
  }
}

# Custom Domain configuration if provided
resource "azurerm_container_app_custom_domain" "main" {
  count                     = var.custom_domain != null ? 1 : 0
  container_app_id          = azurerm_container_app.main.id
  name                      = var.custom_domain.name
  certificate_blob_base64   = var.custom_domain.certificate_blob_base64
  certificate_password      = var.custom_domain.certificate_password
  dns_zone_id               = var.custom_domain.dns_zone_id
  
  depends_on = [
    azurerm_container_app.main
  ]
}

# Diagnostic Settings
resource "azurerm_monitor_diagnostic_setting" "container_app" {
  count                      = var.enable_diagnostic_settings ? 1 : 0
  name                       = "${azurerm_container_app.main.name}-diag"
  target_resource_id         = azurerm_container_app.main.id
  log_analytics_workspace_id = var.log_analytics_workspace_id
  
  dynamic "enabled_log" {
    for_each = ["ContainerAppConsoleLogs", "ContainerAppSystemLogs"]
    content {
      category = enabled_log.value
    }
  }
  
  metric {
    category = "AllMetrics"
    enabled  = true
  }
  
  lifecycle {
    ignore_changes = [log_analytics_workspace_id]
  }
}
