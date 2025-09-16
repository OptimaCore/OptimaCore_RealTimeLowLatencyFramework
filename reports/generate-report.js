#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const Handlebars = require('handlebars');
const { createCanvas } = require('canvas');
const { Chart, registerables } = require('chart.js');
// Register all Chart.js components
Chart.register(...registerables);
const { v4: uuidv4 } = require('uuid');
const md = require('markdown-it')()
  .use(require('markdown-it-anchor'))
  .use(require('markdown-it-toc-done-right'));
const puppeteer = require('puppeteer');
const { execSync } = require('child_process');

// Register Handlebars helpers
require('./helpers/handlebars-helpers')(Handlebars);

// Configuration
const CONFIG = {
  outputFormats: ['md', 'pdf', 'html'],
  defaultTemplate: 'default',
  figureFormats: ['png', 'svg'],
  defaultFigureFormat: 'png',
  chartOptions: {
    responsive: true,
    scales: {
      y: { beginAtZero: true }
    },
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Performance Comparison' }
    }
  }
};

/**
 * Main function to generate reports
 */
async function generateReport(options) {
  try {
    console.log('Starting report generation...');
    
    // Ensure output directory exists
    const outputDir = path.resolve(options.out);
    fs.mkdirSync(outputDir, { recursive: true });
    
    // Load and parse input data
    const data = await loadData(options.data);
    
    // Process data for templates
    const reportData = processData(data, options);
    
    // Generate figures
    const figurePaths = await generateFigures(reportData, outputDir);
    
    // Add figure paths to report data
    reportData.figurePaths = figurePaths;
    reportData.hasFigures = Object.keys(figurePaths).length > 0;
    
    // Generate reports in all requested formats
    const generatedFiles = [];
    const formats = options.format.split(',');
  
    // Generate markdown first as it's needed for HTML/PDF
    if (formats.includes('md') || options.html || options.pdf) {
      const formatOutputDir = path.join(outputDir, 'md');
      fs.mkdirSync(formatOutputDir, { recursive: true });
      
      const files = await generateFormatReport(reportData, 'md', formatOutputDir, options);
      generatedFiles.push(...files);
    }
  
    // Generate other formats
    for (const format of formats) {
      if (format === 'md') continue; // Already handled
      
      const formatOutputDir = path.join(outputDir, format);
      fs.mkdirSync(formatOutputDir, { recursive: true });
      
      try {
        const files = await generateFormatReport(reportData, format, formatOutputDir, options);
        generatedFiles.push(...files);
      } catch (error) {
        console.warn(`Skipping ${format} format:`, error.message);
      }
    }
    
    console.log(`\n✅ Report generation complete!`);
    console.log(`Generated files:`);
    generatedFiles.forEach(file => console.log(`- ${file}`));
    
  } catch (error) {
    console.error('Error generating report:', error);
    process.exit(1);
  }
}

/**
 * Load and parse input data
 */
async function loadData(dataPath) {
  console.log(`Loading data from ${dataPath}...`);
  
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    if (!data.metadata || !data.analyses) {
      throw new Error('Invalid data format: missing metadata or analyses');
    }
    
    return data;
  } catch (error) {
    throw new Error(`Failed to load data: ${error.message}`);
  }
}

/**
 * Process data for templates
 */
