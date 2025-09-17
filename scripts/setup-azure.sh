#!/bin/bash
# Setup script for Azure deployment

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Setting up Azure deployment for OptimaCore...${NC}"

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${YELLOW}Azure CLI not found. Installing...${NC}"
    # Install Azure CLI (Ubuntu/Debian)
    curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
    echo -e "${GREEN}✅ Azure CLI installed successfully!${NC}"
else
    echo -e "${GREEN}✅ Azure CLI is already installed.${NC}"
fi

# Check if Terraform is installed
if ! command -v terraform &> /dev/null; then
    echo -e "${YELLOW}Terraform not found. Installing...${NC}"
    # Install Terraform (Ubuntu/Debian)
    sudo apt-get update && sudo apt-get install -y gnupg software-properties-common curl
    curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo apt-key add -
    sudo apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"
    sudo apt-get update && sudo apt-get install terraform
    echo -e "${GREEN}✅ Terraform installed successfully!${NC}"
else
    echo -e "${GREEN}✅ Terraform is already installed.${NC}"
fi

# Login to Azure
az login

# Set subscription if needed
# az account set --subscription "your-subscription-id"

# Create service principal for CI/CD
# echo -e "${YELLOW}Creating service principal for CI/CD...${NC}"
# SP_JSON=$(az ad sp create-for-rbac --name "optima-core-sp" --role contributor \
#     --scopes /subscriptions/$(az account show --query id -o tsv) \
#     --sdk-auth)
# echo $SP_JSON > azure-credentials.json
# echo -e "${GREEN}✅ Service principal created. Credentials saved to azure-credentials.json${NC}"

# Initialize Terraform
echo -e "${YELLOW}Initializing Terraform...${NC}"
cd infrastructure/azure
terraform init

# Create terraform.tfvars file if it doesn't exist
if [ ! -f terraform.tfvars ]; then
    cat > terraform.tfvars <<EOL
app_name      = "optimacore"
environment   = "dev"
location      = "eastus"
app_service_plan_sku = "B1"
EOL
    echo -e "${GREEN}✅ Created terraform.tfvars with default values.${NC}"
else
    echo -e "${GREEN}✅ terraform.tfvars already exists.${NC}"
fi

echo -e "\n${GREEN}✨ Azure setup complete! ✨${NC}"
echo "Next steps:"
echo "1. Review the terraform.tfvars file in infrastructure/azure/"
echo "2. Run 'terraform plan' to see what will be created"
echo "3. Run 'terraform apply' to create the Azure resources"
echo "4. After deployment, update your .env file with the output values"

# Make the script executable
chmod +x "$0"
