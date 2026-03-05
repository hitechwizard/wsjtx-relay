#!/usr/bin/env node

/**
 * Generate Windows ICO file from SVG source with all required sizes.
 * Creates icon.ico with 16x16, 32x32, 48x48, 64x64, 128x128, and 256x256 sizes.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const imageToIco = require('image-to-ico');

async function generateWindowsIcon() {
  const svgSource = path.join(__dirname, '..', 'assets', 'icon-source.svg');
  const outputPath = path.join(__dirname, '..', 'assets', 'icon.ico');

  // Windows icon sizes
  const sizes = [16, 32, 48, 64, 128, 256];

  if (!fs.existsSync(svgSource)) {
    console.error(`Error: SVG source not found at ${svgSource}`);
    process.exit(1);
  }

  console.log(`Converting '${path.basename(svgSource)}' to Windows ICO with sizes: ${sizes.join(', ')}`);

  try {
    // Generate PNG buffers for each size
    const images = [];

    for (const size of sizes) {
      process.stdout.write(`  Generating ${size}x${size}... `);

      const pngBuffer = await sharp(svgSource)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toBuffer();

      images.push(pngBuffer);
      console.log('✓');
    }

    // Generate ICO file from PNG buffers using the primary image
    // Use the largest image as primary and downsize as necessary
    const icoBuffer = await imageToIco(images);
    fs.writeFileSync(outputPath, icoBuffer);

    const fileSize = fs.statSync(outputPath).size;
    console.log(`\n✓ Successfully created: ${outputPath}`);
    console.log(`  File size: ${(fileSize / 1024).toFixed(2)} KB`);
    console.log(`  Included ${images.length} different sizes`);
  } catch (error) {
    console.error('Error generating icon:', error.message);
    process.exit(1);
  }
}

// Run the generator
generateWindowsIcon();