function processData(data, options) {
  console.log('Processing data...');
  
  const { metadata, analyses } = data;
  
  // Extract significant results
  const significantMetrics = [];
  const pValues = [];
  const metricInterpretations = [];
  let hasSignificantResults = false;
  
  const processedAnalyses = analyses.map(analysis => {
    const hasSigResults = Object.values(analysis.tests || {}).some(test => 
      test.anova?.isSignificant || 
      Object.values(test.pairwise || {}).some(p => p.isSignificant)
    );
    
    if (hasSigResults) {
      significantMetrics.push(analysis.metric);
      pValues.push(getMinPValue(analysis));
      metricInterpretations.push(generateInterpretation(analysis));
      hasSignificantResults = true;
    }
    
    return {
      ...analysis,
      hasSignificantResults: hasSigResults,
      minPValue: getMinPValue(analysis)
    };
  });
  
  // Prepare conclusion points
  const conclusionPoints = hasSignificantResults ? [
    `The variant '${getBestPerformingVariant(analyses)}' showed the best overall performance.`,
    `The most significant improvement was observed in '${significantMetrics[0]}'.`
  ] : [];
  
  return {
    metadata: {
      ...metadata,
      reportId: uuidv4(),
      timestamp: new Date().toISOString(),
      alpha: options.alpha || 0.05
    },
    analyses: processedAnalyses,
    significantMetrics,
    pValues,
    metricInterpretations,
    hasSignificantResults,
    conclusionPoint1: conclusionPoints[0] || 'No significant differences found.',
    conclusionPoint2: conclusionPoints[1] || 'Consider increasing sample size or effect size.',
    experimentPurpose: options.purpose || 'compare performance across different configurations'
  };
}

/**
 * Generate figures for the report
 */
async function generateFigures(reportData, outputDir) {
  console.log('Generating figures...');
  
  const figuresDir = path.join(outputDir, 'figures');
  fs.mkdirSync(figuresDir, { recursive: true });
  
  const figurePaths = {};
  
  try {
    // Generate performance comparison chart
    const performanceChartPath = path.join(figuresDir, 'performance-comparison.png');
    await generatePerformanceChart(reportData, performanceChartPath);
    figurePaths.performance = path.relative(outputDir, performanceChartPath);
    
    // Generate metric-specific charts
    for (const analysis of reportData.analyses) {
      if (analysis.hasSignificantResults) {
        const metricChartPath = path.join(figuresDir, `${slugify(analysis.metric)}.png`);
        await generateMetricChart(analysis, metricChartPath);
        figurePaths[analysis.metric] = path.relative(outputDir, metricChartPath);
      }
    }
  } catch (error) {
    console.warn('Error generating figures:', error.message);
  }
  
  return figurePaths;
}

/**
 * Generate performance comparison chart
 */
async function generatePerformanceChart(reportData, outputPath) {
  const canvas = createCanvas(800, 400);
  const ctx = canvas.getContext('2d');
  
  // Extract data for chart
  const labels = [];
  const datasets = [];
  
  // Group metrics by variant
  const variantData = {};
  
  reportData.analyses.forEach(analysis => {
    if (!analysis.tests) return;
    
    Object.entries(analysis.tests).forEach(([source, test]) => {
      if (!variantData[source]) {
        variantData[source] = {
          label: source,
          data: [],
          backgroundColor: getRandomColor()
        };
      }
      
      // Add metric value to variant data
      const metricValue = test.groupStats?.[0]?.mean; // Simplified for example
      variantData[source].data.push(metricValue || 0);
    });
  });
  
  // Create chart
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: reportData.analyses.map(a => a.metric),
      datasets: Object.values(variantData)
    },
    options: CONFIG.chartOptions
  });
  
  // Save chart to file
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  
  return new Promise((resolve, reject) => {
    out.on('finish', () => resolve(outputPath));
    out.on('error', reject);
  });
}

/**
 * Generate chart for a specific metric
 */
