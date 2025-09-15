# Basic Redis Example

This example demonstrates a basic deployment of Azure Redis Cache with minimal configuration.

## Features Demonstrated

- Basic Redis Cache deployment with Standard SKU
- VNet integration
- Public network access
- Basic Redis configuration

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
| environment | The deployment environment (e.g., dev, test, prod) | `string` | `dev` | no |
| tags | A mapping of tags to assign to all resources | `map(string)` | `{}` | no |

### Outputs

| Name | Description |
|------|-------------|
| redis_hostname | The hostname of the Redis instance |
| redis_ssl_port | The SSL port of the Redis instance |
| resource_group_name | The name of the resource group |

## Architecture

This example creates the following resources:

1. **Resource Group**: Container for all resources
2. **Virtual Network**: Network isolation for Redis
3. **Subnet**: For the Redis instance with service delegation
4. **Azure Redis Cache**: A basic Redis instance with:
   - Standard SKU
   - Public network access enabled
   - Basic Redis configuration

## Security Considerations

- Public network access is enabled by default for simplicity
- For production use, consider:
  - Using private endpoints
  - Disabling public network access
  - Implementing network security groups
  - Enforcing TLS 1.2

## Cost Estimation

This example uses Standard tier Redis, which has a lower cost compared to Premium tier. For production workloads, consider the appropriate SKU based on your requirements.

## Cleanup

To avoid unnecessary charges, remember to destroy the resources when you're done:

```bash
terraform destroy
```

## Troubleshooting

### Connection Issues
- Verify the Redis instance is running
- Check network security group rules
- Validate DNS resolution
- Ensure the client is in the allowed IP ranges

### Performance Issues
- Monitor CPU and memory usage in Azure Portal
- Consider upgrading the SKU if more resources are needed

## Next Steps

1. Enable monitoring and alerts
2. Configure backup settings
3. Implement private endpoints for secure access
4. Set up replication for high availability

## License

This example is licensed under the MIT License - see the [LICENSE](../../../LICENSE) file for details.
