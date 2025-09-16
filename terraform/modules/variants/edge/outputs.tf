output "edge_endpoint" {
  description = "The endpoint URL for the edge deployment"
  value       = "https://${var.app_name}-${var.environment}.workers.dev"
}

output "kv_namespace_id" {
  description = "The ID of the Cloudflare Workers KV namespace"
  value       = cloudflare_workers_kv_namespace.edge_cache.id
}

output "d1_database_id" {
  description = "The ID of the Cloudflare D1 database"
  value       = cloudflare_d1_database.edge_db.id
}

output "r2_bucket_name" {
  description = "The name of the Cloudflare R2 bucket"
  value       = cloudflare_r2_bucket.edge_storage.name
}

output "deployment_variant" {
  description = "The deployment variant type"
  value       = "edge"
}

output "telemetry_config" {
  description = "Telemetry configuration for the edge variant"
  value = {
    enabled           = true
    provider          = "cloudflare-analytics"
    sampling_rate     = 1.0
    enable_tracing    = true
    enable_metrics    = true
    enable_logging    = true
    enable_profiling  = false
    storage_location  = "cloudflare-logs"
    retention_days    = var.log_retention_days
  }
}