async function generateMetricChart(analysis, outputPath) {
  const canvas = createCanvas(800, 400);
  const ctx = canvas.getContext('2d');
  
  // Extract data for chart
  const labels = [];
  const datasets = [];
  
  // Process each test (e.g., by storage source)
  Object.entries(analysis.tests || {}).forEach(([source, test]) => {
    if (!test.groupStats) return;
    
    const data = [];
    const backgroundColors = [];
    const borderColors = [];
    
    test.groupStats.forEach(stat => {
      labels.push(`${stat.group} (${source})`);
      data.push(stat.mean);
      const color = getRandomColor();
      backgroundColors.push(color.replace('0.7', '0.5'));
      borderColors.push(color);
    });
    
    datasets.push({
      label: source,
      data,
      backgroundColor: backgroundColors,
      borderColor: borderColors,
      borderWidth: 1
    });
  });
  
  // Create chart
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['No data'],
      datasets: datasets.length ? datasets : [{ data: [0] }]
    },
    options: {
      ...CONFIG.chartOptions,
      plugins: {
        ...CONFIG.chartOptions.plugins,
        title: {
          ...CONFIG.chartOptions.plugins.title,
          text: `${analysis.metric} Comparison`
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: analysis.metric
          }
        },
        x: {
          title: {
            display: true,
            text: 'Variant (Storage Source)'
          }
        }
      }
    }
  });
  
  // Save chart to file
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  
  return new Promise((resolve, reject) => {
    out.on('finish', () => resolve(outputPath));
    out.on('error', reject);
  });
}

/**
 * Generate report in the specified format
 */
async function generateFormatReport(reportData, format, outputDir, options) {
  console.log(`Generating ${format.toUpperCase()} report...`);
  
  // Handle PDF format by using LaTeX
  const useFormat = format === 'pdf' ? 'tex' : format;
  
  const templatePath = path.join(
    __dirname,
    'templates',
    `report.${useFormat}.hbs`
  );
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found for format: ${useFormat}`);
  }
  
  // Compile template
  const template = Handlebars.compile(fs.readFileSync(templatePath, 'utf8'));
  
  // Render template with data
  const output = template(reportData);
  
  // Save output
  const outputFile = path.join(outputDir, `report.${useFormat}`);
  fs.writeFileSync(outputFile, output);
  
  // Post-process based on format
  switch (format) {
    case 'md':
      return await processMarkdown(outputFile, outputDir, options);
    case 'tex':
    case 'pdf':
      return await processLatex(outputFile, outputDir, options);
    default:
      return [outputFile];
  }
}

/**
 * Process Markdown output (convert to HTML/PDF)
 */
async function processMarkdown(mdFile, outputDir, options) {
  const files = [mdFile];
  
  // Convert to HTML if requested
  if (options.html) {
    const htmlFile = path.join(outputDir, 'report.html');
    const markdown = fs.readFileSync(mdFile, 'utf8');
    const html = md.render(markdown);
    fs.writeFileSync(htmlFile, `<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>${options.title || 'Report'}</title>\n  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.1.0/github-markdown.min.css">\n  <style>\n    .markdown-body { box-sizing: border-box; min-width: 200px; max-width: 980px; margin: 0 auto; padding: 45px; }\n    @media (max-width: 767px) {\n      .markdown-body { padding: 15px; }\n    }\n  </style>\n</head>\n<body>\n  <article class="markdown-body">${html}</article>\n</body>\n</html>`);
    files.push(htmlFile);
    
    // Convert to PDF if requested
    if (options.pdf) {
      const pdfFile = path.join(outputDir, 'report.pdf');
      await htmlToPdf(htmlFile, pdfFile);
      files.push(pdfFile);
    }
  }
  
  return files;
}

/**
 * Process LaTeX output (compile to PDF)
 */
async function processLatex(texFile, outputDir, options) {
  const files = [texFile];
  
  if (options.pdf) {
    const pdfFile = path.join(outputDir, 'report.pdf');
    
    try {
      // Check if pdflatex is available
      execSync('pdflatex --version');
      
      // Compile LaTeX to PDF
      const cwd = path.dirname(texFile);
      execSync(`pdflatex -interaction=nonstopmode -output-directory=${cwd} ${texFile}`, {
        stdio: 'inherit'
      });
      
      // Clean up auxiliary files
      const baseName = path.basename(texFile, '.tex');
      ['aux', 'log', 'out', 'toc'].forEach(ext => {
        const file = path.join(cwd, `${baseName}.${ext}`);
        if (fs.existsSync(file)) fs.unlinkSync(file);
      });
      
      if (fs.existsSync(pdfFile)) {
        files.push(pdfFile);
      }
    } catch (error) {
      console.warn('Failed to compile LaTeX to PDF. Is pdflatex installed?');
    }
  }
  
  return files;
}

