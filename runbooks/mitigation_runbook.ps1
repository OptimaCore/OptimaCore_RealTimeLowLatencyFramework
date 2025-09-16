<#
.SYNOPSIS
    Azure Automation Runbook to mitigate costs when budget thresholds are exceeded.
.DESCRIPTION
    This runbook is triggered by an Azure Alert when a budget threshold is reached.
    It performs cost-saving actions such as scaling down non-essential resources.
    
    Actions performed:
    1. Scale down non-production VMs
    2. Pause non-essential databases
    3. Scale down App Service plans
    4. Send notification of actions taken
    
.PARAMETER WebhookData
    The webhook data that triggered the alert.
    
.NOTES
    Version:        1.0
    Author:         OptimaCore Team
    Creation Date:  2023-11-15
    Prerequisites:  Azure Automation Account with Run As Account
                    Appropriate RBAC permissions to manage resources
#>

param(
    [Parameter(Mandatory=$false)]
    [object] $WebhookData
)

# Error action preference
$ErrorActionPreference = "Stop"

# Import required modules
#Requires -Modules @{ModuleName="Az.Accounts"; ModuleVersion="2.0.0"}
#Requires -Modules @{ModuleName="Az.Compute"; ModuleVersion="4.0.0"}
#Requires -Modules @{ModuleName="Az.Sql"; ModuleVersion="2.0.0"}
#Requires -Modules @{ModuleName="Az.Websites"; ModuleVersion="2.0.0"}

