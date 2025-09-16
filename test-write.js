const fs = require('fs');
const path = require('path');

const testDir = path.join(__dirname, 'results', 'analysis');
const testFile = path.join(testDir, 'test.txt');

// Create directory if it doesn't exist
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

// Try to write a file
try {
  fs.writeFileSync(testFile, 'Test content', 'utf8');
  console.log(`Successfully wrote to ${testFile}`);
  
  // Verify the file was created
  if (fs.existsSync(testFile)) {
    console.log(`File exists and contains: ${fs.readFileSync(testFile, 'utf8')}`);
  } else {
    console.log('File was not created');
  }
} catch (error) {
  console.error('Error writing file:', error);
}
