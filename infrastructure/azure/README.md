# Azure Infrastructure for OptimaCore

This directory contains Terraform configurations for deploying the OptimaCore application to Azure App Service.

## Prerequisites

1. [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) installed
2. [Terraform](https://www.terraform.io/downloads.html) installed
3. An Azure subscription
4. Appropriate permissions to create resources in the Azure subscription

## Authentication

Before running Terraform, authenticate with Azure:

```bash
az login
az account set --subscription <your-subscription-id>
```

## Environment Setup

1. Create a `.tfvars` file for your environment (e.g., `dev.tfvars`):

```hcl
app_name      = "optimacore"
environment   = "dev"
location      = "eastus"
app_service_plan_sku = "B1"
```

## Initializing Terraform

```bash
terraform init
```

## Planning the Deployment

```bash
terraform plan -var-file=dev.tfvars -out=tfplan
```

## Applying the Configuration

```bash
terraform apply tfplan
```

## Destroying Resources

To remove all resources created by Terraform:

```bash
terraform destroy -var-file=dev.tfvars
```

## Environment Variables

Set these environment variables in the Azure Portal under Configuration > Application Settings:

- `NODE_ENV`: The environment (development, production)
- `PORT`: The port the app should listen on (default: 8080)
- `HOST`: The host to bind to (default: 0.0.0.0)
- `ENABLE_METRICS`: Whether to enable metrics (true/false)
- `ENABLE_REQUEST_LOGGING`: Whether to enable request logging (true/false)
- `TRUST_PROXY`: Whether to trust proxy headers (true/false)
- `MAX_MEMORY_THRESHOLD`: Memory threshold for health checks (0-1)

## Monitoring

Application Insights is configured for monitoring. The instrumentation key and connection string are automatically injected as environment variables.

## CI/CD

For production deployments, set up a CI/CD pipeline to automatically deploy changes when code is pushed to the main branch. Example GitHub Actions workflow:

```yaml
name: Deploy to Azure

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Terraform
      uses: hashicorp/setup-terraform@v1
      with:
        terraform_version: 1.0.0
        
    - name: Terraform Init
      run: terraform init
      working-directory: ./infrastructure/azure
      env:
        ARM_CLIENT_ID: ${{ secrets.ARM_CLIENT_ID }}
        ARM_CLIENT_SECRET: ${{ secrets.ARM_CLIENT_SECRET }}
        ARM_SUBSCRIPTION_ID: ${{ secrets.ARM_SUBSCRIPTION_ID }}
        ARM_TENANT_ID: ${{ secrets.ARM_TENANT_ID }}
        
    - name: Terraform Plan
      run: terraform plan -var-file=production.tfvars -out=tfplan
      working-directory: ./infrastructure/azure
      continue-on-error: true
      
    - name: Terraform Apply
      run: terraform apply -auto-approve tfplan
      working-directory: ./infrastructure/azure
```

## Security Considerations

- Use Azure Key Vault for managing secrets in production
- Enable managed identities for secure access to Azure resources
- Configure network security groups and application gateway for additional security layers
- Regularly rotate credentials and secrets
