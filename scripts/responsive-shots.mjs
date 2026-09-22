import { chromium } from "playwright";
import path from "path";
import { mkdirSync } from "fs";

const BASE = "http://localhost:5185";
const FIXTURES = path.resolve("test/fixtures");
const OUT = path.resolve("test/output/responsive");
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { w: 320, h: 568, label: "m-320x568" },
  { w: 375, h: 812, label: "m-375x812" },
  { w: 430, h: 932, label: "m-430x932" },
  { w: 812, h: 375, label: "m-land-812x375" },
  { w: 768, h: 1024, label: "t-768x1024" },
  { w: 834, h: 1194, label: "t-834x1194" },
  { w: 1024, h: 1366, label: "t-1024x1366" },
  { w: 1024, h: 768, label: "t-land-1024x768" },
  { w: 1280, h: 720, label: "d-1280x720" },
  { w: 1440, h: 900, label: "d-1440x900" },
  { w: 1920, h: 1080, label: "d-1920x1080" },
];

const browser = await chromium.launch();

for (const v of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: v.w, height: v.h } });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, `${v.label}-01-empty.png`), fullPage: true });

  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  await page.locator(".advanced-disclosure summary").click();
  await page.screenshot({ path: path.join(OUT, `${v.label}-02-ready.png`), fullPage: true });

  await page.locator(".conversion-status .btn-primary").click();
  await page.waitForSelector(".result-screen, .error-state", { timeout: 30000 });
  await page.screenshot({ path: path.join(OUT, `${v.label}-03-result.png`), fullPage: true });

  await page.close();
}

await browser.close();
console.log("done");
