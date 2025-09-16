// Dashboard Configuration
const config = {
    colors: {
        primary: '#4e73df',
        success: '#1cc88a',
        info: '#36b9cc',
        warning: '#f6c23e',
        danger: '#e74a3b',
        secondary: '#858796',
        light: '#f8f9fc',
        dark: '#5a5c69',
    },
    charts: {},
    currentData: null
};

// Initialize the dashboard when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    initializeCharts();
    loadSampleData(); // For demo purposes
});

// Set up event listeners
function initializeEventListeners() {
    // Toggle sidebar
    document.getElementById('toggleSidebar')?.addEventListener('click', toggleSidebar);
    
    // Data source toggle
    const dataSourceSelect = document.getElementById('dataSource');
    if (dataSourceSelect) {
        dataSourceSelect.addEventListener('change', function(e) {
            const isApi = e.target.value === 'api';
            const fileInputContainer = document.getElementById('fileInputContainer');
            const apiInputContainer = document.getElementById('apiInputContainer');
            
            if (fileInputContainer) fileInputContainer.classList.toggle('d-none', isApi);
            if (apiInputContainer) apiInputContainer.classList.toggle('d-none', !isApi);
        });
    }
    
    // File input handler
    const fileInput = document.getElementById('dataFile');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }
    
    // API load button
    const loadApiBtn = document.getElementById('loadApiData');
    if (loadApiBtn) {
        loadApiBtn.addEventListener('click', loadDataFromApi);
    }
    
    // Export buttons
    const exportAllBtn = document.getElementById('exportAll');
    if (exportAllBtn) {
        exportAllBtn.addEventListener('click', exportAllCharts);
    }
    
    const exportReportBtn = document.getElementById('exportReport');
    if (exportReportBtn) {
        exportReportBtn.addEventListener('click', exportPdfReport);
    }
    
    // Chart actions
    document.addEventListener('click', function(e) {
        if (e.target.matches('[data-chart]')) {
            e.preventDefault();
            const chartId = e.target.getAttribute('data-chart');
            const action = e.target.getAttribute('data-action');
            handleChartAction(chartId, action);
        }
    });
    
    // Group by checkboxes
    const groupByCheckboxes = document.querySelectorAll('#groupByOptions input[type="checkbox"]');
    groupByCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => updateCharts());
    });
}

