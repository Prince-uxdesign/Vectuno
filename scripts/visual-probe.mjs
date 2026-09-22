import { chromium } from "playwright";
import path from "path";
import { mkdirSync, copyFileSync } from "fs";

const BASE = "http://localhost:5185";
const FIXTURES = path.resolve("test/fixtures");
const OUT = path.resolve("test/output/screenshots");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

// 1. Long filename overflow check
{
  const longNamePath = path.join(OUT, "a-very-long-descriptive-filename-that-should-not-break-the-layout-at-all-hopefully.png");
  copyFileSync(path.join(FIXTURES, "02-color-logo.png"), longNamePath);

  for (const width of [320, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.locator('input[type="file"]').setInputFiles(longNamePath);
    await page.locator(".conversion-status__text", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
    const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    console.log(`${width}px long-filename horizontalScroll=${hScroll}`);
    await page.screenshot({ path: path.join(OUT, `long-filename-${width}.png`) });
    await page.close();
  }
}

// 2. Real drag-and-drop simulation (DataTransfer) at mobile + desktop
async function testRealDrag(width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });

  const buffer = await import("fs").then((fs) => fs.readFileSync(path.join(FIXTURES, "01-bw-logo.png")));
  const dataTransfer = await page.evaluateHandle((b64) => {
    const dt = new DataTransfer();
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], "01-bw-logo.png", { type: "image/png" });
    dt.items.add(file);
    return dt;
  }, buffer.toString("base64"));

  await page.locator(".upload-zone").dispatchEvent("dragenter", { dataTransfer });
  const activeText = await page.locator(".upload-zone__label").textContent();
  console.log(`${width}px drag-active label: "${activeText}"`);
  await page.screenshot({ path: path.join(OUT, `drag-active-${width}.png`) });

  await page.locator(".upload-zone").dispatchEvent("drop", { dataTransfer });
  await page.locator(".conversion-status__text", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  console.log(`${width}px real drop -> reached ready state`);
  await page.close();
}
await testRealDrag(375);
await testRealDrag(1440);

// 3. Disabled state during conversion (Change image + settings should be inert)
{
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class SlowWorker extends OriginalWorker {
      constructor(url, opts) {
        super(url, opts);
        this.postMessage = () => {
          /* never respond -> stays in "converting" indefinitely for this test */
        };
      }
    };
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__text", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  await page.locator(".conversion-status .app-primary").click();
  await page.locator(".conversion-status__text", { hasText: /Converting/ }).waitFor({ timeout: 5000 });

  const changeImageDisabled = await page.locator(".file-preview .app-secondary").isDisabled();
  console.log(`Change-image button disabled while converting: ${changeImageDisabled}`);

  const settingsDisabled = await page.locator(".conversion-settings").isDisabled();
  console.log(`Settings fieldset disabled while converting: ${settingsDisabled}`);

  await page.screenshot({ path: path.join(OUT, "converting-state.png") });
  await page.close();
}

// 4. Whole-page screenshots at key breakpoints (empty + ready + result)
for (const width of [320, 768, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, `empty-${width}.png`) });

  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "06-multicolor-illustration.png"));
  await page.locator(".conversion-status__text", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, `ready-${width}.png`), fullPage: true });

  await page.locator(".conversion-status .app-primary").click();
  await page.waitForSelector(".result-preview", { timeout: 30000 });
  await page.screenshot({ path: path.join(OUT, `result-${width}.png`), fullPage: true });
  await page.close();
}

await browser.close();
console.log("\nScreenshots written to test/output/screenshots/");
