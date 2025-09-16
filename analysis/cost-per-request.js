#!/usr/bin/env node

const { DefaultAzureCredential } = require('@azure/identity');
const { ConsumptionManagementClient } = require('@azure/arm-consumption');
const { program } = require('commander');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// Configure command line options
program
  .requiredOption('--from <date>', 'Start date (YYYY-MM-DD)')
  .requiredOption('--to <date>', 'End date (YYYY-MM-DD)')
  .requiredOption('--subscription-id <id>', 'Azure subscription ID')
  .option('--resource-group <name>', 'Filter by resource group')
  .option('--variant <name>', 'Filter by variant tag (e.g., control, optimized)')
  .option('--output <format>', 'Output format: json, csv, table', 'json')
  .option('--output-file <path>', 'Output file path')
  .parse(process.argv);

const options = program.opts();

// Validate date format
function isValidDate(dateString) {
  return moment(dateString, 'YYYY-MM-DD', true).isValid();
}

if (!isValidDate(options.from) || !isValidDate(options.to)) {
  console.error('Error: Invalid date format. Please use YYYY-MM-DD');
  process.exit(1);
}

const startDate = moment(options.from).startOf('day').toISOString();
const endDate = moment(options.to).endOf('day').toISOString();

// Initialize Azure clients
const credential = new DefaultAzureCredential();
const consumptionClient = new ConsumptionManagementClient(credential, options.subscriptionId);

// Helper function to format currency
function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 4,
    maximumFractionDigits: 6
  }).format(amount);
}

// Helper function to format large numbers
function formatNumber(num) {
  return new Intl.NumberFormat('en-US').format(num);
}

// Get request count from Application Insights
async function getRequestCount(timeStart, timeEnd, cloudRoleName) {
  // This is a placeholder - you'll need to implement actual Application Insights query
  // For now, we'll return a mock value
  return {
    count: 1000000, // Mock value - replace with actual query
    successCount: 980000,
    failedCount: 20000,
    avgDurationMs: 150
  };
}

// Get cost data
async function getCostData() {
  try {
    const scope = `/subscriptions/${options.subscriptionId}`;
    const filter = `properties/usageStart ge '${startDate}' and properties/usageEnd le '${endDate}'`;
    
    // Add resource group filter if specified
    let expandedFilter = filter;
    if (options.resourceGroup) {
      expandedFilter += ` and properties/resourceGroup eq '${options.resourceGroup}'`;
    }
    
    // Add variant tag filter if specified
    if (options.variant) {
      expandedFilter += ` and tags/any(t: t eq 'variant:${options.variant}')`;
    }
    
    const usageDetails = [];
    let iterator = consumptionClient.usageDetails.list(scope, { expand: 'properties/tags', filter: expandedFilter });
    
    console.log('Fetching cost data...');
    for await (const item of iterator) {
      usageDetails.push(item);
    }
    
    return usageDetails;
  } catch (error) {
    console.error('Error fetching cost data:', error.message);
    throw error;
  }
}

// Calculate cost per request metrics
async function calculateMetrics() {
  try {
    // Get cost data
    const costData = await getCostData();
    
    if (costData.length === 0) {
      console.log('No cost data found for the specified criteria');
      return null;
    }
    
    // Calculate total cost
    const totalCost = costData.reduce((sum, item) => {
      const cost = parseFloat(item.costInBillingCurrency || item.cost || 0);
      return sum + (isNaN(cost) ? 0 : cost);
    }, 0);
    
    // Get request count
    const requestStats = await getRequestCount(
      startDate,
      endDate,
      options.variant
    );
    
    // Calculate metrics
    const costPerMillion = (totalCost / requestStats.count) * 1000000;
    const costPerSuccess = (totalCost / requestStats.successCount) * 1000000;
    
    return {
      period: {
        start: startDate,
        end: endDate,
        days: moment(endDate).diff(moment(startDate), 'days') + 1
      },
      requestStats,
      cost: {
        total: totalCost,
        currency: costData[0]?.billingCurrencyCode || 'USD',
        perMillionRequests: costPerMillion,
        perMillionSuccess: costPerSuccess
      },
      resources: {
        count: new Set(costData.map(item => item.resourceId)).size,
        resourceGroups: new Set(costData.map(item => item.resourceGroup)).size
      },
      variant: options.variant || 'all',
      resourceGroup: options.resourceGroup || 'all'
    };
  } catch (error) {
    console.error('Error calculating metrics:', error.message);
    throw error;
  }
}

