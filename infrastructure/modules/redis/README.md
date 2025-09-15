# Azure Redis Cache Module

This Terraform module deploys an Azure Redis Cache instance with configurable settings for high availability, security, and monitoring.

## Features

- **Multiple SKU Support**: Deploy Basic, Standard, or Premium tier Redis caches
- **High Availability**: Configure replication, sharding, and availability zones
- **Security**: Private endpoints, network isolation, and TLS encryption
- **Monitoring**: Built-in diagnostics and integration with Azure Monitor
- **Backup & Recovery**: Configurable RDB and AOF persistence options
- **Scalability**: Support for clustering and horizontal scaling

## Usage

```hcl
module "redis" {
  source = "../../modules/redis"

  project_name         = "myapp"
  environment          = "prod"
  location             = "eastus"
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
  
  tags = {
    Environment = "Production"
    ManagedBy   = "Terraform"
  }
}
```

## Requirements

| Name | Version |
|------|---------|
| terraform | >= 1.0.0 |
| azurerm | >= 3.0.0 |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| project_name | The name of the project | `string` | n/a | yes |
| environment | The deployment environment (dev, staging, prod) | `string` | n/a | yes |
| location | The Azure region where the Redis cache will be created | `string` | n/a | yes |
| resource_group_name | The name of the resource group | `string` | n/a | yes |
| sku_name | The SKU of Redis to use (Basic, Standard, Premium) | `string` | `"Premium"` | no |
| sku_capacity | The size of the Redis cache to deploy | `number` | `1` | no |
| family | The SKU family to use (C for Basic/Standard, P for Premium) | `string` | `"P"` | no |
| enable_non_ssl_port | Enable the non-SSL port (6379) for Redis | `bool` | `false` | no |
| minimum_tls_version | The minimum TLS version for Redis connections | `string` | `"1.2"` | no |
| subnet_id | The ID of the subnet where the Redis cache will be deployed | `string` | `null` | no |
| private_static_ip_address | The Static IP Address to assign to the Redis Cache when hosted inside a VNet | `string` | `null` | no |
| public_network_access_enabled | Whether or not public network access is allowed | `bool` | `false` | no |
| enable_private_endpoint | Enable private endpoint for the Redis Cache | `bool` | `true` | no |
| private_endpoint_subnet_id | The ID of the subnet for the private endpoint | `string` | `null` | no |
| redis_configuration | Redis configuration settings | `map(any)` | `{}` | no |
| patch_schedules | List of patch schedules for the Redis Cache | `list(map(string))` | `[]` | no |
| firewall_rules | List of firewall rules to apply to the Redis Cache | `list(map(string))` | `[]` | no |
| redis_modules | List of Redis modules to enable | `list(map(string))` | `[]` | no |
| enable_diagnostic_setting | Enable diagnostic settings for the Redis Cache | `bool` | `true` | no |
| log_analytics_workspace_id | The ID of the Log Analytics Workspace to send diagnostics to | `string` | `null` | no |
| eventhub_name | The name of the Event Hub to send diagnostics to | `string` | `null` | no |
| storage_account_id | The ID of the Storage Account to send diagnostics to | `string` | `null` | no |
| customer_managed_key | Customer managed key settings for encryption at rest | `map(string)` | `null` | no |
| identity_type | The type of Managed Identity to assign to the Redis Cache | `string` | `"SystemAssigned"` | no |
| user_assigned_identity_ids | A list of User Assigned Managed Identity IDs | `list(string)` | `[]` | no |
| zones | A list of availability zones for the Redis Cache | `list(string)` | `[]` | no |
| tags | A mapping of tags to assign to the resource | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| redis_id | The ID of the Redis instance |
| redis_name | The name of the Redis instance |
| redis_hostname | The hostname of the Redis instance |
| redis_ssl_port | The SSL port of the Redis instance |
| redis_primary_access_key | The primary access key for the Redis instance |
| redis_secondary_access_key | The secondary access key for the Redis instance |
| redis_connection_strings | Connection strings for the Redis instance |
| redis_public_network_access_enabled | Whether public network access is enabled |
| redis_configuration | The Redis configuration |
| redis_version | The Redis version |
| redis_sku | The Redis SKU details |
| redis_tags | The tags assigned to the Redis instance |
| redis_zones | The availability zones for the Redis instance |
| redis_identity | The managed identity assigned to the Redis instance |
| private_endpoint_connections | The private endpoint connections for the Redis instance |
| private_endpoint_id | The ID of the private endpoint (if enabled) |
| private_endpoint_fqdn | The FQDN of the private endpoint (if enabled) |

## Example: Production Deployment

```hcl
module "redis_prod" {
  source = "../../modules/redis"

  project_name         = "myapp"
  environment          = "prod"
  location             = "eastus"
  resource_group_name  = azurerm_resource_group.example.name
  
  # High availability configuration
  sku_name            = "Premium"
  sku_capacity        = 2
  family              = "P"
  shard_count         = 3
  replicas_per_master = 2
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
  
  # Monitoring
  enable_diagnostic_setting   = true
  log_analytics_workspace_id = azurerm_log_analytics_workspace.example.id
  
  # Redis modules
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
  
  # Backup
  redis_configuration = {
    rdb_backup_enabled            = true
    rdb_backup_frequency         = 60
    rdb_backup_max_snapshot_count = 3
    rdb_storage_connection_string = azurerm_storage_account.backup.primary_blob_connection_string
  }
  
  tags = {
    Environment = "Production"
    ManagedBy   = "Terraform"
    CostCenter  = "12345"
  }
}
```

## Best Practices

1. **Network Security**:
   - Always deploy Redis inside a VNet when possible
   - Use private endpoints for secure access
   - Restrict public network access in production

2. **High Availability**:
   - Use Premium tier for production workloads
   - Enable replication with at least one replica
   - Deploy across availability zones for zonal redundancy

3. **Performance**:
   - Choose appropriate VM size based on workload
   - Enable clustering for high throughput scenarios
   - Configure appropriate maxmemory-policy

4. **Monitoring**:
   - Enable diagnostic settings
   - Set up alerts for critical metrics
   - Monitor memory usage and evictions

5. **Backup & Recovery**:
   - Configure RDB or AOF persistence
   - Test restore procedures regularly
   - Store backups in a separate region for disaster recovery

## Troubleshooting

### Connection Issues
- Verify network security groups and route tables
- Check if private DNS zones are properly linked to the VNet
- Validate firewall rules and NSG rules

### Performance Issues
- Monitor CPU and memory usage
- Check for slow queries using Redis slow log
- Review eviction policies and memory usage patterns

### Authentication Issues
- Verify access keys and connection strings
- Check Azure AD authentication configuration if using managed identity
- Validate TLS certificate chain if using custom certificates

## License

This module is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
