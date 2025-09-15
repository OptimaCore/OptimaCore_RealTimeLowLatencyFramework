# GitHub Actions Scripts

This directory contains scripts used by GitHub Actions workflows for various automation tasks.

## Available Scripts

### `verify-redis.ps1`
Verifies that Redis instances created during testing are functioning correctly.

**Usage:**
```powershell
.\verify-redis.ps1 -ResourceGroupName <resource-group-name> [-Location <azure-region>]
```

**Parameters:**
- `ResourceGroupName`: (Required) The name of the resource group containing the Redis instances
- `Location`: (Optional) Azure region (default: `eastus`)

### `setup-github-secrets.ps1`
Helps set up GitHub secrets required for the Redis module testing workflow.

**Usage:**
```powershell
.\setup-github-secrets.ps1 -SubscriptionId <subscription-id> \
    [-ResourceGroupName <resource-group-name>] \
    [-ServicePrincipalName <sp-name>] \
    [-Location <azure-region>]
```

**Parameters:**
- `SubscriptionId`: (Required) Azure subscription ID
- `ResourceGroupName`: (Optional) Resource group name (default: `github-actions-redis-test-rg`)
- `ServicePrincipalName`: (Optional) Service principal name (default: `GitHubActions-RedisTest`)
- `Location`: (Optional) Azure region (default: `eastus`)

## Prerequisites

- PowerShell 7.0 or later
- Azure CLI installed and logged in
- GitHub CLI (for setting secrets via command line)

## Security Considerations

- These scripts handle sensitive information like Azure credentials
- Never commit secrets or sensitive information to version control
- The `setup-github-secrets.ps1` script outputs commands that include sensitive information - be careful where you run them
- Service principals created should have the minimum required permissions

## Best Practices

1. Always review scripts before running them
2. Use the principle of least privilege when creating service principals
3. Regularly rotate credentials and secrets
4. Use GitHub's secret scanning to detect accidentally committed secrets

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.
