variable "app_name" {
  description = "Name of the application"
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g., dev, staging, prod)"
  type        = string
}

variable "vpc_id" {
  description = "The VPC ID where resources will be created"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for EKS nodes"
  type        = list(string)
}

variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}

# EKS Cluster Configuration
variable "kubernetes_version" {
  description = "Kubernetes version to use for the EKS cluster"
  type        = string
  default     = "1.27"
}

# Node Group Configuration
variable "node_instance_types" {
  description = "List of instance types for the EKS node group"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "desired_node_count" {
  description = "Desired number of nodes in the EKS node group"
  type        = number
  default     = 2
}

variable "min_node_count" {
  description = "Minimum number of nodes in the EKS node group"
  type        = number
  default     = 1
}

variable "max_node_count" {
  description = "Maximum number of nodes in the EKS node group"
  type        = number
  default     = 3
}

# EKS Add-ons
variable "vpc_cni_version" {
  description = "Version of the VPC CNI add-on"
  type        = string
  default     = "v1.12.6-eksbuild.2"
}

variable "coredns_version" {
  description = "Version of the CoreDNS add-on"
  type        = string
  default     = "v1.9.3-eksbuild.2"
}

variable "kube_proxy_version" {
  description = "Version of the kube-proxy add-on"
  type        = string
  default     = "v1.27.1-eksbuild.1"
}

# Application Configuration
variable "app_image" {
  description = "Docker image for the application"
  type        = string
}

variable "app_version" {
  description = "Version of the application to deploy"
  type        = string
  default     = "latest"
}

variable "app_port" {
  description = "Port on which the application listens"
  type        = number
  default     = 3000
}

variable "app_replicas" {
  description = "Number of application replicas to run"
  type        = number
  default     = 2
}

# Resource Requests and Limits
variable "app_cpu_request" {
  description = "CPU request for the application container"
  type        = string
  default     = "100m"
}

variable "app_memory_request" {
  description = "Memory request for the application container"
  type        = string
  default     = "256Mi"
}

variable "app_cpu_limit" {
  description = "CPU limit for the application container"
  type        = string
  default     = "500m"
}

variable "app_memory_limit" {
  description = "Memory limit for the application container"
  type        = string
  default     = "512Mi"
}

# Cache Configuration
variable "cache_ttl" {
  description = "Default TTL for cache entries in seconds"
  type        = number
  default     = 300
}

# Logging Configuration
variable "log_retention_days" {
  description = "Number of days to retain logs"
  type        = number
  default     = 30
}
