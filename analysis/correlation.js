const ss = require('simple-statistics');
const { Matrix } = require('ml-matrix');

/**
 * Calculates Pearson correlation coefficient between two variables
 * @param {number[]} x - First variable
 * @param {number[]} y - Second variable
 * @param {Object} [options] - Options
 * @param {number} [options.alpha=0.05] - Significance level for confidence interval
 * @returns {Object} Correlation results
 */
function pearson(x, y, { alpha = 0.05 } = {}) {
  // Filter out pairs where either value is not finite
  const cleanPairs = [];
  const n = Math.min(x.length, y.length);
  
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
      cleanPairs.push([x[i], y[i]]);
    }
  }
  
  if (cleanPairs.length < 3) {
    throw new Error('Insufficient data points for correlation analysis');
  }
  
  const xClean = cleanPairs.map(p => p[0]);
  const yClean = cleanPairs.map(p => p[1]);
  
  // Calculate correlation coefficient
  const r = ss.sampleCorrelation(xClean, yClean);
  const nClean = cleanPairs.length;
  
  // Calculate confidence interval using Fisher's z-transformation
  const zr = 0.5 * Math.log((1 + r) / (1 - r));
  const se = 1 / Math.sqrt(nClean - 3);
  const zCrit = Math.abs(ss.standardNormalInverse(alpha / 2));
  const lowerZ = zr - zCrit * se;
  const upperZ = zr + zCrit * se;
  
  // Transform back to r scale
  const lowerR = (Math.exp(2 * lowerZ) - 1) / (Math.exp(2 * lowerZ) + 1);
  const upperR = (Math.exp(2 * upperZ) - 1) / (Math.exp(2 * upperZ) + 1);
  
  // Calculate coefficient of determination (R²)
  const rSquared = r * r;
  
  // Calculate p-value
  const t = (r * Math.sqrt(nClean - 2)) / Math.sqrt(1 - r * r);
  const pValue = 2 * (1 - ss.erf(Math.abs(t) / Math.sqrt(2)));
  
  return {
    method: 'pearson',
    coefficient: r,
    rSquared,
    pValue,
    ci: [lowerR, upperR],
    n: nClean,
    interpretation: interpretCorrelation(r)
  };
}

/**
 * Calculates Spearman's rank correlation coefficient
 * @param {number[]} x - First variable
 * @param {number[]} y - Second variable
 * @returns {Object} Correlation results
 */
function spearman(x, y) {
  // Filter out non-finite values
  const cleanPairs = [];
  const n = Math.min(x.length, y.length);
  
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
      cleanPairs.push({ x: x[i], y: y[i] });
    }
  }
  
  if (cleanPairs.length < 3) {
    throw new Error('Insufficient data points for correlation analysis');
  }
  
  // Extract and rank the data
  const xRanks = rank(cleanPairs.map(p => p.x));
  const yRanks = rank(cleanPairs.map(p => p.y));
  
  // Calculate Spearman's rho
  const nClean = cleanPairs.length;
  const d2 = xRanks.map((xRank, i) => Math.pow(xRank - yRanks[i], 2));
  const sumD2 = ss.sum(d2);
  
  let rho;
  if (new Set(xRanks).size === nClean && new Set(yRanks).size === nClean) {
    // No ties
    rho = 1 - (6 * sumD2) / (nClean * (nClean * nClean - 1));
  } else {
    // Handle ties
    const xTiedRanks = rankWithTies(cleanPairs.map(p => p.x));
    const yTiedRanks = rankWithTies(cleanPairs.map(p => p.y));
    
    const xMeanRank = (nClean + 1) / 2;
    const yMeanRank = (nClean + 1) / 2;
    
    let cov = 0;
    let xVar = 0;
    let yVar = 0;
    
    for (let i = 0; i < nClean; i++) {
      const xDev = xTiedRanks[i] - xMeanRank;
      const yDev = yTiedRanks[i] - yMeanRank;
      
      cov += xDev * yDev;
      xVar += xDev * xDev;
      yVar += yDev * yDev;
    }
    
    rho = cov / Math.sqrt(xVar * yVar);
  }
  
  // Calculate p-value using t-approximation
  const t = rho * Math.sqrt((nClean - 2) / (1 - rho * rho));
  const pValue = 2 * (1 - ss.erf(Math.abs(t) / Math.sqrt(2)));
  
  return {
    method: 'spearman',
    coefficient: rho,
    pValue,
    n: nClean,
    interpretation: interpretCorrelation(rho)
  };
}

