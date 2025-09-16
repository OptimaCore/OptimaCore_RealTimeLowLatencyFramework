# CI/CD Pipeline Documentation

This document describes the CI/CD pipeline setup for the OptimaCore Real-Time Low Latency Framework.

## Overview

The CI/CD pipeline automates the following processes:

1. **Linting and Validation** - Code quality checks and type validation
2. **Unit Testing** - Running tests with coverage reporting
3. **Infrastructure Deployment** - Automated provisioning of test environments
4. **Performance Benchmarking** - Running benchmarks against deployed environments
5. **Results Processing** - Analyzing and reporting benchmark results
6. **Cleanup** - Automatic teardown of test resources

## Prerequisites

1. **GitHub Repository** - The code must be in a GitHub repository
2. **Azure Subscription** - With appropriate permissions to create resources
3. **Service Principal** - For authenticating GitHub Actions with Azure
4. **GitHub Secrets** - Configured with necessary credentials

## Required GitHub Secrets

| Secret Name | Description |
|-------------|-------------|
| `AZURE_CREDENTIALS` | JSON output of `az ad sp create-for-rbac` |
| `CODECOV_TOKEN` | Codecov upload token for coverage reports |

## Pipeline Triggers

The pipeline runs on:

- **Push** to `main` or `develop` branches (excluding markdown and text files)
- **Pull Requests** targeting `main` or `develop` branches
- **Scheduled** - Every Sunday at midnight UTC
- **Manual** - Via GitHub Actions UI with environment selection

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_VERSION` | Node.js version | `20.x` |
| `TERRAFORM_VERSION` | Terraform version | `1.5.7` |
| `RESOURCE_GROUP` | Azure resource group name | `optima-core-{run_id}` |
| `LOCATION` | Azure region | `eastus` |
| `BUDGET_AMOUNT` | Monthly budget in USD | `50` |
| `BUDGET_ALERT_EMAILS` | Email for budget alerts | `devops@example.com` |

## Manual Execution

To manually trigger the pipeline:

1. Go to GitHub Actions
2. Select the "CI/CD Pipeline" workflow
3. Click "Run workflow"
4. Select the environment (`test` or `staging`)
5. Click "Run workflow"

## Local Development

For local testing, install:

- [act](https://github.com/nektos/act) - Run GitHub Actions locally
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
- [Terraform](https://www.terraform.io/downloads.html)

### Running Locally

1. Login to Azure:
   ```bash
   az login
   ```

2. Set environment variables:
   ```bash
   export AZURE_CREDENTIALS=$(az ad sp create-for-rbac --name optimacore-ci --role contributor --scopes /subscriptions/{subscription-id} --sdk-auth)
   export CODECOV_TOKEN=your-codecov-token
   ```

3. Run the pipeline:
   ```bash
   act -s AZURE_CREDENTIALS="$AZURE_CREDENTIALS" -s CODECOV_TOKEN
   ```

## Cleanup

Resources are automatically cleaned up after the pipeline completes. For manual cleanup:

```bash
# Teardown current environment
node scripts/teardown.js teardown

# Clean up old resource groups
node scripts/teardown.js cleanup
```

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   - Verify `AZURE_CREDENTIALS` secret is correctly set
   - Ensure the service principal has the correct permissions

2. **Resource Group Deletion**
   - Some resources may take time to delete
   - Check for locks on resource groups

3. **Terraform State**
   - State is stored in Azure Storage
   - Verify the storage account exists and is accessible

## Monitoring

- **GitHub Actions** - View pipeline execution and logs
- **Azure Portal** - Monitor resource usage and costs
- **Codecov** - View test coverage reports

## Security

- **Secrets** - Never commit sensitive data to the repository
- **Permissions** - Use least-privilege principle for service principals
- **Audit Logs** - Regularly review GitHub Actions and Azure audit logs
