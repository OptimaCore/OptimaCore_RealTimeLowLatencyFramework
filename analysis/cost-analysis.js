#!/usr/bin/env node

const { DefaultAzureCredential } = require('@azure/identity');
const { CostManagementClient } = require('@azure/arm-costmanagement');
const { SubscriptionClient } = require('@azure/arm-subscriptions');
const { program } = require('commander');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// Configure command line options
program
  .requiredOption('--from <date>', 'Start date (YYYY-MM-DD)')
  .requiredOption('--to <date>', 'End date (YYYY-MM-DD)')
  .option('--subscription-id <id>', 'Azure subscription ID (default: all accessible subscriptions)')
  .option('--resource-group <name>', 'Filter by resource group')
  .option('--tag <tag>', 'Filter by tag (format: key=value)')
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
const costClient = new CostManagementClient(credential);

// Helper function to format currency
function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

// Helper function to process cost data
function processCostData(data) {
  if (!data || !data.rows) {
    console.warn('No cost data found for the specified criteria');
    return [];
  }

  const columns = data.columns.map(col => col.name);
  return data.rows.map(row => {
    const entry = {};
    row.forEach((value, index) => {
      entry[columns[index]] = value;
    });
    return entry;
  });
}

// Get cost data for a subscription
async function getSubscriptionCosts(subscriptionId, scope) {
  try {
    const query = {
      type: 'Usage',
      timeframe: 'Custom',
      timePeriod: {
        from: new Date(startDate),
        to: new Date(endDate)
      },
      dataset: {
        granularity: 'Daily',
        aggregation: {
          totalCost: {
            name: 'Cost',
            function: 'Sum'
          },
          totalCostUSD: {
            name: 'CostUSD',
            function: 'Sum'
          }
        },
        grouping: [
          {
            type: 'Dimension',
            name: 'ResourceGroup'
          },
          {
            type: 'Dimension',
            name: 'ServiceName'
          },
          {
            type: 'Dimension',
            name: 'ResourceId'
          }
        ]
      }
    };

    // Add tag filter if specified
    if (options.tag) {
      const [key, value] = options.tag.split('=');
      if (key && value) {
        query.dataset.filter = {
          tags: {
            name: key,
            operator: 'In',
            values: [value]
          }
        };
      }
    }

    // Add resource group filter if specified
    if (options.resourceGroup) {
      if (!query.dataset.filter) {
        query.dataset.filter = {};
      }
      query.dataset.filter.and = [
        ...(query.dataset.filter.and || []),
        {
          dimensions: {
            name: 'ResourceGroupName',
            operator: 'In',
            values: [options.resourceGroup]
          }
        }
      ];
    }

    const result = await costClient.query.usage(scope, query);
    return processCostData(result);
  } catch (error) {
    console.error(`Error fetching cost data for subscription ${subscriptionId}:`, error.message);
    return [];
  }
}

// Main function
async function main() {
  try {
    let subscriptions = [];
    
    // Get subscription(s)
    if (options.subscriptionId) {
      subscriptions = [{ subscriptionId: options.subscriptionId }];
    } else {
      const subscriptionClient = new SubscriptionClient(credential);
      for await (const subscription of subscriptionClient.subscriptions.list()) {
        subscriptions.push(subscription);
      }
    }

    if (subscriptions.length === 0) {
      console.error('No accessible subscriptions found');
      process.exit(1);
    }

    // Get costs for each subscription
    let allCosts = [];
    for (const sub of subscriptions) {
      const scope = `/subscriptions/${sub.subscriptionId}`;
      console.log(`Fetching cost data for subscription: ${sub.displayName || sub.subscriptionId}`);
      
      const costs = await getSubscriptionCosts(sub.subscriptionId, scope);
      allCosts = [...allCosts, ...costs];
    }

    // Process and output results
    if (allCosts.length === 0) {
      console.log('No cost data found for the specified criteria');
      return;
    }

    // Aggregate costs by resource group and service
    const aggregated = allCosts.reduce((acc, item) => {
      const key = `${item.ResourceGroup || 'NoRG'}|${item.ServiceName || 'Unknown'}`;
      if (!acc[key]) {
        acc[key] = {
          resourceGroup: item.ResourceGroup || 'No Resource Group',
          service: item.ServiceName || 'Unknown',
          cost: 0,
          costUSD: 0
        };
      }
      acc[key].cost += parseFloat(item.Cost || 0);
      acc[key].costUSD += parseFloat(item.CostUSD || 0);
      return acc;
    }, {});

    const results = Object.values(aggregated).sort((a, b) => b.costUSD - a.costUSD);
    
    // Calculate totals
    const totalCost = results.reduce((sum, item) => sum + item.cost, 0);
    const totalCostUSD = results.reduce((sum, item) => sum + item.costUSD, 0);

    // Prepare output
    const output = {
      metadata: {
        query: {
          from: startDate,
          to: endDate,
          subscriptionId: options.subscriptionId || 'all',
          resourceGroup: options.resourceGroup || 'all',
          tag: options.tag || 'none'
        },
        totals: {
          cost: totalCost,
          costUSD: totalCostUSD,
          currency: 'USD',
          resourceGroups: new Set(results.map(r => r.resourceGroup)).size,
          services: new Set(results.map(r => r.service)).size
        }
      },
      results: results.map(item => ({
        resourceGroup: item.resourceGroup,
        service: item.service,
        cost: item.cost,
        costUSD: item.costUSD,
        percentage: (item.costUSD / totalCostUSD) * 100
      }))
    };

    // Output results
    let outputStr;
    switch (options.output.toLowerCase()) {
      case 'csv':
        outputStr = 'Resource Group,Service,Cost,Cost (USD),Percentage\n';
        output.results.forEach(item => {
          outputStr += `"${item.resourceGroup}","${item.service}",${item.cost},${item.costUSD},${item.percentage.toFixed(2)}%\n`;
        });
        outputStr += `\nTotal,,${output.metadata.totals.cost},${output.metadata.totals.costUSD},100%`;
        break;
      
      case 'table':
        console.log('\nCost Analysis Report');
        console.log('===================');
        console.log(`Period: ${moment(startDate).format('MMM D, YYYY')} to ${moment(endDate).format('MMM D, YYYY')}`);
        console.log(`Subscriptions: ${subscriptions.length}`);
        console.log(`Total Cost: ${formatCurrency(output.metadata.totals.costUSD)}\n`);
        
        console.log('Cost by Resource Group and Service:');
        console.log('----------------------------------');
        console.log('Resource Group'.padEnd(30) + 'Service'.padEnd(30) + 'Cost (USD)'.padStart(15) + '  %'.padStart(8));
        console.log('-'.repeat(85));
        
        output.results.forEach(item => {
          console.log(
            item.resourceGroup.padEnd(30).substring(0, 30) + 
            item.service.padEnd(30).substring(0, 30) + 
            formatCurrency(item.costUSD).padStart(15) +
            item.percentage.toFixed(1).padStart(8) + '%'
          );
        });
        
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
    console.error('Error generating cost report:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
