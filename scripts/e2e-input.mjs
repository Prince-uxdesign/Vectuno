// Image-input experience: every way of getting an image into Vectuno (picker,
// drag-and-drop, page-level drop, clipboard paste) must converge on the same
// validate -> decode -> preview -> convert workflow. Requires the dev server:
//   npx vite --port 5185
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = process.env.BASE_URL ?? "http://localhost:5185";
const FIXTURES = path.resolve("test/fixtures");
const SHOTS = process.env.SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

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

async function newPage(contextOptions = {}) {
  const context = await browser.newContext({ acceptDownloads: true, ...contextOptions });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  return { page, context, errors };
}

// Build a DataTransfer inside the page from raw bytes (fixture or synthetic).
async function dataTransferFor(page, { name, type, bytes }) {
  return page.evaluateHandle(
    ({ name, type, b64 }) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([arr], name, { type }));
      return dt;
    },
    { name, type, b64: Buffer.from(bytes).toString("base64") }
  );
}

function fixture(name, type) {
  return { name, type, bytes: readFileSync(path.join(FIXTURES, name)) };
}

async function dropOn(page, selector, file) {
  const dataTransfer = await dataTransferFor(page, file);
  await page.dispatchEvent(selector, "dragenter", { dataTransfer });
  await page.dispatchEvent(selector, "dragover", { dataTransfer });
  await page.dispatchEvent(selector, "drop", { dataTransfer });
}

