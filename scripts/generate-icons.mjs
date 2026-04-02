/**
 * Generate all icon assets from logo.svg
 * Usage: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const svgPath = resolve(root, 'src-tauri/icons/logo.svg');
const svgSmallPath = resolve(root, 'src-tauri/icons/logo-small.svg');
const svg = readFileSync(svgPath);
const svgSmall = readFileSync(svgSmallPath);

// Small sizes use simplified SVG (single petal + dot) for legibility
const targets = [
  // Tauri icons (src-tauri/icons/) — small sizes use simplified SVG
  { path: 'src-tauri/icons/icon-16.png',  size: 16,  small: true },
  { path: 'src-tauri/icons/icon-32.png',  size: 32,  small: true },
  { path: 'src-tauri/icons/icon-48.png',  size: 48,  small: true },
  { path: 'src-tauri/icons/icon-256.png', size: 256 },
  { path: 'src-tauri/icons/icon-512.png', size: 512 },

  // Web / docs icons
  { path: 'docs/favicon.png',          size: 32 },
  { path: 'docs/apple-touch-icon.png', size: 180 },
  { path: 'docs/icon-256.png',         size: 256 },
  { path: 'docs/icon-512.png',         size: 512 },
];

console.log('Generating PNGs from logo.svg + logo-small.svg...\n');

for (const t of targets) {
  const out = resolve(root, t.path);
  const source = t.small ? svgSmall : svg;
  await sharp(source, { density: Math.max(300, t.size * 2) })
    .resize(t.size, t.size)
    .png()
    .toFile(out);
  console.log(`  ${t.size.toString().padStart(4)}px -> ${t.path} ${t.small ? '(simplified)' : ''}`);
}

// Generate multi-resolution .ico (16, 32, 48, 256)
console.log('\nGenerating multi-resolution icon.ico...');
const icoSizes = [16, 32, 48, 256];
const icoPngs = icoSizes.map(s =>
  resolve(root, `src-tauri/icons/icon-${s}.png`)
);
const icoBuffer = await pngToIco(icoPngs);
writeFileSync(resolve(root, 'src-tauri/icons/icon.ico'), icoBuffer);
console.log(`  icon.ico (${icoSizes.join(', ')}px)`);

// Copy favicon to docs/site/ if it exists
try {
  const siteDir = resolve(root, 'docs/site');
  writeFileSync(resolve(siteDir, 'favicon.png'),
    readFileSync(resolve(root, 'docs/favicon.png')));
  writeFileSync(resolve(siteDir, 'icon-256.png'),
    readFileSync(resolve(root, 'docs/icon-256.png')));
  console.log('\n  Copied to docs/site/');
} catch { /* docs/site may not exist */ }

console.log('\nDone! All icons generated from single SVG source.');
