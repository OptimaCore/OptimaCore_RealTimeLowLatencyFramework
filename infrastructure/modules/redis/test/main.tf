# Test configuration for the Redis module

provider "azurerm" {
  features {}
}

# Create a resource group for testing
resource "random_id" "test" {
  byte_length = 4
}

resource "azurerm_resource_group" "test" {
  name     = "test-redis-${random_id.test.hex}-rg"
  location = var.location
}

# Create a virtual network and subnets
resource "azurerm_virtual_network" "test" {
  name                = "test-redis-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.test.location
  resource_group_name = azurerm_resource_group.test.name
}

resource "azurerm_subnet" "redis" {
  name                 = "redis-subnet"
  resource_group_name  = azurerm_resource_group.test.name
  virtual_network_name = azurerm_virtual_network.test.name
  address_prefixes     = ["10.0.1.0/24"]
  
  enforce_private_link_endpoint_network_policies = true
}

resource "azurerm_subnet" "private_endpoints" {
  name                 = "private-endpoints-subnet"
  resource_group_name  = azurerm_resource_group.test.name
  virtual_network_name = azurerm_virtual_network.test.name
  address_prefixes     = ["10.0.2.0/24"]
  
  enforce_private_link_endpoint_network_policies = true
}

# Test Redis with minimal configuration
module "redis_minimal" {
  source = "../"
  
  project_name        = "testmin"
  environment         = "test"
  location           = azurerm_resource_group.test.location
  resource_group_name = azurerm_resource_group.test.name
  
  # Basic configuration
  sku_name     = "Basic"
  sku_capacity = 0  # C0 (free tier)
  family       = "C"
  
  # Network
  subnet_id                    = azurerm_subnet.redis.id
  public_network_access_enabled = true
  
  tags = {
    Test = "minimal"
  }
}

# Test Redis with all features enabled
module "redis_complete" {
  source = "../"
  
  project_name        = "testcomplete"
  environment         = "test"
  location           = azurerm_resource_group.test.location
  resource_group_name = azurerm_resource_group.test.name
  
  # High availability configuration
  sku_name            = "Premium"
  sku_capacity        = 1  # P1
  family              = "P"
  shard_count         = 1
  replicas_per_master = 1
  
  # Network
  subnet_id                    = azurerm_subnet.redis.id
  private_static_ip_address    = "10.0.1.10"
  public_network_access_enabled = false
  
  # Private endpoint
  enable_private_endpoint    = true
  private_endpoint_subnet_id = azurerm_subnet.private_endpoints.id
  
  # Redis configuration
  redis_configuration = {
    maxmemory_policy                 = "allkeys-lru"
    maxmemory_reserved              = 2
    maxfragmentationmemory_reserved = 2
    maxmemory_delta                 = 2
    notify_keyspace_events          = "KExg"
    rdb_backup_enabled              = false
    aof_backup_enabled              = false
  }
  
  # Firewall rules
  firewall_rules = [
    {
      name             = "test-rule"
      start_ip_address = "10.0.1.0"
      end_ip_address   = "10.0.1.255"
    }
  ]
  
  # Patch schedule
  patch_schedules = [
    {
      day_of_week    = "Saturday"
      start_hour_utc = 2
    }
  ]
  
  # Identity
  identity_type = "SystemAssigned"
  
  tags = {
    Test = "complete"
  }
}

# Output test results
output "minimal_redis_hostname" {
  value = module.redis_minimal.redis_hostname
}

output "complete_redis_hostname" {
  value = module.redis_complete.redis_hostname
}

output "resource_group_name" {
  value = azurerm_resource_group.test.name
}

output "location" {
  value = azurerm_resource_group.test.location
}
