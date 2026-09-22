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
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  ok("reaches ready state", true);
  ok("shows file preview image", await page.locator(".file-preview__image").isVisible());
  ok("shows file metadata (name)", (await page.locator(".file-metadata").textContent())?.includes(fileName));
  const convertBtn = page.locator(".conversion-status .btn-primary");
  ok("convert button enabled when ready", await convertBtn.isEnabled());

  await convertBtn.click();
  await page.waitForFunction(
    () => document.querySelector(".result-screen") !== null || document.querySelector(".error-state") !== null,
    { timeout: 30000 }
  );

  const hasError = await page.locator(".error-state").count();
  if (hasError) {
    console.log("  FAIL unexpected error:", await page.locator(".error-state__message").textContent());
    fail++;
    await page.close();
    return;
  }

  ok("shows result screen heading", (await page.locator(".result-screen__heading").textContent())?.includes("ready") ?? false);
  ok("shows result screen after conversion", await page.locator(".result-screen").isVisible());
  ok(
    "SVG renders inline (real <svg> element, not a raster image)",
    await page.locator(".compare-slider__layer--vector svg").count() > 0
  );
  ok(
    "inline SVG has actual path content",
    await page.locator(".compare-slider__layer--vector svg path").count() > 0
  );
  ok("shows SVG metadata", ((await page.locator(".result-metadata").textContent())?.length ?? 0) > 0);
  ok("metadata includes dimensions", (await page.locator(".result-metadata").textContent())?.includes("×") ?? false);

  const downloadPromise = page.waitForEvent("download", { timeout: 5000 });
  await page.locator(".result-screen__actions .btn-primary").click();
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
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  const hScroll2 = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  ok(`${width}px: no horizontal scroll (workspace)`, !hScroll2);

  // touch target size check on the primary convert button
  const box = await page.locator(".conversion-status .btn-primary").boundingBox();
  ok(`${width}px: convert button >= 44px tall`, (box?.height ?? 0) >= 44);

  await page.locator(".conversion-status .btn-primary").click();
  await page.waitForSelector(".result-screen, .error-state", { timeout: 30000 });
  const hScroll3 = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  ok(`${width}px: no horizontal scroll (result)`, !hScroll3);

  // The comparison handle is the smallest interactive control on the result
  // screen — confirm it still meets the touch target minimum at every width.
  const handleBox = await page.locator(".compare-slider__handle").boundingBox();
  ok(`${width}px: comparison handle >= 44px touch target`, (handleBox?.width ?? 0) >= 44 && (handleBox?.height ?? 0) >= 44);

  const downloadBox = await page.locator(".result-screen__download").boundingBox();
  ok(`${width}px: download button >= 44px tall`, (downloadBox?.height ?? 0) >= 44);

  await page.close();
}

// ---------- 3. Keyboard navigation ----------
async function testKeyboardNav() {
  console.log("\n[keyboard]");
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });

  // Tab order should be logical: logo -> nav links -> CTA -> upload button.
  // The upload control is a real <button> filling the drop zone (one tab
  // stop), so its class is upload-zone__button. Walk forward (bounded)
  // instead of assuming a fixed count, and log the sequence so a
  // broken/illogical order is visible, not just "found it".
  const sequence = [];
  let reachedUploadZone = false;
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const cls = await page.evaluate(() => document.activeElement?.className ?? "");
    sequence.push(cls);
    if (String(cls).includes("upload-zone")) {
      reachedUploadZone = true;
      break;
    }
  }
  console.log("  tab sequence:", sequence.join(" -> "));
  ok("Tab order reaches upload zone in a bounded, logical sequence", reachedUploadZone);

  // Enter should open the native picker; we can't drive the OS dialog, but
  // we can confirm the click-through fires by listening for the 'filechooser' event.
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 3000 });
  await page.keyboard.press("Enter");
  const chooser = await chooserPromise;
  ok("Enter on upload zone opens file chooser", !!chooser);
  await chooser.setFiles(path.join(FIXTURES, "01-bw-logo.png"));

  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });

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
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  await page.locator(".conversion-status .btn-primary").tap();
  await page.waitForSelector(".result-screen", { timeout: 30000 });
  ok("tap-driven conversion reaches result", await page.locator(".result-screen").isVisible());

  // Touch-driven comparison: tapping the Original/Vector toggle should move
  // the divider without needing a drag gesture.
  await page.getByRole("group", { name: "Switch between original and vector" }).getByRole("button", { name: "Vector" }).tap();
  const valueAfterTap = await page.locator(".compare-slider__handle").getAttribute("aria-valuenow");
  ok("touch: toggle button moves comparison to Vector (0)", valueAfterTap === "0");

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
  const hint = await page.locator(".error-state__hint").textContent();
  ok("unsupported file shows error message", !!msg, msg ?? "");
  ok("unsupported file shows an actionable hint", !!hint, hint ?? "");
  ok("unsupported file offers 'choose different image'", await page.locator(".error-state__actions .btn-secondary").isVisible());
  ok("unsupported file does NOT offer 'try again' (file is the problem)", (await page.locator(".error-state__actions .btn-primary").count()) === 0);

  await page.locator(".error-state__actions .btn-secondary").click();
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
    const hint = await page.locator(".error-state__hint").textContent();
    ok(`${file} shows a specific, non-technical error`, !!msg && !/stack|undefined|NaN/i.test(msg), msg ?? "");
    ok(`${file} shows an actionable hint`, !!hint && !/stack|undefined|NaN/i.test(hint), hint ?? "");
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
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  await page.locator(".conversion-status .btn-primary").click();
  await page.locator(".error-state").waitFor({ timeout: 10000 });
  const msg = await page.locator(".error-state__message").textContent();
  ok("forced engine failure shows error", !!msg, msg ?? "");
  ok("forced engine failure offers 'Try again' (retry-able)", await page.locator(".error-state__actions .btn-primary").isVisible());
  ok("file preview/settings still visible during retryable error", await page.locator(".file-preview").isVisible());
  await page.close();
}