/**
 * Convert HTML to PDF using Puppeteer
 */
async function htmlToPdf(htmlFile, pdfFile) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.goto(`file://${htmlFile}`, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: pdfFile,
    format: 'A4',
    margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    printBackground: true
  });
  
  await browser.close();
}

/**
 * Helper function to get minimum p-value from analysis
 */
function getMinPValue(analysis) {
  let minP = 1;
  
  if (analysis.tests) {
    Object.values(analysis.tests).forEach(test => {
      if (test.anova?.pValue < minP) minP = test.anova.pValue;
      if (test.pairwise) {
        Object.values(test.pairwise).forEach(p => {
          if (p.pValue < minP) minP = p.pValue;
        });
      }
    });
  }
  
  return minP === 1 ? null : minP;
}

/**
 * Generate interpretation for a metric
 */
function generateInterpretation(analysis) {
  if (!analysis.tests) return 'No significant results';
  
  const interpretations = [];
  
  Object.entries(analysis.tests).forEach(([source, test]) => {
    if (test.anova?.isSignificant) {
      interpretations.push(`Significant differences in ${source} (p = ${test.anova.pValue.toExponential(2)})`);
    }
    
    if (test.pairwise) {
      Object.entries(test.pairwise).forEach(([comparison, p]) => {
        if (p.isSignificant) {
          const direction = p.meanDiff > 0 ? 'higher' : 'lower';
          interpretations.push(
            `${comparison}: ${p.variant1} has ${direction} values than ${p.variant2} ` +
            `(mean diff = ${p.meanDiff.toFixed(2)}, p = ${p.pValue.toExponential(2)})`
          );
        }
      });
    }
  });
  
  return interpretations.join('; ') || 'No significant differences found';
}

/**
 * Get best performing variant based on metric values
 */
function getBestPerformingVariant(analyses) {
  const variantScores = {};
  
  analyses.forEach(analysis => {
    if (!analysis.tests) return;
    
    Object.values(analysis.tests).forEach(test => {
      if (test.groupStats) {
        test.groupStats.forEach(stat => {
          const variant = stat.variant;
          if (!variantScores[variant]) variantScores[variant] = 0;
          variantScores[variant] += stat.mean;
        });
      }
    });
  });
  
  return Object.entries(variantScores)
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => v)[0] || 'unknown';
}

/**
 * Generate a random color for charts
 */
function getRandomColor() {
  return `rgba(${
    Math.floor(Math.random() * 200) + 55
  }, ${
    Math.floor(Math.random() * 200) + 55
  }, ${
    Math.floor(Math.random() * 200) + 55
  }, 0.7)`;
}

/**
 * Convert string to URL-friendly slug
 */
function slugify(str) {
  return String(str)
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

// Set up command line interface
program
  .name('generate-report')
  .description('Generate reports from statistical analysis results')
  .requiredOption('-d, --data <file>', 'Path to statistical results JSON file')
  .option('-o, --out <dir>', 'Output directory', 'reports')
  .option('--format <formats>', 'Output formats (comma-separated: md,html,pdf)', 'md')
  .option('--title <title>', 'Report title')
  .option('--purpose <text>', 'Experiment purpose/description')
  .option('--alpha <number>', 'Significance level', parseFloat, 0.05)
  .option('--html', 'Generate HTML output (with --format=md)')
  .option('--pdf', 'Generate PDF output')
  .parse(process.argv);

// Generate report
if (require.main === module) {
  generateReport({
    ...program.opts(),
    format: program.opts().format.toLowerCase()
  });
}

module.exports = {
  generateReport,
  loadData,
  processData,
  generateFigures,
  generateFormatReport
};
