# Azure Budget Module
# This module creates an Azure Budget with configurable thresholds and action groups

resource "azurerm_consumption_budget_subscription" "budget" {
  name            = var.budget_name
  subscription_id = data.azurerm_subscription.current.subscription_id
  amount          = var.budget_amount
  time_grain     = var.time_grain
  
  time_period {
    start_date = formatdate("YYYY-MM-01T00:00:00Z", timeadd(timestamp(), "-24h"))
    end_date   = var.end_date
  }

  dynamic "notification" {
    for_each = var.notifications
    
    content {
      enabled        = notification.value.enabled
      threshold      = notification.value.threshold
      operator       = notification.value.operator
      threshold_type = notification.value.threshold_type
      
      contact_emails = notification.value.contact_emails
      
      dynamic "contact_groups" {
        for_each = notification.value.action_group_ids != null ? [1] : []
        content {
          action_group_id = notification.value.action_group_ids
        }
      }
      
      contact_roles = notification.value.contact_roles
    }
  }
  
  dynamic "filter" {
    for_each = var.filters != null ? [var.filters] : []
    
    content {
      dynamic "dimension" {
        for_each = filter.value.dimensions != null ? filter.value.dimensions : []
        
        content {
          name     = dimension.value.name
          operator = dimension.value.operator
          values   = dimension.value.values
        }
      }
      
      dynamic "tag" {
        for_each = filter.value.tags != null ? filter.value.tags : []
        
        content {
          name     = tag.value.name
          operator = tag.value.operator
          values   = tag.value.values
        }
      }
    }
  }
  
  lifecycle {
    ignore_changes = [
      time_period[0].start_date
    ]
  }
}

# Data source to get current subscription ID
data "azurerm_subscription" "current" {}

# Outputs
output "budget_id" {
  value = azurerm_consumption_budget_subscription.budget.id
}

output "budget_name" {
  value = azurerm_consumption_budget_subscription.budget.name
}