// ---------- 7. Replacing an image mid-flow ----------
async function testReplaceImage() {
  console.log("\n[replace image]");
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "01-bw-logo.png"));
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  const nameBefore = await page.locator(".file-metadata").textContent();
  ok("shows first file name", nameBefore?.includes("01-bw-logo.png") ?? false);

  await page.locator(".file-preview .btn-secondary").click(); // "Change image"
  ok("change image returns to upload zone", await page.locator(".upload-zone").isVisible());

  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
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
    await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
    await page.locator(".conversion-status .btn-primary").click();
    await page.waitForSelector(".result-screen", { timeout: 30000 });
    ok(`sequential: ${file} converted`, await page.locator(".result-screen").isVisible());
    if (file === "05-transparent.png") {
      ok(
        "sequential: transparent PNG shows checkerboard background",
        await page.locator(".compare-slider__frame--checkerboard").isVisible()
      );
    }
    await page.locator(".result-screen__actions .btn-secondary").click(); // "Convert another image"
    ok(`sequential: returns to empty state after ${file}`, await page.locator(".upload-zone").isVisible());
  }
  await page.close();
}

// ---------- 9. Settings genuinely change output ----------
async function testSettingsChangeOutput() {
  console.log("\n[settings change output]");

  async function convertWith(detail, smoothness) {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
    await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
    await page.getByRole("group", { name: "Detail" }).getByRole("button", { name: detail, exact: true }).click();
    await page
      .getByRole("group", { name: "Smoothness" })
      .getByRole("button", { name: smoothness, exact: true })
      .click();
    await page.locator(".conversion-status__cta").click();
    await page.waitForSelector(".result-screen", { timeout: 30000 });
    const stats = await page.locator(".result-metadata").textContent();
    await page.close();
    const paths = Number(/Paths(\d+)/.exec(stats ?? "")?.[1] ?? -1);
    return { stats, paths };
  }

  const low = await convertWith("Low", "Low");
  const high = await convertWith("High", "High");
  ok(
    "Low detail/smoothness produces fewer paths than High (real, measurable difference)",
    low.paths >= 0 && high.paths > low.paths,
    `low=${low.stats} high=${high.stats}`
  );

  // Monochrome mode should hide the Advanced (colors) section entirely —
  // colour count is meaningless once output is forced to 2 colors.
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  ok("Advanced (colors) visible in Color mode", await page.locator(".advanced-disclosure").isVisible());
  await page.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Monochrome" }).click();
  ok("Advanced (colors) hidden in Monochrome mode", (await page.locator(".advanced-disclosure").count()) === 0);
  await page.close();
}

