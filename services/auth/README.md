# Authentication Service

This service provides JWT-based authentication with Azure Key Vault integration for secure secret management.

## Features

- JWT token generation and verification
- Role-based access control (RBAC)
- Refresh token mechanism
- Secure secret management with Azure Key Vault
- Local development fallback for secrets
- CORS support
- Comprehensive test coverage

## Setup

1. Install dependencies:
   ```bash
   npm install @azure/identity @azure/keyvault-secrets jsonwebtoken uuid
   ```

2. Set up environment variables (create a `.env` file):
   ```env
   # Azure Key Vault
   AZURE_KEY_VAULT_URI=https://your-keyvault.vault.azure.net/
   
   # JWT Configuration
   JWT_ISSUER=OptimaCore
   JWT_AUDIENCE=optima-client
   JWT_ACCESS_EXPIRES_IN=15m
   JWT_REFRESH_EXPIRES_IN=7d
   
   # CORS
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
   
   # Environment
   NODE_ENV=development
   ```

## Usage

### Authentication Flow

1. **Login** - Get access and refresh tokens:
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}'
   ```

2. **Access Protected Route** - Use the access token:
   ```bash
   curl -H "Authorization: Bearer <access_token>" \
     http://localhost:3000/api/protected
   ```

3. **Refresh Token** - Get a new access token:
   ```bash
   curl -X POST http://localhost:3000/api/auth/refresh \
     -H "Authorization: Bearer <refresh_token>"
   ```

### Middleware

Use the provided middleware to protect your routes:

```javascript
const { requireAuth, requireRole } = require('./middleware/auth');

// Protected route
app.get('/protected', requireAuth, (req, res) => {
  res.json({ message: 'Access granted', user: req.user });
});

// Admin-only route
app.get('/admin', requireRole('admin'), (req, res) => {
  res.json({ message: 'Admin access granted' });
});
```

## Key Vault Integration

### Setting Up Azure Key Vault

1. Create a Key Vault in the Azure Portal
2. Add the following secrets:
   - `jwt-private-key` - RSA private key for signing tokens
   - `jwt-public-key` - Corresponding public key
   - `jwt-key-id` - Key identifier (e.g., 'prod-key-1')

### Local Development

For local development, you can use the `.secrets.json` file in the project root:

```json
{
  "jwt-private-key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
  "jwt-public-key": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
  "jwt-key-id": "local-dev-key"
}
```

## Testing

Run the test suite:

```bash
npm test tests/auth.test.js
```

Or start the test server:

```bash
node tests/test-server.js
```

## Security Considerations

- Always use HTTPS in production
- Store sensitive configuration in environment variables or Key Vault
- Rotate signing keys regularly
- Set appropriate token expiration times
- Implement rate limiting on authentication endpoints
- Use HTTP-only cookies for refresh tokens
- Enable CORS only for trusted origins

## License

This project is licensed under the MIT License.

## Troubleshooting

### Common Issues

1. **Key Vault Access Denied**
   - Ensure your Azure CLI or managed identity has the correct RBAC roles
   - Run `az login` if using local development

2. **Token Verification Failed**
   - Check that the public/private key pair matches
   - Verify the issuer and audience match between token creation and verification

3. **CORS Issues**
   - Ensure the client's origin is included in `ALLOWED_ORIGINS`
   - Check that credentials are included in the request if using cookies

For additional help, check the logs or open an issue.
