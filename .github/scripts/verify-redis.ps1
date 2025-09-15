#Requires -Version 7.0

<#
.SYNOPSIS
    Verifies that Redis instances are functioning correctly.
.DESCRIPTION
    This script is specifically designed for GitHub Actions to verify Redis instances.
    It checks connectivity and basic operations on Redis instances.
.PARAMETER ResourceGroupName
    The name of the resource group containing the Redis instances.
#>

param (
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroupName,
    
    [string]$Location = "eastus"
)

# Function to write colored output
function Write-Status {
    param(
        [string]$Message,
        [string]$Status
    )
    
    $color = switch ($Status.ToLower()) {
        "success" { "Green" }
        "warning" { "Yellow" }
        "error"   { "Red" }
        default   { "White" }
    }
    
    Write-Host "$($Status.ToUpper()): $Message" -ForegroundColor $color
}

try {
    # Check if Azure CLI is installed
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        Write-Status -Message "Azure CLI is not installed" -Status "error"
        exit 1
    }
    
    # Login to Azure if not already logged in
    $azAccount = az account show 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
    if (-not $azAccount) {
        Write-Status -Message "Logging in to Azure..." -Status "info"
        az login --service-principal \
            -u $env:ARM_CLIENT_ID \
            -p $env:ARM_CLIENT_SECRET \
            --tenant $env:ARM_TENANT_ID | Out-Null
            
        az account set --subscription $env:ARM_SUBSCRIPTION_ID | Out-Null
        $azAccount = az account show | ConvertFrom-Json
    }
    
    Write-Status -Message "Using Azure subscription: $($azAccount.name) ($($azAccount.id))" -Status "info"
    
    # Get the Redis instances in the resource group
    Write-Status -Message "Retrieving Redis instances in resource group: $ResourceGroupName" -Status "info"
    $redisCaches = az redis list --resource-group $ResourceGroupName --query "[].{name:name, hostName:hostName, sslPort:sslPort, enableNonSslPort:enableNonSslPort, sslPort:sslPort, sslEnabled:sslPort != null}" | ConvertFrom-Json
    
    if (-not $redisCaches) {
        Write-Status -Message "No Redis caches found in resource group: $ResourceGroupName" -Status "error"
        exit 1
    }
    
    $overallSuccess = $true
    
    # Test each Redis instance
    foreach ($redis in $redisCaches) {
        Write-Host "`nTesting Redis instance: $($redis.name)" -ForegroundColor Cyan
        Write-Host "Host: $($redis.hostName)"
        
        # Get the access key
        $accessKey = az redis list-keys --name $redis.name --resource-group $ResourceGroupName --query "primaryKey" -o tsv
        
        if (-not $accessKey) {
            Write-Status -Message "Could not retrieve access key for $($redis.name)" -Status "error"
            $overallSuccess = $false
            continue
        }
        
        # Install redis-tools if not already installed
        if (-not (Get-Command redis-cli -ErrorAction SilentlyContinue)) {
            Write-Status -Message "Installing redis-tools..." -Status "info"
            if ($IsWindows) {
                choco install redis-64 -y
            } elseif ($IsMacOS) {
                brew install redis
            } else {
                sudo apt-get update
                sudo apt-get install -y redis-tools
            }
        }
        
        # Test basic connectivity
        $testResults = @()
        
        # Test 1: PING
        $pingResult = redis-cli -h $($redis.hostName) -p $($redis.sslPort) -a $accessKey --tls --insecure PING 2>&1
        $pingSuccess = $pingResult -eq "PONG"
        $testResults += @{
            Test = "PING"
            Status = if ($pingSuccess) { "SUCCESS" } else { "FAILED" }
            Details = $pingResult
        }
        
        # Test 2: SET/GET
        $testKey = "github:test:$(Get-Date -Format "yyyyMMddHHmmss")"
        $testValue = "test-value-$(Get-Random -Minimum 1000 -Maximum 9999)"
        
        $setResult = redis-cli -h $($redis.hostName) -p $($redis.sslPort) -a $accessKey --tls --insecure SET $testKey $testValue 2>&1
        $setSuccess = $setResult -eq "OK"
        
        $getResult = redis-cli -h $($redis.hostName) -p $($redis.sslPort) -a $accessKey --tls --insecure GET $testKey 2>&1
        $getSuccess = $getResult -eq $testValue
        
        # Clean up test key
        redis-cli -h $($redis.hostName) -p $($redis.sslPort) -a $accessKey --tls --insecure DEL $testKey | Out-Null
        
        $testResults += @{
            Test = "SET/GET"
            Status = if ($setSuccess -and $getSuccess) { "SUCCESS" } else { "FAILED" }
            Details = "SET: $($setResult), GET: $getResult"
        }
        
        # Test 3: INFO
        $infoResult = redis-cli -h $($redis.hostName) -p $($redis.sslPort) -a $accessKey --tls --insecure INFO 2>&1
        $infoSuccess = $infoResult -match "redis_version"
        
        $testResults += @{
            Test = "INFO"
            Status = if ($infoSuccess) { "SUCCESS" } else { "FAILED" }
            Details = if ($infoSuccess) { ($infoResult | Select-String "redis_version:(\S+)").Matches.Groups[1].Value } else { $infoResult }
        }
        
        # Display test results
        $testResults | Format-Table -Property Test, Status, @{Name="Details"; Expression={$_.Details}; Width=50} -Wrap
        
        # Check if all tests passed
        $allTestsPassed = $testResults.Status -notcontains "FAILED"
        if (-not $allTestsPassed) {
            $overallSuccess = $false
            Write-Status -Message "Some tests failed for $($redis.name)" -Status "error"
        } else {
            Write-Status -Message "All tests passed for $($redis.name)" -Status "success"
        }
    }
    
    # Set final status
    if (-not $overallSuccess) {
        Write-Status -Message "One or more tests failed" -Status "error"
        exit 1
    }
    
    Write-Status -Message "All Redis instances verified successfully" -Status "success"
    exit 0
    
} catch {
    Write-Status -Message "Error during verification: $_" -Status "error"
    Write-Status -Message $_.ScriptStackTrace -Status "error"
    exit 1
}
