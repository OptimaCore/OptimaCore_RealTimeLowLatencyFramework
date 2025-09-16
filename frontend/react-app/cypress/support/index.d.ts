/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable<Subject = any> {
    /**
     * Check for accessibility issues using axe-core
     * @example
     * cy.checkA11yWithLog()
     */
    checkA11yWithLog(): Chainable<void>;

    /**
     * Log in a test user
     * @example
     * cy.login()
     * cy.login('user@example.com', 'password123')
     */
    login(email?: string, password?: string): Chainable<void>;

    /**
     * Add a product to the cart
     * @example
     * cy.addProductToCart()
     * cy.addProductToCart('123', 2)
     */
    addProductToCart(productId?: string, quantity?: number): Chainable<void>;

    /**
     * Check if an element is in the viewport
     * @example
     * cy.get('.my-element').isInViewport()
     */
    isInViewport(): Chainable<Subject>;

    /**
     * Wait for all images to load
     * @example
     * cy.waitForImages()
     */
    waitForImages(): Chainable<void>;

    /**
     * Set viewport size with a name
     * @example
     * cy.setViewport('mobile')
     * cy.setViewport('tablet')
     */
    setViewport(size: 'mobile' | 'tablet' | 'desktop' | 'large'): Chainable<void>;
  }
}
