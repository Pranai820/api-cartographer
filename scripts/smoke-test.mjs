#!/usr/bin/env node
// Loads the built extension into a real headless Chromium instance and
// checks that it installs and its surfaces render without errors.
// Requires the Chromium browser once: `npx playwright install chromium`.
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(rootDir, "dist");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function checkPage(context, extensionId, path, expectedText) {
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });

  await page.goto(`chrome-extension://${extensionId}/${path}`);
  await page.waitForLoadState("networkidle");

  const bodyText = await page.locator("body").innerText();
  assert(bodyText.includes(expectedText), `expected ${path} body to include "${expectedText}", got: ${bodyText}`);
  assert(consoleErrors.length === 0, `console errors on ${path}: ${consoleErrors.join("; ")}`);

  await page.close();
}

async function main() {
  console.log("Building extension...");
  execSync("npm run build", { cwd: rootDir, stdio: "inherit" });

  const userDataDir = mkdtempSync(join(tmpdir(), "api-cartographer-smoke-"));
  // Playwright's `headless: true` launch path doesn't support extensions;
  // pass `--headless=new` directly instead (supported since Chrome 109).
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: ["--headless=new", `--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`]
  });

  try {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    }

    const extensionId = serviceWorker.url().split("/")[2];
    assert(Boolean(extensionId), "could not determine extension id from service worker url");
    console.log(`Extension installed: ${extensionId}`);

    await checkPage(context, extensionId, "popup.html", "API Cartographer");
    console.log("popup.html rendered without errors");

    await checkPage(context, extensionId, "panel.html", "Network Map");
    console.log("panel.html rendered without errors");

    console.log("Smoke test passed.");
  } finally {
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("Smoke test failed:", error.message);
  process.exitCode = 1;
});
