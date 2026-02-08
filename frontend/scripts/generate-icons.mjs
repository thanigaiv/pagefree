import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const iconsDir = join(publicDir, 'icons');

// Read the SVG source
const svgPath = join(iconsDir, 'icon.svg');
const svgContent = readFileSync(svgPath, 'utf-8');

// Convert SVG buffer for sharp
const svgBuffer = Buffer.from(svgContent);

async function generateIcons() {
  console.log('Generating PWA icons from SVG...');

  // Generate 192x192 icon
  await sharp(svgBuffer, { density: 300 })
    .resize(192, 192)
    .png()
    .toFile(join(iconsDir, 'icon-192.png'));
  console.log('Generated: icons/icon-192.png (192x192)');

  // Generate 512x512 icon
  await sharp(svgBuffer, { density: 300 })
    .resize(512, 512)
    .png()
    .toFile(join(iconsDir, 'icon-512.png'));
  console.log('Generated: icons/icon-512.png (512x512)');

  // Generate 180x180 apple-touch-icon
  await sharp(svgBuffer, { density: 300 })
    .resize(180, 180)
    .png()
    .toFile(join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated: apple-touch-icon.png (180x180)');

  console.log('Done! All icons generated successfully.');
}

generateIcons().catch(console.error);
