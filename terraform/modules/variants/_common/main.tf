# Common resources and configurations for all variants

# Common tags for all resources
locals {
  common_tags = merge(
    var.tags,
    {
      Environment     = var.environment
      DeploymentVariant = var.deployment_variant
      ManagedBy       = "terraform"
      LastUpdated     = timestamp()
    }
  )
}

# Common IAM policies and roles
resource "aws_iam_role" "execution_role" {
  name = "${var.app_name}-${var.environment}-execution-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = [
            "ecs-tasks.amazonaws.com",
            "lambda.amazonaws.com",
            "ec2.amazonaws.com"
          ]
        }
      }
    ]
  })
  
  tags = local.common_tags
}

# Common CloudWatch log group
resource "aws_cloudwatch_log_group" "app_logs" {
  name              = "/${var.app_name}/${var.environment}/${var.deployment_variant}"
  retention_in_days = var.log_retention_days
  
  tags = local.common_tags
}

# Common security group
resource "aws_security_group" "app_sg" {
  name        = "${var.app_name}-${var.environment}-${var.deployment_variant}-sg"
  description = "Security group for ${var.app_name} ${var.environment} ${var.deployment_variant}"
  vpc_id      = var.vpc_id
  
  # Common egress rule
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = local.common_tags
}

# Common parameter store parameters
resource "aws_ssm_parameter" "app_config" {
  for_each = var.app_config_parameters
  
  name  = "/${var.app_name}/${var.environment}/${var.deployment_variant}/${each.key}"
  type  = each.value.secure ? "SecureString" : "String"
  value = each.value.value
  
  tags = local.common_tags
}

# Common outputs
output "common_tags" {
  value = local.common_tags
}

output "execution_role_arn" {
  value = aws_iam_role.execution_role.arn
}

output "security_group_id" {
  value = aws_security_group.app_sg.id
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.app_logs.name
}
