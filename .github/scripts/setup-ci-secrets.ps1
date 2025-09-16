#Requires -Version 7.0

<#
.SYNOPSIS
    Configures GitHub secrets required for the CI/CD pipeline.
.DESCRIPTION
    This script helps set up the necessary GitHub secrets for the CI/CD pipeline.
    It creates a new Azure service principal and outputs the commands needed to set up the GitHub secrets.
.PARAMETER SubscriptionId
    The Azure subscription ID.
.PARAMETER ResourceGroupName
    The name of the resource group where the service principal will have access.
    Defaults to 'optima-core-ci-rg'.
.PARAMETER ServicePrincipalName
    The name for the new service principal.
    Defaults to 'GitHubActions-OptimaCoreCI'.
.EXAMPLE
    .\setup-ci-secrets.ps1 -SubscriptionId "00000000-0000-0000-0000-000000000000"
    
    Sets up a new service principal with default settings and outputs the GitHub secrets setup commands.
#>

param (
    [Parameter(Mandatory=$true)]
    [string]$SubscriptionId,
    
    [string]$ResourceGroupName = "optima-core-ci-rg",
    [string]$ServicePrincipalName = "GitHubActions-OptimaCoreCI",
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
    
    Write-Host "[$($Status.ToUpper())] $Message" -ForegroundColor $color
}

try {
    # Check if Azure CLI is installed
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        Write-Status -Message "Azure CLI is not installed" -Status "error"
        Write-Host "Please install Azure CLI: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
        exit 1
    }

    # Login to Azure if not already logged in
    $account = az account show 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
    if (-not $account) {
        Write-Status -Message "Logging in to Azure..." -Status "info"
        az login --output none
    }

    # Set subscription
    Write-Status -Message "Setting subscription to $SubscriptionId" -Status "info"
    az account set --subscription $SubscriptionId

    # Create resource group if it doesn't exist
    $rg = az group show --name $ResourceGroupName --query "id" -o tsv 2>$null
    if (-not $rg) {
        Write-Status -Message "Creating resource group '$ResourceGroupName'..." -Status "info"
        az group create --name $ResourceGroupName --location $Location --output none
    } else {
        Write-Status -Message "Using existing resource group '$ResourceGroupName'" -Status "info"
    }

    # Create service principal with Contributor role on the resource group
    Write-Status -Message "Creating service principal '$ServicePrincipalName'..." -Status "info"
    $sp = az ad sp create-for-rbac \
        --name $ServicePrincipalName \
        --role "Contributor" \
        --scopes "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName" \
        --years 1 \
        --sdk-auth | ConvertFrom-Json

    if (-not $sp) {
        throw "Failed to create service principal"
    }

    # Get Codecov token from user
    $codecovToken = Read-Host -Prompt "Enter your Codecov token (leave empty to skip)"

    # Output GitHub secrets setup instructions
    Write-Host "`n"
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "GitHub Secrets Setup" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "Follow these steps to set up the required GitHub secrets:"
    Write-Host "1. Go to your GitHub repository"
    Write-Host "2. Navigate to Settings > Secrets > Actions"
    Write-Host "3. Click 'New repository secret' and add the following:"
    Write-Host ""
    
    # AZURE_CREDENTIALS
    $azureCredentials = @{
        clientId = $sp.clientId
        clientSecret = $sp.clientSecret
        subscriptionId = $sp.subscriptionId
        tenantId = $sp.tenantId
    } | ConvertTo-Json -Compress
    
    Write-Host "Name: AZURE_CREDENTIALS" -ForegroundColor Yellow
    Write-Host "Value: $azureCredentials"
    Write-Host ""
    
    # CODECOV_TOKEN (if provided)
    if ($codecovToken) {
        Write-Host "Name: CODECOV_TOKEN" -ForegroundColor Yellow
        Write-Host "Value: $codecovToken"
        Write-Host ""
    }
    
    Write-Host "4. Save the secrets"
    Write-Host ""
    Write-Host "Your CI/CD pipeline is now ready to use!" -ForegroundColor Green
    Write-Host "The service principal has been granted 'Contributor' role on the resource group '$ResourceGroupName'" -ForegroundColor Green
    
    # Save service principal info to a file (excluded from git)
    $secretsFile = ".github/secrets.json"
    $secretsDir = Split-Path -Path $secretsFile -Parent
    if (-not (Test-Path $secretsDir)) {
        New-Item -ItemType Directory -Path $secretsDir -Force | Out-Null
    }
    
    $secrets = @{
        ServicePrincipal = $sp
        ResourceGroup = $ResourceGroupName
        SubscriptionId = $SubscriptionId
        CodecovToken = $codecovToken
        CreatedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    } | ConvertTo-Json -Depth 10
    
    $secrets | Out-File -FilePath $secretsFile -Force
    
    # Add to .gitignore if not already there
    $gitignore = ".gitignore"
    if (-not (Select-String -Path $gitignore -Pattern $secretsFile -SimpleMatch -Quiet)) {
        Add-Content -Path $gitignore -Value "`n# CI/CD Secrets`n$secretsFile"
    }
    
    Write-Status -Message "Service principal details saved to $secretsFile (excluded from git)" -Status "success"
    
} catch {
    Write-Status -Message "An error occurred: $_" -Status "error"
    exit 1
}
