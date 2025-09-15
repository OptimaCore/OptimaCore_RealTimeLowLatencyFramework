provider "azurerm" {
  features {}
  
  # Use environment variables for authentication
  # AZURE_SUBSCRIPTION_ID
  # AZURE_TENANT_ID
  # AZURE_CLIENT_ID
  # AZURE_CLIENT_SECRET
  
  # Enable MSAL authentication (recommended)
  use_msal = true
  
  # Configure the AzureRM provider to suppress unnecessary warnings
  skip_provider_registration = true
}

# Enable additional provider configurations for different environments
provider "azurerm" {
  alias           = "prod"
  subscription_id = var.prod_subscription_id
  features {}
  
  # Enable MSAL authentication for production
  use_msal = true
  skip_provider_registration = true
}

# Random provider for generating unique names
provider "random" {
  # Configuration options
}

# Local provider for local file operations
provider "local" {
  # Configuration options
}
