import { chromium } from "playwright";

const BASE = "http://localhost:5185";
const widths = [320, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920];

const browser = await chromium.launch();
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  const hasHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  const uploadBox = await page.locator(".upload-zone").boundingBox();
  console.log(
    `${width}px -> horizontalScroll=${hasHorizontalScroll} uploadZoneWidth=${uploadBox?.width.toFixed(0)}`
  );
  await page.close();
}
await browser.close();
