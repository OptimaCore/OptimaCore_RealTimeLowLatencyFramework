#Requires -Version 7.0

<#
.SYNOPSIS
    Runs tests for the Redis module.
.DESCRIPTION
    This script automates the testing of the Redis module by:
    1. Initializing Terraform
    2. Validating the configuration
    3. Running a plan
    4. Applying the configuration (if approved)
    5. Running verifications
    6. Destroying the test resources (if cleanup is not skipped)
.PARAMETER Location
    The Azure region to deploy the test resources to.
.PARAMETER SkipCleanup
    If specified, the test resources will not be automatically destroyed.
.EXAMPLE
    .\run-tests.ps1 -Location eastus
    
    Runs the tests in the East US region and cleans up resources when done.
.EXAMPLE
    .\run-tests.ps1 -Location westus -SkipCleanup
    
    Runs the tests in the West US region and leaves the resources running.
#>

param (
    [string]$Location = "eastus",
    [switch]$SkipCleanup
)

# Set error action preference
$ErrorActionPreference = 'Stop'

# Check if Terraform is installed
if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
    Write-Error "Terraform is not installed or not in PATH. Please install Terraform and try again."
    exit 1
}

# Check if logged in to Azure
$azAccount = az account show 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
if (-not $azAccount) {
    Write-Host "Logging in to Azure..."
    az login --use-device-code
    $azAccount = az account show | ConvertFrom-Json
}

Write-Host "Using Azure subscription: $($azAccount.name) ($($azAccount.id))"

# Set the location in the terraform.tfvars file
@"
location = "$Location"
"@ | Set-Content -Path ".\terraform.tfvars" -Force

# Initialize Terraform
Write-Host "`nInitializing Terraform..." -ForegroundColor Cyan
terraform init -upgrade

# Validate the configuration
Write-Host "`nValidating configuration..." -ForegroundColor Cyan
$validateOutput = terraform validate 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Configuration validation failed:"
    $validateOutput
    exit 1
}

# Run plan
Write-Host "`nRunning plan..." -ForegroundColor Cyan
$planOutput = terraform plan -out=tfplan
if ($LASTEXITCODE -ne 0) {
    Write-Error "Plan failed"
    exit 1
}

# Ask for confirmation before applying
$confirmation = Read-Host "`nDo you want to apply these changes? (y/n)"
if ($confirmation -ne 'y') {
    Write-Host "Test cancelled by user." -ForegroundColor Yellow
    exit 0
}

# Apply the configuration
Write-Host "`nApplying configuration..." -ForegroundColor Cyan
terraform apply -auto-approve
if ($LASTEXITCODE -ne 0) {
    Write-Error "Apply failed"
    exit 1
}

# Get the outputs
Write-Host "`nTest Resources Deployed:" -ForegroundColor Green
terraform output -json | ConvertFrom-Json | Format-List

# Run verifications
Write-Host "`nRunning verifications..." -ForegroundColor Cyan
$minimalHostname = terraform output -raw minimal_redis_hostname
$completeHostname = terraform output -raw complete_redis_hostname

Write-Host "- Minimal Redis instance: $minimalHostname"
Write-Host "- Complete Redis instance: $completeHostname"

# Check if we should skip cleanup
if ($SkipCleanup) {
    Write-Host "`nSkipping cleanup as requested. Resources will remain running." -ForegroundColor Yellow
    Write-Host "To clean up manually, run: terraform destroy -auto-approve" -ForegroundColor Yellow
    exit 0
}

# Ask for confirmation before destroying
$confirmation = Read-Host "`nDo you want to destroy the test resources? (y/n)"
if ($confirmation -ne 'y') {
    Write-Host "Skipping cleanup. To clean up later, run: terraform destroy -auto-approve" -ForegroundColor Yellow
    exit 0
}

# Destroy the resources
Write-Host "`nDestroying test resources..." -ForegroundColor Cyan
terraform destroy -auto-approve

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nTest completed successfully!" -ForegroundColor Green
} else {
    Write-Error "Test completed with errors during cleanup."
    exit 1
}
