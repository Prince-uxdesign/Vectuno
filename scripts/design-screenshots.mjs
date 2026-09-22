import { chromium } from "playwright";
import path from "path";
import { mkdirSync } from "fs";

const BASE = "http://localhost:5185";
const OUT = path.resolve("test/output/design");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const widths = [320, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920];

for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: width < 768 ? 1200 : 1400 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  const hScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  console.log(`${width}px landing horizontalScroll=${hScroll}`);
  await page.screenshot({ path: path.join(OUT, `landing-${width}.png`), fullPage: true });
  await page.close();
}

await browser.close();
console.log("done");