// ---------- 10. Advanced disclosure ----------
async function testAdvancedDisclosure() {
  console.log("\n[advanced disclosure]");
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });

  ok("Advanced starts collapsed", !(await page.locator(".advanced-disclosure").evaluate((el) => el.open)));
  const slider = page.locator('.advanced-disclosure input[type="range"]');
  await page.locator(".advanced-disclosure summary").click();
  ok("Advanced expands on click", await page.locator(".advanced-disclosure").evaluate((el) => el.open));
  ok("colors slider has an accessible value text", !!(await slider.getAttribute("aria-valuetext")));

  // Keyboard: focus the summary and toggle with Enter (native <details> behavior).
  await page.locator(".advanced-disclosure summary").click(); // collapse again
  await page.locator(".advanced-disclosure summary").focus();
  await page.keyboard.press("Enter");
  ok("Advanced is keyboard-toggleable", await page.locator(".advanced-disclosure").evaluate((el) => el.open));

  await page.close();
}

// ---------- 11. Cancellation ----------
async function testCancellation() {
  console.log("\n[cancellation]");
  const page = await browser.newPage();
  // Slow the worker down (without breaking it) so there's a real window to cancel in.
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class SlowWorker extends OriginalWorker {
      constructor(url, opts) {
        super(url, opts);
        const realPostMessage = this.postMessage.bind(this);
        this.postMessage = (data) => {
          setTimeout(() => realPostMessage(data), 4000);
        };
      }
    };
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  await page.locator(".conversion-status__cta").click();
  await page.locator(".conversion-status__headline", { hasText: /Vectorizing/ }).waitFor({ timeout: 5000 });
  ok("Cancel button appears while converting", await page.locator(".conversion-status__actions button").isVisible());

  await page.locator(".conversion-status__actions button", { hasText: "Cancel" }).click();
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 5000 });
  ok("Cancelling returns to ready (not error)", (await page.locator(".error-state").count()) === 0);

  // Converting again afterward should work normally — cancellation must not
  // leave the pipeline in a broken state.
  await page.locator(".conversion-status__cta").click();
  await page.waitForSelector(".result-screen", { timeout: 30000 });
  ok("conversion works normally after a prior cancel", await page.locator(".result-screen").isVisible());
  await page.close();
}

// ---------- 12. Changing settings does not auto-convert ----------
async function testNoAutoConvert() {
  console.log("\n[no accidental auto-convert]");
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  // Flip every core setting; none of this should trigger a conversion.
  await page.getByRole("group", { name: "Detail" }).getByRole("button", { name: "High", exact: true }).click();
  await page.getByRole("group", { name: "Smoothness" }).getByRole("button", { name: "Low", exact: true }).click();
  await page.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Monochrome" }).click();
  await page.waitForTimeout(500);
  ok(
    "changing settings does not start a conversion",
    (await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).count()) > 0
  );
  await page.close();
}

// ---------- 13. Compare slider accessibility ----------
async function testCompareSliderA11y() {
  console.log("\n[compare slider accessibility]");
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  await page.locator(".conversion-status .btn-primary").click();
  await page.waitForSelector(".result-screen", { timeout: 30000 });

  const handle = page.locator(".compare-slider__handle");
  ok("handle exposes role=slider", (await handle.getAttribute("role")) === "slider");
  ok("handle has an accessible label", !!(await handle.getAttribute("aria-labelledby")));
  ok("handle starts at 50 (even split)", (await handle.getAttribute("aria-valuenow")) === "50");

  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  const afterLeft = await handle.getAttribute("aria-valuenow");
  ok("ArrowLeft decreases the value", Number(afterLeft) < 50);

  await page.keyboard.press("End");
  ok("End jumps to 100", (await handle.getAttribute("aria-valuenow")) === "100");
  await page.keyboard.press("Home");
  ok("Home jumps to 0", (await handle.getAttribute("aria-valuenow")) === "0");

  // Non-drag alternative: the Original/Split/Vector buttons must reach every
  // state the handle can, since dragging can't be the only way in.
  const toggle = page.getByRole("group", { name: "Switch between original and vector" });
  await toggle.getByRole("button", { name: "Original" }).click();
  ok("toggle 'Original' sets value to 100", (await handle.getAttribute("aria-valuenow")) === "100");
  await toggle.getByRole("button", { name: "Split" }).click();
  ok("toggle 'Split' resets value to 50", (await handle.getAttribute("aria-valuenow")) === "50");

  ok(
    "screen-reader description of the comparison exists",
    (await page.locator(".compare-slider .visually-hidden").count()) > 0
  );

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
await testSettingsChangeOutput();
await testAdvancedDisclosure();
await testCancellation();
await testNoAutoConvert();
await testCompareSliderA11y();

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