// Generate report
async function generateReport() {
  try {
    const metrics = await calculateMetrics();
    
    if (!metrics) {
      return;
    }
    
    // Prepare output
    const output = {
      metadata: {
        generatedAt: new Date().toISOString(),
        subscriptionId: options.subscriptionId,
        resourceGroup: options.resourceGroup || 'all',
        variant: options.variant || 'all'
      },
      metrics
    };
    
    // Output results
    let outputStr;
    switch (options.output.toLowerCase()) {
      case 'csv':
        outputStr = 'Period Start,Period End,Days,Total Requests,Successful Requests,Failed Requests,Total Cost,Cost per 1M Requests,Cost per 1M Success\n';
        outputStr += `"${metrics.period.start}","${metrics.period.end}",${metrics.period.days},`;
        outputStr += `${metrics.requestStats.count},${metrics.requestStats.successCount},${metrics.requestStats.failedCount},`;
        outputStr += `${metrics.cost.total},${metrics.cost.perMillionRequests},${metrics.cost.perMillionSuccess}`;
        break;
      
      case 'table':
        console.log('\nCost per Request Analysis');
        console.log('=========================');
        console.log(`Period: ${moment(metrics.period.start).format('MMM D, YYYY')} to ${moment(metrics.period.end).format('MMM D, YYYY')} (${metrics.period.days} days)`);
        console.log(`Variant: ${metrics.variant}`);
        console.log(`Resource Group: ${metrics.resourceGroup}`);
        console.log(`Resources: ${metrics.resources.count} resources across ${metrics.resources.resourceGroups} resource groups\n`);
        
        console.log('Request Statistics:');
        console.log('------------------');
        console.log(`Total Requests:    ${formatNumber(metrics.requestStats.count)}`);
        console.log(`Successful:        ${formatNumber(metrics.requestStats.successCount)} (${((metrics.requestStats.successCount / metrics.requestStats.count) * 100).toFixed(2)}%)`);
        console.log(`Failed:            ${formatNumber(metrics.requestStats.failedCount)} (${((metrics.requestStats.failedCount / metrics.requestStats.count) * 100).toFixed(2)}%)`);
        console.log(`Avg. Duration:     ${metrics.requestStats.avgDurationMs} ms\n`);
        
        console.log('Cost Analysis:');
        console.log('--------------');
        console.log(`Total Cost:        ${formatCurrency(metrics.cost.total, metrics.cost.currency)}`);
        console.log(`Cost per 1M reqs:  ${formatCurrency(metrics.cost.perMillionRequests, metrics.cost.currency)}`);
        console.log(`Cost per 1M OK:    ${formatCurrency(metrics.cost.perMillionSuccess, metrics.cost.currency)}`);
        
        console.log('\nReport generated at: ' + new Date().toISOString());
        return; // Skip file output for table format
      
      case 'json':
      default:
        outputStr = JSON.stringify(output, null, 2);
    }
    
    // Write to file or console
    if (options.outputFile) {
      const outputPath = path.resolve(process.cwd(), options.outputFile);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, outputStr);
      console.log(`Report saved to: ${outputPath}`);
    } else {
      console.log(outputStr);
    }
    
  } catch (error) {
    console.error('Error generating report:', error.message);
    process.exit(1);
  }
}

// Run the script
generateReport();
