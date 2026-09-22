import sharp from "sharp";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "test", "fixtures");
mkdirSync(OUT, { recursive: true });

const svgWrap = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

async function fromSvg(name, svg, w, h) {
  await sharp(Buffer.from(svg), { density: 96 })
    .resize(w, h)
    .png()
    .toFile(`${OUT}/${name}.png`);
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

console.log("done");
