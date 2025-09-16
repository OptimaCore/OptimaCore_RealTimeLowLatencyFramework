/**
 * Register Handlebars helpers for report generation
 */
module.exports = function(Handlebars) {
  // Format a number with specified decimal places
  Handlebars.registerHelper('formatNumber', function(number, decimals) {
    if (number === undefined || number === null) return 'N/A';
    return Number(number).toFixed(decimals || 2);
  });

  // Format a p-value with scientific notation if needed
  Handlebars.registerHelper('formatPValue', function(pValue) {
    if (pValue === undefined || pValue === null) return 'N/A';
    if (pValue < 0.0001) return '< 0.0001';
    if (pValue < 0.001) return pValue.toExponential(1);
    return pValue.toFixed(4);
  });

  // Format a date
  Handlebars.registerHelper('formatDate', function(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  });

  // Convert a string to a URL-friendly slug
  Handlebars.registerHelper('slugify', function(str) {
    if (!str) return '';
    return String(str)
      .normalize('NFKD')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-');
  });

  // Join an array with a separator
  Handlebars.registerHelper('join', function(array, separator) {
    if (!Array.isArray(array)) return '';
    return array.join(separator || ', ');
  });

  // Convert a value to JSON string
  Handlebars.registerHelper('toJSON', function(obj) {
    return JSON.stringify(obj, null, 2);
  });

  // Check if a value is an array
  Handlebars.registerHelper('isArray', function(value) {
    return Array.isArray(value);
  });

  // Check if a value is an object
  Handlebars.registerHelper('isObject', function(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  });

  // Create a lookup helper
  Handlebars.registerHelper('lookup', function(obj, key) {
    return obj && obj[key];
  });

  // Compare two values
  Handlebars.registerHelper('eq', function(a, b, options) {
    return a === b ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('ne', function(a, b, options) {
    return a !== b ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('lt', function(a, b, options) {
    return a < b ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('gt', function(a, b, options) {
    return a > b ? options.fn(this) : options.inverse(this);
  });

  // Logical operators
  Handlebars.registerHelper('and', function() {
    return Array.prototype.slice.call(arguments, 0, -1).every(Boolean);
  });

  Handlebars.registerHelper('or', function() {
    return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
  });

  // Math operations
  Handlebars.registerHelper('add', function(a, b) {
    return a + b;
  });

  Handlebars.registerHelper('subtract', function(a, b) {
    return a - b;
  });

  Handlebars.registerHelper('multiply', function(a, b) {
    return a * b;
  });

  Handlebars.registerHelper('divide', function(a, b) {
    return a / b;
  });

  // String manipulation
  Handlebars.registerHelper('toLowerCase', function(str) {
    return String(str).toLowerCase();
  });

  Handlebars.registerHelper('toUpperCase', function(str) {
    return String(str).toUpperCase();
  });

  // Array helpers
  Handlebars.registerHelper('eachProperty', function(obj, options) {
    const result = [];
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result.push(options.fn({ key, value: obj[key] }));
      }
    }
    return result.join('');
  });

  // Debug helper
  Handlebars.registerHelper('debug', function(optionalValue) {
    console.log('Current Context');
    console.log('====================');
    console.log(this);

    if (optionalValue) {
      console.log('Value');
      console.log('====================');
      console.log(optionalValue);
    }
  });

  // Conditional content
  Handlebars.registerHelper('ifCond', function(v1, operator, v2, options) {
    switch (operator) {
      case '==':
        return v1 == v2 ? options.fn(this) : options.inverse(this);
      case '===':
        return v1 === v2 ? options.fn(this) : options.inverse(this);
      case '!=':
        return v1 != v2 ? options.fn(this) : options.inverse(this);
      case '!==':
        return v1 !== v2 ? options.fn(this) : options.inverse(this);
      case '<':
        return v1 < v2 ? options.fn(this) : options.inverse(this);
      case '<=':
        return v1 <= v2 ? options.fn(this) : options.inverse(this);
      case '>':
        return v1 > v2 ? options.fn(this) : options.inverse(this);
      case '>=':
        return v1 >= v2 ? options.fn(this) : options.inverse(this);
      case '&&':
        return v1 && v2 ? options.fn(this) : options.inverse(this);
      case '||':
        return v1 || v2 ? options.fn(this) : options.inverse(this);
      default:
        return options.inverse(this);
    }
  });

  // Markdown to HTML conversion
  Handlebars.registerHelper('markdown', function(text) {
    if (!text) return '';
    const md = require('markdown-it')();
    return new Handlebars.SafeString(md.render(text));
  });

  // Truncate text to a certain length
  Handlebars.registerHelper('truncate', function(str, len) {
    if (str && str.length > len) {
      return str.substring(0, len) + '...';
    }
    return str;
  });

  // Format a number as a percentage
  Handlebars.registerHelper('percent', function(number, decimals) {
    if (number === undefined || number === null) return 'N/A';
    return (number * 100).toFixed(decimals || 1) + '%';
  });
};
