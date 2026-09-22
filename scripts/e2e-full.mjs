import { chromium } from "playwright";
import path from "path";

const BASE = "http://localhost:5185";
const FIXTURES = path.resolve("test/fixtures");
let pass = 0;
let fail = 0;

function ok(label, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  OK   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

const browser = await chromium.launch();

// ---------- 1. Full workflow across required test images ----------
async function testFullWorkflow(fileName) {
  console.log(`\n[workflow] ${fileName}`);
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });

  // Empty state
  ok("shows upload zone in empty state", await page.locator(".upload-zone").isVisible());

  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, fileName));

  // Preparing -> Ready
  await page.locator(".conversion-status__text", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  ok("reaches ready state", true);
  ok("shows file preview image", await page.locator(".file-preview__image").isVisible());
  ok("shows file metadata (name)", (await page.locator(".file-metadata").textContent())?.includes(fileName));
  const convertBtn = page.locator(".conversion-status .app-primary");
  ok("convert button enabled when ready", await convertBtn.isEnabled());

  await convertBtn.click();
  await page.waitForFunction(
    () => document.querySelector(".result-preview") !== null || document.querySelector(".error-state") !== null,
    { timeout: 30000 }
  );

  const hasError = await page.locator(".error-state").count();
  if (hasError) {
    console.log("  FAIL unexpected error:", await page.locator(".error-state__message").textContent());
    fail++;
    await page.close();
    return;
  }

  ok("shows result preview after conversion", await page.locator(".result-preview").isVisible());
  ok("SVG image renders (has natural size)", await page
    .locator(".result-preview__pane:nth-child(2) img")
    .evaluate((img) => img.naturalWidth > 0));
  ok("shows SVG stats", ((await page.locator(".result-preview__stats").textContent())?.length ?? 0) > 0);

  const downloadPromise = page.waitForEvent("download", { timeout: 5000 });
  await page.locator(".workspace__actions .app-primary").click();
  const download = await downloadPromise;
  const expectedBase = fileName.replace(/\.[^.]+$/, "");
  ok(
    `download filename derived correctly (${download.suggestedFilename()})`,
    download.suggestedFilename() === `${expectedBase}.svg`
  );

  ok("no uncaught page errors", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  await page.close();
}

// ---------- 2. Responsive breakpoints ----------
async function testBreakpoint(width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  const hScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  ok(`${width}px: no horizontal scroll (empty state)`, !hScroll);

  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__text", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  const hScroll2 = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  ok(`${width}px: no horizontal scroll (workspace)`, !hScroll2);

  // touch target size check on the primary convert button
  const box = await page.locator(".conversion-status .app-primary").boundingBox();
  ok(`${width}px: convert button >= 44px tall`, (box?.height ?? 0) >= 44);

  await page.locator(".conversion-status .app-primary").click();
  await page.waitForSelector(".result-preview, .error-state", { timeout: 30000 });
  const hScroll3 = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  ok(`${width}px: no horizontal scroll (result)`, !hScroll3);

  await page.close();
}

// ---------- 3. Keyboard navigation ----------
async function testKeyboardNav() {
  console.log("\n[keyboard]");
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });

  await page.keyboard.press("Tab"); // nav link
  await page.keyboard.press("Tab"); // upload zone
  const focused = await page.evaluate(() => document.activeElement?.className);
  ok("Tab reaches upload zone", focused?.includes("upload-zone") ?? false, focused);

  // Enter should open the native picker; we can't drive the OS dialog, but
  // we can confirm the click-through fires by listening for the 'filechooser' event.
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 3000 });
  await page.keyboard.press("Enter");
  const chooser = await chooserPromise;
  ok("Enter on upload zone opens file chooser", !!chooser);
  await chooser.setFiles(path.join(FIXTURES, "01-bw-logo.png"));

  await page.locator(".conversion-status__text", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });

  // Tab through settings and confirm focus-visible outline applies somewhere
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    return getComputedStyle(el).outlineStyle;
  });
  ok("focused element has a visible outline style", outline !== "none", outline ?? "null");

  await page.close();
}

// ---------- 4. Touch interaction ----------
async function testTouch() {
  console.log("\n[touch]");
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 3000 });
  await page.locator(".upload-zone").tap();
  const chooser = await chooserPromise;
  ok("tap on upload zone opens file chooser", !!chooser);
  await chooser.setFiles(path.join(FIXTURES, "03-icon.png"));
  await page.locator(".conversion-status__text", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  await page.locator(".conversion-status .app-primary").tap();
  await page.waitForSelector(".result-preview", { timeout: 30000 });
  ok("tap-driven conversion reaches result", await page.locator(".result-preview").isVisible());
  await page.close();
  await context.close();
}

