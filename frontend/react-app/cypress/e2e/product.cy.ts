/// <reference types="cypress" />

describe('Product Page', () => {
  beforeEach(() => {
    // Mock API responses
    cy.intercept('GET', '/api/products/1', {
      statusCode: 200,
      fixture: 'product.json',
    }).as('getProduct');

    cy.intercept('POST', '/api/cart', {
      statusCode: 200,
      body: {
        success: true,
        cartId: 'cart-12345',
        item: {
          id: 'item-67890',
          productId: '1',
          color: 'Black',
          size: 'M',
          quantity: 1,
          addedAt: new Date().toISOString(),
        },
      },
    }).as('addToCart');

    // Visit the product page
    cy.visit('/product/1');
    
    // Wait for the product to load
    cy.wait('@getProduct');
  });

  it('should load the product page', () => {
    // Check the page title
    cy.title().should('include', 'OptimaStore');
    
    // Check the product name is visible
    cy.get('h1').should('be.visible');
    
    // Check the product image is visible
    cy.get('img[alt^="Premium Wireless"]').should('be.visible');
    
    // Check the price is displayed
    cy.contains('\$249.99').should('be.visible');
    
    // Check the rating is displayed
    cy.get('div[role="img"]').should('be.visible');
    
    // Check the description is present
    cy.contains('Experience crystal clear sound').should('be.visible');
  });

  it('should allow selecting color and size', () => {
    // Select a color
    cy.contains('button', 'Black').click();
    cy.contains('button', 'Black').should('have.class', 'MuiChip-filled');
    
    // Select a size
    cy.contains('button', 'M').click();
    cy.contains('button', 'M').should('have.class', 'MuiChip-filled');
  });

  it('should change quantity', () => {
    // Check initial quantity is 1
    cy.contains('1').should('be.visible');
    
    // Increase quantity
    cy.get('button').contains('+').click();
    cy.contains('2').should('be.visible');
    
    // Decrease quantity
    cy.get('button').contains('-').click();
    cy.contains('1').should('be.visible');
    
    // Should not go below 1
    cy.get('button').contains('-').click();
    cy.contains('1').should('be.visible');
  });

  it('should add product to cart', () => {
    // Select color and size
    cy.contains('button', 'Black').click();
    cy.contains('button', 'M').click();
    
    // Click add to cart
    cy.contains('button', 'Add to Cart').click();
    
    // Wait for the API call
    cy.wait('@addToCart').then((interception) => {
      expect(interception.request.body).to.deep.equal({
        productId: '1',
        color: 'Black',
        size: 'M',
        quantity: 1,
      });
    });
    
    // Check for success message
    cy.contains('Product added to cart!').should('be.visible');
  });

  it('should show error when adding to cart without selection', () => {
    // Try to add to cart without selecting color and size
    cy.contains('button', 'Add to Cart').click();
    
    // Should show error message
    cy.contains('Please select color and size').should('be.visible');
  });

  it('should be accessible', () => {
    // Run accessibility tests
    cy.checkA11yWithLog();
    
    // Check for proper heading structure
    cy.get('h1').should('exist');
    
    // Check images have alt text
    cy.get('img:not([alt])').should('not.exist');
    
    // Check form elements have labels
    cy.get('button').each(($btn) => {
      cy.wrap($btn).should('have.attr', 'aria-label').or('have.text');
    });
  });

  it('should be responsive', () => {
    // Test on mobile
    cy.viewport('iphone-x');
    cy.get('h1').should('be.visible');
    
    // Test on tablet
    cy.viewport('ipad-2');
    cy.get('h1').should('be.visible');
    
    // Test on desktop
    cy.viewport('macbook-15');
    cy.get('h1').should('be.visible');
  });

  it('should handle API errors gracefully', () => {
    // Mock a failed API response
    cy.intercept('GET', '/api/products/1', {
      statusCode: 500,
      body: {
        error: 'Internal Server Error',
      },
    });
    
    // Reload the page to trigger the error
    cy.reload();
    
    // Check error message is displayed
    cy.contains('Error loading product').should('be.visible');
  });
});
