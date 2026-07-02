const { createCanvas } = require('canvas');
const fs = require('fs');

function generateFavicon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  const scale = size / 32;
  
  // Background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, size, size);
  
  // Glider pattern
  ctx.fillStyle = '#6ab4ff';
  ctx.fillRect(12 * scale, 4 * scale, 8 * scale, 8 * scale);
  ctx.fillRect(20 * scale, 12 * scale, 8 * scale, 8 * scale);
  ctx.fillRect(4 * scale, 20 * scale, 8 * scale, 8 * scale);
  ctx.fillRect(12 * scale, 20 * scale, 8 * scale, 8 * scale);
  ctx.fillRect(20 * scale, 20 * scale, 8 * scale, 8 * scale);
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buffer);
  console.log(`Generated ${filename}`);
}

// Generate all favicon sizes
generateFavicon(16, 'favicon-16.png');
generateFavicon(32, 'favicon-32.png');
generateFavicon(180, 'favicon-180.png');
generateFavicon(192, 'favicon-192.png');
generateFavicon(512, 'favicon-512.png');

console.log('All favicons generated!');
