#!/usr/bin/env node

const RedisClient = require('../services/redis/client');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { Command } = require('commander');
const { table } = require('table');

const program = new Command();

program
  .name('test-azure-connection')
  .description('Test connection to Azure Redis Cache')
  .option('-c, --config <path>', 'Path to Azure Redis config file', '../config/azure.redis.json')
  .option('-h, --host <host>', 'Azure Redis host')
  .option('-p, --port <port>', 'Azure Redis port')
  .option('-a, --auth <password>', 'Azure Redis access key')
  .option('-n, --name <name>', 'Azure Cache name (used as username)')
  .option('--tls', 'Enable TLS (default: true)', true)
  .option('--no-tls', 'Disable TLS')
  .option('-v, --verbose', 'Enable verbose output', false);

program.parse(process.argv);
const options = program.opts();

async function testConnection() {
  try {
    // Load config file if it exists
    let config = {
      connection: {
        host: 'localhost',
        port: 6379,
        tls: { enabled: false }
      },
      retry: {
        maxRetries: 3,
        initialDelay: 200,
        maxDelay: 1000,
        factor: 2,
        jitter: 0.1
      }
    };

    // Try to load config file
    const configPath = path.resolve(process.cwd(), options.config);
    if (fs.existsSync(configPath)) {
      try {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config = { ...config, ...fileConfig };
      } catch (err) {
        console.warn(chalk.yellow(`Warning: Could not load config file: ${err.message}`));
      }
    } else if (options.config !== '../config/azure.redis.json') {
      console.warn(chalk.yellow(`Warning: Config file not found: ${configPath}`));
    }

    // Apply command line overrides
    if (options.host) config.connection.host = options.host;
    if (options.port) config.connection.port = parseInt(options.port, 10);
    if (options.auth) config.connection.password = options.auth;
    if (options.name) config.connection.username = options.name;
    if (options.tls !== undefined) {
      config.connection.tls = config.connection.tls || {};
      config.connection.tls.enabled = options.tls;
      if (options.tls && !config.connection.tls.servername) {
        config.connection.tls.servername = config.connection.host;
      }
    }

    console.log(chalk.blue('\n=== Azure Redis Connection Tester ===\n'));
    
    // Display connection details (masking password)
    const displayConfig = JSON.parse(JSON.stringify(config));
    if (displayConfig.connection.password) {
      displayConfig.connection.password = '********';
    }
    if (displayConfig.connection.connectionString) {
      displayConfig.connection.connectionString = 
        displayConfig.connection.connectionString.replace(/:([^:]+)@/, ':********@');
    }
    
    console.log(chalk.green('Connection Configuration:'));
    console.log(JSON.stringify(displayConfig.connection, null, 2));
    console.log('');

    // Create Redis client
    console.log(chalk.blue('Connecting to Azure Redis...'));
    const client = new RedisClient({
      strategy: 'CACHE_ASIDE',
      config: config
    });

    // Wait for connection
    await new Promise((resolve) => {
      client.client.on('ready', resolve);
      client.client.on('error', resolve);
    });

    // Test basic operations
    const testKey = 'azure:test:connection';
    const testValue = { timestamp: Date.now(), message: 'Azure Redis Test' };
    
    console.log(chalk.blue('\nTesting basic operations...'));
    
    // Test SET
    await client.set(testKey, testValue);
    console.log(chalk.green('✓ SET command successful'));
    
    // Test GET
    const retrievedValue = await client.get(testKey);
    if (JSON.stringify(retrievedValue) === JSON.stringify(testValue)) {
      console.log(chalk.green('✓ GET command successful'));
    } else {
      console.log(chalk.yellow('⚠ GET command returned unexpected value'));
    }
    
    // Test DELETE
    await client.del(testKey);
    console.log(chalk.green('✓ DEL command successful'));
    
    // Get server info
    console.log(chalk.blue('\nFetching server info...'));
    const stats = await client.getStats();
    
    // Display server info in a table
    const data = [
      [chalk.cyan('Property'), chalk.cyan('Value')],
      ['Redis Version', stats.version || 'N/A'],
      ['Mode', stats.mode || 'standalone'],
      ['Connected Clients', stats.connected_clients || 0],
      ['Uptime (hours)', stats.uptime ? (stats.uptime / 3600).toFixed(2) : 'N/A'],
      ['Used Memory (MB)', stats.used_memory ? (stats.used_memory / 1024 / 1024).toFixed(2) : 'N/A'],
      ['Total Commands', stats.total_commands_processed || 0],
      ['Keyspace Hits', stats.keyspace_hits || 0],
      ['Keyspace Misses', stats.keyspace_misses || 0],
      ['Hit Ratio', stats.hit_ratio ? `${stats.hit_ratio.toFixed(2)}%` : 'N/A']
    ];
    
    if (stats.azure) {
      data.push(
        ['\n' + chalk.cyan('Azure Info'), ''],
        ['Cache Name', stats.azure.cacheName || 'N/A'],
        ['SKU', stats.azure.sku || 'N/A'],
        ['Shard Count', stats.azure.shardCount || 0],
        ['TLS Version', stats.azure.tlsVersion || 'N/A'],
        ['Connected', stats.azure.connected ? chalk.green('Yes') : chalk.red('No')]
      );
    }
    
    console.log(table(data));
    
    // Display metrics
    console.log(chalk.blue('\nConnection Metrics:'));
    const metrics = stats.metrics || {};
    const metricsData = [
      [chalk.cyan('Metric'), chalk.cyan('Value')],
      ['Cache Hits', metrics.cache_hit || 0],
      ['Cache Misses', metrics.cache_miss || 0],
      ['Hit Ratio', metrics.hit_ratio ? `${metrics.hit_ratio.toFixed(2)}%` : '0%'],
      ['Total Commands', metrics.total_commands || 0],
      ['Command Duration (avg)', metrics.avg_duration ? `${metrics.avg_duration.toFixed(2)}ms` : 'N/A'],
      ['Errors', metrics.total_errors || 0]
    ];
    
    console.log(table(metricsData));
    
    console.log(chalk.green('\n✅ Connection test completed successfully!'));
    
    // Close connection
    await client.close();
    process.exit(0);
    
  } catch (error) {
    console.error(chalk.red('\n❌ Connection test failed:'), error.message);
    
    if (options.verbose) {
      console.error(chalk.red('\nError details:'));
      console.error(error);
    }
    
    console.log('\nTroubleshooting tips:');
    console.log('1. Verify the hostname and port are correct');
    console.log('2. Check if the Azure Redis Cache is running');
    console.log('3. Verify the access key (password) is correct');
    console.log('4. Ensure your IP is whitelisted in Azure Redis Firewall');
    console.log('5. Check if TLS is properly configured (Azure Redis requires TLS)');
    console.log('6. For clusters, ensure all nodes are accessible');
    
    process.exit(1);
  }
}

testConnection();
