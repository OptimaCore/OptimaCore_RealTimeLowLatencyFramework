# perf-optimization-2023 - Analysis Report

*Generated on Sep 17, 2025, 01:53 AM*  
*Report ID: 91c1f3c3-c150-432b-a8b9-fe9c266a09d2*

## Executive Summary

This report presents the analysis of the experiment **perf-optimization-2023** conducted across 2 variants. The experiment was designed to Compare performance between control and optimized variants.

### Key Findings

- **Significant differences** were found in the following metrics:
  - `response_time_ms` (p < 0.0007)
  - `throughput_rps` (p < 0.0002)

## 1. Introduction

### 1.1 Experiment Overview

| **Property**       | **Value**                |
|-------------------|--------------------------|
| Experiment ID    | perf-optimization-2023 |
| Start Time       | Nov 15, 2023, 02:30 PM |
| End Time         | Nov 15, 2023, 06:00 PM |
| Total Variants   | 2 |
| Storage Sources  | redis, postgres |
| Total Metrics    | 3 |

### 1.2 Variant Descriptions


## 2. Methodology

### 2.1 Statistical Analysis

We performed the following statistical tests:

- **T-tests**: For comparing means between two variants
- **ANOVA**: For comparing means across multiple variants
- **Effect Size**: Cohen's d for t-tests, η² (eta squared) for ANOVA
- **Significance Level**: α = 0.05

### 2.2 Data Collection

- **Sampling Method**: stratified random sampling
- **Sample Sizes**:

## 3. Results

### 3.1 Overall Performance

![Performance Comparison](figures\performance-comparison.png)

### 3.2 Metric-wise Analysis


## 4. Discussion

### 4.1 Key Observations

- The most significant differences were observed in:
  - **response_time_ms**: Significant differences in redis (p &#x3D; 7.00e-4); control_vs_optimized: control has higher values than optimized (mean diff &#x3D; 19.40, p &#x3D; 7.00e-4); Significant differences in postgres (p &#x3D; 4.10e-3); control_vs_optimized: control has higher values than optimized (mean diff &#x3D; 13.40, p &#x3D; 4.10e-3)
  - **throughput_rps**: Significant differences in redis (p &#x3D; 2.00e-4); control_vs_optimized: control has lower values than optimized (mean diff &#x3D; -130.00, p &#x3D; 2.00e-4)

### 4.2 Limitations

- Sample sizes varied across variants
- Potential confounding variables: 

## 5. Conclusion

The experiment demonstrated statistically significant differences in performance across variants. The most notable findings include:

1. The variant &#x27;unknown&#x27; showed the best overall performance.
2. The most significant improvement was observed in &#x27;response_time_ms&#x27;.

## Appendices

### A. Raw Data Summary

```json
{
  &quot;experimentId&quot;: &quot;perf-optimization-2023&quot;,
  &quot;startTime&quot;: &quot;2023-11-15T09:00:00Z&quot;,
  &quot;endTime&quot;: &quot;2023-11-15T12:30:00Z&quot;,
  &quot;variants&quot;: [
    &quot;control&quot;,
    &quot;optimized&quot;
  ],
  &quot;storageSources&quot;: [
    &quot;redis&quot;,
    &quot;postgres&quot;
  ],
  &quot;metrics&quot;: [
    &quot;response_time_ms&quot;,
    &quot;throughput_rps&quot;,
    &quot;error_rate&quot;
  ],
  &quot;samplingMethod&quot;: &quot;stratified random sampling&quot;,
  &quot;alpha&quot;: 0.05,
  &quot;notes&quot;: &quot;This is a sample dataset for testing report generation.&quot;,
  &quot;reportId&quot;: &quot;91c1f3c3-c150-432b-a8b9-fe9c266a09d2&quot;,
  &quot;timestamp&quot;: &quot;2025-09-16T20:23:38.026Z&quot;
}
```

### B. Statistical Details

Detailed statistical results are available in the accompanying files:

- `statistical-results.json`: Complete statistical analysis
- `figures/`: Generated visualizations

### C. Additional Notes

This is a sample dataset for testing report generation.
