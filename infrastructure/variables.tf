# Global Variables
variable "environment" {
  description = "The deployment environment (e.g., dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "location" {
  description = "The Azure region where resources will be created"
  type        = string
  default     = "eastus"
}

variable "project_name" {
  description = "The name of the project (used for resource naming and tagging)"
  type        = string
  default     = "optimacore"
}

# Subscription and Tenant Variables
variable "subscription_id" {
  description = "The Azure subscription ID"
  type        = string
  sensitive   = true
}

variable "tenant_id" {
  description = "The Azure AD tenant ID"
  type        = string
  sensitive   = true
}

# Production Subscription (for cross-subscription deployments)
variable "prod_subscription_id" {
  description = "The production Azure subscription ID"
  type        = string
  default     = ""
  sensitive   = true
}

# Resource Group Variables
variable "resource_group_name" {
  description = "The name of the resource group (will be created if it doesn't exist)"
  type        = string
  default     = ""
}

# Networking Variables
variable "address_space" {
  description = "The address space for the virtual network"
  type        = list(string)
  default     = ["10.0.0.0/16"]
}

variable "subnet_prefixes" {
  description = "The address prefixes for subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "subnet_names" {
  description = "The names of the subnets"
  type        = list(string)
  default     = ["subnet1", "subnet2"]
}

# Tags
variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default = {
    Environment = "dev"
    Project     = "OptimaCore"
    ManagedBy   = "Terraform"
  }
}

# Budget Variables
variable "monthly_budget_amount" {
  description = "The monthly budget amount in USD"
  type        = number
  default     = 100
}

variable "budget_alert_emails" {
  description = "List of email addresses to send budget alerts to"
  type        = list(string)
  default     = []
}

# Module Toggles
variable "enable_redis" {
  description = "Enable Redis Cache deployment"
  type        = bool
  default     = true
}

variable "enable_postgres" {
  description = "Enable PostgreSQL deployment"
  type        = bool
  default     = true
}

variable "enable_cosmos" {
  description = "Enable Cosmos DB deployment"
  type        = bool
  default     = false
}

variable "enable_blob" {
  description = "Enable Blob Storage deployment"
  type        = bool
  default     = false
}

# Experiment Manifest
variable "git_commit" {
  description = "The git commit hash for the deployment"
  type        = string
  default     = "local"
}

variable "experiment_name" {
  description = "Name of the experiment"
  type        = string
  default     = "default-experiment"
}
