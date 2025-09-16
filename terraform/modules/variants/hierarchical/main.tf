# Hierarchical Variant Module
# Implements a traditional 3-tier architecture with Redis cache and PostgreSQL

module "common" {
  source = "../_common"
  
  app_name          = var.app_name
  environment       = var.environment
  deployment_variant = "hierarchical"
  vpc_id           = var.vpc_id
  log_retention_days = var.log_retention_days
  tags             = merge(var.tags, { "Architecture" = "hierarchical" })
  
  app_config_parameters = {
    "cache/type" = { value = var.cache_type, secure = false }
    "cache/ttl"  = { value = tostring(var.cache_ttl), secure = false }
    "db/host"    = { value = module.rds.db_instance_address, secure = false }
    "db/port"    = { value = tostring(module.rds.db_instance_port), secure = false }
    "db/name"    = { value = var.db_name, secure = false }
    "db/user"    = { value = var.db_username, secure = true }
  }
}

# RDS PostgreSQL Database
module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 5.0"
  
  identifier = "${var.app_name}-${var.environment}-hierarchical"
  
  engine               = "postgres"
  engine_version       = "14"
  instance_class       = var.db_instance_type
  allocated_storage    = var.db_allocated_storage
  storage_encrypted   = true
  
  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 5432
  
  vpc_security_group_ids = [module.common.security_group_id]
  
  maintenance_window = "Mon:00:00-Mon:03:00"
  backup_window     = "03:00-06:00"
  backup_retention_period = 7
  
  # Enhanced Monitoring
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn
  
  # Disable creation of parameter group if using default
  create_db_parameter_group = false
  parameter_group_name      = "default.postgres14"
  
  tags = module.common.common_tags
}

# ElastiCache Redis
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.app_name}-${var.environment}-hierarchical"
  subnet_ids = var.private_subnet_ids
  
  tags = module.common.common_tags
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.app_name}-${var.environment}-hierarchical"
  engine               = "redis"
  node_type            = var.cache_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis6.x"
  engine_version       = "6.x"
  port                 = 6379
  
  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [module.common.security_group_id]
  
  tags = module.common.common_tags
}

# IAM Role for RDS Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.app_name}-${var.environment}-rds-monitoring-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
  
  managed_policy_arns = ["arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"]
  
  tags = module.common.common_tags
}

# Outputs
output "rds_endpoint" {
  value = module.rds.db_instance_address
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "security_group_id" {
  value = module.common.security_group_id
}

output "execution_role_arn" {
  value = module.common.execution_role_arn
}
