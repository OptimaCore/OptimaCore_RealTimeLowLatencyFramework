# Container Variant Module
# Implements a container-based deployment using Kubernetes

module "common" {
  source = "../_common"
  
  app_name          = var.app_name
  environment      = var.environment
  deployment_variant = "container"
  vpc_id           = var.vpc_id
  log_retention_days = var.log_retention_days
  tags             = merge(var.tags, { "Architecture" = "container" })
  
  app_config_parameters = {
    "cache/type" = { value = "redis", secure = false }
    "cache/ttl"  = { value = tostring(var.cache_ttl), secure = false }
    "db/type"    = { value = "postgresql", secure = false }
    "storage/type" = { value = "s3", secure = false }
    "container/enabled" = { value = "true", secure = false }
  }
}

# EKS Cluster
resource "aws_eks_cluster" "main" {
  name     = "${var.app_name}-${var.environment}"
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.kubernetes_version

  vpc_config {
    subnet_ids = var.private_subnet_ids
    
    endpoint_private_access = true
    endpoint_public_access  = true
    
    public_access_cidrs = [
      "0.0.0.0/0"
    ]
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.app_name}-${var.environment}"
    }
  )
}

# EKS Node Group
resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.app_name}-${var.environment}-ng"
  node_role_arn   = aws_iam_role.eks_nodes.arn
  subnet_ids      = var.private_subnet_ids
  instance_types  = var.node_instance_types
  
  scaling_config {
    desired_size = var.desired_node_count
    max_size     = var.max_node_count
    min_size     = var.min_node_count
  }

  update_config {
    max_unavailable = 1
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.app_name}-${var.environment}-ng"
    }
  )
}

# EKS Add-ons
resource "aws_eks_addon" "vpc_cni" {
  cluster_name      = aws_eks_cluster.main.name
  addon_name        = "vpc-cni"
  addon_version     = var.vpc_cni_version
  resolve_conflicts = "OVERWRITE"
}

resource "aws_eks_addon" "coredns" {
  cluster_name      = aws_eks_cluster.main.name
  addon_name        = "coredns"
  addon_version     = var.coredns_version
  resolve_conflicts = "OVERWRITE"
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name      = aws_eks_cluster.main.name
  addon_name        = "kube-proxy"
  addon_version     = var.kube_proxy_version
  resolve_conflicts = "OVERWRITE"
}

# Kubernetes Provider
provider "kubernetes" {
  host                   = aws_eks_cluster.main.endpoint
  cluster_ca_certificate = base64decode(aws_eks_cluster.main.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.main.token
}

# Kubernetes Namespace
resource "kubernetes_namespace" "app" {
  metadata {
    name = var.app_name
    labels = {
      app     = var.app_name
      env     = var.environment
      variant = "container"
    }
  }
}

# Kubernetes Deployment
resource "kubernetes_deployment" "app" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace.app.metadata[0].name
    labels = {
      app = var.app_name
    }
  }

  spec {
    replicas = var.app_replicas
    
    selector {
      match_labels = {
        app = var.app_name
      }
    }
    
    template {
      metadata {
        labels = {
          app = var.app_name
        }
      }
      
      spec {
        container {
          name  = var.app_name
          image = "${var.app_image}:${var.app_version}"
          
          port {
            container_port = var.app_port
          }
          
          resources {
            limits = {
              cpu    = var.app_cpu_limit
              memory = var.app_memory_limit
            }
            requests = {
              cpu    = var.app_cpu_request
              memory = var.app_memory_request
            }
          }
          
          env_from {
            config_map_ref {
              name = "${var.app_name}-config"
            }
          }
          
          liveness_probe {
            http_get {
              path = "/health"
              port = var.app_port
            }
            initial_delay_seconds = 30
            period_seconds        = 10
          }
          
          readiness_probe {
            http_get {
              path = "/ready"
              port = var.app_port
            }
            initial_delay_seconds = 5
            period_seconds        = 5
          }
        }
      }
    }
  }
}

# Kubernetes Service
resource "kubernetes_service" "app" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace.app.metadata[0].name
  }
  
  spec {
    selector = {
      app = kubernetes_deployment.app.spec[0].template[0].metadata[0].labels.app
    }
    
    port {
      port        = 80
      target_port = var.app_port
    }
    
    type = "LoadBalancer"
  }
}
