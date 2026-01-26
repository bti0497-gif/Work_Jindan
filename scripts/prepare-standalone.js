const fs = require('fs');
const path = require('path');

const sourceStatic = path.join(__dirname, '../.next/static');
const destStatic = path.join(__dirname, '../.next/standalone/.next/static');

const sourcePublic = path.join(__dirname, '../public');
const destPublic = path.join(__dirname, '../.next/standalone/public');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Preparing standalone build...');

// Copy .next/static to .next/standalone/.next/static
console.log('Copying static files...');
copyDir(sourceStatic, destStatic);

// Copy public to .next/standalone/public
console.log('Copying public files...');
copyDir(sourcePublic, destPublic);

console.log('Standalone build preparation complete.');
