#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const jsdoc2md = require('jsdoc-to-markdown');
const prettier = require('prettier');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const API_DOCS_DIR = path.join(DOCS_DIR, 'api');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

// Ensure directories exist
[API_DOCS_DIR, TEMPLATES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Format markdown content with Prettier
 */
async function formatMarkdown(content) {
  return await prettier.format(content, {
    parser: 'markdown',
    printWidth: 100,
    proseWrap: 'always',
    singleQuote: true,
    trailingComma: 'es5',
  });
}

/**
 * Generate API documentation from JSDoc comments
 */
async function generateApiDocs() {
  console.log('🔍 Generating API documentation...');
  
  // Find all JavaScript and TypeScript files
  const jsFiles = await findJsFiles(path.join(__dirname, '..', 'src'));
  const tsFiles = await findFiles(path.join(__dirname, '..', 'src'), '.ts');
  const files = [...jsFiles, ...tsFiles];
  
  if (files.length === 0) {
    console.warn('⚠️ No JavaScript/TypeScript files found in src directory');
    return;
  }
  
  console.log(`📄 Found ${files.length} source files to process`);
  
  // Load custom template if it exists, otherwise use default
  let template;
  try {
    template = await readFile(
      path.join(TEMPLATES_DIR, 'api.hbs'),
      'utf8'
    );
    console.log('📝 Using custom template');
  } catch (error) {
    console.log('ℹ️ Using default template (no custom template found)');
  }

  const options = {
    files,
    template,
    'example-lang': 'javascript',
    'name-format': 'backticks',
    'no-cache': true,
    'heading-depth': 3,
  };

  const markdown = await jsdoc2md.render(options);
  const formattedMarkdown = await formatMarkdown(markdown);
  
  await writeFile(
    path.join(API_DOCS_DIR, 'api-reference.md'),
    `# API Reference\n\n${formattedMarkdown}`
  );
  
  console.log('API documentation generated at:', path.relative(process.cwd(), path.join(API_DOCS_DIR, 'api-reference.md')));
}

/**
 * Recursively find all files with a specific extension in a directory
 */
async function findFiles(dir, ext, fileList = []) {
  const files = await readdir(dir, { withFileTypes: true });
  
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      await findFiles(filePath, ext, fileList);
    } else if (file.name.endsWith(ext)) {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

/**
 * Recursively find all JavaScript/TypeScript files in a directory
 */
async function findJsFiles(dir) {
  const jsFiles = await findFiles(dir, '.js');
  const jsxFiles = await findFiles(dir, '.jsx');
  const tsFiles = await findFiles(dir, '.ts');
  const tsxFiles = await findFiles(dir, '.tsx');
  
  return [...jsFiles, ...jsxFiles, ...tsFiles, ...tsxFiles];
}

/**
 * Generate architecture documentation
 */
async function generateArchitectureDoc() {
  const content = `# System Architecture

## Overview

OptimaCore is a real-time low-latency framework designed for high-performance applications. This document outlines the system architecture and key components.

## Core Components

### 1. Data Processing Pipeline
- **Ingestion Layer**: Handles high-velocity data ingestion
- **Processing Layer**: Real-time data processing with minimal latency
- **Storage Layer**: Optimized for low-latency data access

### 2. API Layer
- RESTful API endpoints
- WebSocket support for real-time updates
- Authentication and authorization

### 3. Monitoring & Analytics
- Real-time metrics collection
- Performance monitoring
- Alerting system

## Technology Stack

- **Runtime**: Node.js
- **Database**: Redis, PostgreSQL
- **API**: Express.js
- **Real-time**: Socket.IO
- **Infrastructure**: Docker, Kubernetes, Terraform
`;

  const formattedContent = await formatMarkdown(content);
  await writeFile(path.join(DOCS_DIR, 'architecture.md'), formattedContent);
  console.log('Architecture documentation generated at:', path.relative(process.cwd(), path.join(DOCS_DIR, 'architecture.md')));
}

/**
 * Generate research methodology documentation
 */
async function generateResearchMethodologyDoc() {
  const content = `# Research Methodology

## Experiment Design

### 1. Objectives
- Measure and optimize end-to-end latency
- Evaluate system scalability
- Identify performance bottlenecks

### 2. Test Environment
- **Hardware**: [Specify test environment]
- **Network**: [Network configuration]
- **Baseline**: [Baseline measurements]

### 3. Experiment Parameters
- **Load Levels**: [Define different load levels]
- **Metrics**: Latency, throughput, error rates
- **Duration**: Test duration and sampling frequency

## Reproducibility Checklist

### Prerequisites
- [ ] Node.js v16+
- [ ] Docker and Docker Compose
- [ ] Terraform v1.0+
- [ ] Azure CLI or AWS CLI (for cloud deployments)

### Setup Steps
1. Clone the repository
2. Install dependencies: \`npm install\`
3. Configure environment variables
4. Start the test environment: \`npm run test:env:up\`
5. Run experiments: \`npm run test:benchmark\`

### Data Collection
- Raw metrics are stored in \`data/raw/\`
- Processed results in \`data/processed/\`
- Logs in \`logs/\`

### Analysis
1. Process raw data: \`npm run analyze\`
2. Generate reports: \`npm run report\`
3. Review findings in \`reports/\`
`;

  const formattedContent = await formatMarkdown(content);
  await writeFile(path.join(DOCS_DIR, 'research-methodology.md'), formattedContent);
  console.log('Research methodology documentation generated at:', path.relative(process.cwd(), path.join(DOCS_DIR, 'research-methodology.md')));
}

/**
 * Generate deployment guide
 */
async function generateDeploymentGuide() {
  const content = `# Deployment Guide

## Prerequisites

- Node.js v16+ and npm
- Docker and Docker Compose
- Terraform v1.0+
- Cloud provider account (Azure/AWS/GCP)

## Local Development

1. Clone the repository
2. Install dependencies: \`npm install\`
3. Start development server: \`npm run dev\`

## Production Deployment

### 1. Infrastructure Setup

\`\`\`bash
# Initialize Terraform
terraform init

# Review changes
terraform plan

# Apply changes
terraform apply
\`\`\`

### 2. Application Deployment

#### Using Docker
\`\`\`bash
docker-compose up -d
\`\`\`

#### Manual Deployment
\`\`\`bash
# Install dependencies
npm install --production

# Start the application
NODE_ENV=production npm start
\`\`\`

## Monitoring

- **Metrics**: Prometheus endpoint at \`/metrics\`
- **Logs**: Centralized logging with ELK stack
- **Alerts**: Configured in \`config/alerts.yml\`

## Maintenance

### Upgrading
1. Pull the latest changes
2. Run database migrations: \`npm run db:migrate\`
3. Restart services

### Backup
- Database backups: \`npm run db:backup\`
- Configuration backups: \`config/backup/\`
`;

  const formattedContent = await formatMarkdown(content);
  await writeFile(path.join(DOCS_DIR, 'deployment-guide.md'), formattedContent);
  console.log('Deployment guide generated at:', path.relative(process.cwd(), path.join(DOCS_DIR, 'deployment-guide.md')));
}

/**
 * Main function
 */
async function main() {
  try {
    await Promise.all([
      generateApiDocs(),
      generateArchitectureDoc(),
      generateResearchMethodologyDoc(),
      generateDeploymentGuide(),
    ]);
    
    console.log('\nDocumentation generation complete!');
    console.log('Generated files:');
    console.log(`- ${path.join('docs', 'api', 'api-reference.md')}`);
    console.log(`- ${path.join('docs', 'architecture.md')}`);
    console.log(`- ${path.join('docs', 'research-methodology.md')}`);
    console.log(`- ${path.join('docs', 'deployment-guide.md')}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error generating documentation:', error);
    process.exit(1);
  }
}

main();