async function pasteFile(page, file) {
  const dataTransfer = await dataTransferFor(page, file);
  await page.evaluate((dt) => {
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, dataTransfer);
}

async function waitWorkspace(page) {
  await page.locator(".file-metadata__details").waitFor({ timeout: 10000 });
  // Decoding finished when the dimensions have replaced the "reading…" placeholder.
  await page.waitForFunction(() => !document.querySelector(".file-metadata__pending"), null, { timeout: 15000 });
}

async function showError(page) {
  await page.locator(".error-state").waitFor({ timeout: 10000 });
  return (await page.locator(".error-state").textContent()) ?? "";
}

async function convert(page) {
  await page.locator(".conversion-settings__cta").click();
  await page.locator(".result-screen").waitFor({ timeout: 60000 });
}

async function backToLanding(page) {
  await page.getByRole("button", { name: "Change image" }).click();
  await page.locator(".upload-zone").waitFor();
}

async function downloadSvg(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download SVG" }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return { name: download.suggestedFilename(), text: Buffer.concat(chunks).toString("utf8") };
}

// ------------------------------------------------------------------ picker
async function testPicker() {
  console.log("\n[file picker]");
  const { page, errors, context } = await newPage();
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await waitWorkspace(page);
  ok("shows filename", (await page.locator(".file-metadata__name").textContent()) === "02-color-logo.png");
  const details = (await page.locator(".file-metadata__details").textContent()) ?? "";
  ok("shows 'PNG · 512 × 512 · size' line", /^PNG · 512 × 512 · [\d.]+ KB/.test(details), details);
  ok("no transparency flag on an opaque PNG", (await page.locator(".file-metadata__flag").count()) === 0);
  ok("no background control for an opaque image", (await page.locator(".bg-toggle").count()) === 0);
  await convert(page);
  ok("converts to a result screen", true);
  ok("no console errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

// ------------------------------------------------------------- drag & drop
async function testDragDrop() {
  console.log("\n[drag and drop]");
  const { page, errors, context } = await newPage();
  const file = fixture("01-bw-logo.png", "image/png");
  const dataTransfer = await dataTransferFor(page, file);

  await page.dispatchEvent(".upload-zone", "dragenter", { dataTransfer });
  ok("zone shows active state on drag over", (await page.locator(".upload-zone--active").count()) === 1);
  ok(
    "active state is also stated in text (not color only)",
    ((await page.locator(".upload-zone__label--pointer").textContent()) ?? "").includes("Release")
  );
  ok(
    "drag state is announced to screen readers",
    ((await page.locator('.upload-zone [role="status"][aria-live="assertive"]').textContent()) ?? "").includes("Release")
  );
  await page.dispatchEvent(".upload-zone", "dragleave", { dataTransfer });
  ok("zone returns to normal on leave", (await page.locator(".upload-zone--active").count()) === 0);

  await page.dispatchEvent(".upload-zone", "dragenter", { dataTransfer });
  await page.dispatchEvent(".upload-zone", "drop", { dataTransfer });
  await waitWorkspace(page);
  ok("drop lands in the normal workspace", (await page.locator(".file-metadata__name").textContent()) === "01-bw-logo.png");
  ok("no console errors", errors.length === 0, errors.join(" | "));
  await context.close();

  // Dropping outside the zone must not navigate away, and still ingests.
  {
    const { page, context } = await newPage();
    await dropOn(page, ".hero__heading", fixture("03-icon.png", "image/png"));
    await waitWorkspace(page);
    ok("page-level drop (outside zone) is accepted", (await page.locator(".file-metadata__name").textContent()) === "03-icon.png");
    ok("stayed on the app (no navigation)", page.url().startsWith(BASE));
    await context.close();
  }

  // Unsupported drag: invalid state + useful error on drop
  {
    const { page, context } = await newPage();
    const txt = { name: "notes.txt", type: "text/plain", bytes: Buffer.from("hello") };
    const dt = await dataTransferFor(page, txt);
    await page.dispatchEvent(".upload-zone", "dragenter", { dataTransfer: dt });
    ok("unsupported drag shows invalid state", (await page.locator(".upload-zone--invalid").count()) === 1);
    ok(
      "invalid state is text, not just color",
      ((await page.locator(".upload-zone__label").first().textContent()) ?? "").includes("isn't supported")
    );
    await page.dispatchEvent(".upload-zone", "drop", { dataTransfer: dt });
    const msg = await showError(page);
    ok("unsupported drop explains itself", msg.includes("isn't supported") && msg.includes("PNG, JPG, JPEG, or WebP"), msg);
    await context.close();
  }

  // Multiple files -> batch workflow
  {
    const { page, context } = await newPage();
    const dt = await page.evaluateHandle(
      ({ a, b }) => {
        const mk = (n, b64) => {
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new File([arr], n, { type: "image/png" });
        };
        const d = new DataTransfer();
        d.items.add(mk("a.png", a));
        d.items.add(mk("b.png", b));
        return d;
      },
      {
        a: readFileSync(path.join(FIXTURES, "01-bw-logo.png")).toString("base64"),
        b: readFileSync(path.join(FIXTURES, "03-icon.png")).toString("base64"),
      }
    );
    await page.dispatchEvent(".upload-zone", "drop", { dataTransfer: dt });
    await page.locator(".batch-workspace").waitFor({ timeout: 10000 });
    ok("multiple dropped files enter the batch workflow", (await page.locator(".batch-list__item").count()) === 2);
    await context.close();
  }
}

// --------------------------------------------------------------- clipboard
async function testPaste() {
  console.log("\n[clipboard paste]");
  {
    const { page, errors, context } = await newPage();
    await pasteFile(page, { name: "image.png", type: "image/png", bytes: readFileSync(path.join(FIXTURES, "02-color-logo.png")) });
    await waitWorkspace(page);
    const name = (await page.locator(".file-metadata__name").textContent()) ?? "";
    ok("pasted image enters the normal workspace", /^pasted-image-\d{8}-\d{6}\.png$/.test(name), name);
    ok("pasted image is decoded + described like any upload", /^PNG · 512 × 512/.test((await page.locator(".file-metadata__details").textContent()) ?? ""));
    await convert(page);
    const dl = await downloadSvg(page);
    ok("pasted image converts and downloads with a sensible name", /^pasted-image-\d{8}-\d{6}\.svg$/.test(dl.name), dl.name);
    ok("no console errors", errors.length === 0, errors.join(" | "));
    await context.close();
  }

  {
    const { page, context } = await newPage();
    const dt = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.setData("text/plain", "just some text");
      return d;
    });
    await page.evaluate((d) => document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: d, bubbles: true, cancelable: true })), dt);
    await page.locator(".upload-zone__notice").waitFor({ timeout: 3000 });
    const notice = (await page.locator(".upload-zone__notice").textContent()) ?? "";
    ok("pasting non-image content shows a gentle notice", notice.includes("No image found"), notice);
    ok("stays on the upload screen, no error state", (await page.locator(".error-state").count()) === 0 && (await page.locator(".upload-zone").count()) === 1);
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "01-bw-logo.png"));
    await waitWorkspace(page);
    ok("normal upload still works after a failed paste", true);
    await context.close();
  }

  {
    const { page, context } = await newPage();
    await pasteFile(page, { name: "image.gif", type: "image/gif", bytes: Buffer.from("GIF89a") });
    const msg = await showError(page);
    ok("pasted unsupported image type gets the same clear error", msg.includes("isn't supported"), msg);
    await context.close();
  }

  // Real system clipboard + real keyboard shortcut (Chromium only).
  {
    const { page, context } = await newPage();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    const b64 = readFileSync(path.join(FIXTURES, "05-transparent.png")).toString("base64");
    const wrote = await page.evaluate(async (b64) => {
      try {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([arr], { type: "image/png" }) })]);
        return true;
      } catch (e) {
        return String(e);
      }
    }, b64);
    if (wrote !== true) {
      console.log(`  SKIP real clipboard write not possible here: ${wrote}`);
    } else {
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("ControlOrMeta+V");
      try {
        await waitWorkspace(page);
        ok("real Ctrl/Cmd+V with a real clipboard image works (Chromium)", true);
        ok("transparency detected on pasted transparent PNG", (await page.locator(".file-metadata__flag").count()) === 1);
      } catch {
        ok("real Ctrl/Cmd+V with a real clipboard image works (Chromium)", false, "no workspace after keypress");
      }
    }
    await context.close();
  }
}

