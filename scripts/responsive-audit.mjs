import { chromium } from "playwright";
import path from "path";

const BASE = "http://localhost:5185";
const FIXTURES = path.resolve("test/fixtures");

const VIEWPORTS = [
  // Mobile
  { w: 320, h: 568, label: "mobile-320x568" },
  { w: 360, h: 800, label: "mobile-360x800" },
  { w: 375, h: 812, label: "mobile-375x812" },
  { w: 390, h: 844, label: "mobile-390x844" },
  { w: 430, h: 932, label: "mobile-430x932" },
  // Mobile landscape (a couple representative)
  { w: 812, h: 375, label: "mobile-landscape-812x375" },
  { w: 932, h: 430, label: "mobile-landscape-932x430" },
  // Tablet
  { w: 768, h: 1024, label: "tablet-768x1024" },
  { w: 820, h: 1180, label: "tablet-820x1180" },
  { w: 834, h: 1194, label: "tablet-834x1194" },
  { w: 912, h: 1368, label: "tablet-912x1368" },
  { w: 1024, h: 1366, label: "tablet-1024x1366" },
  // Tablet landscape
  { w: 1024, h: 768, label: "tablet-landscape-1024x768" },
  { w: 1180, h: 820, label: "tablet-landscape-1180x820" },
  // Desktop
  { w: 1280, h: 720, label: "desktop-1280x720" },
  { w: 1366, h: 768, label: "desktop-1366x768" },
  { w: 1440, h: 900, label: "desktop-1440x900" },
  { w: 1536, h: 864, label: "desktop-1536x864" },
  { w: 1920, h: 1080, label: "desktop-1920x1080" },
];

let issues = [];

function report(viewportLabel, state, issue, detail = "") {
  issues.push({ viewportLabel, state, issue, detail });
  console.log(`  ISSUE [${viewportLabel}] [${state}] ${issue} ${detail}`);
}

async function checkOverflow(page, viewportLabel, state) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const hScroll = doc.scrollWidth > doc.clientWidth + 1;
    // Find the worst offending element(s)
    const offenders = [];
    if (hScroll) {
      const all = document.querySelectorAll("body *");
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        if (rect.right > doc.clientWidth + 1 || rect.left < -1) {
          offenders.push({
            tag: el.tagName,
            cls: el.className && typeof el.className === "string" ? el.className.slice(0, 60) : "",
            right: Math.round(rect.right),
            left: Math.round(rect.left),
          });
        }
      }
    }
    return { hScroll, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders: offenders.slice(0, 5) };
  });
  if (result.hScroll) {
    report(viewportLabel, state, "horizontal scroll", JSON.stringify(result));
  }
  return result;
}

async function checkTouchTargets(page, viewportLabel, state, selectors) {
  for (const sel of selectors) {
    const boxes = await page.locator(sel).evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 };
      })
    );
    for (const b of boxes) {
      if (!b.visible) continue;
      if (b.h < 40 || (sel.includes("btn") && b.w < 40)) {
        report(viewportLabel, state, `small touch target on ${sel}`, JSON.stringify(b));
      }
    }
  }
}

async function checkTextClipping(page, viewportLabel, state) {
  // Elements whose scrollWidth exceeds clientWidth (ellipsis/clip) are fine if intentional (title attr),
  // but headings/paragraphs with overflow visible getting cut off are not.
  const clipped = await page.evaluate(() => {
    const problems = [];
    const headings = document.querySelectorAll("h1, h2, h3, .btn, .segmented button");
    for (const el of headings) {
      const style = getComputedStyle(el);
      if (style.overflow === "hidden" && el.scrollWidth > el.clientWidth + 2 && style.textOverflow !== "ellipsis") {
        problems.push({ tag: el.tagName, cls: el.className, text: el.textContent?.slice(0, 40) });
      }
    }
    return problems;
  });
  if (clipped.length > 0) {
    report(viewportLabel, state, "text clipped without ellipsis", JSON.stringify(clipped));
  }
}

const browser = await chromium.launch();

async function auditEmptyState(page, v) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await checkOverflow(page, v.label, "empty");
  await checkTouchTargets(page, v.label, "empty", [".site-header__cta", ".upload-zone"]);
  await checkTextClipping(page, v.label, "empty");
}

async function auditReadyState(page, v, file = "02-color-logo.png") {
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, file));
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  await checkOverflow(page, v.label, "ready");
  await checkTouchTargets(page, v.label, "ready", [".conversion-settings__cta", ".segmented button", ".file-preview .btn-secondary"]);
  await checkTextClipping(page, v.label, "ready");
}

async function auditResultState(page, v) {
  await page.locator(".conversion-settings__cta").click();
  await page.waitForSelector(".result-screen, .error-state", { timeout: 30000 });
  if ((await page.locator(".error-state").count()) > 0) {
    report(v.label, "result", "unexpected error state", await page.locator(".error-state__message").textContent());
    return;
  }
  await checkOverflow(page, v.label, "result");
  await checkTouchTargets(page, v.label, "result", [
    ".result-screen__download",
    ".result-screen__actions .btn-secondary",
    ".compare-slider__handle",
    ".compare-slider__toggle button",
  ]);
  await checkTextClipping(page, v.label, "result");

  // Comparison frame must not overflow its container
  const overflowCheck = await page.evaluate(() => {
    const frame = document.querySelector(".compare-slider__frame");
    const parent = frame?.parentElement;
    if (!frame || !parent) return null;
    const f = frame.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    return { frameRight: f.right, parentRight: p.right, overflows: f.right > p.right + 1 };
  });
  if (overflowCheck?.overflows) {
    report(v.label, "result", "compare-slider frame overflows its container", JSON.stringify(overflowCheck));
  }
}

async function auditErrorState(page, v) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await page.locator(".error-state").waitFor({ timeout: 10000 });
  await checkOverflow(page, v.label, "error");
  await checkTouchTargets(page, v.label, "error", [".error-state__actions .btn"]);
  await checkTextClipping(page, v.label, "error");
}

async function auditLongFilename(page, v) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  const fs = await import("fs");
  const buf = fs.readFileSync(path.join(FIXTURES, "02-color-logo.png"));
  const longName =
    "this-is-an-extremely-long-filename-designed-to-test-overflow-behavior-in-the-file-metadata-and-result-screen-components-01.png";
  await page.locator('input[type="file"]').setInputFiles({ name: longName, mimeType: "image/png", buffer: buf });
  await page.locator(".conversion-status__subtext", { hasText: /Ready to convert/ }).waitFor({ timeout: 10000 });
  await checkOverflow(page, v.label, "long-filename-ready");
  await page.locator(".conversion-settings__cta").click();
  await page.waitForSelector(".result-screen, .error-state", { timeout: 30000 });
  await checkOverflow(page, v.label, "long-filename-result");
}

async function runForViewport(v) {
  const page = await browser.newPage({ viewport: { width: v.w, height: v.h } });
  console.log(`\n=== ${v.label} ===`);
  await auditEmptyState(page, v);
  await auditReadyState(page, v);
  await auditResultState(page, v);
  await auditErrorState(page, v);
  await auditLongFilename(page, v);
  await page.close();
}

for (const v of VIEWPORTS) {
  await runForViewport(v);
}

await browser.close();

console.log(`\n\nTotal issues: ${issues.length}`);
if (issues.length > 0) {
  console.log(JSON.stringify(issues, null, 2));
}
process.exit(0);
