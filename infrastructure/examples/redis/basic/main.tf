# Basic example of using the Redis module

provider "azurerm" {
  features {}
}

# Create a resource group
resource "random_id" "this" {
  byte_length = 4
}

resource "azurerm_resource_group" "this" {
  name     = "redis-basic-example-${random_id.this.hex}-rg"
  location = var.location
  
  tags = merge(
    var.tags,
    {
      Example = "Basic Redis Configuration"
    }
  )
}

# Create a virtual network and subnet
resource "azurerm_virtual_network" "this" {
  name                = "redis-vnet-${random_id.this.hex}"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  
  tags = var.tags
}

resource "azurerm_subnet" "redis" {
  name                 = "redis-subnet"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = ["10.0.1.0/24"]
  
  enforce_private_link_endpoint_network_policies = true
  
  # Required for Redis
  delegation {
    name = "redis-delegation"
    
    service_delegation {
      name    = "Microsoft.Cache/redis"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action"
      ]
    }
  }
  
  tags = var.tags
}

# Deploy Redis with basic configuration
module "redis" {
  source = "../../"  # Adjust the path to the module source
  
  project_name        = "basic-example"
  environment         = var.environment
  location           = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  
  # Basic configuration
  sku_name     = "Standard"
  sku_capacity = 1
  family       = "C"
  
  # Network
  subnet_id                    = azurerm_subnet.redis.id
  public_network_access_enabled = true
  
  # Basic Redis configuration
  redis_configuration = {
    maxmemory_policy        = "allkeys-lru"
    maxmemory_reserved      = 2
    notify_keyspace_events  = "KExg"
  }
  
  tags = merge(
    var.tags,
    {
      Environment = var.environment
      Example     = "Basic Configuration"
    }
  )
}

# Output the Redis connection details
output "redis_hostname" {
  value       = module.redis.redis_hostname
  description = "The hostname of the Redis instance"
}

output "redis_ssl_port" {
  value       = module.redis.redis_ssl_port
  description = "The SSL port of the Redis instance"
}

output "resource_group_name" {
  value       = azurerm_resource_group.this.name
  description = "The name of the resource group"
}
