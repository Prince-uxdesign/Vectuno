import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const svgPath = path.join(ROOT, 'public', 'app-icon.svg');
const publicDir = path.join(ROOT, 'public');

async function generateIcons() {
  const svgBuffer = fs.readFileSync(svgPath);

  // 192x192 standard icon
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'vectuno-pwa-192-v2.png'));
  console.log('Generated vectuno-pwa-192-v2.png');

  // 512x512 standard icon
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'vectuno-pwa-512-v2.png'));
  console.log('Generated vectuno-pwa-512-v2.png');

  // 180x180 Apple Touch Icon
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'vectuno-apple-touch-v2.png'));
  console.log('Generated vectuno-apple-touch-v2.png');

  // The master icon keeps the mark inside the platform-safe center zone
  // while its background remains full bleed for maskable launchers.
  const innerIcon = await sharp(svgBuffer)
    .resize(512, 512)
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: '#fffcfa' // Matches Vectuno warm canvas
    }
  })
    .composite([{ input: innerIcon, gravity: 'center' }])
    .png()
    .toFile(path.join(publicDir, 'vectuno-pwa-maskable-512-v2.png'));
  console.log('Generated vectuno-pwa-maskable-512-v2.png');
}

generateIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