/**
 * Calculates partial correlation between x and y, controlling for controlVars
 * @param {number[]} x - First variable
 * @param {number[]} y - Second variable
 * @param {Array<number[]>} controlVars - Array of control variables
 * @returns {Object} Partial correlation results
 */
function partialCorrelation(x, y, controlVars) {
  // Combine all variables into a matrix
  const n = x.length;
  const k = controlVars.length;
  
  // Create data matrix
  const data = [];
  for (let i = 0; i < n; i++) {
    const row = [x[i], y[i]];
    for (let j = 0; j < k; j++) {
      row.push(controlVars[j][i]);
    }
    // Only include rows with all values finite
    if (row.every(Number.isFinite)) {
      data.push(row);
    }
  }
  
  if (data.length < k + 2) {
    throw new Error('Insufficient data points for partial correlation');
  }
  
  const X = new Matrix(data);
  const corrMatrix = ss.sampleCovariance(X.transpose().to2DArray());
  
  // Invert the correlation matrix
  try {
    const invCorr = new Matrix(corrMatrix).inverse().to2DArray();
    
    // Calculate partial correlation
    const r = -invCorr[0][1] / Math.sqrt(invCorr[0][0] * invCorr[1][1]);
    
    // Calculate p-value
    const df = data.length - k - 2;
    const t = r * Math.sqrt(df / (1 - r * r));
    const pValue = 2 * (1 - ss.erf(Math.abs(t) / Math.sqrt(2)));
    
    return {
      method: 'partial',
      coefficient: r,
      pValue,
      df,
      n: data.length,
      numControlVars: k,
      interpretation: interpretCorrelation(r)
    };
  } catch (e) {
    throw new Error('Matrix inversion failed. The control variables may be linearly dependent.');
  }
}

/**
 * Ranks values, handling ties with average ranks
 * @private
 */
function rank(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map(v => sorted.indexOf(v) + 1);
}

/**
 * Ranks values, handling ties with average ranks
 * @private
 */
function rankWithTies(values) {
  // Create array of {value, originalIndex} pairs
  const indexedValues = values.map((v, i) => ({ value: v, index: i }));
  
  // Sort by value
  indexedValues.sort((a, b) => a.value - b.value);
  
  // Assign ranks, handling ties
  const ranks = new Array(values.length);
  let i = 0;
  
  while (i < indexedValues.length) {
    // Find all elements with the same value
    let j = i;
    while (j < indexedValues.length && 
           indexedValues[j].value === indexedValues[i].value) {
      j++;
    }
    
    // Calculate average rank
    const avgRank = (i + 1 + j) / 2;
    
    // Assign average rank to all tied elements
    for (let k = i; k < j; k++) {
      ranks[indexedValues[k].index] = avgRank;
    }
    
    i = j;
  }
  
  return ranks;
}

/**
 * Interprets correlation coefficient magnitude
 * @private
 */
function interpretCorrelation(r) {
  const absR = Math.abs(r);
  if (absR < 0.1) return 'negligible';
  if (absR < 0.3) return 'small';
  if (absR < 0.5) return 'moderate';
  return 'strong';
}

module.exports = {
  pearson,
  spearman,
  partial: partialCorrelation,
  // Export utility functions for testing
  _private: {
    rank,
    rankWithTies,
    interpretCorrelation
  }
};
