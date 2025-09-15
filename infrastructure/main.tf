locals {
  # Common tags to be assigned to all resources
  common_tags = merge(
    var.tags,
    {
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "Terraform"
    }
  )
  
  # Generate a unique name suffix for resources that need it
  name_suffix = lower(substr(md5(azurerm_resource_group.main.id), 0, 8))
}

# Create a resource group
resource "azurerm_resource_group" "main" {
  name     = coalesce(var.resource_group_name, "${var.project_name}-${var.environment}-rg")
  location = var.location
  tags     = local.common_tags
}

# Network Module
module "network" {
  source              = "./modules/network"
  resource_group_name = azurerm_resource_group.main.name
  location           = azurerm_resource_group.main.location
  environment        = var.environment
  project_name       = var.project_name
  address_space      = var.address_space
  subnet_prefixes    = var.subnet_prefixes
  subnet_names       = var.subnet_names
  tags               = local.common_tags
}

# Redis Module
module "redis" {
  count               = var.enable_redis ? 1 : 0
  source              = "./modules/redis"
  resource_group_name = azurerm_resource_group.main.name
  location           = azurerm_resource_group.main.location
  environment        = var.environment
  project_name       = var.project_name
  subnet_id          = module.network.subnet_ids[0] # Using first subnet for Redis
  tags               = local.common_tags
}

# PostgreSQL Module
module "postgres" {
  count               = var.enable_postgres ? 1 : 0
  source              = "./modules/postgres"
  resource_group_name = azurerm_resource_group.main.name
  location           = azurerm_resource_group.main.location
  environment        = var.environment
  project_name       = var.project_name
  subnet_id          = module.network.subnet_ids[0] # Using first subnet for PostgreSQL
  tags               = local.common_tags
}

# Cosmos DB Module
module "cosmos" {
  count               = var.enable_cosmos ? 1 : 0
  source              = "./modules/cosmos"
  resource_group_name = azurerm_resource_group.main.name
  location           = azurerm_resource_group.main.location
  environment        = var.environment
  project_name       = var.project_name
  tags               = local.common_tags
}

# Blob Storage Module
module "storage" {
  count               = var.enable_blob ? 1 : 0
  source              = "./modules/blob"
  resource_group_name = azurerm_resource_group.main.name
  location           = azurerm_resource_group.main.location
  environment        = var.environment
  project_name       = var.project_name
  tags               = local.common_tags
}

# Monitoring Module
module "monitoring" {
  source              = "./modules/monitoring"
  resource_group_name = azurerm_resource_group.main.name
  location           = azurerm_resource_group.main.location
  environment        = var.environment
  project_name       = var.project_name
  tags               = local.common_tags
}

# Budget Module
module "budget" {
  source              = "./modules/budgets"
  resource_group_name = azurerm_resource_group.main.name
  environment        = var.environment
  project_name       = var.project_name
  subscription_id    = var.subscription_id
  monthly_budget     = var.monthly_budget_amount
  alert_emails       = var.budget_alert_emails
  tags               = local.common_tags
}

# Generate experiment manifest
resource "local_file" "experiment_manifest" {
  filename = "${path.module}/experiment_manifest.tpl"
  content = templatefile("${path.module}/templates/experiment_manifest.tpl", {
    git_commit      = var.git_commit
    terraform_version = "1.3.0"
    start_ts        = timestamp()
    region          = var.location
    variant         = var.environment
    experiment_name = var.experiment_name
  })
  
  lifecycle {
    ignore_changes = [content] # Don't update on every run
  }
}
