terraform {
  required_version = ">= 1.0.0"
  
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 3.0.0, < 4.0.0"
    }
    
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0.0"
    }
    
    time = {
      source  = "hashicorp/time"
      version = ">= 0.7.0"
    }
  }
}
