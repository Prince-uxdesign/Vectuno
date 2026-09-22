import { chromium } from "playwright";
import path from "path";

const BASE = "http://localhost:5185";
const FIXTURES = path.resolve("test/fixtures");

const browser = await chromium.launch();

async function testFile(fileName, { expectError } = {}) {
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(m.text()));
  page.on("pageerror", (e) => logs.push("PAGEERROR: " + e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });

  const input = page.locator('input[type="file"]');
  await input.setInputFiles(path.join(FIXTURES, fileName));

  try {
    if (expectError) {
      await page.locator(".app-error").waitFor({ timeout: 10000 });
      const err = await page.locator(".app-error").textContent();
      console.log(`[${fileName}] EXPECTED ERROR ->`, err);
    } else {
      const convertBtn = page.locator(".controls-panel__convert");
      await convertBtn.waitFor({ timeout: 10000 });
      await convertBtn.click();
      await page.waitForFunction(
        () => document.querySelector(".app-primary") !== null || document.querySelector(".app-error") !== null,
        { timeout: 30000 }
      );
      const hasError = await page.locator(".app-error").count();
      if (hasError) {
        const err = await page.locator(".app-error").textContent();
        console.log(`[${fileName}] UNEXPECTED ERROR ->`, err);
      } else {
        const stats = await page.locator(".preview-panel__stats").textContent();
        console.log(`[${fileName}] OK -> stats: ${stats}`);
        // verify download triggers without throwing
        const downloadPromise = page.waitForEvent("download", { timeout: 5000 });
        await page.locator(".app-primary").click();
        const download = await downloadPromise;
        console.log(`[${fileName}] download filename -> ${download.suggestedFilename()}`);
      }
    }
  } catch (e) {
    console.log(`[${fileName}] TEST FAILURE ->`, e.message);
    console.log("  console logs:", logs.slice(-5));
  } finally {
    await page.close();
  }
}

async function testUnsupportedFile() {
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  // Create a fake .txt file on the fly and try to select it via the input's accept-agnostic API
  const buffer = Buffer.from("not an image");
  await page.locator('input[type="file"]').setInputFiles({
    name: "not-an-image.txt",
    mimeType: "text/plain",
    buffer,
  });
  await page.locator(".app-error").waitFor({ timeout: 10000 });
  const err = await page.locator(".app-error").textContent();
  console.log("[unsupported-file] EXPECTED ERROR ->", err);
  await page.close();
}

async function testValidationFailure(fileName) {
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, fileName));
  try {
    await page.locator(".app-error").waitFor({ timeout: 10000 });
    const err = await page.locator(".app-error").textContent();
    console.log(`[${fileName}] EXPECTED ERROR ->`, err);
  } catch (e) {
    console.log(`[${fileName}] TEST FAILURE (no error shown) ->`, e.message);
  }
  await page.close();
}

await testFile("01-bw-logo.png");
await testFile("02-color-logo.png");
await testFile("05-transparent.png");
await testFile("09-photograph.jpg");
await testFile("11-large.png"); // should downsample + still succeed
await testFile("13-webp.webp");
await testUnsupportedFile();
await testValidationFailure("14-corrupted.png");
await testValidationFailure("15-oversized-dims.png");

await browser.close();
console.log("\nE2E probe complete.");
