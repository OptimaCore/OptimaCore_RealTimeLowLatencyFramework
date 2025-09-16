<template>
  <div class="product-page">
    <!-- Loading State -->
    <div v-if="loading && !product" class="loading-container">
      <div class="loading-spinner"></div>
      <p>Loading product details...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-container">
      <p class="error-message">Error: {{ error }}</p>
      <button @click="fetchProduct" class="retry-button">Retry</button>
    </div>

    <!-- Product Content -->
    <div v-else class="product-content">
      <div class="product-gallery">
        <img 
          :src="product?.image || 'https://via.placeholder.com/600x400?product=image+not+found'" 
          :alt="product?.name || 'Product image'"
          class="product-image"
        />
      </div>
      
      <div class="product-details">
        <h1 class="product-title">{{ product?.name || 'Product Name' }}</h1>
        
        <div class="product-rating">
          <div class="stars">
            <span v-for="i in 5" :key="i" class="star">
              {{ i <= Math.round(product?.rating || 0) ? '★' : '☆' }}
            </span>
          </div>
          <span class="review-count">({{ product?.reviewCount || 0 }} reviews)</span>
        </div>
        
        <p class="product-price">${{ product?.price?.toFixed(2) || '0.00' }}</p>
        
        <p class="product-description">
          {{ product?.description || 'No description available' }}
        </p>
        
        <div class="product-options">
          <div class="option-group">
            <h3>Color</h3>
            <div class="color-options">
              <button
                v-for="color in product?.colors || []"
                :key="color"
                @click="selectColor(color)"
                :class="['color-option', { 'selected': selectedColor === color }]"
                :style="{ backgroundColor: color.toLowerCase() }"
                :aria-label="`Select color ${color}`"
              ></button>
            </div>
            <p v-if="!product?.colors?.length" class="no-options">No colors available</p>
          </div>
          
          <div class="option-group">
            <h3>Size</h3>
            <div class="size-options">
              <button
                v-for="size in product?.sizes || []"
                :key="size"
                @click="selectSize(size)"
                :class="['size-option', { 'selected': selectedSize === size }]"
              >
                {{ size }}
              </button>
            </div>
            <p v-if="!product?.sizes?.length" class="no-options">No sizes available</p>
          </div>
          
          <div class="quantity-selector">
            <h3>Quantity</h3>
            <div class="quantity-controls">
              <button 
                @click="decreaseQuantity" 
                :disabled="quantity <= 1"
                aria-label="Decrease quantity"
              >
                -
              </button>
              <span class="quantity">{{ quantity }}</span>
              <button 
                @click="increaseQuantity"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>
        </div>
        
        <div class="action-buttons">
          <button 
            @click="addToCart" 
            :disabled="!canAddToCart" 
            class="add-to-cart"
          >
            Add to Cart
          </button>
          <button class="wishlist-button">
            <span>♡</span> Add to Wishlist
          </button>
        </div>
        
        <div class="product-specs">
          <h3>Product Details</h3>
          <ul>
            <li v-if="product?.details?.brand"><strong>Brand:</strong> {{ product.details.brand }}</li>
            <li v-if="product?.details?.model"><strong>Model:</strong> {{ product.details.model }}</li>
            <li v-if="product?.details?.weight"><strong>Weight:</strong> {{ product.details.weight }}</li>
            <li v-if="product?.details?.dimensions"><strong>Dimensions:</strong> {{ product.details.dimensions }}</li>
            <li v-if="product?.details?.connectivity"><strong>Connectivity:</strong> {{ product.details.connectivity }}</li>
            <li v-if="product?.details?.batteryLife"><strong>Battery Life:</strong> {{ product.details.batteryLife }}</li>
          </ul>
          
          <div v-if="product?.details?.features?.length" class="features">
            <h4>Features:</h4>
            <ul>
              <li v-for="(feature, index) in product.details.features" :key="index">
                {{ feature }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useApi } from '@/composables/useApi';

interface ProductDetails {
  brand?: string;
  model?: string;
  weight?: string;
  dimensions?: string;
  connectivity?: string;
  batteryLife?: string;
  features?: string[];
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  rating: number;
  reviewCount: number;
  image: string;
  category: string;
  inStock: boolean;
  colors: string[];
  sizes: string[];
  details: ProductDetails;
}

const route = useRoute();
const productId = route.params.id as string;

// Product data
const product = ref<Product | null>(null);
const selectedColor = ref('');
const selectedSize = ref('');
const quantity = ref(1);

// API composable
const { data, loading, error, execute } = useApi<Product>();

// Computed properties
const canAddToCart = computed(() => {
  return selectedColor.value && selectedSize.value && product.value?.inStock;
});

