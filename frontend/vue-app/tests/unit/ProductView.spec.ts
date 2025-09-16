import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { createRouter, createWebHistory } from 'vue-router';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { useApi } from '@/composables/useApi';
import ProductView from '@/views/ProductView.vue';
import { mockProduct } from '../mocks/mockProduct';

// Mock the useApi composable
vi.mock('@/composables/useApi', () => ({
  useApi: vi.fn(() => ({
    data: { value: mockProduct },
    loading: { value: false },
    error: { value: null },
    execute: vi.fn().mockResolvedValue({ data: mockProduct })
  }))
}));

// Mock the API calls
vi.mock('@/composables/useApi', () => ({
  useApi: vi.fn(() => ({
    data: { value: mockProduct },
    loading: { value: false },
    error: { value: null },
    execute: vi.fn().mockResolvedValue({ data: mockProduct })
  }))
}));

describe('ProductView', () => {
  let router;
  let wrapper;
  
  beforeAll(async () => {
    // Create a test app with router and pinia
    const app = createApp({});
    const pinia = createPinia();
    
    router = createRouter({
      history: createWebHistory(),
      routes: [
        {
          path: '/product/:id',
          name: 'product',
          component: ProductView,
          props: true
        }
      ]
    });
    
    app.use(router);
    app.use(pinia);
    
    await router.push('/product/1');
    await router.isReady();
  });

  const createWrapper = () => {
    return mount(ProductView, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            stubActions: false,
          }),
          router
        ],
        stubs: ['RouterLink', 'FontAwesomeIcon']
      },
      props: {
        id: '1'
      }
    });
  };

  it('renders product details correctly', async () => {
    wrapper = createWrapper();
    
    // Wait for async operations to complete
    await flushPromises();
    await wrapper.vm.$nextTick();
    
    // Check if product details are rendered
    expect(wrapper.find('.product-title').text()).toContain(mockProduct.name);
    expect(wrapper.find('.product-price').text()).toContain(mockProduct.price.toFixed(2));
    expect(wrapper.find('.product-description').text()).toContain(mockProduct.description);
    
    // Check if color options are rendered
    const colorOptions = wrapper.findAll('.color-option');
    expect(colorOptions.length).toBe(mockProduct.colors.length);
    
    // Check if size options are rendered
    const sizeOptions = wrapper.findAll('.size-option');
    expect(sizeOptions.length).toBe(mockProduct.sizes.length);
  });

  it('allows selecting color and size', async () => {
    wrapper = createWrapper();
    await flushPromises();
    await wrapper.vm.$nextTick();
    
    // Select a color
    const colorOption = wrapper.find('.color-option');
    await colorOption.trigger('click');
    expect(colorOption.classes()).toContain('selected');
    
    // Select a size
    const sizeOption = wrapper.find('.size-option');
    await sizeOption.trigger('click');
    expect(sizeOption.classes()).toContain('selected');
  });

  it('allows changing quantity', async () => {
    wrapper = createWrapper();
    await flushPromises();
    await wrapper.vm.$nextTick();
    
    // Initial quantity should be 1
    expect(wrapper.find('.quantity').text()).toBe('1');
    
    // Increase quantity
    const increaseButton = wrapper.findAll('.quantity-controls button').at(1);
    await increaseButton.trigger('click');
    expect(wrapper.find('.quantity').text()).toBe('2');
    
    // Decrease quantity
    const decreaseButton = wrapper.find('.quantity-controls button');
    await decreaseButton.trigger('click');
    expect(wrapper.find('.quantity').text()).toBe('1');
    
    // Should not go below 1
    await decreaseButton.trigger('click');
    expect(wrapper.find('.quantity').text()).toBe('1');
  });

  it('disables add to cart button when no color or size is selected', async () => {
    wrapper = createWrapper();
    await flushPromises();
    await wrapper.vm.$nextTick();
    
    // Initially disabled
    const addToCartButton = wrapper.find('.add-to-cart');
    expect(addToCartButton.attributes('disabled')).toBeDefined();
    
    // Select color
    await wrapper.find('.color-option').trigger('click');
    expect(addToCartButton.attributes('disabled')).toBeDefined();
    
    // Select size
    await wrapper.find('.size-option').trigger('click');
    expect(addToCartButton.attributes('disabled')).toBeUndefined();
  });

  it('shows loading state', async () => {
    // Mock loading state
    (useApi as jest.Mock).mockReturnValue({
      data: { value: null },
      loading: { value: true },
      error: { value: null },
      execute: vi.fn()
    });
    
    wrapper = createWrapper();
    await flushPromises();
    expect(wrapper.find('.loading-container').exists()).toBe(true);
    expect(wrapper.find('.loading-spinner').exists()).toBe(true);
  });

  it('shows error state', async () => {
    // Mock error state
    (useApi as jest.Mock).mockReturnValue({
      data: { value: null },
      loading: { value: false },
      error: { value: 'Failed to load product' },
      execute: vi.fn()
    });
    
    wrapper = createWrapper();
    await flushPromises();
    expect(wrapper.find('.error-container').exists()).toBe(true);
    expect(wrapper.find('.error-message').text()).toContain('Failed to load product');
  });
});
