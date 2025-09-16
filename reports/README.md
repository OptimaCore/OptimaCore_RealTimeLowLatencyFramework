# Statistical Report Generation

This module provides automated generation of statistical analysis reports from experiment data. It supports multiple output formats including Markdown, HTML, and PDF.

## Features

- Generate comprehensive statistical reports from JSON data
- Multiple output formats: Markdown, HTML, PDF (via LaTeX or HTML)
- Automated figure generation with Chart.js
- Customizable templates using Handlebars
- Support for statistical significance testing and effect sizes

## Installation

1. Install dependencies:
   ```bash
   npm install handlebars chart.js canvas puppeteer markdown-it markdown-it-anchor markdown-it-toc-done-right
   ```

2. For PDF generation via LaTeX, ensure you have a LaTeX distribution installed:
   - Windows: [MiKTeX](https://miktex.org/) or [TeX Live](https://www.tug.org/texlive/)
   - macOS: [MacTeX](https://www.tug.org/mactex/)
   - Linux: `sudo apt-get install texlive-latex-base texlive-latex-extra`

## Usage

### Basic Usage

```bash
# Generate reports in all formats
node generate-report.js --data path/to/results.json --out output/directory

# Generate specific formats
node generate-report.js --data path/to/results.json --out output/directory --format md,html,pdf

# Specify report purpose
node generate-report.js --data path/to/results.json --out output/directory --purpose "Performance comparison between variants"

# Generate HTML report with custom template
node generate-report.js --data path/to/results.json --out output/directory --format html --template custom-template.html
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--data` | Path to input JSON file with analysis results | Required |
| `--out` | Output directory for generated reports | `./reports` |
| `--format` | Output formats (comma-separated): md, html, pdf | `md` |
| `--purpose` | Description of the experiment purpose | "" |
| `--template` | Custom template file (overrides default) | null |
| `--title` | Custom report title | Based on experiment ID |
| `--theme` | Color theme: light, dark | "light" |
| `--verbose` | Enable verbose logging | false |

## Input Data Format

The input JSON file should follow this structure:

```json
{
  "metadata": {
    "experimentId": "string",
    "startTime": "ISO date string",
    "endTime": "ISO date string",
    "variants": ["array", "of", "variant", "names"],
    "storageSources": ["array", "of", "storage", "sources"],
    "metrics": ["array", "of", "metric", "names"],
    "samplingMethod": "string",
    "alpha": 0.05
  },
  "analyses": [
    {
      "metric": "metric_name",
      "tests": {
        "storage_source": {
          "anova": {
            "test": "one-way-anova",
            "alpha": 0.05,
            "fValue": 12.45,
            "df": {
              "between": 1,
              "within": 98,
              "total": 99
            },
            "pValue": 0.0007,
            "isSignificant": true,
            "effectSize": {
              "etaSquared": 0.112,
              "omegaSquared": 0.103,
              "interpretation": "medium"
            },
            "groupStats": [
              {
                "group": "variant_name",
                "n": 50,
                "mean": 145.2,
                "std": 14.3,
                "variance": 204.49
              }
            ]
          },
          "pairwise": {
            "variant1_vs_variant2": {
              "variant1": "control",
              "variant2": "optimized",
              "test": "t-test",
              "equalVariance": true,
              "alpha": 0.05,
              "tValue": 3.53,
              "df": 98,
              "pValue": 0.0007,
              "isSignificant": true,
              "effectSize": {
                "cohensD": 0.71,
                "interpretation": "medium"
              },
              "groupStats": {
                "group1": {
                  "n": 50,
                  "mean": 145.2,
                  "std": 14.3,
                  "variance": 204.49
                }
              },
              "ci": [8.1, 30.7],
              "meanDiff": 19.4
            }
          }
        }
      }
    }
  ]
}
```

## Customization

### Templates

You can create custom templates by adding new `.hbs` files in the `templates` directory. The following template variables are available:

- `metadata`: Experiment metadata
- `analyses`: Array of metric analyses
- `hasSignificantResults`: Boolean indicating if any significant results were found
- `significantMetrics`: Array of metric names with significant results
- `pValues`: Array of p-values for significant metrics
- `metricInterpretations`: Array of interpretations for significant metrics
- `conclusionPoint1`: First conclusion point
- `conclusionPoint2`: Second conclusion point
- `figurePaths`: Object with paths to generated figures
- `hasFigures`: Boolean indicating if any figures were generated

### Handlebars Helpers

The following Handlebars helpers are available in templates:

- `formatNumber`: Format a number with specified decimal places
- `formatPValue`: Format a p-value with scientific notation if needed
- `formatDate`: Format a date string
- `slugify`: Convert a string to a URL-friendly slug
- `join`: Join an array with a separator
- `toJSON`: Convert a value to a JSON string
- `isArray`: Check if a value is an array
- `isObject`: Check if a value is an object
- `lookup`: Lookup a property in an object
- `eq`, `ne`, `lt`, `gt`: Comparison helpers
- `and`, `or`: Logical operators
- `add`, `subtract`, `multiply`, `divide`: Math operations
- `toLowerCase`, `toUpperCase`: String manipulation
- `eachProperty`: Iterate over object properties
- `markdown`: Convert Markdown to HTML
- `truncate`: Truncate text to a certain length
- `percent`: Format a number as a percentage

## License

MIT
