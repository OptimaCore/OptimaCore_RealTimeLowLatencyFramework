import { v4 as uuidv4 } from 'uuid';

// Mock product data
const mockProducts = [
  {
    id: '1',
    name: 'Premium Wireless Headphones',
    description: 'Experience crystal clear sound with our premium wireless headphones. Featuring noise cancellation, 30-hour battery life, and comfortable over-ear design.',
    price: 249.99,
    rating: 4.5,
    reviewCount: 128,
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80',
    category: 'Audio',
    inStock: true,
    colors: ['Black', 'Silver', 'Blue'],
    sizes: ['S', 'M', 'L'],
    details: {
      brand: 'AudioPro',
      model: 'X500',
      weight: '0.5kg',
      dimensions: '20 x 18 x 8 cm',
      connectivity: 'Bluetooth 5.0',
      batteryLife: '30 hours',
      features: [
        'Active Noise Cancellation',
        'Built-in Microphone',
        'Touch Controls',
        'Foldable Design',
        'Fast Charging'
      ]
    }
  },
  // Add more mock products as needed
];

// Simulate API delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock API service
export const mockApi = {
  // Get product by ID
  getProduct: async (productId: string) => {
    await delay(300 + Math.random() * 500); // Random delay between 300-800ms
    const product = mockProducts.find(p => p.id === productId);
    
    if (!product) {
      throw new Error('Product not found');
    }
    
    return product;
  },
  
  // Add product to cart
  addToCart: async (data: {
    productId: string;
    color: string;
    size: string;
    quantity: number;
  }) => {
    await delay(500 + Math.random() * 700); // Random delay between 500-1200ms
    
    // Simulate 10% chance of error
    if (Math.random() < 0.1) {
      throw new Error('Failed to add item to cart. Please try again.');
    }
    
    return {
      success: true,
      cartId: `cart_${uuidv4()}`,
      item: {
        id: `item_${uuidv4()}`,
        productId: data.productId,
        color: data.color,
        size: data.size,
        quantity: data.quantity,
        addedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };
  },
  
  // Get related products
  getRelatedProducts: async (productId: string) => {
    await delay(400 + Math.random() * 400); // Random delay between 400-800ms
    
    // Return a subset of products excluding the current one
    return mockProducts
      .filter(p => p.id !== productId)
      .slice(0, 3);
  },
  
  // Search products
  searchProducts: async (query: string) => {
    await delay(200 + Math.random() * 300); // Random delay between 200-500ms
    
    if (!query.trim()) {
      return [];
    }
    
    const searchTerm = query.toLowerCase();
    return mockProducts.filter(
      p => p.name.toLowerCase().includes(searchTerm) ||
           p.description.toLowerCase().includes(searchTerm)
    );
  },
  
  // Get product reviews
  getProductReviews: async (productId: string) => {
    await delay(500 + Math.random() * 500); // Random delay between 500-1000ms
    
    const reviews = [
      {
        id: `review_${uuidv4()}`,
        productId,
        author: 'Alex Johnson',
        rating: 5,
        title: 'Amazing sound quality!',
        comment: 'These headphones exceeded my expectations. The noise cancellation is incredible and the sound is crystal clear.',
        date: '2023-05-15T10:30:00Z',
        verified: true
      },
      {
        id: `review_${uuidv4()}`,
        productId,
        author: 'Sam Wilson',
        rating: 4,
        title: 'Great headphones with minor issues',
        comment: 'Overall great sound and comfort, but the ear cushions could be more breathable for long sessions.',
        date: '2023-06-22T14:45:00Z',
        verified: true
      },
      {
        id: `review_${uuidv4()}`,
        productId,
        author: 'Taylor Smith',
        rating: 5,
        title: 'Worth every penny',
        comment: 'The battery life is incredible and the sound quality is top-notch. Very comfortable for all-day use.',
        date: '2023-07-10T09:15:00Z',
        verified: false
      }
    ];
    
    return reviews;
  }
};

export default mockApi;
