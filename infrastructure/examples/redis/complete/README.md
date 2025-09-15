# Complete Redis Example

This example demonstrates a production-ready deployment of Azure Redis Cache with all available features enabled.

## Features Demonstrated

- **High Availability**: Premium SKU with replication and availability zones
- **Security**:
  - Private endpoint
  - VNet integration
  - TLS 1.2 enforcement
  - Customer-managed keys for encryption at rest
  - Managed identity
- **Monitoring**:
  - Azure Monitor integration
  - Log Analytics workspace
  - Diagnostic settings
- **Backup & Recovery**:
  - RDB persistence
  - AOF persistence (append-only file)
  - Automatic backups to Azure Storage
- **Advanced Features**:
  - Redis modules (RedisJSON, RediSearch)
  - Patch management
  - Firewall rules
  - Custom Redis configuration

## Prerequisites

- Terraform >= 1.0.0
- Azure CLI or service principal with contributor permissions
- Access to an Azure subscription

## Usage

1. Initialize Terraform:
   ```bash
   terraform init
   ```

2. Review the execution plan:
   ```bash
   terraform plan
   ```

3. Apply the configuration:
   ```bash
   terraform apply
   ```

4. When you're done, clean up resources:
   ```bash
   terraform destroy
   ```

## Configuration

### Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| location | The Azure region where resources will be created | `string` | `eastus` | no |
| environment | The deployment environment (e.g., dev, test, prod) | `string` | `test` | no |
| tags | A mapping of tags to assign to all resources | `map(string)` | `{}` | no |

### Outputs

| Name | Description |
|------|-------------|
| redis_connection_strings | The Redis connection strings (sensitive) |
| redis_public_network_access_enabled | Whether public network access is enabled |
| redis_private_endpoint_connections | The private endpoint connections |
| redis_configuration | The Redis configuration |
| redis_sku | The Redis SKU details |
| resource_group_name | The name of the resource group |
| virtual_network_name | The name of the virtual network |
| key_vault_id | The ID of the Key Vault |
| log_analytics_workspace_id | The ID of the Log Analytics workspace |
| storage_account_name | The name of the storage account |
| user_assigned_identity_id | The ID of the user-assigned managed identity |

## Architecture

This example creates the following resources:

1. **Resource Group**: Container for all resources
2. **Virtual Network**: Network isolation for Redis
3. **Subnets**:
   - `redis-subnet`: For the Redis instance with service delegation
   - `private-endpoints`: For private endpoints
4. **Storage Account**: For Redis RDB and AOF backups
5. **Key Vault**: For customer-managed keys
6. **Log Analytics Workspace**: For monitoring and diagnostics
7. **User-Assigned Managed Identity**: For Key Vault access
8. **Azure Redis Cache**: The Redis instance with:
   - Premium SKU with replication
   - Private endpoint
   - Diagnostic settings
   - Backup configuration
   - Redis modules
   - Customer-managed key encryption
   - Managed identity
   - Firewall rules
   - Patch schedule

## Security Considerations

- Public network access is disabled by default
- Private endpoints are used for secure access
- Network security groups restrict traffic
- All data is encrypted in transit and at rest
- Customer-managed keys are used for encryption at rest
- Access keys are stored as sensitive values in Terraform state

## Cost Estimation

This example uses Premium tier Redis with additional resources, which has a higher cost. For non-production environments, consider using Standard or Basic tiers.

## Cleanup

To avoid unnecessary charges, remember to destroy the resources when you're done:

```bash
terraform destroy
```

## Troubleshooting

### Connection Issues
- Verify the private endpoint is properly configured
- Check network security group rules
- Validate DNS resolution
- Ensure the client is in the allowed IP ranges

### Performance Issues
- Monitor CPU and memory usage in Azure Portal
- Check for slow queries using Redis slow log
- Review eviction policies and memory usage patterns

### Authentication Issues
- Verify access keys
- Check managed identity configuration
- Validate TLS certificate chain if using custom certificates

## Next Steps

1. Configure Azure Monitor alerts for critical metrics
2. Set up Azure Policy for compliance
3. Implement backup retention policies
4. Configure Azure AD integration for authentication

## License

This example is licensed under the MIT License - see the [LICENSE](../../../LICENSE) file for details.
