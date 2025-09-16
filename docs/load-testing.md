# Load Testing with OptimaCore

This document provides an overview of the load testing capabilities in the OptimaCore Real-Time Low Latency Framework.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Scenario Generator](#scenario-generator)
- [Running Tests](#running-tests)
- [Analyzing Results](#analyzing-results)
- [Best Practices](#best-practices)

## Overview

The load testing framework provides tools to:

- Generate realistic load test scenarios
- Simulate traffic from multiple regions
- Inject failures and network chaos
- Analyze system behavior under load
- Validate system resilience and performance

## Quick Start

1. Install dependencies:
   ```bash
   npm install -g artillery k6
   npm install
   ```

2. List available scenarios:
   ```bash
   node testing/scenarios/generator.js --list
   ```

3. Generate and run a test:
   ```bash
   # Generate Artillery test
   node testing/scenarios/generator.js --scenario load-test --out testing/scenarios/
   
   # Run the test
   artillery run testing/scenarios/load-test.yaml
   ```

## Scenario Generator

The scenario generator creates load test scripts from JSON configurations. See the [scenario generator documentation](testing/scenarios/README.md) for details.

### Key Features

- Multiple test types (smoke, load, stress, soak, chaos)
- Multi-region testing
- Chaos engineering capabilities
- Support for Artillery and k6

## Running Tests

### Artillery

```bash
# Run a specific scenario
artillery run testing/scenarios/load-test.yaml

# Run with environment variables
ARTILLERY_USE_ENV=1 artillery run testing/scenarios/load-test.yaml

# Run with JSON output
artillery run --output test.json testing/scenarios/load-test.yaml

# Generate HTML report
artillery report test.json
```

### k6

```bash
# Run a k6 test
k6 run testing/scenarios/load-test.js

# Run with virtual users
k6 run --vus 10 --duration 30s testing/scenarios/load-test.js

# Run with environment variables
k6 run -e ENV=staging testing/scenarios/load-test.js
```

## Analyzing Results

### Artillery Reports

Artillery can generate HTML reports:

```bash
artillery run --output results.json testing/scenarios/load-test.yaml
artillery report results.json
```

### k6 Results

k6 provides built-in metrics and can output to various formats:

```bash
# Output to InfluxDB
k6 run --out influxdb=http://localhost:8086/k6 testing/scenarios/load-test.js

# Output to JSON
k6 run --out json=test_results.json testing/scenarios/load-test.js
```

## Best Practices

1. **Start Small**: Begin with smoke tests before running full load tests
2. **Monitor Resources**: Keep an eye on system metrics during tests
3. **Use Realistic Data**: Parameterize requests with realistic data
4. **Test Failure Modes**: Use chaos engineering to test system resilience
5. **Document Scenarios**: Keep scenario configurations well-documented

## Advanced Topics

### Custom Scenarios

Create custom scenarios in `config/scenarios.json`:

```json
{
  "my-scenario": {
    "description": "Custom load test scenario",
    "phases": [
      {
        "duration": 300,
        "arrivalRate": 10,
        "name": "ramp-up"
      }
    ],
    "scenarios": [
      {
        "name": "user-journey",
        "flow": [
          { "get": { "url": "/api/health" } },
          { "think": 1 },
          { "get": { "url": "/api/products" } }
        ]
      }
    ]
  }
}
```

### Chaos Engineering

Enable chaos in your test phases:

```json
{
  "phases": [
    {
      "name": "chaos-phase",
      "duration": 300,
      "arrivalRate": 10,
      "chaos": {
        "networkLatency": {
          "enabled": true,
          "minDelay": 1000,
          "maxDelay": 3000
        }
      }
    }
  ]
}
```

### Multi-region Testing

Simulate traffic from different regions:

```json
{
  "regions": [
    { "name": "us-east-1", "weight": 3 },
    { "name": "eu-west-1", "weight": 2 }
  ]
}
```

## Troubleshooting

### Common Issues

1. **Connection Refused**: Ensure the target service is running
2. **Timeout Errors**: Check network connectivity and service responsiveness
3. **Validation Errors**: Run the validator to check scenario configurations

### Getting Help

For issues and feature requests, please [open an issue](https://github.com/OptimaCore/OptimaCore_RealTimeLowLatencyFramework/issues).
