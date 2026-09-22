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

async function testBatchHappyPath() {
  console.log("\n[batch: happy path]");
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });

  const files = ["01-bw-logo.png", "02-color-logo.png", "05-transparent.png"].map((f) => path.join(FIXTURES, f));
  await page.locator('input[type="file"]').setInputFiles(files);

  await page.locator(".batch-workspace").waitFor({ timeout: 10000 });
  ok("enters batch workspace for 3 files", true);
  ok("shows 3 items in the list", (await page.locator(".batch-list__item").count()) === 3);
  ok("upload zone is gone (landing left)", (await page.locator(".upload-zone").count()) === 0);

  const convertBtn = page.locator(".batch-workspace__actions .btn-primary");
  ok("convert button labeled with count", (await convertBtn.textContent())?.includes("3 images") ?? false);
  await convertBtn.click();

  await page.waitForFunction(
    () => document.querySelectorAll(".batch-list__status-text--done, .batch-list__status-text--error").length === 3,
    undefined,
    { timeout: 60000 }
  );

  const doneCount = await page.locator(".batch-list__status-text--done").count();
  ok("all 3 items converted successfully", doneCount === 3, `got ${doneCount}`);

  const zipBtn = page.locator("button", { hasText: /Download all as ZIP/ });
  ok("zip download button appears", await zipBtn.isVisible());
  ok("zip button shows correct count", (await zipBtn.textContent())?.includes("(3)") ?? false);

  const [download] = await Promise.all([page.waitForEvent("download"), zipBtn.click()]);
  const filename = download.suggestedFilename();
  ok("zip filename ends in .zip", filename.endsWith(".zip"), filename);

  const fs = await import("fs");
  const os = await import("os");
  const zipPath = path.join(os.tmpdir(), filename);
  await download.saveAs(zipPath);
  const buf = fs.readFileSync(zipPath);
  ok("downloaded file is a real zip (PK magic bytes)", buf[0] === 0x50 && buf[1] === 0x4b, `magic: ${buf.subarray(0, 2).toString("hex")}`);
  ok("zip file is non-trivial size", buf.length > 100, `size: ${buf.length}`);

  ok("no uncaught page errors", errors.length === 0, errors.join("; "));
  await page.close();
}

async function testBatchPartialFailure() {
  console.log("\n[batch: partial failure — mixed valid and invalid files]");
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });

  const files = [
    path.join(FIXTURES, "01-bw-logo.png"),
    path.join(FIXTURES, "14-corrupted.png"),
    path.join(FIXTURES, "02-color-logo.png"),
  ];
  await page.locator('input[type="file"]').setInputFiles(files);
  await page.locator(".batch-workspace").waitFor({ timeout: 10000 });

  await page.locator(".batch-workspace__actions .btn-primary").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".batch-list__status-text--done, .batch-list__status-text--error").length === 3,
    undefined,
    { timeout: 60000 }
  );

  const doneCount = await page.locator(".batch-list__status-text--done").count();
  const errorCount = await page.locator(".batch-list__status-text--error").count();
  ok("2 succeeded, 1 failed (batch continues past a single failure)", doneCount === 2 && errorCount === 1, `done=${doneCount} error=${errorCount}`);

  const retryBtn = page.locator("button", { hasText: /Retry failed/ });
  ok("retry-failed button appears with correct count", (await retryBtn.textContent())?.includes("(1)") ?? false);

  const zipBtn = page.locator("button", { hasText: /Download all as ZIP/ });
  ok("zip button still offered for the 2 that succeeded", (await zipBtn.textContent())?.includes("(2)") ?? false);

  await page.close();
}

async function testBatchRemoveAndCancel() {
  console.log("\n[batch: remove item before converting, then cancel mid-run]");
  const page = await browser.newPage();
  // Slow the worker down (without breaking it) so there's a real window to
  // cancel in — otherwise these small fixtures convert faster than the test
  // can click Cancel. Same technique as the single-file cancellation test.
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class SlowWorker extends OriginalWorker {
      constructor(url, opts) {
        super(url, opts);
        const realPostMessage = this.postMessage.bind(this);
        this.postMessage = (data) => {
          setTimeout(() => realPostMessage(data), 3000);
        };
      }
    };
  });
  await page.goto(BASE, { waitUntil: "networkidle" });

  const files = ["01-bw-logo.png", "02-color-logo.png", "05-transparent.png", "09-photograph.jpg"].map((f) =>
    path.join(FIXTURES, f)
  );
  await page.locator('input[type="file"]').setInputFiles(files);
  await page.locator(".batch-workspace").waitFor({ timeout: 10000 });
  ok("4 items queued", (await page.locator(".batch-list__item").count()) === 4);

  await page.locator(".batch-list__remove").first().click();
  ok("removing an item drops the count to 3", (await page.locator(".batch-list__item").count()) === 3);

  await page.locator(".batch-workspace__actions .btn-primary").click();
  const cancelBtn = page.locator(".batch-workspace__actions .btn-secondary", { hasText: "Cancel" });
  await cancelBtn.waitFor({ timeout: 5000 });
  ok("Cancel button appears while a batch is converting", await cancelBtn.isVisible());
  await cancelBtn.click();

  await page.waitForFunction(() => document.querySelector(".batch-workspace__actions .btn-secondary") === null, undefined, {
    timeout: 15000,
  });
  const primaryAfterCancel = page.locator(".batch-workspace__actions .btn-primary");
  ok(
    "returns to a convertable state after cancel (not stuck, not marked complete)",
    (await primaryAfterCancel.textContent())?.includes("Convert") ?? false
  );

  await page.close();
}

async function testSingleFileStillWorksAlongsideBatch() {
  console.log("\n[batch: single-file upload is unaffected]");
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });

  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  ok("single file does NOT enter batch mode", (await page.locator(".batch-workspace").count()) === 0);
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  ok("single file reaches the normal ready state", true);

  await page.close();
}

await testBatchHappyPath();
await testBatchPartialFailure();
await testBatchRemoveAndCancel();
await testSingleFileStillWorksAlongsideBatch();

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
