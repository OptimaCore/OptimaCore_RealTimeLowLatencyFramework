// Import commands.js using ES2015 syntax:
import './commands';
import 'cypress-axe';
import 'cypress-real-events/support';

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Handle uncaught exceptions
Cypress.on('uncaught:exception', (err) => {
  // Log the error but don't fail the test
  console.error('Uncaught exception:', err);
  // Return false to prevent the error from failing the test
  return false;
});

// Add global test hooks
beforeEach(() => {
  // Reset the test state if needed
  cy.log('Starting test:', Cypress.currentTest.title);
  
  // Clear any existing data
  cy.clearLocalStorage();
  cy.clearCookies();
  
  // Mock network requests if needed
  // cy.intercept('GET', '/api/**').as('apiRequest');
});

afterEach(() => {
  // Take a screenshot on test failure
  if (Cypress.currentTest.state === 'failed') {
    const specName = Cypress.spec.name;
    const testName = Cypress.currentTest.title;
    const screenshotPath = `screenshots/${specName}/${testName} (failed).png`;
    cy.screenshot(screenshotPath, { capture: 'runner' });
  }
});
