# Database Performance Testing

This directory contains tools for testing and benchmarking database performance under various load conditions.

## Test Components

### 1. `db-test.js`
A standalone script for running individual database test scenarios.

**Features:**
- Executes different types of SQL queries (simple selects, joins, complex queries, inserts)
- Collects detailed performance metrics (latency, throughput, error rates)
- Supports concurrent query execution
- Exports results in JSON format

**Usage:**
```bash
# Basic usage with default settings (100 iterations, 10 concurrent queries)
npm run test:db

# Custom number of iterations and concurrency
node testing/database/db-test.js --iterations 500 --concurrency 20

# Save results to a specific file
node testing/database/db-test.js --output custom-results.json
```

### 2. `load-test.js`
A distributed load testing tool that simulates multiple concurrent clients.

**Features:**
- Simulates multiple concurrent database clients
- Supports ramp-up and cooldown periods
- Generates detailed HTML reports with charts
- Collects system metrics during testing
- Can be run in CI environments

**Usage:**
```bash
# Basic usage with default settings (100 clients, 1000 iterations per client)
npm run test:load

# Custom number of clients and iterations
node testing/database/load-test.js --clients 200 --iterations 5000

# Run a time-based test (30 seconds)
node testing/database/load-test.js --duration 30

# CI mode (no HTML report)
node testing/database/load-test.js --clients 200 --no-html
```

## Configuration

### Environment Variables

Set these environment variables to configure the database connection:

```bash
PGUSER=postgres
PGHOST=localhost
PGDATABASE=your_database
PGPASSWORD=your_password
PGPORT=5432
```

### Test Queries

Edit the `testQueries` object in `db-test.js` to customize the test queries for your schema.

## Output

Test results are saved in the `results` directory with timestamps. Each test generates:

1. A JSON file with detailed metrics
2. An HTML report with visualizations (when not in CI mode)

## Metrics Collected

- Query latency (min, max, avg, percentiles)
- Throughput (queries per second)
- Error rates
- Connection pool statistics
- System resource usage

## Integration with Monitoring

The test results can be integrated with your monitoring system by:

1. Configuring the metrics collector in `monitoring/metrics-collector.js`
2. Setting up alerts based on performance thresholds
3. Using the `--monitor` flag to send metrics to your monitoring system

## Example Commands

```bash
# Run a quick smoke test
npm run test:db -- --iterations 10

# Run a full load test with 200 concurrent clients
npm run test:load -- --clients 200

# Run in CI environment
npm run test:load:ci
```

## License

This project is licensed under the ISC License - see the [LICENSE](../../LICENSE) file for details.