// ---------------------------------------------------------------- validation
async function testValidation() {
  console.log("\n[validation]");
  const cases = [
    { label: "corrupt (truncated) PNG", file: fixture("14-corrupted.png", "image/png"), expect: "couldn't read" },
    { label: "text file renamed .png", file: { name: "fake.png", type: "image/png", bytes: Buffer.from("this is not an image at all") }, expect: "couldn't read" },
    { label: "empty file", file: { name: "empty.png", type: "image/png", bytes: Buffer.alloc(0) }, expect: "empty" },
    { label: "excessive dimensions (9000px wide)", file: fixture("15-oversized-dims.png", "image/png"), expect: "too large" },
    { label: "SVG file", file: { name: "logo.svg", type: "image/svg+xml", bytes: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") }, expect: "isn't supported" },
    { label: "PDF", file: { name: "doc.pdf", type: "application/pdf", bytes: Buffer.from("%PDF-1.4") }, expect: "isn't supported" },
    { label: "no MIME, unsupported extension", file: { name: "data.bin", type: "", bytes: Buffer.from("xyz") }, expect: "isn't supported" },
  ];
  for (const c of cases) {
    const { page, context } = await newPage();
    await dropOn(page, ".upload-zone", c.file);
    const msg = await showError(page);
    ok(`${c.label} -> "${c.expect}"`, msg.toLowerCase().includes(c.expect.toLowerCase()), msg);
    ok(`${c.label}: offers a way to try again`, (await page.locator(".error-state .btn").count()) > 0);
    await context.close();
  }

  {
    const { page, context } = await newPage();
    const dt = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.items.add(new File([new Uint8Array(21 * 1024 * 1024)], "huge.png", { type: "image/png" }));
      return d;
    });
    await page.dispatchEvent(".upload-zone", "drop", { dataTransfer: dt });
    const msg = await showError(page);
    ok("file over 20MB -> 'too large'", msg.includes("too large"), msg);
    await context.close();
  }

  // A JPEG saved with a .png name/MIME is identified by its bytes.
  {
    const { page, context } = await newPage();
    await dropOn(page, ".upload-zone", { name: "actually-a-jpeg.png", type: "image/png", bytes: readFileSync(path.join(FIXTURES, "09-photograph.jpg")) });
    await waitWorkspace(page);
    const details = (await page.locator(".file-metadata__details").textContent()) ?? "";
    ok("type comes from the file's bytes, not its name (JPEG saved as .png)", details.startsWith("JPEG"), details);
    await context.close();
  }
}

