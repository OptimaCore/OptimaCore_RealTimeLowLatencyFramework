import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { routes } from '@/router';
import App from '@/App.vue';
import { mockProduct } from '../mocks/mockProduct';
import { server } from '../mocks/server';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Extend the mock server with additional routes for this test
const testServer = setupServer(
  ...server.handlers,
  http.get('/api/products/1', () => {
    return HttpResponse.json(mockProduct);
  }),
  http.post('/api/cart', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
      success: true,
      cartId: 'test-cart-123',
      item: {
        id: 'test-item-123',
        productId: body.productId,
        color: body.color,
        size: body.size,
        quantity: body.quantity,
        addedAt: new Date().toISOString()
      }
    });
  })
);

describe('Product Page Integration', () => {
  let wrapper;
  let router;
  
  beforeAll(async () => {
    testServer.listen({ onUnhandledRequest: 'error' });
    
    // Create a test router
    router = createRouter({
      history: createWebHistory(),
      routes
    });
    
    // Navigate to the product page
    await router.push('/product/1');
    await router.isReady();
    
    // Mount the app with router and pinia
    wrapper = mount(App, {
      global: {
        plugins: [
          createPinia(),
          router
        ]
      }
    });
    
    // Wait for initial data loading
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  afterAll(() => {
    testServer.close();
  });
  
  it('loads and displays product details', async () => {
    // Check if product details are displayed
    expect(wrapper.find('.product-title').text()).toContain(mockProduct.name);
    expect(wrapper.find('.product-price').text()).toContain(mockProduct.price.toFixed(2));
  });
  
  it('allows selecting product options and adding to cart', async () => {
    // Select a color
    const colorOption = wrapper.find('.color-option');
    await colorOption.trigger('click');
    expect(colorOption.classes()).toContain('selected');
    
    // Select a size
    const sizeOption = wrapper.find('.size-option');
    await sizeOption.trigger('click');
    expect(sizeOption.classes()).toContain('selected');
    
    // Increase quantity
    const increaseButton = wrapper.findAll('.quantity-controls button').at(1);
    await increaseButton.trigger('click');
    expect(wrapper.find('.quantity').text()).toBe('2');
    
    // Mock the window.alert function
    const alertMock = vi.fn();
    window.alert = alertMock;
    
    // Click add to cart
    const addToCartButton = wrapper.find('.add-to-cart');
    await addToCartButton.trigger('click');
    
    // Wait for the API call to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check if the success alert was shown
    expect(alertMock).toHaveBeenCalledWith('Product added to cart!');
  });
  
  it('shows loading state while fetching data', async () => {
    // Navigate away and back to trigger loading state
    await router.push('/');
    await router.push('/product/1');
    
    // Check if loading state is shown
    expect(wrapper.find('.loading-container').exists()).toBe(true);
    
    // Wait for data to load
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check if product is displayed after loading
    expect(wrapper.find('.product-title').exists()).toBe(true);
  });
  
  it('handles API errors gracefully', async () => {
    // Mock a failing API request
    testServer.use(
      http.get('/api/products/1', () => {
        return new HttpResponse(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      })
    );
    
    // Navigate to trigger a new request
    await router.push('/product/1');
    
    // Wait for the error state
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check if error message is displayed
    expect(wrapper.find('.error-container').exists()).toBe(true);
    expect(wrapper.find('.error-message').text()).toContain('Failed to load product');
    
    // Reset the mock
    testServer.resetHandlers();
  });
});
