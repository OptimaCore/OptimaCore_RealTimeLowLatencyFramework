# OptimaCore Analysis Dashboard

Interactive dashboard for visualizing and analyzing performance metrics from the OptimaCore Real-Time Low Latency Framework.

## Features

- **Interactive Visualizations**: View latency, throughput, and error rate metrics in real-time
- **Multiple Data Sources**: Load data from local files or API endpoints
- **Export Capabilities**: Export charts as PNG, SVG, or PDF
- **Responsive Design**: Works on desktop and tablet devices
- **Azure Integration**: Deploy to Azure with the provided dashboard template

## Getting Started

### Prerequisites

- Node.js 14+ and npm
- Modern web browser (Chrome, Firefox, Safari, or Edge)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npx http-server -p 3000
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:3000/dashboard
   ```

## Usage

### Loading Data

1. **From a local file**:
   - Click "Choose File" and select a JSON file with analysis results
   - The dashboard will automatically update with the new data

2. **From an API endpoint**:
   - Select "API Endpoint" from the data source dropdown
   - Enter the API URL
   - Click "Load Data"

### Interacting with Charts

- **Zoom**: Click and drag to zoom in on a specific area
- **Pan**: Hold Shift and drag to pan around the chart
- **Reset Zoom**: Click the reset button in the top-right corner of each chart
- **Export**: Click the download icon to export a chart as an image

### Exporting Reports

- **Export All Charts**: Exports all visible charts as individual images
- **Export PDF Report**: Creates a PDF document with all charts and metrics

## Chart Generation Script

The `scripts/generate-charts.js` script can be used to generate static chart images from analysis results.

### Usage

```bash
node scripts/generate-charts.js -i results/analysis-report.json -o paper/figures --format png
```

### Options

- `-i, --input <file>`: Input JSON file with analysis results (required)
- `-o, --out <directory>`: Output directory for generated charts (default: paper/figures)
- `--format <format>`: Output format: png, svg, or pdf (default: png)
- `--width <pixels>`: Chart width in pixels (default: 800)
- `--height <pixels>`: Chart height in pixels (default: 600)
- `--dpi <dpi>`: DPI for raster formats (default: 300)

## Azure Dashboard

The `dashboard/azure-dashboard.json` file is an Azure Resource Manager (ARM) template that can be used to deploy a monitoring dashboard to Azure. This dashboard integrates with Application Insights and Log Analytics to provide real-time monitoring of your OptimaCore deployment.

### Deployment

1. In the Azure Portal, click "Create a resource"
2. Search for "Template deployment" and select "Deploy a custom template"
3. Click "Build your own template in the editor"
4. Copy and paste the contents of `azure-dashboard.json`
5. Click "Save" and fill in the required parameters
6. Select a resource group and click "Review + create"

### Required Parameters

- **dashboardName**: Name for the dashboard
- **appInsightsName**: Name of your Application Insights resource
- **workspaceName**: Name of your Log Analytics workspace

## Data Format

The dashboard expects analysis results in the following format:

```json
{
  "groups": [
    {
      "group_values": {
        "storage_source": "local",
        "cache_hit": true
      },
      "statistics": {
        "latency_ms": {
          "mean": 42.5,
          "median": 41.8,
          "p95": 52.3,
          "p99": 56.8,
          "std": 5.2,
          "min": 32.1,
          "max": 58.7
        },
        "throughput_rps": {
          "mean": 1250.3,
          "median": 1245.6,
          "p95": 1450.8,
          "p99": 1480.3,
          "std": 125.7,
          "min": 980.5,
          "max": 1500.2
        },
        "error_rate": {
          "mean": 0.012,
          "median": 0.011,
          "p95": 0.022,
          "p99": 0.024,
          "std": 0.005,
          "min": 0.001,
          "max": 0.025
        }
      }
    }
  ]
}
```

## Development

### Adding New Chart Types

1. Add a new canvas element to `index.html`
2. Initialize the chart in `dashboard.js`
3. Implement the update function for the new chart type
4. Add the chart to the `updateCharts` function

### Styling

Customize the dashboard appearance by modifying the CSS in `index.html`. The dashboard uses Bootstrap 5 for responsive layout and basic styling.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
