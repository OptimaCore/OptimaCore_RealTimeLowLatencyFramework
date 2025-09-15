#Requires -Version 7.0

<#
.SYNOPSIS
    Configures GitHub secrets required for the Redis module testing workflow.
.DESCRIPTION
    This script helps set up the necessary GitHub secrets for the Redis module testing workflow.
    It creates a new Azure service principal and outputs the commands needed to set up the GitHub secrets.
.PARAMETER SubscriptionId
    The Azure subscription ID.
.PARAMETER ResourceGroupName
    The name of the resource group where the service principal will have access.
    Defaults to a new resource group named 'github-actions-redis-test-rg'.
.PARAMETER ServicePrincipalName
    The name for the new service principal.
    Defaults to 'GitHubActions-RedisTest'.
.EXAMPLE
    .\setup-github-secrets.ps1 -SubscriptionId "00000000-0000-0000-0000-000000000000"
    
    Sets up a new service principal with default settings and outputs the GitHub secrets setup commands.
.EXAMPLE
    .\setup-github-secrets.ps1 -SubscriptionId "00000000-0000-0000-0000-000000000000" -ResourceGroupName "my-test-rg" -ServicePrincipalName "MyTestSP"
    
    Sets up a new service principal with custom resource group and name.
#>

param (
    [Parameter(Mandatory=$true)]
    [string]$SubscriptionId,
    
    [string]$ResourceGroupName = "github-actions-redis-test-rg",
    [string]$ServicePrincipalName = "GitHubActions-RedisTest",
    [string]$Location = "eastus"
)

# Function to write colored output
function Write-Status {
    param(
        [string]$Message,
        [string]$Status = "info"
    )
    
    $color = switch ($Status.ToLower()) {
        "success" { "Green" }
        "warning" { "Yellow" }
        "error"   { "Red" }
        "info"    { "Cyan" }
        default   { "White" }
    }
    
    Write-Host "$($Status.ToUpper()): $Message" -ForegroundColor $color
}

try {
    # Check if Azure CLI is installed
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        Write-Status -Message "Azure CLI is not installed" -Status "error"
        Write-Host "Please install Azure CLI: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
        exit 1
    }
    
    # Login to Azure if not already logged in
    $azAccount = az account show 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
    if (-not $azAccount) {
        Write-Status -Message "Logging in to Azure..." -Status "info"
        az login --use-device-code | Out-Null
        $azAccount = az account show | ConvertFrom-Json
    }
    
    # Switch to the specified subscription
    if ($azAccount.id -ne $SubscriptionId) {
        Write-Status -Message "Switching to subscription: $SubscriptionId" -Status "info"
        az account set --subscription $SubscriptionId | Out-Null
        $azAccount = az account show | ConvertFrom-Json
    }
    
    Write-Status -Message "Using Azure subscription: $($azAccount.name) ($($azAccount.id))" -Status "info"
    
    # Create resource group if it doesn't exist
    $rg = az group show --name $ResourceGroupName --query "id" -o tsv 2>$null
    if (-not $rg) {
        Write-Status -Message "Creating resource group: $ResourceGroupName" -Status "info"
        az group create --name $ResourceGroupName --location $Location | Out-Null
    } else {
        Write-Status -Message "Using existing resource group: $ResourceGroupName" -Status "info"
    }
    
    # Check if service principal already exists
    $sp = az ad sp list --display-name $ServicePrincipalName --query "[0]" | ConvertFrom-Json -ErrorAction SilentlyContinue
    
    if ($sp) {
        Write-Status -Message "Service principal '$ServicePrincipalName' already exists. Resetting credentials..." -Status "warning"
        $spJson = az ad sp credential reset --name $ServicePrincipalName --append --years 1 --query "{}" | ConvertFrom-Json
    } else {
        # Create a new service principal
        Write-Status -Message "Creating service principal: $ServicePrincipalName" -Status "info"
        $spJson = az ad sp create-for-rbac \
            --name $ServicePrincipalName \
            --role "Contributor" \
            --scopes "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName" \
            --years 1 \
            --query "{}" | ConvertFrom-Json
    }
    
    if (-not $spJson) {
        throw "Failed to create or update service principal"
    }
    
    # Get the tenant ID
    $tenantId = $azAccount.tenantId
    
    # Output the GitHub secrets setup commands
    Write-Host "`n"
    Write-Host "# ===== GITHUB SECRETS SETUP =====" -ForegroundColor Green
    Write-Host "# Run these commands to set up your GitHub secrets:"
    Write-Host "#"
    Write-Host "# AZURE_CREDENTIALS (copy the entire JSON output below):" -ForegroundColor Yellow
    $azCredentials = @{
        clientId = $spJson.appId
        clientSecret = $spJson.password
        subscriptionId = $SubscriptionId
        tenantId = $tenantId
    } | ConvertTo-Json -Compress
    
    Write-Host $azCredentials -ForegroundColor Cyan
    Write-Host "#"
    Write-Host "# Individual secrets (alternative to AZURE_CREDENTIALS):" -ForegroundColor Yellow
    Write-Host "gh secret set ARM_SUBSCRIPTION_ID --body ""$SubscriptionId"""
    Write-Host "gh secret set ARM_TENANT_ID --body ""$($tenantId)"""
    Write-Host "gh secret set ARM_CLIENT_ID --body ""$($spJson.appId)"""
    Write-Host "gh secret set ARM_CLIENT_SECRET --body ""$($spJson.password)"""
    Write-Host "#"
    Write-Host "# To set these secrets in the GitHub UI:" -ForegroundColor Yellow
    Write-Host "# 1. Go to your repository on GitHub"
    Write-Host "# 2. Click on 'Settings' > 'Secrets' > 'Actions'"
    Write-Host "# 3. Click 'New repository secret' for each secret above"
    Write-Host "# ==================================" -ForegroundColor Green
    
    Write-Status -Message "GitHub secrets setup complete!" -Status "success"
    
} catch {
    Write-Status -Message "Error setting up GitHub secrets: $_" -Status "error"
    Write-Status -Message $_.ScriptStackTrace -Status "error"
    exit 1
}
