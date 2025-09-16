# Performance Benchmarking Suite

This directory contains tools for benchmarking and load testing the OptimaCore Real-Time Low Latency Framework.

## Directory Structure

```
testing/
├── benchmark/               # Benchmarking tools
│   ├── latency-test.js      # Run latency tests across variants
│   └── compare_variants.js  # Compare benchmark results
├── chaos/                   # Chaos engineering tools
│   └── network-impairment.js # Network impairment simulation
└── results/                 # Test results (gitignored)
```

## Prerequisites

- Node.js 18+
- For network impairment on Linux: `tc` (traffic control)
- For network impairment on Windows: Administrator privileges

## Installation

Install the required dependencies:

```bash
npm install
```

## Usage

### 1. Running Latency Benchmarks

Run a benchmark for a specific variant:

```bash
# Run hierarchical variant benchmark
npm run test:benchmark -- --variant hierarchical --out testing/results/hierarchical.json

# Run distributed variant benchmark
npm run test:benchmark -- --variant distributed --out testing/results/distributed.json

# Run hybrid variant benchmark
npm run test:benchmark -- --variant hybrid --out testing/results/hybrid.json
```

Benchmark options:
- `--variant`: The storage variant to test (hierarchical|distributed|hybrid)
- `--out`: Output file for results (default: testing/results/benchmark.json)
- `--concurrency`: Number of concurrent requests (default: 10)
- `--requests`: Number of requests per test (default: 100)
- `--base-url`: Base URL of the API (default: http://localhost:3001)

### 2. Comparing Benchmark Results

Compare results from multiple benchmark runs:

```bash
# Compare multiple result files
npm run test:benchmark:compare -- -f testing/results/*.json -o testing/results/comparison

# Output options
npm run test:benchmark:compare -- -f results/*.json --csv    # CSV format
npm run test:benchmark:compare -- -f results/*.json --json   # JSON format
```

### 3. Network Impairment (Chaos Testing)

Simulate network conditions:

```bash
# Add 100ms latency and 1% packet loss for 5 minutes
npm run test:chaos -- --latency 100 --loss 1 --duration 300

# Add bandwidth limit
npm run test:chaos -- --bandwidth 1mbit --duration 120

# Reset network conditions
npm run test:chaos:reset
```

Network impairment options:
- `--latency`: Add latency in milliseconds
- `--jitter`: Add jitter in milliseconds
- `--loss`: Packet loss percentage
- `--duplicate`: Packet duplication percentage
- `--corrupt`: Packet corruption percentage
- `--bandwidth`: Bandwidth limit (e.g., 1mbit, 100kbit)
- `--duration`: Duration in seconds (0 = until reset)
- `--interface`: Network interface to affect (default: eth0)
- `--reset`: Reset all network impairments

## Interpreting Results

### Latency Metrics

- **Avg**: Average response time
- **p50**: Median response time (50th percentile)
- **p90**: 90th percentile response time
- **p95**: 95th percentile response time
- **p99**: 99th percentile response time
- **Min/Max**: Minimum and maximum observed latencies

### Cache Metrics

- **Cache Hit Rate**: Percentage of requests served from cache
- **Storage Source Distribution**: Breakdown of which storage backend handled each request

## Best Practices

1. **Baseline Testing**: Always establish a baseline before making changes
2. **Isolate Variables**: Test one variable at a time (e.g., storage backend, cache settings)
3. **Warm-up**: Allow the system to warm up before collecting metrics
4. **Multiple Runs**: Run tests multiple times to account for variability
5. **Monitor Resources**: Keep an eye on CPU, memory, and I/O during tests

## Troubleshooting

### Network Impairment Not Working
- On Linux, ensure you have `tc` installed
- On Windows, run as Administrator
- Check your network interface name with `ipconfig` (Windows) or `ifconfig` (Linux/Mac)

### High Variability in Results
- Check for other processes consuming resources
- Ensure the system is not under heavy load from other applications
- Consider increasing the test duration

## License

This project is licensed under the ISC License - see the [LICENSE](../LICENSE) file for details.
