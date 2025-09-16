# Load Test Scenario Generator

A flexible and powerful scenario generator for load testing with Artillery and k6, featuring multi-region testing and chaos engineering capabilities.

## Features

- 🚀 **Multiple Scenario Types**: Smoke, load, stress, soak, and chaos tests
- 🌍 **Multi-region Testing**: Simulate traffic from different geographic regions
- 🎭 **Chaos Engineering**: Built-in support for failure injection and network chaos
- 📊 **Telemetry**: Automatic tagging of requests with metadata for analysis
- 🔍 **Validation**: Comprehensive validation of scenario configurations
- 🔄 **Multiple Formats**: Generate tests in Artillery (YAML/JSON) and k6 (JavaScript) formats

## Installation

1. Ensure you have Node.js 16+ installed
2. Install dependencies:
   ```bash
   npm install --save-dev artillery k6 ajv-formats
   ```

## Usage

### 1. List Available Scenarios

```bash
node testing/scenarios/generator.js --list
```

### 2. Generate a Scenario

```bash
# Basic usage
node testing/scenarios/generator.js --scenario load-test --out testing/scenarios/

# Generate k6 script
node testing/scenarios/generator.js --scenario stress-test --format k6 --out testing/scenarios/

# Specify target environment
node testing/scenarios/generator.js --scenario smoke-test --env staging --out testing/scenarios/
```

### 3. Validate Scenarios

```bash
# Validate all scenarios
node testing/scenarios/validate.js

# Validate specific file
node testing/scenarios/validate.js path/to/scenarios.json

# Verbose output
node testing/scenarios/validate.js --verbose
```

## Scenario Configuration

Scenarios are defined in `config/scenarios.json`. Each scenario includes:

- **Phases**: Define different load patterns (ramp-up, sustained load, etc.)
- **Scenarios**: User flows to be tested
- **Chaos Engineering**: Optional failure injection and network chaos
- **Multi-region**: Traffic distribution across regions

### Example Scenario

```json
{
  "load-test": {
    "description": "Standard load test with realistic user patterns",
    "phases": [
      {
        "duration": 300,
        "arrivalRate": 5,
        "rampTo": 50,
        "name": "ramp-up"
      },
      {
        "duration": 600,
        "arrivalRate": 50,
        "name": "sustained-load"
      }
    ],
    "scenarios": [
      {
        "name": "browse-products",
        "weight": 3,
        "flow": [
          { "get": { "url": "/api/products" } },
          { "think": 1 },
          { "get": { "url": "/api/products/{{ $randomInt(1, 100) }}" } }
        ]
      }
    ]
  }
}
```

## Chaos Engineering

The chaos processor supports:

- **Network Latency**: Add delays to simulate network conditions
- **Error Injection**: Inject HTTP errors at specified rates
- **Request Tracking**: Monitor request flow and performance

### Enabling Chaos

Add a `chaos` section to your phase configuration:

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
          "maxDelay": 3000,
          "errorRate": 0.2
        },
        "errorInjection": {
          "enabled": true,
          "errorRate": 0.1,
          "statusCodes": [500, 502, 503, 504]
        }
      }
    }
  ]
}
```

## Multi-region Testing

Simulate traffic from different geographic regions:

```json
{
  "regions": [
    { "name": "us-east-1", "weight": 3 },
    { "name": "eu-west-1", "weight": 2 },
    { "name": "ap-southeast-1", "weight": 1 }
  ]
}
```

## Running Tests

### With Artillery

```bash
# Install Artillery
npm install -g artillery

# Run a generated test
artillery run testing/scenarios/load-test.yaml
```

### With k6

```bash
# Install k6
# See: https://k6.io/docs/getting-started/installation/

# Run a generated test
k6 run testing/scenarios/load-test.js
```

## Best Practices

1. **Start Small**: Begin with a smoke test before running full load tests
2. **Monitor Resources**: Keep an eye on system resources during tests
3. **Use Realistic Data**: Parameterize requests with realistic data
4. **Test Failure Modes**: Use chaos engineering to test system resilience
5. **Document Scenarios**: Keep scenario configurations well-documented

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
