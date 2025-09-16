import React, { useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Card, 
  CardContent, 
  CardMedia, 
  Grid, 
  Button, 
  CircularProgress,
  Alert,
  Box,
  Rating,
  Chip,
  Divider
} from '@mui/material';
import { ShoppingCart, Favorite, Share } from '@mui/icons-material';
import useApi from '../hooks/useApi';

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
}

const ProductPage: React.FC = () => {
  const { data: product, loading, error, fetchData } = useApi<Product>();
  const [selectedColor, setSelectedColor] = React.useState<string>('');
  const [selectedSize, setSelectedSize] = React.useState<string>('');
  const [quantity, setQuantity] = React.useState<number>(1);

  useEffect(() => {
    // Fetch product data when component mounts
    fetchData({
      url: '/api/products/1', // Replace with your actual API endpoint
      method: 'GET',
    }, 'fetch-product');
  }, [fetchData]);

  const handleAddToCart = async () => {
    if (!selectedColor || !selectedSize) {
      alert('Please select color and size');
      return;
    }
    
    try {
      await fetchData({
        url: '/api/cart',
        method: 'POST',
        data: {
          productId: product?.id,
          color: selectedColor,
          size: selectedSize,
          quantity,
        },
      }, 'add-to-cart');
      
      alert('Product added to cart!');
    } catch (err) {
      console.error('Failed to add to cart:', err);
    }
  };

  if (loading && !product) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error">Error loading product: {error}</Alert>
      </Container>
    );
  }

  // Mock data in case API is not available
  const mockProduct: Product = {
    id: '1',
    name: 'Premium Wireless Headphones',
    description: 'Experience crystal clear sound with our premium wireless headphones. Featuring noise cancellation, 30-hour battery life, and comfortable over-ear design.',
    price: 249.99,
    rating: 4.5,
    reviewCount: 128,
    image: 'https://via.placeholder.com/600x400?text=Premium+Headphones',
    category: 'Audio',
    inStock: true,
    colors: ['Black', 'Silver', 'Blue'],
    sizes: ['S', 'M', 'L']
  };

  const displayProduct = product || mockProduct;

  return (
    <Container maxWidth="lg" sx={{ my: 4 }}>
      <Grid container spacing={4}>
        {/* Product Image */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardMedia
              component="img"
              image={displayProduct.image}
              alt={displayProduct.name}
              sx={{
                height: '100%',
                objectFit: 'contain',
                p: 2,
                backgroundColor: '#f5f5f5'
              }}
            />
          </Card>
        </Grid>

        {/* Product Details */}
        <Grid item xs={12} md={6}>
          <Typography variant="h4" component="h1" gutterBottom>
            {displayProduct.name}
          </Typography>
          
          <Box display="flex" alignItems="center" mb={2}>
            <Rating value={displayProduct.rating} precision={0.5} readOnly />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              {displayProduct.rating} ({displayProduct.reviewCount} reviews)
            </Typography>
          </Box>

          <Typography variant="h5" color="primary" gutterBottom>
            ${displayProduct.price.toFixed(2)}
          </Typography>

          <Typography variant="body1" paragraph sx={{ my: 3 }}>
            {displayProduct.description}
          </Typography>

          <Divider sx={{ my: 3 }} />

          {/* Color Selection */}
          <Box mb={3}>
            <Typography variant="subtitle1" gutterBottom>
              Color: {selectedColor || 'Select a color'}
            </Typography>
            <Box display="flex" gap={1} flexWrap="wrap">
              {displayProduct.colors.map((color) => (
                <Chip
                  key={color}
                  label={color}
                  onClick={() => setSelectedColor(color)}
                  variant={selectedColor === color ? 'filled' : 'outlined'}
                  color={selectedColor === color ? 'primary' : 'default'}
                  sx={{ 
                    minWidth: 80,
                    cursor: 'pointer',
                    border: `2px solid ${selectedColor === color ? 'primary.main' : 'transparent'}`
                  }}
                />
              ))}
            </Box>
          </Box>

          {/* Size Selection */}
          <Box mb={4}>
            <Typography variant="subtitle1" gutterBottom>
              Size: {selectedSize || 'Select a size'}
            </Typography>
            <Box display="flex" gap={1} flexWrap="wrap">
              {displayProduct.sizes.map((size) => (
                <Chip
                  key={size}
                  label={size}
                  onClick={() => setSelectedSize(size)}
                  variant={selectedSize === size ? 'filled' : 'outlined'}
                  color={selectedSize === size ? 'primary' : 'default'}
                  sx={{ 
                    minWidth: 50,
                    cursor: 'pointer',
                    border: `2px solid ${selectedSize === size ? 'primary.main' : 'transparent'}`
                  }}
                />
              ))}
            </Box>
          </Box>

          {/* Quantity */}
          <Box display="flex" alignItems="center" mb={4}>
            <Typography variant="subtitle1" sx={{ mr: 2 }}>
              Quantity:
            </Typography>
            <Button 
              variant="outlined" 
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
            >
              -
            </Button>
            <Typography variant="body1" sx={{ mx: 2 }}>
              {quantity}
            </Typography>
            <Button 
              variant="outlined" 
              onClick={() => setQuantity(quantity + 1)}
            >
              +
            </Button>
          </Box>

          {/* Action Buttons */}
          <Box display="flex" gap={2} flexWrap="wrap">
            <Button
              variant="contained"
              size="large"
              startIcon={<ShoppingCart />}
              onClick={handleAddToCart}
              disabled={!displayProduct.inStock || !selectedColor || !selectedSize}
              fullWidth
              sx={{ py: 1.5 }}
            >
              {displayProduct.inStock ? 'Add to Cart' : 'Out of Stock'}
            </Button>
            
            <Button
              variant="outlined"
              size="large"
              startIcon={<Favorite />}
              fullWidth
              sx={{ py: 1.5 }}
            >
              Add to Wishlist
            </Button>
            
            <Button
              variant="text"
              size="large"
              startIcon={<Share />}
              fullWidth
              sx={{ py: 1.5 }}
            >
              Share
            </Button>
          </Box>

          {/* Product Details */}
          <Box mt={4}>
            <Typography variant="h6" gutterBottom>
              Product Details
            </Typography>
            <ul>
              <li>Wireless Bluetooth connectivity</li>
              <li>Active Noise Cancellation</li>
              <li>30-hour battery life</li>
              <li>Built-in microphone with call controls</li>
              <li>Comfortable over-ear design</li>
              <li>Includes carrying case and charging cable</li>
            </ul>
          </Box>
        </Grid>
      </Grid>
    </Container>
  );
};

export default ProductPage;
