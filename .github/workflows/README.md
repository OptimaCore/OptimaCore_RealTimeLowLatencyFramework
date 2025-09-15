# GitHub Actions Workflows

This directory contains GitHub Actions workflows for automating various tasks in the project.

## Available Workflows

### Test Redis Module (`test-redis-module.yml`)

Automated testing for the Redis module that runs on push and pull requests.

#### Features
- Runs on Ubuntu latest
- Tests both minimal and complete Redis configurations
- Verifies Redis instance connectivity and basic operations
- Automatically cleans up resources after testing
- Uploads test artifacts for debugging

#### Prerequisites
1. Azure service principal with contributor access to the subscription
2. The following GitHub secrets must be configured in your repository:
   - `AZURE_CREDENTIALS`: Azure service principal credentials in JSON format
   - `ARM_SUBSCRIPTION_ID`: Azure subscription ID
   - `ARM_TENANT_ID`: Azure tenant ID
   - `ARM_CLIENT_ID`: Azure client ID (service principal ID)
   - `ARM_CLIENT_SECRET`: Azure client secret (service principal secret)

#### Manual Trigger
You can manually trigger the workflow from the Actions tab in GitHub by selecting "Test Redis Module" and clicking "Run workflow".

#### Environment Variables
- `TF_VAR_location`: Azure region to deploy resources (default: `eastus`)
- `TF_VAR_environment`: Environment name (default: `test`)
- `TF_VAR_project_name`: Project name for resource naming (default: `github-actions`)

#### Artifacts
After a workflow run, the following artifacts are available for download:
- `terraform-plan`: The Terraform execution plan
- `terraform-logs`: Detailed logs from Terraform operations

## Setting Up GitHub Secrets

1. Create a service principal in Azure:
   ```bash
   az ad sp create-for-rbac --name "GitHubActions-RedisTest" --role contributor \
     --scopes /subscriptions/{subscription-id} \
     --sdk-auth
   ```

2. Copy the JSON output and add it as a GitHub secret named `AZURE_CREDENTIALS`

3. Add the following secrets to your GitHub repository:
   - `ARM_SUBSCRIPTION_ID`: Your Azure subscription ID
   - `ARM_TENANT_ID`: Your Azure tenant ID
   - `ARM_CLIENT_ID`: The appId from the service principal JSON
   - `ARM_CLIENT_SECRET`: The password from the service principal JSON

## Debugging Workflow Failures

1. Check the workflow run logs in the Actions tab
2. Download and review the workflow artifacts
3. For Terraform issues, check the plan output in the "Terraform Plan" step
4. For Redis connectivity issues, check the "Verify Redis Instances" step

## Security Considerations

- Never commit sensitive information like credentials or access keys
- Use GitHub secrets for all sensitive values
- The workflow automatically cleans up resources after testing
- The service principal should have the minimum required permissions

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
