// Generate simple placeholder icons
const fs = require('fs');
const { createCanvas } = require('canvas');

[16, 48, 128].forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, size, size);
  
  // Link symbol
  ctx.fillStyle = '#4a4';
  ctx.beginPath();
  const s = size / 4;
  ctx.arc(size/2 - s/2, size/2, s, 0, Math.PI * 2);
  ctx.arc(size/2 + s/2, size/2, s, 0, Math.PI * 2);
  ctx.fill();
  
  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`icon${size}.png`, buffer);
  console.log(`Created icon${size}.png`);
});
