terraform {
  backend "azurerm" {
    # The storage account name where the state file will be stored
    storage_account_name = "tfstate${substr(md5(data.azurerm_subscription.current.subscription_id), 0, 8)}"
    
    # The name of the container within the storage account
    container_name       = "tfstate"
    
    # The name of the state file
    key                  = "${var.environment}.terraform.tfstate"
    
    # The name of the resource group where the storage account is located
    resource_group_name  = "${var.project_name}-tfstate-rg"
    
    # Enable state locking
    use_azuread_auth     = true
    
    # Use MSI authentication if available, fall back to CLI auth
    use_oidc             = true
    
    # Tags for the storage account
    tags = {
      environment = var.environment
      managed_by  = "terraform"
    }
  }
}

# Get current subscription information
data "azurerm_subscription" "current" {}

# Create a resource group for the Terraform state if it doesn't exist
resource "azurerm_resource_group" "tfstate" {
  name     = "${var.project_name}-tfstate-rg"
  location = var.location
  
  lifecycle {
    prevent_destroy = true
  }
  
  tags = {
    environment = "global"
    managed_by  = "terraform"
  }
}

# Create a storage account for Terraform state if it doesn't exist
resource "azurerm_storage_account" "tfstate" {
  name                     = "tfstate${substr(md5(data.azurerm_subscription.current.subscription_id), 0, 8)}"
  resource_group_name      = azurerm_resource_group.tfstate.name
  location                = azurerm_resource_group.tfstate.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  
  # Enable soft delete for state files
  blob_properties {
    delete_retention_policy {
      days = 30
    }
    
    container_delete_retention_policy {
      days = 30
    }
  }
  
  # Enable infrastructure encryption
  infrastructure_encryption_enabled = true
  
  # Enable HTTPS traffic only
  enable_https_traffic_only = true
  
  # Allow access from all networks (can be restricted to specific IPs if needed)
  network_rules {
    default_action = "Allow"
    bypass         = ["AzureServices"]
  }
  
  # Enable blob public access
  allow_nested_items_to_be_public = false
  
  # Enable blob versioning
  blob_properties {
    versioning_enabled = true
  }
  
  # Enable change feed
  blob_properties {
    change_feed_enabled = true
  }
  
  # Enable container delete retention policy
  blob_properties {
    container_delete_retention_policy {
      days = 30
    }
  }
  
  # Enable soft delete for blobs
  blob_properties {
    delete_retention_policy {
      days = 30
    }
  }
  
  tags = {
    environment = "global"
    managed_by  = "terraform"
  }
  
  lifecycle {
    prevent_destroy = true
  }
}

# Create a container for the Terraform state
resource "azurerm_storage_container" "tfstate" {
  name                  = "tfstate"
  storage_account_name  = azurerm_storage_account.tfstate.name
  container_access_type = "private"
  
  lifecycle {
    prevent_destroy = true
  }
}

# Create a storage account network rules to allow access from Azure services
resource "azurerm_storage_account_network_rules" "tfstate" {
  storage_account_id = azurerm_storage_account.tfstate.id
  
  # Allow access from Azure services
  bypass = ["AzureServices"]
  
  # Default action is to deny all traffic
  default_action = "Deny"
  
  # Allow access from all networks (can be restricted to specific IPs if needed)
  ip_rules = []
  
  # Allow access from virtual networks
  virtual_network_subnet_ids = []
  
  depends_on = [
    azurerm_storage_account.tfstate
  ]
}