// ---------- 5. File rejection ----------
async function testRejection() {
  console.log("\n[rejection]");
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await page.locator(".error-state").waitFor({ timeout: 10000 });
  const msg = await page.locator(".error-state__message").textContent();
  ok("unsupported file shows error", !!msg, msg ?? "");
  ok("unsupported file offers 'choose different image'", await page.locator(".error-state__actions .app-secondary").isVisible());
  ok("unsupported file does NOT offer 'try again' (file is the problem)", (await page.locator(".error-state__actions .app-primary").count()) === 0);

  await page.locator(".error-state__actions .app-secondary").click();
  ok("choosing new file returns to empty/upload state", await page.locator(".upload-zone").isVisible());
  await page.close();
}

async function testOversizedAndCorrupted() {
  console.log("\n[oversized + corrupted]");
  for (const file of ["14-corrupted.png", "15-oversized-dims.png"]) {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, file));
    await page.locator(".error-state").waitFor({ timeout: 10000 });
    const msg = await page.locator(".error-state__message").textContent();
    ok(`${file} shows a specific, non-technical error`, !!msg && !/stack|undefined|NaN/i.test(msg), msg ?? "");
    await page.close();
  }
}

// ---------- 6. Conversion failure (forced) ----------
async function testConversionFailure() {
  console.log("\n[forced conversion failure]");
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    // Only intercept the vectorize worker; force it to report failure.
    // @ts-expect-error test override
    window.Worker = class FailingWorker extends OriginalWorker {
      constructor(url, opts) {
        super(url, opts);
        const realPostMessage = this.postMessage.bind(this);
        this.postMessage = (data) => {
          void data;
          void realPostMessage;
          setTimeout(() => {
            this.dispatchEvent(new MessageEvent("message", { data: { ok: false, error: "forced failure" } }));
          }, 50);
        };
      }
    };
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__text", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  await page.locator(".conversion-status .app-primary").click();
  await page.locator(".error-state").waitFor({ timeout: 10000 });
  const msg = await page.locator(".error-state__message").textContent();
  ok("forced engine failure shows error", !!msg, msg ?? "");
  ok("forced engine failure offers 'Try again' (retry-able)", await page.locator(".error-state__actions .app-primary").isVisible());
  ok("file preview/settings still visible during retryable error", await page.locator(".file-preview").isVisible());
  await page.close();
}

// ---------- 7. Replacing an image mid-flow ----------
async function testReplaceImage() {
  console.log("\n[replace image]");
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "01-bw-logo.png"));
  await page.locator(".conversion-status__text", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  const nameBefore = await page.locator(".file-metadata").textContent();
  ok("shows first file name", nameBefore?.includes("01-bw-logo.png") ?? false);

  await page.locator(".file-preview .app-secondary").click(); // "Change image"
  ok("change image returns to upload zone", await page.locator(".upload-zone").isVisible());

  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__text", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  const nameAfter = await page.locator(".file-metadata").textContent();
  ok("shows second file name after replace", nameAfter?.includes("02-color-logo.png") ?? false);
  await page.close();
}

// ---------- 8. Sequential conversions ----------
async function testSequentialConversions() {
  console.log("\n[sequential conversions]");
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  const files = ["01-bw-logo.png", "02-color-logo.png", "05-transparent.png"];
  for (const file of files) {
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, file));
    await page.locator(".conversion-status__text", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
    await page.locator(".conversion-status .app-primary").click();
    await page.waitForSelector(".result-preview", { timeout: 30000 });
    ok(`sequential: ${file} converted`, await page.locator(".result-preview").isVisible());
    await page.locator(".workspace__actions .app-secondary").click(); // "Convert another image"
    ok(`sequential: returns to empty state after ${file}`, await page.locator(".upload-zone").isVisible());
  }
  await page.close();
}

await testFullWorkflow("01-bw-logo.png"); // simple logo
await testFullWorkflow("02-color-logo.png"); // color logo
await testFullWorkflow("05-transparent.png"); // transparent PNG
await testFullWorkflow("09-photograph.jpg"); // jpg
await testFullWorkflow("13-webp.webp"); // webp
await testFullWorkflow("04-flat-illustration.png"); // illustration
await testFullWorkflow("07-detailed-illustration.png"); // complex image

console.log("\n[breakpoints]");
for (const w of [320, 375, 390, 430, 768, 820, 1024, 1280, 1440]) {
  await testBreakpoint(w);
}

await testKeyboardNav();
await testTouch();
await testRejection();
await testOversizedAndCorrupted();
await testConversionFailure();
await testReplaceImage();
await testSequentialConversions();

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
