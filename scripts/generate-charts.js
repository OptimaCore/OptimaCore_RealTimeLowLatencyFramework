#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { Chart } = require('chart.js');
const { jsPDF } = require('jspdf');
const { program } = require('commander');

// Register the required plugins
require('chartjs-plugin-datalabels');
require('chartjs-plugin-zoom');

// Command line options
program
  .requiredOption('-i, --input <file>', 'Input JSON file with analysis results')
  .option('-o, --out <directory>', 'Output directory for generated charts', 'paper/figures')
  .option('--format <format>', 'Output format (png, svg, or pdf)', 'png')
  .option('--width <pixels>', 'Chart width in pixels', '800')
  .option('--height <pixels>', 'Chart height in pixels', '600')
  .option('--dpi <dpi>', 'DPI for raster formats', '300')
  .parse(process.argv);

const options = program.opts();

// Ensure output directory exists
if (!fs.existsSync(options.out)) {
  fs.mkdirSync(options.out, { recursive: true });
}

// Load and validate input data
let data;
try {
  const fileContent = fs.readFileSync(options.input, 'utf8');
  data = JSON.parse(fileContent);
  
  if (!data.groups || !Array.isArray(data.groups)) {
    throw new Error('Invalid data format: missing groups array');
  }
} catch (error) {
  console.error(`Error loading input file: ${error.message}`);
  process.exit(1);
}

// Generate charts
async function generateCharts() {
  console.log(`Generating charts from ${options.input}...`);
  
  // Create a canvas for Chart.js
  const canvas = createCanvas(parseInt(options.width), parseInt(options.height));
  const ctx = canvas.getContext('2d');
  
  // Generate latency comparison chart
  await generateChart('latency', 'Latency Comparison (ms)', 'bar', {
    labels: data.groups.map(g => g.group_values.storage_source || 'all'),
    datasets: [{
      label: 'Average Latency (ms)',
      data: data.groups.map(g => g.statistics.latency_ms?.mean || 0),
      backgroundColor: getColors(data.groups.length, 0.7),
      borderColor: getColors(data.groups.length),
      borderWidth: 1
    }]
  }, canvas, ctx);
  
  // Generate throughput chart
  await generateChart('throughput', 'Throughput (rps)', 'bar', {
    labels: data.groups.map(g => g.group_values.storage_source || 'all'),
    datasets: [{
      label: 'Throughput (rps)',
      data: data.groups.map(g => g.statistics.throughput_rps?.mean || 0),
      backgroundColor: getColors(data.groups.length, 0.7),
      borderColor: getColors(data.groups.length),
      borderWidth: 1
    }]
  }, canvas, ctx);
  
  // Generate error rate chart
  await generateChart('error_rate', 'Error Rate (%)', 'doughnut', {
    labels: data.groups.map(g => g.group_values.storage_source || 'all'),
    datasets: [{
      data: data.groups.map(g => (g.statistics.error_rate?.mean || 0) * 100),
      backgroundColor: getColors(data.groups.length, 0.7),
      borderColor: '#fff',
      borderWidth: 2
    }]
  }, canvas, ctx);
  
  console.log(`Charts generated successfully in ${options.out}`);
}

// Generate a single chart and save it to a file
async function generateChart(name, title, type, chartData, canvas, ctx) {
  console.log(`Generating ${name} chart...`);
  
  // Create chart
  const chart = new Chart(ctx, {
    type,
    data: chartData,
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: title,
          font: { size: 18 }
        },
        legend: {
          position: 'right'
        },
        datalabels: {
          formatter: (value) => {
            if (name === 'error_rate') return `${value.toFixed(1)}%`;
            return Math.round(value).toLocaleString();
          },
          color: name === 'error_rate' ? '#fff' : '#000',
          font: { weight: 'bold' }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: name === 'latency' ? 'Milliseconds (ms)' : 
                  name === 'throughput' ? 'Requests per Second (rps)' : 'Percentage (%)'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Storage Source'
          }
        }
      }
    },
    plugins: [ChartDataLabels]
  });
  
  // Save chart to file
  const outputPath = path.join(options.out, `${name}.${options.format}`);
  
  if (options.format === 'pdf') {
    // For PDF, we need to create a new document for each chart
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm'
    });
    
    // Convert canvas to image data
    const imgData = canvas.toDataURL('image/png');
    
    // Add image to PDF
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 10, 10, pdfWidth, pdfHeight);
    pdf.save(outputPath);
  } else if (options.format === 'svg') {
    // For SVG, we need to use a different approach
    const svg = canvas.toBuffer('image/svg+xml');
    fs.writeFileSync(outputPath, svg);
  } else {
    // For PNG/JPEG
    const out = fs.createWriteStream(outputPath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    
    await new Promise((resolve, reject) => {
      out.on('finish', resolve);
      out.on('error', reject);
    });
  }
  
  // Clean up
  chart.destroy();
}

// Helper function to generate colors
function getColors(count, opacity = 1) {
  const colors = [
    `rgba(78, 115, 223, ${opacity})`,
    `rgba(28, 200, 138, ${opacity})`,
    `rgba(54, 185, 204, ${opacity})`,
    `rgba(246, 194, 62, ${opacity})`,
    `rgba(231, 74, 59, ${opacity})`,
    `rgba(133, 135, 150, ${opacity})`,
    `rgba(120, 40, 203, ${opacity})`,
    `rgba(0, 180, 204, ${opacity})`,
  ];
  
  // If we need more colors than we have, cycle through them
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(colors[i % colors.length]);
  }
  
  return result;
}

// Run the generator
generateCharts().catch(error => {
  console.error('Error generating charts:', error);
  process.exit(1);
});
