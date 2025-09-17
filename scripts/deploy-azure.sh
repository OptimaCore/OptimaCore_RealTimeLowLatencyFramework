#!/bin/bash
# Deployment script for Azure App Service

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f "../.env" ]; then
    export $(grep -v '^#' ../.env | xargs)
else
    echo -e "${YELLOW}⚠️  Warning: .env file not found. Using default values.${NC}"
fi

# Default values
APP_NAME=${APP_NAME:-"optimacore"}
ENVIRONMENT=${ENVIRONMENT:-"dev"}
RESOURCE_GROUP="${APP_NAME}-${ENVIRONMENT}-rg"
APP_SERVICE_NAME="${APP_NAME}-${ENVIRONMENT}"
LOCATION=${LOCATION:-"eastus"}
NODE_VERSION=${NODE_VERSION:-"18-lts"}

# Check Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}❌ Azure CLI not found. Please install it first.${NC}"
    exit 1
fi

# Login to Azure if not already logged in
az account show > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}🔐 Logging in to Azure...${NC}"
    az login
fi

# Create resource group if it doesn't exist
echo -e "${YELLOW}🔍 Checking resource group...${NC}"
az group show --name $RESOURCE_GROUP > /dev/null 2>&1 || {
    echo -e "${YELLOW}🆕 Creating resource group $RESOURCE_GROUP...${NC}"
    az group create --name $RESOURCE_GROUP --location $LOCATION
}

# Deploy using Terraform
echo -e "${YELLOW}🚀 Starting Terraform deployment...${NC}"
cd ../infrastructure/azure

# Initialize Terraform if needed
if [ ! -d ".terraform" ]; then
    terraform init
fi

# Plan the deployment
echo -e "${YELLOW}📋 Planning deployment...${NC}"
terraform plan \
    -var="app_name=$APP_NAME" \
    -var="environment=$ENVIRONMENT" \
    -out=tfplan

# Apply the plan
echo -e "${YELLOW}🚀 Applying deployment...${NC}"
terraform apply -auto-approve tfplan

# Get the web app name
WEB_APP_NAME=$(terraform output -raw web_app_name)
WEB_APP_URL=$(terraform output -raw web_app_url)

# Deploy the application
echo -e "${YELLOW}🚀 Deploying application code...${NC}"

# Install dependencies and build the app
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm ci --production

# Create deployment package
ZIP_FILE="../deploy-${ENVIRONMENT}.zip"
echo -e "${YELLOW}📦 Creating deployment package...${NC}"
zip -r $ZIP_FILE . -x "node_modules/*" ".git/*" ".github/*" ".vscode/*" ".env*" "*.zip"

# Deploy to Azure App Service
echo -e "${YELLOW}🚀 Deploying to Azure App Service...${NC}"
az webapp deployment source config-zip \
    --resource-group $RESOURCE_GROUP \
    --name $WEB_APP_NAME \
    --src $ZIP_FILE

# Clean up
rm $ZIP_FILE

# Restart the app to apply changes
echo -e "${YELLOW}🔄 Restarting the application...${NC}"
az webapp restart --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP

# Get the deployment status
echo -e "${YELLOW}🔄 Checking deployment status...${NC}"
az webapp deployment list-publishing-credentials \
    --name $WEB_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --query scmUri \
    --output tsv

echo -e "\n${GREEN}✅ Deployment successful!${NC}"
echo -e "${GREEN}🌐 Application URL: $WEB_APP_URL${NC}"
echo -e "\nNext steps:"
echo "1. Visit $WEB_APP_URL to access your application"
echo "2. Check logs: az webapp log tail --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP"
echo "3. Set up CI/CD: https://docs.microsoft.com/en-us/azure/app-service/deploy-github-actions"

# Make the script executable
chmod +x "$0"
