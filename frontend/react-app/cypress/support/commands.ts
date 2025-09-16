// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
//
// declare global {
//   namespace Cypress {
//     interface Chainable {
//       login(email: string, password: string): Chainable<void>
//       drag(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       dismiss(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       visit(originalFn: CommandOriginalFn, url: string, options: Partial<VisitOptions>): Chainable<Element>
//     }
//   }
// }

// Add custom commands here
import '@testing-library/cypress/add-commands';

// Custom command to check for accessibility issues
Cypress.Commands.add('checkA11yWithLog', () => {
  // Inject the axe-core runtime
  cy.injectAxe();
  
  // Configure aXe and check for violations
  cy.configureAxe({
    rules: [
      { id: 'color-contrast', enabled: true },
      { id: 'heading-order', enabled: true },
      { id: 'label', enabled: true },
      { id: 'link-name', enabled: true },
    ],
  });
  
  // Check for a11y violations
  cy.checkA11y(
    null,
    {
      includedImpacts: ['critical', 'serious'],
    },
    (violations) => {
      // Log violations to the console
      cy.task('log', `${violations.length} accessibility violation(s) detected`);
      violations.forEach((violation) => {
        cy.task('log', `[${violation.impact}] ${violation.description}`);
        cy.task('log', `  ${violation.help}`);
        cy.task('log', `  ${violation.helpUrl}`);
      });
    },
    true // Skip failures in non-CI environments
  );
});

// Command to log in a test user
Cypress.Commands.add('login', (email = 'test@example.com', password = 'password123') => {
  cy.session([email, password], () => {
    // Mock login API call
    cy.intercept('POST', '/api/login', {
      statusCode: 200,
      body: {
        user: {
          id: 1,
          email,
          name: 'Test User',
        },
        token: 'test-jwt-token',
      },
    }).as('loginRequest');

    // Navigate to login page and fill out form
    cy.visit('/login');
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type(password);
    cy.get('button[type="submit"]').click();

    // Wait for login to complete
    cy.wait('@loginRequest');
  });
});

// Command to add a product to cart
Cypress.Commands.add('addProductToCart', (productId = '1', quantity = 1) => {
  // Mock add to cart API call
  cy.intercept('POST', '/api/cart', {
    statusCode: 200,
    body: {
      success: true,
      cartId: `cart-${Cypress._.random(1000, 9999)}`,
      item: {
        id: `item-${Cypress._.random(1000, 9999)}`,
        productId,
        quantity,
        addedAt: new Date().toISOString(),
      },
    },
  }).as('addToCartRequest');

  // Add product to cart
  cy.get(`[data-testid="add-to-cart-${productId}"]`).click();
  
  // Wait for the request to complete
  cy.wait('@addToCartRequest');
});

// Command to check if an element is in viewport
Cypress.Commands.add('isInViewport', { prevSubject: true }, (subject) => {
  const rect = subject[0].getBoundingClientRect();
  
  expect(rect.top).to.be.lessThan(Cypress.$(window).height());
  expect(rect.bottom).to.be.greaterThan(0);
  expect(rect.left).to.be.lessThan(Cypress.$(window).width());
  expect(rect.right).to.be.greaterThan(0);
  
  return subject;
});

// Command to wait for all images to load
Cypress.Commands.add('waitForImages', () => {
  cy.get('img').each(($img) => {
    cy.wrap($img).should('be.visible').and('have.prop', 'naturalWidth').should('be.greaterThan', 0);
  });
});

// Command to set viewport size with a name
const viewports = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
  large: { width: 1920, height: 1080 },
};

Cypress.Commands.add('setViewport', (size) => {
  if (!viewports[size]) {
    throw new Error(`Viewport '${size}' is not defined. Available viewports: ${Object.keys(viewports).join(', ')}`);
  }
  
  cy.viewport(viewports[size].width, viewports[size].height);
});
