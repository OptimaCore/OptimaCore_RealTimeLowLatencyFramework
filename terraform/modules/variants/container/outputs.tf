output "cluster_name" {
  description = "The name of the EKS cluster"
  value       = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  description = "The endpoint for the EKS cluster"
  value       = aws_eks_cluster.main.endpoint
}

output "cluster_certificate_authority" {
  description = "The certificate authority data for the EKS cluster"
  value       = aws_eks_cluster.main.certificate_authority[0].data
}

output "node_group_arn" {
  description = "The ARN of the EKS node group"
  value       = aws_eks_node_group.main.arn
}

output "node_group_id" {
  description = "The ID of the EKS node group"
  value       = aws_eks_node_group.main.id
}

output "node_group_status" {
  description = "The status of the EKS node group"
  value       = aws_eks_node_group.main.status
}

output "kubernetes_namespace" {
  description = "The name of the Kubernetes namespace"
  value       = kubernetes_namespace.app.metadata[0].name
}

output "service_name" {
  description = "The name of the Kubernetes service"
  value       = kubernetes_service.app.metadata[0].name
}

output "service_endpoint" {
  description = "The endpoint for the Kubernetes service"
  value       = "http://${kubernetes_service.app.status[0].load_balancer[0].ingress[0].hostname}"
}

output "deployment_variant" {
  description = "The deployment variant type"
  value       = "container"
}

output "telemetry_config" {
  description = "Telemetry configuration for the container variant"
  value = {
    enabled           = true
    provider          = "prometheus"
    sampling_rate     = 1.0
    enable_tracing    = true
    enable_metrics    = true
    enable_logging    = true
    enable_profiling  = true
    storage_location  = "cloudwatch"
    retention_days    = var.log_retention_days
  }
}
