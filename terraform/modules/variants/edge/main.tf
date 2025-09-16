# Edge Variant Module
# Implements a globally distributed edge-optimized architecture using Cloudflare Workers

module "common" {
  source = "../_common"
  
  app_name          = var.app_name
  environment      = var.environment
  deployment_variant = "edge"
  vpc_id           = var.vpc_id
  log_retention_days = var.log_retention_days
  tags             = merge(var.tags, { "Architecture" = "edge" })
  
  app_config_parameters = {
    "cache/type" = { value = "cloudflare-kv", secure = false }
    "cache/ttl"  = { value = tostring(var.cache_ttl), secure = false }
    "db/type"    = { value = "d1", secure = false }
    "storage/type" = { value = "r2", secure = false }
    "edge/enabled" = { value = "true", secure = false }
  }
}

# Cloudflare Workers KV Namespace for Edge Caching
resource "cloudflare_workers_kv_namespace" "edge_cache" {
  account_id = var.cloudflare_account_id
  title      = "${var.app_name}-${var.environment}-edge-cache"
}

# Cloudflare D1 Database
resource "cloudflare_d1_database" "edge_db" {
  account_id = var.cloudflare_account_id
  name       = "${var.app_name}-${var.environment}-edge"
}

# Cloudflare R2 Bucket for Edge Storage
resource "cloudflare_r2_bucket" "edge_storage" {
  account_id = var.cloudflare_account_id
  name       = "${var.app_name}-${var.environment}-edge-storage"
}

# Outputs
output "kv_namespace_id" {
  value = cloudflare_workers_kv_namespace.edge_cache.id
}

output "d1_database_id" {
  value = cloudflare_d1_database.edge_db.id
}

output "r2_bucket_name" {
  value = cloudflare_r2_bucket.edge_storage.name
}
