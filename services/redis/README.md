# Redis Integration for OptimaCore

This module provides a high-performance Redis client with support for Azure Redis Cache, including various caching strategies and comprehensive metrics collection.

## Features

- **Multiple Caching Strategies**:
  - Cache-Aside (Lazy Loading)
  - Read-Through
  - Write-Through
  - Write-Behind (simplified)

- **Azure Redis Cache Support**:
  - Automatic TLS configuration
  - Connection string parsing
  - Cluster support
  - Azure-specific optimizations

- **Metrics & Monitoring**:
  - Cache hit/miss ratios
  - Command execution times
  - Error tracking
  - Azure Monitor integration

## Configuration

### Configuration File (`config/redis.json`)

```json
{
  "connection": {
    "host": "localhost",
    "port": 6379,
    "username": "",
    "password": "",
    "tls": {
      "enabled": false,
      "servername": ""
    },
    "connectionString": "",
    "db": 0,
    "keyPrefix": "optima:",
    "connectionTimeout": 10000,
    "commandTimeout": 5000
  },
  "retry": {
    "maxRetries": 5,
    "initialDelay": 200,
    "maxDelay": 2000,
    "factor": 2,
    "jitter": 0.1
  },
  "cluster": {
    "enabled": false,
    "nodes": [
      { "host": "localhost", "port": 7000 },
      { "host": "localhost", "port": 7001 },
      { "host": "localhost", "port": 7002 }
    ]
  },
  "cache": {
    "defaultTtl": 3600,
    "maxKeys": 10000,
    "checkPeriod": 60,
    "autoPipeline": true,
    "enableOfflineQueue": true,
    "maxRetriesPerRequest": 3
  },
  "metrics": {
    "enabled": true,
    "prefix": "redis.",
    "collectInterval": 30000,
    "azureMonitor": {
      "enabled": false,
      "resourceId": ""
    }
  }
}
```

### Environment Variables

You can override any configuration using environment variables:

```bash
# Connection settings
REDIS_HOST=your-cache.redis.cache.windows.net
REDIS_PORT=6380
REDIS_USERNAME=your-cache-name
REDIS_PASSWORD=your-access-key
REDIS_DB=0

# TLS
REDIS_TLS_ENABLED=true

# Azure specific
AZURE_REDIS_CACHE_NAME=your-cache-name
AZURE_REDIS_ACCESS_KEY=your-access-key
```

## Usage

### Basic Usage

```javascript
const RedisClient = require('./services/redis/client');

// Create a client with cache-aside strategy
const client = new RedisClient({
  strategy: RedisClient.STRATEGY.CACHE_ASIDE,
  loader: async (key) => {
    // Called on cache miss
    return await fetchFromDatabase(key);
  }
});

// Set a value
await client.set('user:1', { id: 1, name: 'John Doe' });

// Get a value
const user = await client.get('user:1');

// Delete a key
await client.del('user:1');

// Close the connection
await client.close();
```

### Azure Redis Cache

```javascript
const RedisClient = require('./services/redis/client');

// Using connection string
const client = new RedisClient({
  config: {
    connection: {
      connectionString: 'rediss://username:password@your-cache.redis.cache.windows.net:6380?ssl=true'
    }
  }
});

// Or using individual settings
const client = new RedisClient({
  config: {
    connection: {
      host: 'your-cache.redis.cache.windows.net',
      port: 6380,
      username: 'your-cache-name',
      password: 'your-access-key',
      tls: {
        enabled: true,
        servername: 'your-cache.redis.cache.windows.net'
      }
    }
  }
});
```

### Testing the Connection

Use the provided script to test your Azure Redis Cache connection:

```bash
# Test with default config
npm run test:azure

# Test with custom config
node scripts/test-azure-connection.js --config config/azure.redis.json

# Test with environment variables
REDIS_HOST=your-cache.redis.cache.windows.net \
REDIS_PORT=6380 \
REDIS_USERNAME=your-cache-name \
REDIS_PASSWORD=your-access-key \
npm run test:azure
```

## Caching Strategies

### Cache-Aside (Lazy Loading)

```javascript
const client = new RedisClient({
  strategy: RedisClient.STRATEGY.CACHE_ASIDE,
  loader: async (key) => {
    // Fetch from database on cache miss
    return await database.get(key);
  }
});

// Automatically loads from DB on miss and caches the result
const data = await client.get('some:key');
```

### Read-Through

```javascript
const client = new RedisClient({
  strategy: RedisClient.STRATEGY.READ_THROUGH,
  loader: async (key) => {
    return await database.get(key);
  }
});

// Automatically loads from DB on miss and caches the result
const data = await client.get('some:key');
```

### Write-Through

```javascript
const client = new RedisClient({
  strategy: RedisClient.STRATEGY.WRITE_THROUGH,
  writer: async (key, value) => {
    // Write to database
    await database.set(key, value);
  }
});

// Writes to both cache and database
await client.set('some:key', { data: 'value' });
```

### Write-Behind

```javascript
const client = new RedisClient({
  strategy: RedisClient.STRATEGY.WRITE_BEHIND,
  writer: async (key, value) => {
    // Write to database asynchronously
    await database.set(key, value);
  }
});

// Writes to cache immediately and asynchronously to database
await client.set('some:key', { data: 'value' });
```

## Monitoring and Metrics

### Built-in Metrics

```javascript
// Get current metrics
const stats = await client.getStats();
console.log(stats.metrics);

// Example output:
{
  cache_hit: 42,
  cache_miss: 8,
  hit_ratio: 84,
  total_commands: 50,
  avg_duration: 2.5,
  min_duration: 1.2,
  max_duration: 15.7,
  total_errors: 0
}
```

### Azure Monitor Integration

Enable Azure Monitor in the configuration:

```json
{
  "metrics": {
    "enabled": true,
    "azureMonitor": {
      "enabled": true,
      "resourceId": "/subscriptions/.../resourceGroups/.../providers/Microsoft.Cache/redis/..."
    }
  }
}
```

## Best Practices for Azure Redis Cache

1. **Use Connection Pooling**: The client automatically manages connections, but ensure your application reuses client instances.

2. **Enable TLS**: Always use TLS for secure connections to Azure Redis Cache.

3. **Use Appropriate SKU**: Choose the right SKU based on your performance requirements and budget.

4. **Monitor Performance**: Use Azure Monitor to track cache performance and set up alerts.

5. **Handle Failures**: Implement proper error handling and retry logic.

6. **Use Appropriate Data Types**: Use Redis data structures (hashes, lists, sets) appropriately for better performance.

7. **Set Appropriate TTL**: Always set a TTL for cached items to prevent memory issues.

## Troubleshooting

### Common Issues

1. **Connection Failures**:
   - Verify the hostname and port
   - Check firewall rules and network security groups
   - Ensure your IP is whitelisted in Azure Redis Firewall

2. **Authentication Failures**:
   - Verify the access key (password)
   - Check if the username matches the cache name
   - Ensure the access key hasn't been regenerated

3. **TLS/SSL Issues**:
   - Ensure TLS is enabled (required for Azure Redis)
   - Verify the servername matches the hostname
   - Check certificate validation settings

4. **Performance Issues**:
   - Check if the cache is properly sized
   - Monitor memory usage and eviction policies
   - Consider enabling clustering for higher throughput

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