// Initialize Chart.js charts with default options
function initializeCharts() {
    // Latency Comparison Chart (Line)
    const latencyCtx = document.getElementById('latencyChart');
    if (latencyCtx) {
        config.charts.latencyChart = new Chart(latencyCtx.getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: getChartOptions('ms', 'Latency Over Time')
        });
    }
    
    // Throughput Chart (Bar)
    const throughputCtx = document.getElementById('throughputChart');
    if (throughputCtx) {
        config.charts.throughputChart = new Chart(throughputCtx.getContext('2d'), {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: getChartOptions('rps', 'Throughput by Storage')
        });
    }
    
    // Error Rate Chart (Pie)
    const errorRateCtx = document.getElementById('errorRateChart');
    if (errorRateCtx) {
        config.charts.errorRateChart = new Chart(errorRateCtx.getContext('2d'), {
            type: 'doughnut',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.label}: ${context.raw.toFixed(2)}%`;
                            }
                        }
                    },
                    datalabels: {
                        formatter: (value) => `${value.toFixed(1)}%`,
                        color: '#fff',
                        font: { weight: 'bold' }
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
    }
}

// Get common chart options
function getChartOptions(unit = '', title = '') {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        scales: {
            x: {
                title: { display: true, text: 'Time' }
            },
            y: {
                title: { display: true, text: unit },
                beginAtZero: true
            }
        },
        plugins: {
            title: { display: !!title, text: title },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return `${context.dataset.label}: ${context.parsed.y} ${unit}`;
                    }
                }
            },
            zoom: {
                zoom: {
                    wheel: { enabled: true },
                    pinch: { enabled: true },
                    mode: 'x',
                    onZoomComplete: ({ chart }) => {
                        chart.update('none');
                    }
                },
                pan: { enabled: true, mode: 'x' }
            }
        }
    };
}

// Handle file upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            processData(data);
        } catch (error) {
            showError('Error parsing JSON file');
            console.error('Error parsing JSON:', error);
        }
    };
    reader.readAsText(file);
}

// Load data from API
async function loadDataFromApi() {
    const apiUrl = document.getElementById('apiUrl')?.value.trim();
    if (!apiUrl) {
        showError('Please enter a valid API URL');
        return;
    }
    
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        processData(data);
    } catch (error) {
        showError('Error loading data from API');
        console.error('API Error:', error);
    }
}

// Process and visualize the data
function processData(data) {
    if (!data || !data.groups || !Array.isArray(data.groups)) {
        showError('Invalid data format');
        return;
    }
    
    config.currentData = data;
    updateDashboard(data);
}

// Update all dashboard components with new data
function updateDashboard(data) {
    updateSummaryCards(data);
    updateCharts();
    updateMetricsTable(data);
    updateMetricsList(data);
}

// Update summary cards
function updateSummaryCards(data) {
    const cardsContainer = document.getElementById('summaryCards');
    if (!cardsContainer) return;
    
    // Calculate overall stats across all groups
    const allMetrics = data.groups.flatMap(group => 
        Object.entries(group.statistics).map(([metric, stats]) => ({
            metric,
            ...stats
        }))
    );
    
    const metricsByType = allMetrics.reduce((acc, item) => {
        if (!acc[item.metric]) acc[item.metric] = [];
        acc[item.metric].push(item);
        return acc;
    }, {});
    
    const cards = Object.entries(metricsByType).map(([metric, values]) => {
        const avgMean = values.reduce((sum, v) => sum + v.mean, 0) / values.length;
        const minValue = Math.min(...values.map(v => v.min));
        const maxValue = Math.max(...values.map(v => v.max));
        
        return `
            <div class="col-xl-3 col-md-6 mb-4">
                <div class="card border-left-primary shadow h-100 py-2">
                    <div class="card-body">
                        <div class="row no-gutters align-items-center">
                            <div class="col mr-2">
                                <div class="text-xs font-weight-bold text-primary text-uppercase mb-1">
                                    ${formatMetricName(metric)}
                                </div>
                                <div class="h5 mb-0 font-weight-bold text-gray-800">
                                    ${formatValue(metric, avgMean)}
                                </div>
                                <div class="text-xs text-muted">
                                    Min: ${formatValue(metric, minValue)} | 
                                    Max: ${formatValue(metric, maxValue)}
                                </div>
                            </div>
                            <div class="col-auto">
                                <i class="bi bi-graph-up-arrow fa-2x text-gray-300"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    cardsContainer.innerHTML = cards;
}

// Update all charts with current data
function updateCharts() {
    if (!config.currentData) return;
    
    const groups = config.currentData.groups;
    const groupBy = Array.from(document.querySelectorAll('#groupByOptions input:checked')).map(cb => cb.value);
    
    // Update Latency Chart
    updateLatencyChart(groups, groupBy);
    
    // Update Throughput Chart
    updateThroughputChart(groups, groupBy);
    
    // Update Error Rate Chart
    updateErrorRateChart(groups, groupBy);
}

// Update Latency Chart
function updateLatencyChart(groups, groupBy) {
    if (!config.charts.latencyChart) return;
    
    const datasets = [];
    const labels = [];
    
    // Generate time-based labels (assuming data is in chronological order)
    const timePoints = 10; // Number of points to show
    for (let i = 0; i < timePoints; i++) {
        labels.push(`T-${timePoints - i}`);
    }
    
    // Group data by the selected grouping
    const groupedData = {};
    groups.forEach((group, idx) => {
        const groupKey = groupBy.map(g => group.groupValues[g] || 'all').join(' - ');
        if (!groupedData[groupKey]) {
            groupedData[groupKey] = {
                label: groupKey,
                data: [],
                borderColor: getColorForIndex(Object.keys(groupedData).length),
                backgroundColor: 'transparent',
                borderWidth: 2,
                tension: 0.1,
                pointRadius: 3
            };
        }
        
        // Add latency data (simplified - in a real app, you'd have time series data)
        const latencyData = group.statistics.latency_ms || {};
        groupedData[groupKey].data.push(latencyData.mean || 0);
    });
    
    // Update chart
    config.charts.latencyChart.data.labels = labels;
    config.charts.latencyChart.data.datasets = Object.values(groupedData);
    config.charts.latencyChart.update();
}

// Update Throughput Chart
function updateThroughputChart(groups, groupBy) {
    if (!config.charts.throughputChart) return;
    
    const labels = [];
    const datasets = [];
    
    // Group data by the selected grouping
    const groupedData = {};
    groups.forEach(group => {
        const groupKey = groupBy.map(g => group.groupValues[g] || 'all').join(' - ');
        if (!groupedData[groupKey]) {
            groupedData[groupKey] = {
                label: groupKey,
                data: [],
                backgroundColor: getColorForIndex(Object.keys(groupedData).length, 0.7),
                borderColor: getColorForIndex(Object.keys(groupedData).length),
                borderWidth: 1
            };
            labels.push(groupKey);
        }
        
        // Add throughput data
        const throughputData = group.statistics.throughput_rps || {};
        groupedData[groupKey].data.push(throughputData.mean || 0);
    });
    
    // Update chart
    config.charts.throughputChart.data.labels = labels;
    config.charts.throughputChart.data.datasets = [{
        label: 'Throughput (rps)',
        data: Object.values(groupedData).map(g => g.data[0] || 0),
        backgroundColor: Object.values(groupedData).map((g, i) => getColorForIndex(i, 0.7)),
        borderColor: Object.values(groupedData).map((g, i) => getColorForIndex(i)),
        borderWidth: 1
    }];
    config.charts.throughputChart.update();
}

// Update Error Rate Chart
function updateErrorRateChart(groups, groupBy) {
    if (!config.charts.errorRateChart) return;
    
    const labels = [];
    const data = [];
    const backgroundColors = [];
    
    // Group data by the selected grouping
    groups.forEach((group, idx) => {
        const groupKey = groupBy.map(g => group.groupValues[g] || 'all').join(' - ');
        const errorRate = group.statistics.error_rate?.mean || 0;
        
        if (errorRate > 0) {
            labels.push(groupKey);
            data.push(errorRate * 100); // Convert to percentage
            backgroundColors.push(getColorForIndex(idx, 0.7));
        }
    });
    
    // Update chart
    config.charts.errorRateChart.data.labels = labels;
    config.charts.errorRateChart.data.datasets = [{
        data,
        backgroundColor: backgroundColors,
        borderColor: '#fff',
        borderWidth: 2
    }];
    config.charts.errorRateChart.update();
}

// Update metrics table
function updateMetricsTable(data) {
    const tbody = document.querySelector('#metricsTable tbody');
    if (!tbody) return;
    
    // Get all unique metrics across all groups
    const allMetrics = new Set();
    data.groups.forEach(group => {
        Object.keys(group.statistics).forEach(metric => allMetrics.add(metric));
    });
    
    // Create table rows
    let rows = '';
    allMetrics.forEach(metric => {
        const stats = data.groups[0]?.statistics[metric] || {};
        rows += `
            <tr>
                <td>${formatMetricName(metric)}</td>
                <td>${formatValue(metric, stats.mean)}</td>
                <td>${formatValue(metric, stats.median)}</td>
                <td>${formatValue(metric, stats.p95)}</td>
                <td>${formatValue(metric, stats.std)}</td>
                <td>${formatValue(metric, stats.min)}</td>
                <td>${formatValue(metric, stats.max)}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = rows;
}

// Update metrics list in sidebar
function updateMetricsList(data) {
    const container = document.getElementById('metricsList');
    if (!container) return;
    
    // Get all unique metrics
    const allMetrics = new Set();
    data.groups.forEach(group => {
        Object.keys(group.statistics).forEach(metric => allMetrics.add(metric));
    });
    
    // Create metric cards
    let html = '';
    Array.from(allMetrics).forEach((metric, idx) => {
        const isActive = idx === 0 ? 'active' : '';
        html += `
            <div class="card mb-2 metric-card ${isActive}" data-metric="${metric}">
                <div class="card-body p-2">
                    <h6 class="card-title mb-0">${formatMetricName(metric)}</h6>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Add click handlers for metric cards
    document.querySelectorAll('.metric-card').forEach(card => {
        card.addEventListener('click', function() {
            document.querySelectorAll('.metric-card').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            // In a real app, you might want to update charts to focus on the selected metric
        });
    });
}

// Toggle sidebar visibility
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapse');
    }
}

// Handle chart actions (export, zoom, etc.)
function handleChartAction(chartId, action) {
    const chart = config.charts[chartId];
    if (!chart) return;
    
    switch (action) {
        case 'export':
            exportChartAsImage(chartId);
            break;
        case 'zoom-reset':
            if (chart.resetZoom) {
                chart.resetZoom();
            }
            break;
    }
}

// Export chart as image
function exportChartAsImage(chartId) {
    const canvas = document.getElementById(chartId);
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `${chartId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// Export all charts as images
async function exportAllCharts() {
    if (!window.jspdf) {
        showError('jsPDF library not loaded');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // Add each chart to the PDF
    for (const [chartId, chart] of Object.entries(config.charts)) {
        const canvas = document.getElementById(chartId);
        if (!canvas) continue;
        
        // Add new page for each chart after the first one
        if (pdf.getNumberOfPages() > 1) {
            pdf.addPage();
        }
        
        // Add chart title
        const title = chart.options.plugins?.title?.text || chartId;
        pdf.setFontSize(16);
        pdf.text(title, 14, 20);
        
        // Add chart image
        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 10, 30, 190, 100);
    }
    
    // Save the PDF
    pdf.save('analysis-report.pdf');
}

// Export dashboard as PDF report
async function exportPdfReport() {
    if (!window.jspdf || !window.html2canvas) {
        showError('Required libraries not loaded');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const element = document.getElementById('chartsContainer');
    
    try {
        // Use html2canvas to capture the dashboard
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: true
        });
        
        // Create PDF
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        pdf.addImage(imgData, 'PNG', 10, 10, pdfWidth, pdfHeight);
        pdf.save('dashboard-report.pdf');
    } catch (error) {
        console.error('Error generating PDF:', error);
        showError('Failed to generate PDF report');
    }
}

// Load sample data for demo
function loadSampleData() {
    // Try to load from the results directory first
    fetch('results/analysis-report.json')
        .then(response => {
            if (!response.ok) throw new Error('Sample data not found');
            return response.json();
        })
        .then(data => {
            processData(data);
        })
        .catch(() => {
            // If no sample data found, show a message
            console.log('No sample data found. Please upload a data file.');
        });
}

// Show error message
function showError(message) {
    // In a real app, you'd show this in a nice toast or alert
    console.error('Error:', message);
    alert(`Error: ${message}`);
}

// Format metric names for display
function formatMetricName(metric) {
    return metric
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}

// Format values based on metric type
function formatValue(metric, value) {
    if (value === null || value === undefined) return 'N/A';
    
    if (metric.includes('percent') || metric.includes('rate')) {
        return `${(value * 100).toFixed(2)}%`;
    }
    
    if (metric.includes('ms') || metric.includes('latency')) {
        return `${value.toFixed(2)} ms`;
    }
    
    if (metric.includes('rps') || metric.includes('throughput')) {
        return Math.round(value).toLocaleString();
    }
    
    return value.toFixed(2);
}

// Get color for chart elements
function getColorForIndex(index, opacity = 1) {
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
    return colors[index % colors.length];
}
