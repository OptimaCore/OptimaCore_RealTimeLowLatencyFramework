variable "app_name" {
  description = "Name of the application"
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g., dev, staging, prod)"
  type        = string
}

variable "deployment_variant" {
  description = "The deployment variant (hierarchical, edge, container, serverless)"
  type        = string
}

variable "vpc_id" {
  description = "The VPC ID where resources will be created"
  type        = string
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

variable "app_config_parameters" {
  description = "A map of application configuration parameters to store in SSM Parameter Store"
  type = map(object({
    value  = string
    secure = bool
  }))
  default = {}
}
