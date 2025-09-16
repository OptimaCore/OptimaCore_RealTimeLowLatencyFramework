const jstat = require('jstat');
const ss = require('simple-statistics');

/**
 * Performs a two-sample t-test between two groups
 * @param {number[]} group1 - First group of values
 * @param {number[]} group2 - Second group of values
 * @param {Object} options - Test options
 * @param {number} [options.alpha=0.05] - Significance level
 * @param {boolean} [options.equalVariance=false] - Assume equal variances
 * @returns {Object} Test results
 */
function tTest(group1, group2, { alpha = 0.05, equalVariance = false } = {}) {
  // Remove any non-finite values
  const cleanGroup1 = group1.filter(Number.isFinite);
  const cleanGroup2 = group2.filter(Number.isFinite);

  // Calculate basic statistics
  const n1 = cleanGroup1.length;
  const n2 = cleanGroup2.length;
  const mean1 = ss.mean(cleanGroup1);
  const mean2 = ss.mean(cleanGroup2);
  const std1 = ss.standardDeviation(cleanGroup1);
  const std2 = ss.standardDeviation(cleanGroup2);
  const var1 = ss.variance(cleanGroup1);
  const var2 = ss.variance(cleanGroup2);

  // Calculate degrees of freedom
  let df, stdErr, tValue;
  
  if (equalVariance) {
    // Pooled standard deviation
    const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
    stdErr = Math.sqrt(pooledVar * (1 / n1 + 1 / n2));
    df = n1 + n2 - 2;
  } else {
    // Welch's t-test (unequal variances)
    stdErr = Math.sqrt(var1 / n1 + var2 / n2);
    const numerator = Math.pow(var1 / n1 + var2 / n2, 2);
    const denominator = Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1);
    df = numerator / denominator;
  }

  // Calculate t-value and p-value
  tValue = (mean1 - mean2) / stdErr;
  const pValue = 2 * (1 - jstat.studentt.cdf(Math.abs(tValue), df));
  
  // Calculate effect size (Cohen's d)
  const pooledStd = equalVariance 
    ? Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))
    : Math.sqrt((var1 + var2) / 2);
  
  const cohensD = (mean1 - mean2) / pooledStd;
  
  // Determine if result is significant
  const isSignificant = pValue < alpha;
  
  return {
    test: 't-test',
    equalVariance,
    alpha,
    tValue,
    df,
    pValue,
    isSignificant,
    effectSize: {
      cohensD,
      interpretation: interpretEffectSize(cohensD)
    },
    groupStats: {
      group1: { n: n1, mean: mean1, std: std1, variance: var1 },
      group2: { n: n2, mean: mean2, std: std2, variance: var2 }
    },
    ci: calculateConfidenceInterval(mean1 - mean2, stdErr, df, alpha)
  };
}

/**
 * Performs one-way ANOVA test across multiple groups
 * @param {Array<number[]>} groups - Array of groups (each group is an array of values)
 * @param {Object} options - Test options
 * @param {number} [options.alpha=0.05] - Significance level
 * @returns {Object} ANOVA results
 */
