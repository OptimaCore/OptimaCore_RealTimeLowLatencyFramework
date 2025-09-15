# Redis Module Tests

This directory contains tests for the Redis module. The tests verify that the module can be deployed with different configurations.

## Prerequisites

- Terraform >= 1.0.0
- Azure CLI or service principal with contributor permissions
- Access to an Azure subscription

## Running the Tests

1. Navigate to this directory:
   ```bash
   cd infrastructure/modules/redis/test
   ```

2. Initialize Terraform:
   ```bash
   terraform init
   ```

3. Review the execution plan:
   ```bash
   terraform plan
   ```

4. Apply the configuration (this will create real Azure resources):
   ```bash
   terraform apply
   ```

5. When you're done, clean up resources:
   ```bash
   terraform destroy
   ```

## Test Cases

The test suite includes the following test cases:

1. **Minimal Configuration**
   - Basic Redis instance with minimum required parameters
   - Public network access enabled
   - No private endpoints or advanced features

2. **Complete Configuration**
   - Premium SKU with high availability
   - Private endpoint configuration
   - Custom Redis settings
   - Firewall rules
   - Patch schedule
   - System-assigned managed identity

## Outputs

The test outputs the following information:

- `minimal_redis_hostname`: Hostname of the minimal Redis instance
- `complete_redis_hostname`: Hostname of the complete Redis instance
- `resource_group_name`: Name of the test resource group
- `location`: Azure region where resources were deployed

## Cleaning Up

To avoid unnecessary charges, always run `terraform destroy` when you're done testing.
