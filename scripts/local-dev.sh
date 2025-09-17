#!/bin/bash
# Local development setup script for OptimaCore

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Setting up local development environment...${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js not found. Installing...${NC}"
    # Install Node.js using nvm (recommended)
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install --lts
    nvm use --lts
    echo -e "${GREEN}✅ Node.js installed successfully!${NC}"
else
    echo -e "${GREEN}✅ Node.js is already installed.${NC}"
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found. Please install Node.js which includes npm.${NC}"
    exit 1
fi

# Install project dependencies
echo -e "${YELLOW}📦 Installing project dependencies...${NC}"
npm ci

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}📝 Creating .env file from .env.example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}ℹ️  Please update the .env file with your configuration.${NC}"
else
    echo -e "${GREEN}✅ .env file already exists.${NC}"
fi

# Set up local database (if needed)
if [ ! -d "data" ]; then
    echo -e "${YELLOW}📂 Creating data directory...${NC}"
    mkdir -p data
fi

# Check if Docker is running (for services like Redis, PostgreSQL)
if docker info &> /dev/null; then
    echo -e "${GREEN}✅ Docker is running.${NC}"
    
    # Start Redis container if not running
    if ! docker ps --format '{{.Names}}' | grep -q 'redis'; then
        echo -e "${YELLOW}🐳 Starting Redis container...${NC}"
        docker run --name redis -d -p 6379:6379 redis:alpine
    else
        echo -e "${GREEN}✅ Redis container is already running.${NC}"
    fi
    
    # Start PostgreSQL container if not running
    if ! docker ps --format '{{.Names}}' | grep -q 'postgres'; then
        echo -e "${YELLOW}🐳 Starting PostgreSQL container...${NC}"
        docker run --name postgres \
            -e POSTGRES_USER=postgres \
            -e POSTGRES_PASSWORD=postgres \
            -e POSTGRES_DB=optimacore \
            -p 5432:5432 \
            -d postgres:13-alpine
    else
        echo -e "${GREEN}✅ PostgreSQL container is already running.${NC}"
    fi
else
    echo -e "${YELLOW}ℹ️  Docker is not running. Some services may not be available.${NC}"
fi

# Run database migrations (if any)
if [ -f "node_modules/.bin/sequelize" ] || [ -f "node_modules/sequelize-cli/lib/sequelize" ]; then
    echo -e "${YELLOW}🔄 Running database migrations...${NC}"
    npx sequelize-cli db:migrate
fi

# Install Git hooks
if [ -d ".git" ]; then
    echo -e "${YELLOW}🔧 Setting up Git hooks...${NC}"
    npm run prepare || echo "Skipping Git hooks setup"
fi

echo -e "\n${GREEN}✨ Local development setup complete! ✨${NC}"
echo "Next steps:"
echo "1. Update the .env file with your configuration"
echo "2. Start the development server: npm run dev"
echo "3. Open http://localhost:3000 in your browser"

# Make the script executable
chmod +x "$0"
