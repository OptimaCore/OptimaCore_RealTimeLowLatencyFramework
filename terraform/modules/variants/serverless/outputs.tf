output "api_endpoint" {
  description = "The base URL of the API Gateway"
  value       = "${aws_apigatewayv2_stage.default.invoke_url}/"
}

output "lambda_function_name" {
  description = "The name of the Lambda function"
  value       = aws_lambda_function.api.function_name
}

output "lambda_function_arn" {
  description = "The ARN of the Lambda function"
  value       = aws_lambda_function.api.arn
}

output "lambda_invoke_arn" {
  description = "The invoke ARN of the Lambda function"
  value       = aws_lambda_function.api.invoke_arn
}

output "api_gateway_id" {
  description = "The ID of the API Gateway"
  value       = aws_apigatewayv2_api.api.id
}

output "api_gateway_arn" {
  description = "The ARN of the API Gateway"
  value       = aws_apigatewayv2_api.api.execution_arn
}

output "cache_table_name" {
  description = "The name of the DynamoDB cache table"
  value       = aws_dynamodb_table.cache.name
}

output "cache_table_arn" {
  description = "The ARN of the DynamoDB cache table"
  value       = aws_dynamodb_table.cache.arn
}

data "aws_region" "current" {}

output "data_table_name" {
  description = "The name of the DynamoDB data table"
  value       = aws_dynamodb_table.data.name
}

output "data_table_arn" {
  description = "The ARN of the DynamoDB data table"
  value       = aws_dynamodb_table.data.arn
}

output "storage_bucket_name" {
  description = "The name of the S3 storage bucket"
  value       = aws_s3_bucket.storage.id
}

output "storage_bucket_arn" {
  description = "The ARN of the S3 storage bucket"
  value       = "arn:aws:s3:::${aws_s3_bucket.storage.id}"
}

output "cloudwatch_log_group_name" {
  description = "The name of the CloudWatch log group"
  value       = "/aws/lambda/${aws_lambda_function.api.function_name}"
}

output "cloudwatch_log_group_arn" {
  description = "The ARN of the CloudWatch log group"
  value       = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${aws_lambda_function.api.function_name}:*"
}

output "lambda_security_group_id" {
  description = "The ID of the security group for the Lambda function"
  value       = aws_security_group.lambda.id
}

output "deployment_variant" {
  description = "The deployment variant type"
  value       = "serverless"
}

output "telemetry_config" {
  description = "Telemetry configuration for the serverless variant"
  value = {
    enabled           = true
    provider          = "xray"
    sampling_rate     = 1.0
    enable_tracing    = true
    enable_metrics    = true
    enable_logging    = true
    enable_profiling  = false
    storage_location  = "cloudwatch"
    retention_days    = var.log_retention_days
  }
}
