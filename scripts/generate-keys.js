const fs = require('fs');
const path = require('path');
const { generateKeyPairSync } = require('crypto');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

const KEY_DIR = path.join(__dirname, '..', 'secrets');
const PRIVATE_KEY_PATH = path.join(KEY_DIR, 'private.key');
const PUBLIC_KEY_PATH = path.join(KEY_DIR, 'public.key');

async function generateKeys() {
  try {
    // Create secrets directory if it doesn't exist
    if (!fs.existsSync(KEY_DIR)) {
      await mkdir(KEY_DIR, { recursive: true });
      console.log(`Created directory: ${KEY_DIR}`);
    }

    // Generate RSA key pair
    console.log('Generating RSA key pair...');
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: 'temporary-passphrase' // In production, use a secure passphrase
      }
    });

    // Write keys to files
    await writeFile(PRIVATE_KEY_PATH, privateKey, 'utf8');
    await writeFile(PUBLIC_KEY_PATH, publicKey, 'utf8');

    console.log('RSA key pair generated successfully!');
    console.log(`Private key: ${PRIVATE_KEY_PATH}`);
    console.log(`Public key: ${PUBLIC_KEY_PATH}`);
    
    // Add .gitignore entry for the secrets directory
    const gitignorePath = path.join(__dirname, '..', '.gitignore');
    const gitignoreContent = fs.existsSync(gitignorePath) 
      ? fs.readFileSync(gitignorePath, 'utf8') 
      : '';
      
    if (!gitignoreContent.includes('secrets/')) {
      fs.appendFileSync(gitignorePath, '\n# Local secrets\nsecrets/\n');
      console.log('Added secrets/ to .gitignore');
    }

  } catch (error) {
    console.error('Error generating keys:', error);
    process.exit(1);
  }
}

generateKeys();
