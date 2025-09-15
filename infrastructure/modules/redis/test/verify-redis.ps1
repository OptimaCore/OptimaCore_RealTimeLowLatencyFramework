#Requires -Version 7.0

<#
.SYNOPSIS
    Verifies that the Redis instances created by the test are functioning correctly.
.DESCRIPTION
    This script verifies that the Redis instances created by the test are accessible
    and responding to basic commands. It requires the redis-cli tool to be installed.
.PARAMETER ResourceGroupName
    The name of the resource group containing the Redis instances.
.EXAMPLE
    .\verify-redis.ps1 -ResourceGroupName "test-redis-abc123-rg"
#>

param (
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroupName
)

# Check if redis-cli is installed
if (-not (Get-Command redis-cli -ErrorAction SilentlyContinue)) {
    Write-Error "redis-cli is not installed or not in PATH. Please install Redis CLI tools."
    exit 1
}

# Get the Redis instances in the resource group
$redisCaches = az redis list --resource-group $ResourceGroupName --query "[].{name:name, hostName:hostName, sslPort:sslPort, enableNonSslPort:enableNonSslPort, sslPort:sslPort, sslEnabled:sslPort != null}" | ConvertFrom-Json

if (-not $redisCaches) {
    Write-Error "No Redis caches found in resource group: $ResourceGroupName"
    exit 1
}

# Get the access keys for each Redis cache
foreach ($redis in $redisCaches) {
    Write-Host "`nTesting Redis instance: $($redis.name)" -ForegroundColor Cyan
    Write-Host "Host: $($redis.hostName)"
    
    # Get the primary access key
    $accessKey = az redis list-keys --name $redis.name --resource-group $ResourceGroupName --query "primaryKey" -o tsv
    
    if (-not $accessKey) {
        Write-Warning "Could not retrieve access key for $($redis.name). Skipping..."
        continue
    }
    
    # Build the connection string
    $connectionString = "$($redis.hostName):$($redis.sslPort),password=$accessKey,ssl=$($redis.sslEnabled),abortConnect=False"
    
    # Test basic Redis operations
    try {
        # Test PING
        Write-Host "- Testing PING..." -NoNewline
        $pingResult = redis-cli -h $($redis.hostName) -p $($redis.sslPort) -a $accessKey --tls --insecure PING 2>&1
        if ($pingResult -eq "PONG") {
            Write-Host " ✓" -ForegroundColor Green
        } else {
            Write-Host " ✗ (Unexpected response: $pingResult)" -ForegroundColor Red
            continue
        }
        
        # Test SET/GET
        $testKey = "test:$(Get-Date -Format "yyyyMMddHHmmss")"
        $testValue = "test-value-$(Get-Random -Minimum 1000 -Maximum 9999)"
        
        Write-Host "- Testing SET..." -NoNewline
        $setResult = redis-cli -h $($redis.hostName) -p $($redis.sslPort) -a $accessKey --tls --insecure SET $testKey $testValue 2>&1
        if ($setResult -eq "OK") {
            Write-Host " ✓" -ForegroundColor Green
        } else {
            Write-Host " ✗ (Failed to SET: $setResult)" -ForegroundColor Red
            continue
        }
        
        # Test GET
        Write-Host "- Testing GET..." -NoNewline
        $getResult = redis-cli -h $($redis.hostName) -p $($redis.sslPort) -a $accessKey --tls --insecure GET $testKey 2>&1
        if ($getResult -eq $testValue) {
            Write-Host " ✓" -ForegroundColor Green
        } else {
            Write-Host " ✗ (Unexpected value: $getResult)" -ForegroundColor Red
        }
        
        # Test INFO
        Write-Host "- Testing INFO..." -NoNewline
        $infoResult = redis-cli -h $($redis.hostName) -p $($redis.sslPort) -a $accessKey --tls --insecure INFO 2>&1
        if ($infoResult -match "redis_version") {
            Write-Host " ✓" -ForegroundColor Green
            $version = ($infoResult | Select-String "redis_version:(\S+)").Matches.Groups[1].Value
            Write-Host "  Redis version: $version"
        } else {
            Write-Host " ✗ (Failed to get INFO)" -ForegroundColor Red
        }
        
        # Clean up test key
        redis-cli -h $($redis.hostName) -p $($redis.sslPort) -a $accessKey --tls --insecure DEL $testKey | Out-Null
        
    } catch {
        Write-Error "Error testing Redis instance $($redis.name): $_"
    }
}

Write-Host "`nVerification complete!" -ForegroundColor Green
