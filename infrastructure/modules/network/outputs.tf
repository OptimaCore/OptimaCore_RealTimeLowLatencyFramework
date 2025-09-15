output "virtual_network_name" {
  description = "The name of the virtual network"
  value       = azurerm_virtual_network.main.name
}

output "virtual_network_id" {
  description = "The ID of the virtual network"
  value       = azurerm_virtual_network.main.id
}

output "subnet_ids" {
  description = "The IDs of the subnets"
  value       = { for i, subnet in azurerm_subnet.subnets : var.subnet_names[i] => subnet.id }
}

output "network_security_group_id" {
  description = "The ID of the network security group"
  value       = azurerm_network_security_group.main.id
}

output "network_security_group_name" {
  description = "The name of the network security group"
  value       = azurerm_network_security_group.main.name
}
