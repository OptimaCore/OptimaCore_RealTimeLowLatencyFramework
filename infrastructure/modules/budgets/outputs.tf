output "id" {
  description = "The ID of the budget"
  value       = azurerm_consumption_budget_subscription.budget.id
}

output "name" {
  description = "The name of the budget"
  value       = azurerm_consumption_budget_subscription.budget.name
}

output "amount" {
  description = "The amount of the budget"
  value       = azurerm_consumption_budget_subscription.budget.amount
}

output "time_grain" {
  description = "The time grain of the budget"
  value       = azurerm_consumption_budget_subscription.budget.time_grain
}

output "time_period" {
  description = "The time period of the budget"
  value       = azurerm_consumption_budget_subscription.budget.time_period
}

output "notifications" {
  description = "The notifications configured for the budget"
  value       = azurerm_consumption_budget_subscription.budget.notification
  sensitive   = true
}

output "filters" {
  description = "The filters applied to the budget"
  value       = azurerm_consumption_budget_subscription.budget.filter
  sensitive   = true
}
