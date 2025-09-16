# Load Testing for OptimaCore

This directory contains load testing configurations and scripts for the OptimaCore platform. We use both [Artillery](https://www.artillery.io/) and [k6](https://k6.io/) for comprehensive load testing.

## Prerequisites

1. **Node.js** (v16 or later)
2. **npm** (comes with Node.js)
3. **k6** (for k6 tests) - [Installation Guide](https://k6.io/docs/get-started/installation/)
4. **Artillery** (for Artillery tests) - Will be installed via npm

## Installation

Install the required dependencies:

```bash
npm install
```

## Available Scripts

- `npm run test:load:artillery` - Run Artillery load tests
- `npm run test:load:k6` - Run k6 load tests
- `npm run test:load:smoke` - Run a quick smoke test (1 user, 30 seconds)
- `npm run test:load:stress` - Run a stress test (100 users, 5 minutes)

## Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Base URL for the API
BASE_URL=http://localhost:3001

# Test environment (local, staging, production)
TEST_ENV=local

# Test type (smoke, load, stress)
TEST_TYPE=smoke

# Number of virtual users
VUS=10

# Test duration in seconds
DURATION=60
```

### Test Data

Test data is stored in the `test-data/` directory. You can modify these files to match your test scenarios.

## Running Tests

### Run Artillery Tests

```bash
# Basic test
npm run test:load:artillery

# With custom parameters
npx artillery run testing/load-test/artillery.yml \
  --environment local \
  --output testing/load-test/reports/artillery-report.json \
  --count 10 \
  --rate 5

# Generate HTML report
npx artillery report testing/load-test/reports/artillery-report.json
```

### Run k6 Tests

```bash
# Basic test
npm run test:load:k6

# With custom parameters
k6 run testing/load-test/k6-script.js \
  --vus 10 \
  --duration 30s \
  --out json=testing/load-test/reports/k6-report.json

# Run with different stages
k6 run --vus 0 --sustain 10s --stages 10s:10,20s:0 testing/load-test/k6-script.js
```

## Test Scenarios

### Smoke Test

A quick test to verify that the system is responding:

```bash
npm run test:load:smoke
```

### Load Test

A standard load test to measure performance under expected load:

```bash
npm run test:load:artillery -- --users 50 --duration 300
```

### Stress Test

A test to determine the system's breaking point:

```bash
npm run test:load:stress
```

## Test Reports

Test reports are generated in the `testing/load-test/reports/` directory. The reports include:

- Response times (min, max, median, p95, p99)
- Request rates
- Error rates
- Custom metrics

## Customizing Tests

### Adding New Scenarios

1. **For Artillery**:
   - Add new scenarios to `artillery.yml`
   - Add custom logic to `utils/artillery-helpers.js`

2. **For k6**:
   - Add new test functions to `k6-script.js`
   - Update the `scenarios` configuration as needed

### Custom Metrics

Both Artillery and k6 support custom metrics. See their respective documentation for more details:

- [Artillery Custom Metrics](https://www.artillery.io/docs/guides/guides/extension-apis#custom-metrics)
- [k6 Custom Metrics](https://k6.io/docs/using-k6/metrics/)

## Best Practices

1. **Start Small**: Begin with a small number of users and gradually increase the load.
2. **Monitor Resources**: Keep an eye on CPU, memory, and network usage during tests.
3. **Run Tests in Staging**: Always test in a staging environment before production.
4. **Analyze Results**: Look for patterns in response times and error rates.
5. **Set Up Alerts**: Configure alerts for high error rates or performance degradation.

## Troubleshooting

### Common Issues

1. **Connection Refused**:
   - Ensure the target server is running
   - Check firewall settings
   - Verify the base URL in the configuration

2. **High Error Rates**:
   - Check server logs for errors
   - Verify that test data is valid
   - Check rate limiting settings

3. **Performance Issues**:
   - Monitor server resources
   - Check for database bottlenecks
   - Review application logs for slow queries

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