try {
    # Get the current execution context
    $connectionName = "AzureRunAsConnection"
    $servicePrincipalConnection = Get-AutomationConnection -Name $connectionName
    
    # Log in to Azure with service principal
    $null = Connect-AzAccount `
        -ServicePrincipal `
        -TenantId $servicePrincipalConnection.TenantId `
        -ApplicationId $servicePrincipalConnection.ApplicationId `
        -CertificateThumbprint $servicePrincipalConnection.CertificateThumbprint
    
    # Set the subscription context if needed
    # $subscriptionId = "your-subscription-id"
    # Set-AzContext -SubscriptionId $subscriptionId
    
    # Initialize output variables
    $actionsTaken = @()
    $skippedResources = @()
    $errors = @()
    
    # Process webhook data if provided
    if ($WebhookData) {
        Write-Output "Processing webhook data..."
        $WebhookBody = $WebhookData.RequestBody | ConvertFrom-Json
        
        # Extract budget information from the alert
        $budgetData = $WebhookBody.data
        $budgetName = $budgetData.budgetName
        $budgetAmount = $budgetData.budgetAmount
        $currentSpend = $budgetData.currentSpend
        $spendPercentage = $budgetData.spentPercentage
        $subscriptionId = $budgetData.subscriptionId
        $resourceGroupName = $budgetData.resourceGroupName
        
        Write-Output "Budget Alert Details:"
        Write-Output "Budget: $budgetName"
        Write-Output "Amount: $budgetAmount"
        Write-Output "Current Spend: $currentSpend ($spendPercentage%)"
        Write-Output "Subscription: $subscriptionId"
        Write-Output "Resource Group: $resourceGroupName"
        
        # Set the subscription context based on the alert
        if ($subscriptionId) {
            Set-AzContext -Subscription $subscriptionId | Out-Null
        }
    } else {
        Write-Output "No webhook data provided. Running in test mode with default parameters."
        $budgetName = "Test Budget"
        $budgetAmount = 1000
        $currentSpend = 950
        $spendPercentage = 95
        $subscriptionId = (Get-AzContext).Subscription.Id
    }
    
    # Define resource tags to identify non-production resources
    $nonProdTags = @{
        "environment" = @("dev", "test", "staging", "non-prod", "sandbox")
        "shutdown" = @("true", "yes")
    }
    
    # 1. Scale down non-production VMs
    Write-Output "`nChecking for non-production VMs to scale down..."
    $vms = Get-AzVM -Status | Where-Object { 
        $_.PowerState -eq "VM running" -and 
        ($_.Tags.Keys | ForEach-Object { $_.ToLower() }) -contains "environment" -and 
        $nonProdTags["environment"] -contains $_.Tags["environment"].ToLower()
    }
    
    foreach ($vm in $vms) {
        try {
            Write-Output "Stopping VM: $($vm.Name) (Resource Group: $($vm.ResourceGroupName))"
            $stopResult = Stop-AzVM -ResourceGroupName $vm.ResourceGroupName -Name $vm.Name -Force -AsJob
            $actionsTaken += "Stopped VM: $($vm.Name) (Resource Group: $($vm.ResourceGroupName))"
        } catch {
            $errorMsg = "Error stopping VM $($vm.Name): $($_.Exception.Message)"
            Write-Error $errorMsg
            $errors += $errorMsg
        }
    }
    
    # 2. Pause non-essential databases
    Write-Output "`nChecking for non-essential databases to pause..."
    $servers = Get-AzSqlServer
    
    foreach ($server in $servers) {
        $dbs = Get-AzSqlDatabase -ServerName $server.ServerName -ResourceGroupName $server.ResourceGroupName | 
               Where-Object { $_.DatabaseName -notin ("master", "model") }
        
        foreach ($db in $dbs) {
            try {
                $tags = (Get-AzResource -ResourceId $db.ResourceId).Tags
                $isNonProd = $false
                
                # Check if database has non-prod tag
                if ($tags) {
                    $envTag = $tags.GetEnumerator() | Where-Object { $_.Key -eq "environment" -and $nonProdTags["environment"] -contains $_.Value.ToLower() }
                    $shutdownTag = $tags.GetEnumerator() | Where-Object { $_.Key -eq "shutdown" -and $nonProdTags["shutdown"] -contains $_.Value.ToLower() }
                    $isNonProd = $envTag -or $shutdownTag
                }
                
                # Skip databases that are already paused or are not non-prod
                if (-not $isNonProd -or $db.CurrentServiceObjectiveName -eq "Paused") {
                    $skippedResources += "Skipped database: $($db.DatabaseName) (Server: $($server.ServerName))"
                    continue
                }
                
                # Pause the database
                Write-Output "Pausing database: $($db.DatabaseName) (Server: $server.ServerName)"
                $pauseResult = Suspend-AzSqlDatabase -ResourceGroupName $server.ResourceGroupName `
                                                  -ServerName $server.ServerName `
                                                  -DatabaseName $db.DatabaseName `
                                                  -AsJob
                
                $actionsTaken += "Paused database: $($db.DatabaseName) (Server: $server.ServerName)"
            } catch {
                $errorMsg = "Error pausing database $($db.DatabaseName): $($_.Exception.Message)"
                Write-Error $errorMsg
                $errors += $errorMsg
            }
        }
    }
    
    # 3. Scale down App Service plans
    Write-Output "`nChecking for non-production App Service plans to scale down..."
    $appServicePlans = Get-AzAppServicePlan | Where-Object { 
        $_.Sku.Tier -notin ("Free", "Shared") -and 
        ($_.Tags.Keys | ForEach-Object { $_.ToLower() }) -contains "environment" -and 
        $nonProdTags["environment"] -contains $_.Tags["environment"].ToLower()
    }
    
    foreach ($plan in $appServicePlans) {
        try {
            $currentTier = $plan.Sku.Tier
            $currentSize = $plan.Sku.Size
            
            # Skip if already at minimum size
            if ($currentTier -eq "Basic" -and $currentSize -eq "B1") {
                $skippedResources += "Skipped App Service Plan (already at minimum size): $($plan.Name)"
                continue
            }
            
            # Determine new tier and size
            $newTier = if ($currentTier -eq "Standard") { "Basic" } else { $currentTier }
            $newSize = if ($currentTier -eq "Basic") { "B1" } else { $currentSize }
            
            # Scale down the App Service plan
            Write-Output "Scaling down App Service Plan: $($plan.Name) from $currentTier $currentSize to $newTier $newSize"
            
            $result = Set-AzAppServicePlan -ResourceGroupName $plan.ResourceGroup `
                                         -Name $plan.Name `
                                         -Tier $newTier `
                                         -NumberofWorkers 1 `
                                         -WorkerSize $newSize
            
            $actionsTaken += "Scaled down App Service Plan: $($plan.Name) to $newTier $newSize"
        } catch {
            $errorMsg = "Error scaling down App Service Plan $($plan.Name): $($_.Exception.Message)"
            Write-Error $errorMsg
            $errors += $errorMsg
        }
    }
    
    # 4. Send notification of actions taken
    Write-Output "`nMitigation actions completed."
    
    # Prepare notification details
    $notificationDetails = @{
        budgetName = $budgetName
        budgetAmount = $budgetAmount
        currentSpend = $currentSpend
        spendPercentage = $spendPercentage
        subscriptionId = $subscriptionId
        resourceGroup = $resourceGroupName
        timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        actionsTaken = $actionsTaken
        skippedResources = $skippedResources
        errors = $errors
    }
    
    # Convert to JSON for output
    $notificationJson = $notificationDetails | ConvertTo-Json -Depth 5
    
    # Output the results (could be sent to a webhook, Logic App, etc.)
    Write-Output "Notification Details:"
    Write-Output $notificationJson
    
    # Example: Send to a webhook
    $webhookUrl = Get-AutomationVariable -Name 'CostAlertWebhookUrl' -ErrorAction SilentlyContinue
    
    if ($webhookUrl) {
        try {
            $body = @{
                title = "Budget Alert: $budgetName"
                text = "Budget threshold of $spendPercentage% reached ($$currentSpend of $$budgetAmount)"
                actions = $actionsTaken
                errors = $errors
                timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            } | ConvertTo-Json -Depth 5
            
            Invoke-RestMethod -Uri $webhookUrl -Method Post -Body $body -ContentType "application/json"
            Write-Output "Notification sent to webhook"
        } catch {
            Write-Error "Failed to send webhook notification: $_"
        }
    } else {
        Write-Output "No webhook URL configured. Skipping notification."
    }
    
    # Return the results
    $result = @{
        status = "Completed"
        actionsTaken = $actionsTaken
        errors = $errors
        timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    }
    
    return $result | ConvertTo-Json -Depth 5
    
} catch {
    $errorMsg = $_.Exception.Message
    Write-Error "Error in runbook: $errorMsg"
    
    # Return error details
    $result = @{
        status = "Failed"
        error = $errorMsg
        timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    }
    
    return $result | ConvertTo-Json -Depth 5
}
