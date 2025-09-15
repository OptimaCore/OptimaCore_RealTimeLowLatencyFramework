const RedisClient = require('./client');
const metrics = require('./metrics');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

async function runTests() {
  console.log('=== Testing Redis Client ===');
  
  // Create a Redis client with cache-aside strategy
  const client = new RedisClient({
    strategy: RedisClient.STRATEGY.CACHE_ASIDE,
    loader: async (key) => {
      console.log(`Loading ${key} from database...`);
      await sleep(100); // Simulate database load
      return { data: `value-for-${key}`, timestamp: Date.now() };
    }
  });

  try {
    // Test basic set and get
    console.log('\n1. Testing basic set/get:');
    await client.set('test:key1', { hello: 'world' });
    const value = await client.get('test:key1');
    console.log('Retrieved value:', value);

    // Test cache miss with loader
    console.log('\n2. Testing cache miss with loader:');
    const loaded = await client.get('test:dynamic:123');
    console.log('Loaded value:', loaded);

    // Test cache hit
    console.log('\n3. Testing cache hit:');
    const cached = await client.get('test:dynamic:123');
    console.log('Cached value:', cached);

    // Test TTL
    console.log('\n4. Testing TTL:');
    await client.set('test:temp', { temp: true }, 5); // 5 seconds TTL
    const ttl = await client.ttl('test:temp');
    console.log('TTL:', ttl, 'seconds');

    // Test metrics
    console.log('\n5. Testing metrics:');
    const stats = metrics.getMetrics();
    console.log('Cache hits:', stats.cache_hit);
    console.log('Cache misses:', stats.cache_miss);
    console.log('Hit ratio:', stats.hit_ratio + '%');

    // Test stats
    console.log('\n6. Testing stats:');
    const redisStats = await client.getStats();
    console.log('Redis version:', redisStats.version);
    console.log('Connected clients:', redisStats.connected_clients);
    console.log('Keys in DB:', redisStats.dbsize);

    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run the tests
runTests().catch(console.error);
