# Deployment Variants

This directory contains Terraform modules for different deployment variants of the application. Each variant is optimized for specific use cases and requirements.

## Available Variants

### 1. Hierarchical
A traditional multi-tier architecture with separate layers for presentation, application, and data.

**Key Features:**
- Kubernetes-based deployment
- Redis for caching
- PostgreSQL for data storage
- Horizontal Pod Autoscaling
- Service mesh integration

**Usage:**
```hcl
module "hierarchical" {
  source = "./variants/hierarchical"
  
  app_name     = var.app_name
  environment = var.environment
  vpc_id      = var.vpc_id
  
  # Optional overrides
  db_instance_type = "db.t3.medium"
  cache_node_type  = "cache.t3.micro"
  
  tags = var.tags
}
```

### 2. Edge
A globally distributed edge-optimized architecture using Cloudflare Workers and edge computing.

**Key Features:**
- Serverless edge functions
- Global content delivery
- Low-latency data access
- Built-in DDoS protection
- Automatic scaling

**Usage:**
```hcl
module "edge" {
  source = "./variants/edge"
  
  app_name     = var.app_name
  environment = var.environment
  vpc_id      = var.vpc_id
  
  cloudflare_account_id = var.cloudflare_account_id
  
  # Optional overrides
  cache_ttl = 300
  
  tags = var.tags
}
```

### 3. Container
A container-based deployment optimized for Kubernetes with advanced orchestration features.

**Key Features:**
- Kubernetes-native deployment
- Horizontal pod autoscaling
- Service mesh integration
- Advanced networking
- Multi-zone high availability

**Usage:**
```hcl
module "container" {
  source = "./variants/container"
  
  app_name     = var.app_name
  environment = var.environment
  vpc_id      = var.vpc_id
  
  private_subnet_ids = var.private_subnet_ids
  
  # Optional overrides
  desired_node_count = 2
  node_instance_types = ["t3.medium"]
  
  tags = var.tags
}
```

### 4. Serverless
A fully serverless deployment using AWS Lambda and managed services.

**Key Features:**
- No server management
- Automatic scaling
- Pay-per-use pricing
- Built-in high availability
- Integrated monitoring

**Usage:**
```hcl
module "serverless" {
  source = "./variants/serverless"
  
  app_name     = var.app_name
  environment = var.environment
  vpc_id      = var.vpc_id
  
  private_subnet_ids = var.private_subnet_ids
  
  # Optional overrides
  lambda_memory_size = 1024
  lambda_timeout     = 30
  
  tags = var.tags
}
```

## Common Configuration

All variants support the following common configuration options:

- `app_name`: Name of the application
- `environment`: Deployment environment (dev/staging/prod)
- `vpc_id`: VPC ID where resources will be created
- `tags`: Map of tags to apply to all resources
- `log_retention_days`: Number of days to retain logs (default: 30)

## Switching Between Variants

To switch between deployment variants, update your root module to reference the desired variant module and run:

```bash
# Initialize Terraform
terraform init

# Plan the changes
terraform plan

# Apply the changes
terraform apply
```

## Best Practices

1. **Start with the simplest variant** that meets your requirements
2. **Monitor performance** and scale as needed
3. **Use tags** consistently for cost allocation and resource management
4. **Enable encryption** for data at rest and in transit
5. **Regularly update** to the latest module versions for security patches

## Versioning

Modules follow [Semantic Versioning](https://semver.org/). When using these modules, pin to a specific version to avoid unexpected changes.

## Contributing

Contributions are welcome! Please follow the contribution guidelines in the main repository.
