# Complete example demonstrating all features of the Redis module

provider "azurerm" {
  features {}
}

# Create a resource group
resource "random_id" "this" {
  byte_length = 4
}

resource "azurerm_resource_group" "this" {
  name     = "redis-complete-example-${random_id.this.hex}-rg"
  location = var.location
  
  tags = merge(
    var.tags,
    {
      Example = "Complete Redis Configuration"
    }
  )
}

# Create a virtual network and subnets
resource "azurerm_virtual_network" "this" {
  name                = "redis-vnet-${random_id.this.hex}"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  
  tags = var.tags
}

# Subnet for Redis
resource "azurerm_subnet" "redis" {
  name                 = "redis-subnet"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = ["10.0.1.0/24"]
  
  enforce_private_link_endpoint_network_policies = true
  service_endpoints                             = ["Microsoft.Storage"]
  
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
}

# Subnet for private endpoints
resource "azurerm_subnet" "private_endpoints" {
  name                 = "private-endpoints"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = ["10.0.2.0/24"]
  
  enforce_private_link_endpoint_network_policies = true
  
  tags = var.tags
}

# Storage account for Redis backups
resource "azurerm_storage_account" "backup" {
  name                     = "redisbackup${random_id.this.hex}"
  resource_group_name      = azurerm_resource_group.this.name
  location                = azurerm_resource_group.this.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  
  network_rules {
    default_action = "Deny"
    ip_rules      = []
    virtual_network_subnet_ids = [
      azurerm_subnet.redis.id
    ]
  }
  
  tags = var.tags
}

# Log Analytics workspace for diagnostics
resource "azurerm_log_analytics_workspace" "this" {
  name                = "redis-logs-${random_id.this.hex}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  
  tags = var.tags
}

# Key Vault for customer-managed keys
resource "azurerm_key_vault" "this" {
  name                        = "redis-kv-${random_id.this.hex}"
  location                    = azurerm_resource_group.this.location
  resource_group_name         = azurerm_resource_group.this.name
  enabled_for_disk_encryption = true
  tenant_id                   = data.azurerm_client_config.current.tenant_id
  soft_delete_retention_days  = 7
  purge_protection_enabled    = true
  
  sku_name = "standard"
  
  network_acls {
    default_action = "Deny"
    bypass         = "AzureServices"
    ip_rules       = []
    virtual_network_subnet_ids = [
      azurerm_subnet.redis.id
    ]
  }
  
  tags = var.tags
}

# Key Vault access policy for current user
resource "azurerm_key_vault_access_policy" "current_user" {
  key_vault_id = azurerm_key_vault.this.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = data.azurerm_client_config.current.object_id
  
  key_permissions = [
    "Create",
    "Get",
    "List",
    "Update",
    "Delete",
    "Recover",
    "Purge",
    "GetRotationPolicy",
    "SetRotationPolicy"
  ]
  
  secret_permissions = [
    "Set",
    "Get",
    "List",
    "Delete",
    "Purge",
    "Recover"
  ]
}

# Create a key for Redis encryption
resource "azurerm_key_vault_key" "redis" {
  name         = "redis-encryption-key"
  key_vault_id = azurerm_key_vault.this.id
  key_type     = "RSA"
  key_size     = 2048
  
  key_opts = [
    "decrypt",
    "encrypt",
    "sign",
    "unwrapKey",
    "verify",
    "wrapKey",
  ]
  
  depends_on = [
    azurerm_key_vault_access_policy.current_user
  ]
  
  tags = var.tags
}

# Create a user-assigned managed identity for Redis
resource "azurerm_user_assigned_identity" "redis" {
  name                = "redis-identity-${random_id.this.hex}"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  
  tags = var.tags
}

# Grant the managed identity access to the Key Vault key
resource "azurerm_key_vault_access_policy" "redis_identity" {
  key_vault_id = azurerm_key_vault.this.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_user_assigned_identity.redis.principal_id
  
  key_permissions = [
    "Get",
    "UnwrapKey",
    "WrapKey"
  ]
  
  depends_on = [
    azurerm_user_assigned_identity.redis
  ]
}

# Deploy Redis with all features enabled
module "redis" {
  source = "../../"  # Adjust the path to the module source
  
  project_name        = "complete-example"
  environment         = var.environment
  location           = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  
  # High availability configuration
  sku_name            = "Premium"
  sku_capacity        = 1  # P1
  family              = "P"
  shard_count         = 2
  replicas_per_master = 1
  zones               = ["1", "2", "3"]
  
  # Security
  enable_non_ssl_port        = false
  minimum_tls_version        = "1.2"
  public_network_access_enabled = false
  
  # Network
  subnet_id                    = azurerm_subnet.redis.id
  private_static_ip_address    = "10.0.1.10"
  enable_private_endpoint      = true
  private_endpoint_subnet_id   = azurerm_subnet.private_endpoints.id
  
  # Redis configuration
  redis_configuration = {
    maxmemory_policy                 = "allkeys-lru"
    maxmemory_reserved              = 4
    maxfragmentationmemory_reserved = 4
    maxmemory_delta                 = 4
    notify_keyspace_events          = "KExg"
    
    # Backup configuration
    rdb_backup_enabled            = true
    rdb_backup_frequency          = 60
    rdb_backup_max_snapshot_count = 3
    rdb_storage_connection_string = azurerm_storage_account.backup.primary_blob_connection_string
    
    # AOF persistence (Premium only)
    aof_backup_enabled             = true
    aof_storage_connection_string_0 = azurerm_storage_account.backup.primary_blob_connection_string
    aof_storage_connection_string_1 = azurerm_storage_account.backup.secondary_blob_connection_string
  }
  
  # Patch schedule
  patch_schedules = [
    {
      day_of_week    = "Sunday"
      start_hour_utc = 2
    },
    {
      day_of_week    = "Wednesday"
      start_hour_utc = 3
    }
  ]
  
  # Firewall rules
  firewall_rules = [
    {
      name             = "allow-aks-nodes"
      start_ip_address = "10.0.1.0"
      end_ip_address   = "10.0.1.255"
    },
    {
      name             = "allow-vnet"
      start_ip_address = "10.0.0.0"
      end_ip_address   = "10.0.255.255"
    }
  ]
  
  # Redis modules (Premium only)
  redis_modules = [
    {
      name    = "RedisJSON"
      version = "v100"
    },
    {
      name    = "RediSearch"
      version = "v202"
    }
  ]
  
  # Customer-managed key for encryption at rest
  customer_managed_key = {
    key_vault_key_id   = azurerm_key_vault_key.redis.id
    identity_client_id = azurerm_user_assigned_identity.redis.client_id
  }
  
  # Managed identity
  identity_type = "UserAssigned"
  user_assigned_identity_ids = [azurerm_user_assigned_identity.redis.id]
  
  # Monitoring
  enable_diagnostic_setting = true
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
  storage_account_id        = azurerm_storage_account.backup.id
  
  tags = merge(
    var.tags,
    {
      Environment = var.environment
      Example     = "Complete Configuration"
    }
  )
  
  depends_on = [
    azurerm_key_vault_access_policy.redis_identity
  ]
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

output "resource_group_name" {
  value       = azurerm_resource_group.this.name
  description = "The name of the resource group"
}

data "azurerm_client_config" "current" {}
