#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const REQUIRED_FILES = [
  'api/api-reference.md',
  'architecture.md',
  'research-methodology.md',
  'deployment-guide.md',
  'ci-cd.md'
];

console.log('Validating documentation...');

// Check if required files exist
let allFilesExist = true;
REQUIRED_FILES.forEach(file => {
  const filePath = path.join(DOCS_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing required file: ${file}`);
    allFilesExist = false;
  } else {
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      console.error(`❌ Empty file: ${file}`);
      allFilesExist = false;
    }
  }
});

if (!allFilesExist) {
  console.error('\nSome documentation files are missing or empty.');
  console.log('Run \'npm run docs\' to generate the documentation.');
  process.exit(1);
}

// Check for broken links in markdown files
console.log('\nChecking for broken links...');
try {
  // This requires markdown-link-check to be installed
  execSync('npx markdown-link-check docs/**/*.md', { stdio: 'inherit' });
} catch (error) {
  console.error('\n❌ Some links are broken. Please fix them.');
  process.exit(1);
}

// Check for TODOs in documentation
console.log('\nChecking for TODOs in documentation...');
let hasTodos = false;

REQUIRED_FILES.forEach(file => {
  const filePath = path.join(DOCS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const todoMatches = content.match(/TODO:/gi) || [];
  
  if (todoMatches.length > 0) {
    console.error(`❌ Found ${todoMatches.length} TODO(s) in ${file}`);
    hasTodos = true;
  }
});

if (hasTodos) {
  console.error('\nPlease address all TODOs in the documentation.');
  process.exit(1);
}

console.log('\n✅ All documentation is valid!');
process.exit(0);
