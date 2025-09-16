import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline, AppBar, Toolbar, Typography, Container, Box, Button } from '@mui/material';
import { ShoppingCart, Favorite } from '@mui/icons-material';
import ProductPage from './pages/ProductPage';
import { tracer } from './telemetry/tracing';

// Initialize telemetry
const App: React.FC = () => {
  // Start a root span for the application
  useEffect(() => {
    const rootSpan = tracer.startSpan('app-mount');
    
    return () => {
      rootSpan.end();
    };
  }, []);

  // Theme configuration
  const theme = createTheme({
    palette: {
      primary: {
        main: '#1976d2',
      },
      secondary: {
        main: '#dc004e',
      },
      background: {
        default: '#f5f5f5',
      },
    },
    typography: {
      fontFamily: [
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        '"Helvetica Neue"',
        'Arial',
        'sans-serif',
        '"Apple Color Emoji"',
        '"Segoe UI Emoji"',
        '"Segoe UI Symbol"',
      ].join(','),
      h1: {
        fontWeight: 500,
        fontSize: '2.5rem',
      },
      h2: {
        fontWeight: 500,
        fontSize: '2rem',
      },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 8,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            boxShadow: '0 4px 20px 0 rgba(0,0,0,0.05)',
            transition: 'transform 0.2s, box-shadow 0.2s',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 6px 24px 0 rgba(0,0,0,0.1)',
            },
          },
        },
      },
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          {/* Header */}
          <AppBar position="static" color="default" elevation={1}>
            <Container maxWidth="lg">
              <Toolbar disableGutters>
                <Typography
                  variant="h6"
                  component={Link}
                  to="/"
                  sx={{
                    flexGrow: 1,
                    fontWeight: 700,
                    color: 'inherit',
                    textDecoration: 'none',
                    '&:hover': {
                      color: theme.palette.primary.main,
                    },
                  }}
                >
                  OptimaStore
                </Typography>
                
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    color="inherit"
                    startIcon={<Favorite />}
                    component={Link}
                    to="/wishlist"
                    sx={{ minWidth: 'auto' }}
                  >
                    Wishlist
                  </Button>
                  <Button
                    color="inherit"
                    startIcon={<ShoppingCart />}
                    component={Link}
                    to="/cart"
                    sx={{ minWidth: 'auto' }}
                  >
                    Cart (0)
                  </Button>
                </Box>
              </Toolbar>
            </Container>
          </AppBar>

          {/* Main Content */}
          <Box component="main" sx={{ flex: 1, py: 4 }}>
            <Container maxWidth="lg">
              <Routes>
                <Route path="/" element={<ProductPage />} />
                <Route path="/product/:id" element={<ProductPage />} />
                {/* Add more routes as needed */}
              </Routes>
            </Container>
          </Box>

          {/* Footer */}
          <Box component="footer" sx={{ py: 3, mt: 'auto', backgroundColor: 'background.paper' }}>
            <Container maxWidth="lg">
              <Typography variant="body2" color="text.secondary" align="center">
                © {new Date().getFullYear()} OptimaStore. All rights reserved.
              </Typography>
            </Container>
          </Box>
        </Box>
      </Router>
    </ThemeProvider>
  );
};

export default App;
