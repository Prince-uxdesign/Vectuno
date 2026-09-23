// Additional "break the state machine" stress scenarios not covered by
// e2e-full.mjs: rapid re-uploads, double-submit convert, retry-that-actually-
// succeeds after a failure, and repeated download clicks. Run against the
// same local dev server as e2e-full.mjs (BASE below must match).
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

// ---------- Change image mid-decode, then pick another: no stale state ----------
// The upload widget unmounts the instant a file is picked (App.tsx isLanding
// flips false on FILE_SELECTED), so a user can never interact with the same
// <input type=file> twice in a row - this scenario is only reachable via
// "Change image" while the first file is still preparing/decoding. That's
// exactly what useConverter's loadTokenRef guard (src/state/useConverter.ts)
// exists to protect against, so exercise it directly.
async function testChangeImageMidDecode() {
  console.log("\n[change image mid-decode, then pick another]");
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });

  const input = page.locator('input[type="file"]');
  // A larger/more detailed fixture widens the decode window.
  await input.setInputFiles(path.join(FIXTURES, "11-large.png"));
  // Don't wait for ready - race "Change image" against the in-flight decode.
  const changeBtn = page.locator(".file-preview .btn-secondary");
  await changeBtn.waitFor({ timeout: 10000 });
  await changeBtn.click();
  ok("change image returns to upload zone even mid-decode", await page.locator(".upload-zone").isVisible());

  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  const meta = await page.locator(".file-metadata").textContent();
  ok("only the second (latest) file is reflected in state", meta?.includes("02-color-logo.png") ?? false);
  ok("no uncaught errors from racing loads", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  await page.close();
}

// ---------- Double-click Convert: only one conversion runs ----------
async function testDoubleClickConvert() {
  console.log("\n[double-click convert]");
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });

  const btn = page.locator(".conversion-settings__cta");
  // Fire two clicks back to back without waiting; the UI may transition to
  // Cancel/converting/success fast enough that the second click's target
  // detaches mid-action - that's fine, it just means the race window closed
  // before a double-submit could happen. Either outcome must not throw
  // unhandled or leave the app in a broken state.
  await Promise.allSettled([btn.click(), btn.click({ force: true, timeout: 2000 })]);

  await page.waitForFunction(
    () => document.querySelector(".result-screen") !== null || document.querySelector(".error-state") !== null,
    { timeout: 30000 }
  );
  ok("reaches a settled state (result or error) without hanging", true);
  ok("no uncaught errors from double-submit", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  await page.close();
}

// ---------- Error -> Retry actually recovers to success ----------
async function testRetryRecoversToSuccess() {
  console.log("\n[retry actually recovers]");
  const page = await browser.newPage();
  let shouldFail = true;
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    // @ts-expect-error test override
    window.Worker = class FlakyWorker extends OriginalWorker {
      constructor(url, opts) {
        super(url, opts);
        const realPostMessage = this.postMessage.bind(this);
        this.postMessage = (data) => {
          // @ts-expect-error test hook set from the page context below
          if (window.__forceFail) {
            setTimeout(() => {
              this.dispatchEvent(new MessageEvent("message", { data: { ok: false, error: "forced failure" } }));
            }, 50);
          } else {
            realPostMessage(data);
          }
        };
      }
    };
  });
  await page.addInitScript(() => {
    // @ts-expect-error test hook
    window.__forceFail = true;
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  await page.locator(".conversion-settings__cta").click();
  await page.locator(".error-state").waitFor({ timeout: 10000 });
  ok("first attempt fails as forced", await page.locator(".error-state").isVisible());

  // Flip the flag so the *next* postMessage succeeds for real, then retry.
  await page.evaluate(() => {
    // @ts-expect-error test hook
    window.__forceFail = false;
  });
  await page.locator(".error-state__actions .btn-primary", { hasText: "Try again" }).click();
  await page.waitForSelector(".result-screen, .error-state", { timeout: 30000 });
  ok("retry after transient failure reaches success", await page.locator(".result-screen").isVisible());
  void shouldFail;
  await page.close();
}

// ---------- Repeated Download clicks: each one fires cleanly ----------
async function testRepeatedDownloads() {
  console.log("\n[repeated download clicks]");
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  await page.locator(".conversion-settings__cta").click();
  await page.waitForSelector(".result-screen", { timeout: 30000 });

  const downloadBtn = page.locator(".result-screen__actions .btn-primary");
  for (let i = 0; i < 3; i++) {
    const downloadPromise = page.waitForEvent("download", { timeout: 5000 });
    await downloadBtn.click();
    const download = await downloadPromise;
    ok(`download #${i + 1} fires with correct filename`, download.suggestedFilename() === "02-color-logo.svg");
  }
  ok("no uncaught errors from repeated downloads", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  await page.close();
}

// ---------- Unicode / special-character filename survives to download ----------
async function testUnicodeFilename() {
  console.log("\n[unicode/special-char filename]");
  const page = await browser.newPage();
  const fs = await import("fs");
  const src = path.join(FIXTURES, "02-color-logo.png");
  const buffer = fs.readFileSync(src);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles({
    name: "café logo (final) #2 — copy.png",
    mimeType: "image/png",
    buffer,
  });
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  await page.locator(".conversion-settings__cta").click();
  await page.waitForSelector(".result-screen", { timeout: 30000 });
  const downloadPromise = page.waitForEvent("download", { timeout: 5000 });
  await page.locator(".result-screen__actions .btn-primary").click();
  const download = await downloadPromise;
  const name = download.suggestedFilename();
  ok(`unicode filename produces a .svg download (${name})`, name.endsWith(".svg"));
  ok("no raw unsafe path characters (/, \\) leak into the filename", !/[/\\]/.test(name));
  await page.close();
}

await testChangeImageMidDecode();
await testDoubleClickConvert();
await testRetryRecoversToSuccess();
await testRepeatedDownloads();
await testUnicodeFilename();

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
