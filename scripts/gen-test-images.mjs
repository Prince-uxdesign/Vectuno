import sharp from "sharp";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "test", "fixtures");
mkdirSync(OUT, { recursive: true });

const svgWrap = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

async function fromSvgBuffer(svg, w, h) {
  return sharp(Buffer.from(svg), { density: 96 }).resize(w, h).png().toBuffer();
}

async function fromSvg(name, svg, w, h) {
  const buf = await fromSvgBuffer(svg, w, h);
  const { writeFileSync } = await import("fs");
  writeFileSync(`${OUT}/${name}.png`, buf);
  console.log("wrote", name);
}

// 1. Simple black-and-white logo (bold geometric mark)
await fromSvg(
  "01-bw-logo",
  svgWrap(512, 512, `
    <rect width="512" height="512" fill="white"/>
    <circle cx="256" cy="256" r="180" fill="black"/>
    <rect x="216" y="140" width="80" height="232" fill="white"/>
    <rect x="140" y="216" width="232" height="80" fill="white"/>
  `),
  512, 512
);

// 2. Simple color logo (few flat colors)
await fromSvg(
  "02-color-logo",
  svgWrap(512, 512, `
    <rect width="512" height="512" fill="white"/>
    <circle cx="256" cy="256" r="180" fill="#1a1a1a"/>
    <circle cx="256" cy="256" r="120" fill="#ff4d29"/>
    <circle cx="256" cy="256" r="60" fill="#ffffff"/>
  `),
  512, 512
);

// 3. Icon (small, simple)
await fromSvg(
  "03-icon",
  svgWrap(64, 64, `
    <rect width="64" height="64" rx="12" fill="#111"/>
    <path d="M16 34 L28 46 L48 20" stroke="white" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  `),
  64, 64
);

// 4. Flat illustration (multiple flat color regions, mountain scene)
await fromSvg(
  "04-flat-illustration",
  svgWrap(600, 400, `
    <rect width="600" height="400" fill="#bfe3ff"/>
    <circle cx="500" cy="80" r="40" fill="#ffd54d"/>
    <polygon points="0,400 150,180 300,400" fill="#7fae6e"/>
    <polygon points="200,400 380,120 560,400" fill="#5c8f4e"/>
    <rect x="0" y="360" width="600" height="40" fill="#3f6b39"/>
  `),
  600, 400
);

// 5. Transparent PNG (shapes on transparent background)
await sharp({
  create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([
    {
      input: Buffer.from(
        svgWrap(400, 400, `
          <circle cx="150" cy="150" r="100" fill="#2b6cff" fill-opacity="0.9"/>
          <circle cx="250" cy="250" r="100" fill="#ff2b6c" fill-opacity="0.6"/>
        `)
      ),
    },
  ])
  .png()
  .toFile(`${OUT}/05-transparent.png`);
console.log("wrote 05-transparent");

// 6. Multicolor illustration (many flat colors, flower pattern)
{
  const petals = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * 360;
    const hue = (i / 12) * 360;
    return `<g transform="rotate(${angle} 300 300)"><ellipse cx="300" cy="180" rx="35" ry="90" fill="hsl(${hue},70%,55%)"/></g>`;
  }).join("");
  await fromSvg(
    "06-multicolor-illustration",
    svgWrap(600, 600, `<rect width="600" height="600" fill="#fff8ec"/>${petals}<circle cx="300" cy="300" r="50" fill="#ffb703"/>`),
    600, 600
  );
}

