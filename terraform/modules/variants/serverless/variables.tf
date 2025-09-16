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
  description = "List of private subnet IDs for Lambda functions"
  type        = list(string)
}

variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}

# Lambda Configuration
variable "lambda_runtime" {
  description = "Runtime environment for the Lambda function"
  type        = string
  default     = "nodejs18.x"
}

variable "lambda_timeout" {
  description = "The amount of time the Lambda function can run in seconds"
  type        = number
  default     = 30
}

variable "lambda_memory_size" {
  description = "Amount of memory in MB the Lambda function can use"
  type        = number
  default     = 1024
}

variable "lambda_package_path" {
  description = "Path to the Lambda deployment package"
  type        = string
  default     = "../../../../dist/lambda.zip"
}

# Logging Configuration
variable "log_level" {
  description = "Log level for the application"
  type        = string
  default     = "info"
}

variable "log_retention_days" {
  description = "Number of days to retain logs"
  type        = number
  default     = 30
}

# CORS Configuration
variable "cors_allowed_origins" {
  description = "List of allowed origins for CORS"
  type        = list(string)
  default     = ["*"]
}

# Cache Configuration
variable "cache_ttl" {
  description = "Default TTL for cache entries in seconds"
  type        = number
  default     = 300
}

# API Gateway Configuration
variable "api_stage_name" {
  description = "Name of the API Gateway stage"
  type        = string
  default     = "$default"
}

# Storage Configuration
variable "enable_s3_encryption" {
  description = "Enable server-side encryption for S3 bucket"
  type        = bool
  default     = true
}

variable "enable_s3_versioning" {
  description = "Enable versioning for S3 bucket"
  type        = bool
  default     = true
}

# Security Configuration
variable "enable_vpc" {
  description = "Enable VPC for Lambda functions"
  type        = bool
  default     = true
}

# Performance Configuration
variable "lambda_concurrent_executions" {
  description = "Maximum number of concurrent executions for the Lambda function"
  type        = number
  default     = 1000
}

# Environment Variables
variable "environment_variables" {
  description = "Additional environment variables for the Lambda function"
  type        = map(string)
  default     = {}
}

# Alarms Configuration
variable "enable_alarms" {
  description = "Enable CloudWatch alarms"
  type        = bool
  default     = true
}

variable "alarm_sns_topic_arn" {
  description = "ARN of the SNS topic for alarm notifications"
  type        = string
  default     = ""
}

# Tracing Configuration
variable "enable_xray_tracing" {
  description = "Enable AWS X-Ray tracing"
  type        = bool
  default     = true
}

# VPC Configuration
variable "security_group_ids" {
  description = "List of security group IDs for Lambda functions"
  type        = list(string)
  default     = []
}

# Dead Letter Queue Configuration
variable "enable_dlq" {
  description = "Enable Dead Letter Queue for Lambda functions"
  type        = bool
  default     = true
}

variable "dlq_arn" {
  description = "ARN of the Dead Letter Queue"
  type        = string
  default     = ""
}
