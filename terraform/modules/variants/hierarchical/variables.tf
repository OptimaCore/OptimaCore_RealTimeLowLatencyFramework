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
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "db_name" {
  description = "Name of the database"
  type        = string
  default     = "appdb"
}

variable "db_username" {
  description = "Database administrator username"
  type        = string
  default     = "dbadmin"
}

variable "db_password" {
  description = "Database administrator password"
  type        = string
  sensitive   = true
}

variable "db_instance_type" {
  description = "Instance type for the RDS instance"
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "cache_type" {
  description = "Type of cache to use (redis or memcached)"
  type        = string
  default     = "redis"
}

variable "cache_node_type" {
  description = "Instance type for the cache nodes"
  type        = string
  default     = "cache.t3.micro"
}

variable "cache_ttl" {
  description = "Default TTL for cache entries in seconds"
  type        = number
  default     = 300
}

variable "log_retention_days" {
  description = "Number of days to retain logs in CloudWatch"
  type        = number
  default     = 30
}

variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}
