import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4183",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
let browser;
try {
  let available = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch("http://127.0.0.1:4183");
      if (r.ok) {
        available = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(available, serverLog);
  browser = await chromium.launch({
    channel: process.env.P1_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [],
    warnings = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
    if (m.type() === "warning") warnings.push(m.text());
  });
  await page.goto("http://127.0.0.1:4183");
  await page.waitForFunction(() => window.p1Diagnostics?.().ready);
  const results = [];
  for (const scene of ["flat", "ramp", "drop", "tube"]) {
    await page.selectOption("#scene", scene);
    await page.locator("#power").fill("70");
    await page.locator("#angle").fill("0");
    await page.click("#shoot");
    await page.waitForFunction(() => window.p1Diagnostics().elapsed >= 2);
    const d = await page.evaluate(() => window.p1Diagnostics());
    assert.equal(d.scene, scene);
    assert(d.position.every(Number.isFinite));
    assert(d.frameCount > 10);
    results.push(d);
    if (scene === "tube") await page.screenshot({ path: "browser-tube.png" });
  }
  assert.deepEqual(errors, []);
  const report = {
    generatedAt: new Date().toISOString(),
    browser: await browser.version(),
    headless: true,
    viewport: { width: 1280, height: 900 },
    results,
    errors,
    warnings,
    limitations:
      "Real browser production-bundle smoke, not a human feel/listening or full-game test.",
  };
  writeFileSync("browser-results.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
