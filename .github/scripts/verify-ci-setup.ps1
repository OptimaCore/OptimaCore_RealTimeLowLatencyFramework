#Requires -Version 7.0

<#
.SYNOPSIS
    Verifies that the CI/CD setup is configured correctly.
.DESCRIPTION
    This script checks if all required tools and configurations are in place
    for the CI/CD pipeline to run successfully.
#>

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

function Test-CommandExists {
    param($command)
    try {
        Get-Command $command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

# Check required tools
$tools = @(
    @{ Name = "Node.js"; Command = "node"; Required = $true },
    @{ Name = "npm"; Command = "npm"; Required = $true },
    @{ Name = "Terraform"; Command = "terraform"; Required = $true },
    @{ Name = "Azure CLI"; Command = "az"; Required = $true },
    @{ Name = "Git"; Command = "git"; Required = $true }
)

Write-Host "`nVerifying required tools..." -ForegroundColor Cyan
$allToolsAvailable = $true

foreach ($tool in $tools) {
    $exists = Test-CommandExists -command $tool.Command
    $status = if ($exists) { "success" } else { "error" }
    $message = if ($exists) { "Found $($tool.Name)" } else { "Missing $($tool.Name) (required: $($tool.Required))" }
    
    Write-Status -Message $message -Status $status
    
    if (-not $exists -and $tool.Required) {
        $allToolsAvailable = $false
    }
}

# Check required files
$requiredFiles = @(
    ".github/workflows/ci-cd.yml",
    "scripts/ci-setup.js",
    "scripts/teardown.js",
    "infrastructure/main.tf",
    "infrastructure/variables.tf",
    "infrastructure/outputs.tf"
)

Write-Host "`nVerifying required files..." -ForegroundColor Cyan
$allFilesExist = $true

foreach ($file in $requiredFiles) {
    $exists = Test-Path $file -PathType Leaf
    $status = if ($exists) { "success" } else { "error" }
    $message = if ($exists) { "Found $file" } else { "Missing $file" }
    
    Write-Status -Message $message -Status $status
    
    if (-not $exists) {
        $allFilesExist = $false
    }
}

# Check GitHub secrets (if running in GitHub Actions)
if ($env:GITHUB_ACTIONS -eq "true") {
    Write-Host "`nVerifying GitHub secrets..." -ForegroundColor Cyan
    
    $requiredSecrets = @(
        @{ Name = "AZURE_CREDENTIALS"; Required = $true },
        @{ Name = "CODECOV_TOKEN"; Required = $false }
    )
    
    foreach ($secret in $requiredSecrets) {
        $exists = [bool]($env:($secret.Name) -ne $null)
        $status = if ($exists) { "success" } else { if ($secret.Required) { "error" } else { "warning" } }
        $message = if ($exists) { "Found secret: $($secret.Name)" } else { "Missing secret: $($secret.Name) (Required: $($secret.Required))" }
        
        Write-Status -Message $message -Status $status
        
        if (-not $exists -and $secret.Required) {
            $allSecretsAvailable = $false
        }
    }
}

# Summary
Write-Host "`nVerification Summary:" -ForegroundColor Cyan
if ($allToolsAvailable -and $allFilesExist) {
    Write-Status -Message "✅ All required tools and files are available" -Status "success"
    
    if ($env:GITHUB_ACTIONS -eq "true") {
        if ($allSecretsAvailable) {
            Write-Status -Message "✅ All required GitHub secrets are available" -Status "success"
        } else {
            Write-Status -Message "❌ Some required GitHub secrets are missing" -Status "error"
            Write-Host "Run '.github\scripts\setup-ci-secrets.ps1' to set up the required secrets." -ForegroundColor Yellow
        }
    } else {
        Write-Status -Message "ℹ️  Run this script in a GitHub Actions environment to verify secrets" -Status "info"
    }
    
    Write-Host "`nNext steps:" -ForegroundColor Green
    Write-Host "1. Push your changes to trigger the CI/CD pipeline"
    Write-Host "2. Monitor the workflow in the GitHub Actions tab"
    Write-Host "3. Check the logs for any issues"
    
    exit 0
} else {
    Write-Status -Message "❌ Some requirements are not met" -Status "error"
    
    if (-not $allToolsAvailable) {
        Write-Host "- Install the missing tools listed above" -ForegroundColor Red
    }
    
    if (-not $allFilesExist) {
        Write-Host "- Ensure all required files are present in the repository" -ForegroundColor Red
    }
    
    exit 1
}
