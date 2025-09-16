# Serverless Variant Module
# Implements a serverless deployment using AWS Lambda and API Gateway

module "common" {
  source = "../_common"
  
  app_name          = var.app_name
  environment      = var.environment
  deployment_variant = "serverless"
  vpc_id           = var.vpc_id
  log_retention_days = var.log_retention_days
  tags             = merge(var.tags, { "Architecture" = "serverless" })
  
  app_config_parameters = {
    "cache/type" = { value = "dynamodb", secure = false }
    "cache/ttl"  = { value = tostring(var.cache_ttl), secure = false }
    "db/type"    = { value = "dynamodb", secure = false }
    "storage/type" = { value = "s3", secure = false }
    "serverless/enabled" = { value = "true", secure = false }
  }
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda_exec" {
  name = "${var.app_name}-${var.environment}-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# Attach basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lambda Function
resource "aws_lambda_function" "api" {
  function_name = "${var.app_name}-${var.environment}-api"
  handler       = "index.handler"
  runtime       = var.lambda_runtime
  role          = aws_iam_role.lambda_exec.arn
  timeout       = var.lambda_timeout
  memory_size   = var.lambda_memory_size
  
  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)
  
  environment {
    variables = {
      NODE_ENV           = var.environment
      APP_NAME           = var.app_name
      LOG_LEVEL          = var.log_level
      CACHE_TABLE        = aws_dynamodb_table.cache.name
      DATA_TABLE         = aws_dynamodb_table.data.name
      STORAGE_BUCKET     = aws_s3_bucket.storage.id
      TELEMETRY_ENABLED  = "true"
    }
  }
  
  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }
  
  tags = var.tags
}

# API Gateway
resource "aws_apigatewayv2_api" "api" {
  name          = "${var.app_name}-${var.environment}"
  protocol_type = "HTTP"
  
  cors_configuration {
    allow_origins = var.cors_allowed_origins
    allow_methods = ["*"]
    allow_headers = ["*"]
  }
  
  tags = var.tags
}

# API Gateway Integration
resource "aws_apigatewayv2_integration" "lambda" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  
  integration_uri    = aws_lambda_function.api.invoke_arn
  integration_method = "POST"
}

# API Gateway Route
resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# API Gateway Stage
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
  
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gw.arn
    
    format = jsonencode({
      requestId        = "$context.requestId"
      ip               = "$context.identity.sourceIp"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      protocol         = "$context.protocol"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }
  
  tags = var.tags
}

# Lambda Permission for API Gateway
resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  
  source_arn = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

# DynamoDB Table for Caching
resource "aws_dynamodb_table" "cache" {
  name         = "${var.app_name}-${var.environment}-cache"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "key"
  
  attribute {
    name = "key"
    type = "S"
  }
  
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
  
  tags = merge(var.tags, {
    Name = "${var.app_name}-${var.environment}-cache"
  })
}

# DynamoDB Table for Data
resource "aws_dynamodb_table" "data" {
  name         = "${var.app_name}-${var.environment}-data"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"
  
  attribute {
    name = "pk"
    type = "S"
  }
  
  attribute {
    name = "sk"
    type = "S"
  }
  
  global_secondary_index {
    name            = "GSI1"
    hash_key        = "sk"
    range_key       = "pk"
    projection_type = "ALL"
  }
  
  tags = merge(var.tags, {
    Name = "${var.app_name}-${var.environment}-data"
  })
}

# S3 Bucket for Storage
resource "aws_s3_bucket" "storage" {
  bucket = "${var.app_name}-${var.environment}-storage-${data.aws_caller_identity.current.account_id}"
  
  tags = merge(var.tags, {
    Name = "${var.app_name}-${var.environment}-storage"
  })
}

# S3 Bucket Versioning
resource "aws_s3_bucket_versioning" "storage" {
  bucket = aws_s3_bucket.storage.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Bucket Server Side Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "storage" {
  bucket = aws_s3_bucket.storage.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_gw" {
  name              = "/aws/api-gw/${var.app_name}-${var.environment}"
  retention_in_days = var.log_retention_days
  
  tags = var.tags
}

# Security Group for Lambda
resource "aws_security_group" "lambda" {
  name        = "${var.app_name}-${var.environment}-lambda-sg"
  description = "Security group for Lambda function"
  vpc_id      = var.vpc_id
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = merge(var.tags, {
    Name = "${var.app_name}-${var.environment}-lambda-sg"
  })
}

data "aws_caller_identity" "current" {}