function anova(groups, { alpha = 0.05 } = {}) {
  // Filter out non-finite values from each group
  const cleanGroups = groups.map(group => group.filter(Number.isFinite));
  
  // Remove any empty groups
  const validGroups = cleanGroups.filter(group => group.length > 0);
  const k = validGroups.length;
  
  if (k < 2) {
    throw new Error('ANOVA requires at least two groups with valid data');
  }
  
  // Calculate group statistics
  const groupStats = validGroups.map(group => ({
    n: group.length,
    sum: ss.sum(group),
    mean: ss.mean(group),
    variance: ss.variance(group)
  }));
  
  const totalN = groupStats.reduce((sum, { n }) => sum + n, 0);
  const grandMean = groupStats.reduce((sum, { n, mean }) => sum + n * mean, 0) / totalN;
  
  // Calculate sums of squares
  let sst = 0;  // Total sum of squares
  let ssb = 0;   // Between-group sum of squares
  let ssw = 0;   // Within-group sum of squares
  
  validGroups.forEach((group, i) => {
    const { n, mean } = groupStats[i];
    ssb += n * Math.pow(mean - grandMean, 2);
    
    group.forEach(value => {
      sst += Math.pow(value - grandMean, 2);
    });
  });
  
  ssw = sst - ssb;
  
  // Calculate degrees of freedom
  const dfb = k - 1;      // Between-group degrees of freedom
  const dfw = totalN - k; // Within-group degrees of freedom
  const dft = totalN - 1; // Total degrees of freedom
  
  // Calculate mean squares
  const msb = ssb / dfb;
  const msw = ssw / dfw;
  
  // Calculate F-statistic and p-value
  const fValue = msb / msw;
  const pValue = 1 - jstat.centralF.cdf(fValue, dfb, dfw);
  
  // Calculate effect size (Eta squared)
  const etaSquared = ssb / sst;
  const omegaSquared = (ssb - (dfb * msw)) / (sst + msw);
  
  // Determine if result is significant
  const isSignificant = pValue < alpha;
  
  // Post-hoc tests (Tukey's HSD)
  const postHoc = isSignificant && k > 2 
    ? tukeyHSD(validGroups, groupStats, msw, dfw, alpha)
    : null;
  
  return {
    test: 'one-way-anova',
    alpha,
    fValue,
    df: { between: dfb, within: dfw, total: dft },
    pValue,
    isSignificant,
    effectSize: {
      etaSquared,
      omegaSquared,
      interpretation: interpretEffectSize(Math.sqrt(etaSquared))
    },
    ss: { between: ssb, within: ssw, total: sst },
    ms: { between: msb, within: msw },
    groupStats: groupStats.map((stats, i) => ({
      group: i,
      ...stats,
      std: Math.sqrt(stats.variance)
    })),
    postHoc
  };
}

/**
 * Performs Tukey's HSD test for post-hoc analysis
 * @private
 */
function tukeyHSD(groups, groupStats, msw, dfw, alpha) {
  const k = groups.length;
  const q = jstat.tukeyQTable[alpha][k][dfw] || 
            jstat.tukeyQTable[0.05][Math.min(k, 10)][Math.min(dfw, 120)];
  
  const comparisons = [];
  const criticalValue = q * Math.sqrt(msw / groupStats[0].n); // Assumes balanced design
  
  // Compare all pairs of groups
  for (let i = 0; i < k - 1; i++) {
    for (let j = i + 1; j < k; j++) {
      const meanDiff = Math.abs(groupStats[i].mean - groupStats[j].mean);
      const isSignificant = meanDiff > criticalValue;
      
      comparisons.push({
        groups: [i, j],
        meanDiff,
        se: Math.sqrt(msw * (1/groupStats[i].n + 1/groupStats[j].n)),
        q: meanDiff / Math.sqrt(msw * (1/groupStats[i].n + 1/groupStats[j].n) / 2),
        criticalValue,
        isSignificant,
        ci: [
          meanDiff - criticalValue,
          meanDiff + criticalValue
        ]
      });
    }
  }
  
  return {
    test: "tukey-hsd",
    alpha,
    criticalValue,
    comparisons
  };
}

/**
 * Calculates confidence interval for mean difference
 * @private
 */
function calculateConfidenceInterval(diff, stdErr, df, alpha) {
  const tCritical = Math.abs(jstat.studentt.inv(alpha / 2, df));
  const marginOfError = tCritical * stdErr;
  return [
    diff - marginOfError,
    diff + marginOfError
  ];
}

/**
 * Interprets effect size magnitude
 * @private
 */
function interpretEffectSize(d) {
  const absD = Math.abs(d);
  if (absD < 0.2) return 'negligible';
  if (absD < 0.5) return 'small';
  if (absD < 0.8) return 'medium';
  return 'large';
}

module.exports = {
  tTest,
  anova,
  // Export utility functions for testing
  _private: {
    calculateConfidenceInterval,
    interpretEffectSize,
    tukeyHSD
  }
};