// ------------------------------------------------------------- formats etc.
async function testFormats() {
  console.log("\n[formats, transparency, background preview]");
  {
    const { page, context } = await newPage();
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "09-photograph.jpg"));
    await waitWorkspace(page);
    const details = (await page.locator(".file-metadata__details").textContent()) ?? "";
    ok("JPEG: type + dimensions shown", /^JPEG · 640 × 480/.test(details), details);
    ok("JPEG: never claims transparency", (await page.locator(".file-metadata__flag").count()) === 0);
    await context.close();
  }
  {
    const { page, context } = await newPage();
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "13-webp.webp"));
    await waitWorkspace(page);
    ok("WebP: type shown", ((await page.locator(".file-metadata__details").textContent()) ?? "").startsWith("WebP"));
    await context.close();
  }
  {
    const { page, context } = await newPage();
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "11-large.png"));
    await waitWorkspace(page);
    ok("large (4000×3000) image decodes and reports true dimensions", ((await page.locator(".file-metadata__details").textContent()) ?? "").includes("4000 × 3000"));
    ok("downsample notice shown", (await page.locator(".app-notice").count()) === 1);
    await context.close();
  }

  const { page, context, errors } = await newPage();
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "05-transparent.png"));
  await waitWorkspace(page);
  ok("transparent PNG: 'Transparency detected' shown", (await page.locator(".file-metadata__flag").textContent())?.includes("Transparency detected") ?? false);
  ok("background control appears", (await page.locator(".bg-toggle").count()) === 1);
  ok("defaults to checkerboard", (await page.locator(".file-preview__frame.preview-bg--checker").count()) === 1);
  await page.locator(".bg-toggle").getByRole("button", { name: "Black" }).click();
  ok("Black applies to the preview frame", (await page.locator(".file-preview__frame.preview-bg--black").count()) === 1);
  const bg = await page.locator(".file-preview__frame").evaluate((el) => getComputedStyle(el).backgroundColor);
  ok("Black is actually rendered black", bg === "rgb(0, 0, 0)", bg);
  await page.locator(".bg-toggle").getByRole("button", { name: "White" }).click();
  await page.locator(".bg-toggle").getByRole("button", { name: "Checker" }).click();

  await convert(page);
  ok("result screen also offers the background control", (await page.locator(".bg-toggle").count()) === 1);
  const svgA = await downloadSvg(page);
  await page.locator(".bg-toggle").getByRole("button", { name: "Black" }).click();
  const vectorMarkupBlack = await page.locator(".compare-slider__layer--vector").innerHTML();
  const svgB = await downloadSvg(page);
  await page.locator(".bg-toggle").getByRole("button", { name: "White" }).click();
  const vectorMarkupWhite = await page.locator(".compare-slider__layer--vector").innerHTML();
  ok("switching background does not change the SVG markup", vectorMarkupBlack === vectorMarkupWhite);
  ok("downloaded SVG is identical regardless of preview background", svgA.text === svgB.text);
  ok("downloaded SVG contains no preview-background artifacts", !/checker|preview-bg/i.test(svgA.text));
  ok("no console errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

// ------------------------------------------------- change image / repeat use
async function testReset() {
  console.log("\n[consecutive uploads, change image, convert another]");
  const { page, context, errors } = await newPage();
  const input = page.locator('input[type="file"]');

  await input.setInputFiles(path.join(FIXTURES, "01-bw-logo.png"));
  await waitWorkspace(page);
  await page.getByRole("radio", { name: /^Detailed/ }).check({ force: true });
  await convert(page);
  ok("first conversion complete", true);

  await page.getByRole("button", { name: "Convert another image" }).click();
  await page.locator(".upload-zone").waitFor();
  ok("Convert another image -> upload state", (await page.locator(".result-screen").count()) === 0);
  const focused = await page
    .waitForFunction(() => document.activeElement?.classList.contains("upload-zone__button"), null, { timeout: 2000 })
    .then(() => true, () => false);
  ok("upload zone is focused for keyboard users", focused);

  await input.setInputFiles(path.join(FIXTURES, "02-color-logo.png"));
  await waitWorkspace(page);
  ok("second image replaces the first", (await page.locator(".file-metadata__name").textContent()) === "02-color-logo.png");
  ok("settings reset to the default preset (Balanced)", await page.getByRole("radio", { name: /^Balanced/ }).isChecked());
  ok("no stale result is shown", (await page.locator(".result-screen").count()) === 0);

  await backToLanding(page);
  ok("Change image clears the preview + metadata", (await page.locator(".file-preview").count()) === 0 && (await page.locator(".file-metadata").count()) === 0);
  for (const f of ["03-icon.png", "04-flat-illustration.png", "10-low-res.png"]) {
    await input.setInputFiles(path.join(FIXTURES, f));
    await waitWorkspace(page);
    ok(`consecutive upload ${f}`, (await page.locator(".file-metadata__name").textContent()) === f);
    await backToLanding(page);
  }
  ok("no console errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

// -------------------------------------------------------------- responsive
const WIDTHS = [
  [320, 700], [375, 812], [390, 844], [430, 932],
  [768, 1024], [820, 1180], [912, 1368],
  [1024, 768], [1280, 800], [1440, 900], [1920, 1080],
];
const TOUCH_WIDTHS = new Set([320, 375, 390, 430, 768, 820, 912]);

async function overflowReport(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || el.closest(".showcase")) continue;
      if (r.right > vw + 1 || r.left < -1) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
    }
    return { scrollW: document.documentElement.scrollWidth, vw, offenders: offenders.slice(0, 6) };
  });
}