// 7. Detailed illustration (many small shapes - simulate fine texture)
{
  let dots = "";
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 400; i++) {
    const x = rand() * 500;
    const y = rand() * 500;
    const r = 2 + rand() * 6;
    const hue = rand() * 360;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="hsl(${hue.toFixed(0)},60%,50%)"/>`;
  }
  await fromSvg("07-detailed-illustration", svgWrap(500, 500, `<rect width="500" height="500" fill="#111"/>${dots}`), 500, 500);
}

// 8. Gradient-heavy image
await fromSvg(
  "08-gradient",
  svgWrap(600, 400, `
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ff0080"/>
        <stop offset="50%" stop-color="#7928ca"/>
        <stop offset="100%" stop-color="#0070f3"/>
      </linearGradient>
      <radialGradient id="g2" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="600" height="400" fill="url(#g1)"/>
    <circle cx="300" cy="200" r="250" fill="url(#g2)"/>
  `),
  600, 400
);

// 9. "Photograph" (simulated photo-like: noise + soft gradients, no flat regions)
{
  const noise = sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  });
  const noiseBuf = await noise.png().toBuffer();
  await sharp(Buffer.from(svgWrap(640, 480, `
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6ba3d6"/>
          <stop offset="60%" stop-color="#cfe6f5"/>
          <stop offset="100%" stop-color="#8a9a5b"/>
        </linearGradient>
      </defs>
      <rect width="640" height="480" fill="url(#sky)"/>
      <ellipse cx="200" cy="150" rx="120" ry="40" fill="#ffffff" opacity="0.6"/>
      <ellipse cx="450" cy="100" rx="150" ry="35" fill="#ffffff" opacity="0.5"/>
    `)))
    .composite([{ input: noiseBuf, blend: "overlay", opacity: 0.15 }])
    .jpeg({ quality: 85 })
    .toFile(`${OUT}/09-photograph.jpg`);
  console.log("wrote 09-photograph");
}

// 10. Low-resolution image
await fromSvg(
  "10-low-res",
  svgWrap(32, 32, `<rect width="32" height="32" fill="#eee"/><circle cx="16" cy="16" r="10" fill="#d62828"/>`),
  32, 32
);

// 11. Large image
await fromSvg(
  "11-large",
  svgWrap(4000, 3000, `
    <rect width="4000" height="3000" fill="#f4f4f4"/>
    <circle cx="2000" cy="1500" r="1200" fill="#264653"/>
    <rect x="800" y="800" width="2400" height="1400" fill="#2a9d8f"/>
  `),
  4000, 3000
);

// 12. Fine details (thin lines, small text-like pattern)
{
  let lines = "";
  for (let i = 0; i < 100; i++) {
    lines += `<line x1="${i * 5}" y1="0" x2="${i * 5}" y2="300" stroke="#000" stroke-width="0.5" opacity="${i % 2 ? 0.8 : 0.3}"/>`;
  }
  await fromSvg("12-fine-details", svgWrap(500, 300, `<rect width="500" height="300" fill="#fff"/>${lines}`), 500, 300);
}

// 13. WebP source (exercises the WebP decode path, not just PNG/JPEG)
await sharp(Buffer.from(svgWrap(400, 400, `
    <rect width="400" height="400" fill="#f4f1de"/>
    <circle cx="200" cy="200" r="140" fill="#e07a5f"/>
    <rect x="120" y="120" width="160" height="160" fill="#3d405b"/>
  `)))
  .webp({ quality: 90 })
  .toFile(`${OUT}/13-webp.webp`);
console.log("wrote 13-webp");

// 14. Corrupted file — valid PNG header/magic bytes, truncated body. Exercises
// the CORRUPTED_FILE path (createImageBitmap fails to decode) rather than the
// UNSUPPORTED_FILE path (wrong extension/MIME), which is a distinct code path.
{
  const validPng = await fromSvgBuffer(
    svgWrap(64, 64, `<rect width="64" height="64" fill="#000"/>`),
    64, 64
  );
  const { writeFileSync } = await import("fs");
  writeFileSync(`${OUT}/14-corrupted.png`, validPng.subarray(0, Math.floor(validPng.length / 3)));
  console.log("wrote 14-corrupted");
}

// 15. Oversized dimensions — exceeds MAX_DECODED_DIMENSION (8000px per side,
// see src/lib/image/validate.ts) to exercise the DIMENSIONS_TOO_LARGE path.
await fromSvg(
  "15-oversized-dims",
  svgWrap(9000, 1200, `<rect width="9000" height="1200" fill="#e0e0e0"/><circle cx="4500" cy="600" r="500" fill="#264653"/>`),
  9000, 1200
);

// 16. Two-color logo (brand blue + white, geometric mark)
await fromSvg(
  "16-two-color-logo",
  svgWrap(600, 600, `
    <rect width="600" height="600" fill="#ffffff"/>
    <rect x="60" y="60" width="480" height="480" rx="96" fill="#1f4fd8"/>
    <path d="M170 380 L300 170 L430 380 Z" fill="#ffffff"/>
    <circle cx="300" cy="330" r="46" fill="#1f4fd8"/>
    <rect x="150" y="410" width="300" height="26" rx="13" fill="#ffffff"/>
  `),
  600, 600
);

// 17. Badge: ring, star, ribbon, dotted border (holes + several flat colors)
{
  let dots = "";
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    dots += `<circle cx="${(300 + 248 * Math.cos(a)).toFixed(1)}" cy="${(300 + 248 * Math.sin(a)).toFixed(1)}" r="7" fill="#f2c14e"/>`;
  }
  const star = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 120 : 52;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    return `${(300 + r * Math.cos(a)).toFixed(1)},${(300 + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  await fromSvg(
    "17-badge",
    svgWrap(600, 600, `
      <rect width="600" height="600" fill="#fbf7ef"/>
      <circle cx="300" cy="300" r="280" fill="#16324f"/>
      ${dots}
      <circle cx="300" cy="300" r="212" fill="#fbf7ef"/>
      <circle cx="300" cy="300" r="192" fill="#c8402f"/>
      <polygon points="${star}" fill="#f2c14e"/>
      <circle cx="300" cy="300" r="26" fill="#16324f"/>
      <path d="M150 470 L450 470 L420 520 L450 570 L150 570 L180 520 Z" fill="#16324f"/>
      <rect x="200" y="505" width="200" height="14" rx="7" fill="#fbf7ef"/>
    `),
    600, 600
  );
}

// 18. Multicolor logo (overlapping flat shapes, five brand colors)
const MULTI_LOGO = svgWrap(600, 600, `
  <rect width="600" height="600" fill="#ffffff"/>
  <circle cx="230" cy="250" r="150" fill="#ef476f"/>
  <circle cx="370" cy="250" r="150" fill="#ffd166"/>
  <circle cx="300" cy="380" r="150" fill="#06d6a0"/>
  <path d="M300 150 L370 250 L300 380 L230 250 Z" fill="#118ab2"/>
  <circle cx="300" cy="270" r="34" fill="#073b4c"/>
`);
await fromSvg("18-multicolor-logo", MULTI_LOGO, 600, 600);

// 19. The same logo saved as a lossy JPEG (ringing around every edge)
await sharp(Buffer.from(MULTI_LOGO), { density: 96 })
  .resize(600, 600)
  .jpeg({ quality: 70 })
  .toFile(`${OUT}/19-logo.jpg`);
console.log("wrote 19-logo");

// 20. Monochrome line icon (thin strokes, closed shapes with holes)
await fromSvg(
  "20-mono-lineart",
  svgWrap(500, 500, `
    <rect width="500" height="500" fill="#ffffff"/>
    <g fill="none" stroke="#111" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M90 240 L250 100 L410 240"/>
      <path d="M130 215 L130 400 L370 400 L370 215"/>
      <rect x="215" y="290" width="70" height="110"/>
      <circle cx="250" cy="205" r="26"/>
      <path d="M330 130 L330 90 L360 90 L360 155"/>
    </g>
    <circle cx="268" cy="345" r="5" fill="#111"/>
  `),
  500, 500
);

console.log("done");
