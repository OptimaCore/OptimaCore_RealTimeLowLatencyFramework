import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { mockProduct } from './mockProduct';

// Setup request interception using MSW
const handlers = [
  // Get product by ID
  http.get('/api/products/:id', ({ params }) => {
    const { id } = params;
    if (id === '1') {
      return HttpResponse.json(mockProduct);
    }
    return new HttpResponse(
      JSON.stringify({ error: 'Product not found' }),
      { status: 404 }
    );
  }),
  
  // Add to cart
  http.post('/api/cart', async ({ request }) => {
    const { productId, color, size, quantity } = await request.json() as {
      productId: string;
      color: string;
      size: string;
      quantity: number;
    };
    
    if (!productId || !color || !size || !quantity) {
      return new HttpResponse(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400 }
      );
    }
    
    return HttpResponse.json({
      success: true,
      cartId: `cart_${Date.now()}`,
      item: {
        id: `item_${Date.now()}`,
        productId,
        color,
        size,
        quantity,
        addedAt: new Date().toISOString(),
      },
    });
  }),
  
  // Get related products
  http.get('/api/products/:id/related', () => {
    // Return a subset of products excluding the current one
    const relatedProducts = [
      { ...mockProduct, id: '2', name: 'Related Product 1' },
      { ...mockProduct, id: '3', name: 'Related Product 2' },
    ];
    
    return HttpResponse.json(relatedProducts);
  }),
  
  // Get product reviews
  http.get('/api/products/:id/reviews', ({ params }) => {
    const reviews = [
      {
        id: `review_${Date.now()}`,
        productId: params.id,
        author: 'Test User',
        rating: 5,
        title: 'Great product!',
        comment: 'I love this product!',
        date: new Date().toISOString(),
        verified: true
      }
    ];
    
    return HttpResponse.json(reviews);
  })
];

export const server = setupServer(...handlers);

// Enable API mocking before tests.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// Reset any runtime request handlers we may add during the tests.
afterEach(() => server.resetHandlers());

// Disable API mocking after the tests are done.
afterAll(() => server.close());