async function smallTargets(page, selectors) {
  return page.evaluate((selectors) => {
    const out = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 43.5 || r.width < 43.5) out.push(`${sel} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return out;
  }, selectors);
}

async function testResponsive() {
  console.log("\n[responsive: no overflow, comfortable targets]");
  for (const [w, h] of WIDTHS) {
    const touch = TOUCH_WIDTHS.has(w);
    const { page, context } = await newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 768 });
    const tag = `${w}px${touch ? " (touch)" : ""}`;

    let r = await overflowReport(page);
    ok(`${tag} landing: no horizontal overflow`, r.scrollW <= r.vw && r.offenders.length === 0, `${r.scrollW}>${r.vw} ${r.offenders.join("; ")}`);
    if (touch) {
      const browse = await page.locator(".upload-zone__browse-btn").boundingBox();
      ok(`${tag} landing: prominent Browse files button (>=48px tall)`, !!browse && browse.height >= 48, JSON.stringify(browse));
      const small = await smallTargets(page, [".upload-zone__button", ".site-header .btn"]);
      ok(`${tag} landing: touch targets >= 44px`, small.length === 0, small.join(", "));
    }
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `landing-${w}.png`), fullPage: true });

    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "05-transparent.png"));
    await waitWorkspace(page);
    r = await overflowReport(page);
    ok(`${tag} workspace: no horizontal overflow`, r.scrollW <= r.vw && r.offenders.length === 0, `${r.scrollW}>${r.vw} ${r.offenders.join("; ")}`);
    if (touch) {
      const small = await smallTargets(page, [".file-preview .btn", ".bg-toggle button", ".preset-card", ".conversion-settings__cta"]);
      ok(`${tag} workspace: touch targets >= 44px`, small.length === 0, small.join(", "));
    }
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `workspace-${w}.png`), fullPage: true });

    await convert(page);
    r = await overflowReport(page);
    ok(`${tag} result: no horizontal overflow`, r.scrollW <= r.vw && r.offenders.length === 0, `${r.scrollW}>${r.vw} ${r.offenders.join("; ")}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `result-${w}.png`), fullPage: true });
    await context.close();
  }

  // Orientation change on phones
  for (const [w, h] of [[844, 390], [932, 430]]) {
    const { page, context } = await newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "05-transparent.png"));
    await waitWorkspace(page);
    const r = await overflowReport(page);
    ok(`landscape ${w}×${h} workspace: no horizontal overflow`, r.scrollW <= r.vw && r.offenders.length === 0, `${r.scrollW}>${r.vw} ${r.offenders.join("; ")}`);
    await context.close();
  }

  // Long filename must not overflow the metadata
  {
    const { page, context } = await newPage({ viewport: { width: 320, height: 700 } });
    const name = "this-is-an-extremely-long-filename-designed-to-test-overflow-behavior-in-the-file-metadata-component-01.png";
    await dropOn(page, ".upload-zone", { name, type: "image/png", bytes: readFileSync(path.join(FIXTURES, "01-bw-logo.png")) });
    await waitWorkspace(page);
    const r = await overflowReport(page);
    ok("320px long filename: no overflow", r.scrollW <= r.vw && r.offenders.length === 0, `${r.scrollW}>${r.vw} ${r.offenders.join("; ")}`);
    await context.close();
  }
}

// -------------------------------------------------------------- keyboard / a11y
async function testKeyboard() {
  console.log("\n[keyboard + accessibility]");
  const { page, context } = await newPage();
  const label = await page.locator(".upload-zone__button").getAttribute("aria-label");
  ok("upload control has an accessible name", !!label && label.includes("Upload"));
  ok("file input is hidden from AT and the tab order", (await page.locator('.upload-zone input[type="file"]').getAttribute("aria-hidden")) === "true");
  await page.locator(".upload-zone__button").focus();
  const outline = await page.locator(".upload-zone__button").evaluate((el) => getComputedStyle(el).outlineStyle);
  ok("upload control shows a visible focus ring", outline !== "none");
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  ok("Enter on the focused control opens the native picker", !!(await chooser));
  ok("paste + best-for guidance present", ((await page.locator(".upload-zone__guidance").textContent()) ?? "").includes("paste from your clipboard") && ((await page.locator(".upload-zone__best").textContent()) ?? "").includes("logos, icons, illustrations, and brand graphics"));
  await context.close();
}

await testPicker();
await testDragDrop();
await testPaste();
await testValidation();
await testFormats();
await testReset();
await testKeyboard();
await testResponsive();

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
