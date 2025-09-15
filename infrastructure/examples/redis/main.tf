# Example of using the Redis module in a production-like environment

provider "azurerm" {
  features {}
}

# Create a resource group
resource "azurerm_resource_group" "example" {
  name     = "example-redis-rg"
  location = "eastus"
  
  tags = {
    Environment = "Example"
    ManagedBy   = "Terraform"
  }
}

# Create a virtual network
resource "azurerm_virtual_network" "example" {
  name                = "example-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.example.location
  resource_group_name = azurerm_resource_group.example.name
  
  tags = {
    Environment = "Example"
  }
}

# Create a subnet for Redis
resource "azurerm_subnet" "redis" {
  name                 = "redis-subnet"
  resource_group_name  = azurerm_resource_group.example.name
  virtual_network_name = azurerm_virtual_network.example.name
  address_prefixes     = ["10.0.1.0/24"]
  
  # Required for Redis
  enforce_private_link_endpoint_network_policies = true
}

# Create a subnet for private endpoints
resource "azurerm_subnet" "private_endpoints" {
  name                 = "private-endpoints-subnet"
  resource_group_name  = azurerm_resource_group.example.name
  virtual_network_name = azurerm_virtual_network.example.name
  address_prefixes     = ["10.0.2.0/24"]
  
  enforce_private_link_endpoint_network_policies = true
}

# Create a storage account for Redis backups
resource "azurerm_storage_account" "backup" {
  name                     = "exampleredisbackup"
  resource_group_name      = azurerm_resource_group.example.name
  location                = azurerm_resource_group.example.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  
  network_rules {
    default_action = "Deny"
    ip_rules      = []
    virtual_network_subnet_ids = [
      azurerm_subnet.redis.id
    ]
  }
  
  tags = {
    Environment = "Example"
  }
}

# Create a Log Analytics Workspace for monitoring
resource "azurerm_log_analytics_workspace" "example" {
  name                = "example-redis-law"
  location            = azurerm_resource_group.example.location
  resource_group_name = azurerm_resource_group.example.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  
  tags = {
    Environment = "Example"
  }
}

# Deploy Redis using our module
module "redis" {
  source = "../../modules/redis"

  project_name         = "exampleapp"
  environment          = "prod"
  location             = azurerm_resource_group.example.location
  resource_group_name  = azurerm_resource_group.example.name
  
  # Redis configuration
  sku_name            = "Premium"
  sku_capacity        = 1
  family              = "P"
  enable_non_ssl_port = false
  
  # Network configuration
  subnet_id                    = azurerm_subnet.redis.id
  private_static_ip_address    = "10.0.1.10"
  public_network_access_enabled = false
  
  # Private endpoint
  enable_private_endpoint      = true
  private_endpoint_subnet_id   = azurerm_subnet.private_endpoints.id
  
  # Monitoring
  enable_diagnostic_setting   = true
  log_analytics_workspace_id = azurerm_log_analytics_workspace.example.id
  
  # Redis modules (Premium only)
  redis_modules = [
    {
      name    = "RedisJSON"
      version = "v100"
    }
  ]
  
  # Backup configuration
  redis_configuration = {
    rdb_backup_enabled            = true
    rdb_backup_frequency          = 60
    rdb_backup_max_snapshot_count = 3
    rdb_storage_connection_string = azurerm_storage_account.backup.primary_blob_connection_string
    maxmemory_policy              = "allkeys-lru"
    maxmemory_reserved            = 4
    maxfragmentationmemory_reserved = 4
    maxmemory_delta               = 4
  }
  
  # Firewall rules
  firewall_rules = [
    {
      name             = "allow-aks-nodes"
      start_ip_address = "10.1.0.0"
      end_ip_address   = "10.1.255.255"
    }
  ]
  
  # Patch schedule
  patch_schedules = [
    {
      day_of_week    = "Sunday"
      start_hour_utc = 2
    }
  ]
  
  tags = {
    Environment = "Production"
    ManagedBy   = "Terraform"
    Component   = "Cache"
  }
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

output "private_endpoint_fqdn" {
  value       = module.redis.private_endpoint_fqdn
  description = "The FQDN of the private endpoint"
}
