// Ad hoc visual evidence using the shared simulation and actual game renderer.
// The Playwright spec separately exercises the production-built complete app.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const server = await createServer({
  server: { host: "127.0.0.1", port: 4184, strictPort: true },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
      viewport: { width: 1280, height: 1050 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(
    "http://127.0.0.1:4184/tests/fixtures/cup-capture/probe.html",
  );
  await page.waitForFunction(() => !!window.cupProbe);
  const cases = [
      ["slow", 1],
      ["fast", 0.04],
      ["airborne", 0.06],
      ["lip", 1.5],
    ],
    results = [];
  for (const [name, time] of cases) {
    const r = await page.evaluate(
      ([name, time]) => window.cupProbe.select(name, time),
      [name, time],
    );
    assert.equal(r.mode, name === "slow" ? "sunk" : "play");
    if (name === "airborne") assert(r.position[2] > 20);
    if (name === "lip") assert(r.events.some((e) => e.type === "cup_lip"));
    results.push(r);
    await page.screenshot({
      path: `tests/fixtures/cup-capture/browser/${name}.png`,
    });
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    "tests/fixtures/cup-capture/browser/results.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        browser: await browser.version(),
        headless: true,
        viewport: { width: 1280, height: 1050 },
        results,
        errors,
        limitations:
          "Diagnostic fixture rendered with real game renderer; production app covered separately; no human feel approval.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Chrome visual probe passed: slow capture, fast overshoot, airborne crossing and lip-out.",
  );
} finally {
  await browser?.close();
  await server.close();
}