// Methods
const fetchProduct = async () => {
  await execute({
    method: 'GET',
    url: `/products/${productId}`,
  });
  
  if (data.value) {
    product.value = data.value;
    // Set default selections
    if (product.value.colors?.length) {
      selectedColor.value = product.value.colors[0];
    }
    if (product.value.sizes?.length) {
      selectedSize.value = product.value.sizes[0];
    }
  }
};

const selectColor = (color: string) => {
  selectedColor.value = color;
};

const selectSize = (size: string) => {
  selectedSize.value = size;
};

const increaseQuantity = () => {
  quantity.value += 1;
};

const decreaseQuantity = () => {
  if (quantity.value > 1) {
    quantity.value -= 1;
  }
};

const addToCart = async () => {
  if (!canAddToCart.value) return;
  
  try {
    await execute({
      method: 'POST',
      url: '/cart',
      data: {
        productId: product.value?.id,
        color: selectedColor.value,
        size: selectedSize.value,
        quantity: quantity.value,
      },
    }, 'add-to-cart');
    
    // Show success message
    alert('Product added to cart!');
    
    // Reset quantity
    quantity.value = 1;
  } catch (err) {
    console.error('Failed to add to cart:', err);
  }
};

// Lifecycle hooks
onMounted(() => {
  fetchProduct();
});
</script>

<style scoped>
.product-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  text-align: center;
}

.loading-spinner {
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top: 4px solid #3498db;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  color: #e74c3c;
  margin-bottom: 1rem;
}

.retry-button {
  padding: 0.5rem 1rem;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.retry-button:hover {
  background-color: #2980b9;
}

.product-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  margin-top: 2rem;
}

.product-gallery {
  position: sticky;
  top: 2rem;
}

.product-image {
  width: 100%;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.product-details {
  padding: 0 1rem;
}

.product-title {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  color: #333;
}

.product-rating {
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
}

.stars {
  color: #f1c40f;
  margin-right: 0.5rem;
}

.review-count {
  color: #7f8c8d;
  font-size: 0.9rem;
}

.product-price {
  font-size: 1.8rem;
  font-weight: bold;
  color: #2c3e50;
  margin: 1rem 0;
}

.product-description {
  color: #555;
  line-height: 1.6;
  margin-bottom: 2rem;
}

.option-group {
  margin-bottom: 1.5rem;
}

.option-group h3 {
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
  color: #2c3e50;
}

.color-options,
.size-options {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

.color-option {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.2s, border-color 0.2s;
}

.color-option.selected {
  border-color: #2c3e50;
  transform: scale(1.1);
  box-shadow: 0 0 0 2px white, 0 0 0 4px #2c3e50;
}

.size-option {
  min-width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ddd;
  border-radius: 4px;
  background-color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.size-option.selected,
.size-option:hover {
  background-color: #2c3e50;
  color: white;
  border-color: #2c3e50;
}

.quantity-selector {
  margin: 2rem 0;
}

.quantity-controls {
  display: flex;
  align-items: center;
  margin-top: 0.5rem;
}

.quantity-controls button {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  background-color: #f8f9fa;
  border: 1px solid #ddd;
  cursor: pointer;
  transition: background-color 0.2s;
}

.quantity-controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.quantity {
  width: 40px;
  text-align: center;
  font-size: 1rem;
  margin: 0 0.5rem;
}

.action-buttons {
  display: flex;
  gap: 1rem;
  margin: 2rem 0;
}

.add-to-cart,
.wishlist-button {
  flex: 1;
  padding: 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.add-to-cart {
  background-color: #2c3e50;
  color: white;
}

.add-to-cart:disabled {
  background-color: #bdc3c7;
  cursor: not-allowed;
}

.add-to-cart:not(:disabled):hover {
  background-color: #1a252f;
  transform: translateY(-1px);
}

.wishlist-button {
  background-color: white;
  border: 1px solid #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.wishlist-button:hover {
  background-color: #f8f9fa;
  border-color: #ccc;
}

.product-specs {
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid #eee;
}

.product-specs h3 {
  margin-bottom: 1rem;
  color: #2c3e50;
}

.product-specs ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.product-specs li {
  margin-bottom: 0.5rem;
  color: #555;
}

.features {
  margin-top: 1.5rem;
}

.features h4 {
  margin-bottom: 0.5rem;
  color: #2c3e50;
}

/* Responsive styles */
@media (max-width: 768px) {
  .product-content {
    grid-template-columns: 1fr;
  }
  
  .product-gallery {
    position: static;
    margin-bottom: 2rem;
  }
  
  .action-buttons {
    flex-direction: column;
  }
  
  .add-to-cart,
  .wishlist-button {
    width: 100%;
  }
}
</style>
