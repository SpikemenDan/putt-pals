// S2: the real modular app must no longer score merely from overlap with the cup.
// Inputs use public UI/shot commands; the app hook is read-only.
const { test, expect } = require("@playwright/test");
const { openApp, until } = require("./support/app.cjs");
const legacy = require("../fixtures/solver-baseline.json").results.find(
  (r) => r.map === 0 && r.putt === 0,
).best;
const current = require("../fixtures/cup-capture/solutions.json").results.find(
  (r) => r.map === 0 && r.putt === 0,
).best;

test("cup: a historical grazing capture now misses, while a centred shot still sinks", async ({
  page,
}, testInfo) => {
  const ana = await openApp(page, "Cup tester");
  await ana.solo();
  await ana.ui("room-lobby").locator("select").selectOption("putt_practice");
  await ana.button("Start Game").click();
  await ana.ui("map-select").locator("button[data-v]").first().click();
  await ana.button("Putt 1 · Par 2").click();
  await until(() => ana.ready(), { label: "ready for cup regression" });
  await page.evaluate(() => {
    window.__s2Trace = [];
    const observe = () => {
      const p = window.__ppApp.putt?.player;
      const c = window.__ppApp.putt?.course;
      if (p && c && p.strokes > 0)
        window.__s2Trace.push({
          x: p.x,
          y: p.y,
          z: p.z,
          mode: p.mode,
          distance: Math.hypot(p.x - c.hole[0], p.y - c.hole[1]),
        });
      window.__s2Observer = requestAnimationFrame(observe);
    };
    observe();
  });
  await ana.shoot(legacy.deg, legacy.power);
  await until(
    async () =>
      (await page.evaluate(() => window.__ppApp.putt?.player?.strokes)) === 1 &&
      (await ana.ready()),
    { label: "grazing shot at rest" },
  );
  const miss = await page.evaluate(() => ({
    trace: window.__s2Trace,
    mode: window.__ppApp.putt.player.mode,
    strokes: window.__ppApp.putt.player.strokes,
  }));
  expect(miss.mode).toBe("play");
  expect(miss.strokes).toBe(1);
  expect(
    Math.min(...miss.trace.map((p) => p.distance)),
    "shot overlaps the default radius-15 cup",
  ).toBeLessThan(15);
  expect(miss.trace.every((p) => p.mode !== "sunk")).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("cup-miss.png") });
  await ana.button("Restart").click();
  await until(() => ana.ready(), { label: "restart" });
  await page.evaluate(() => {
    window.__s2Trace = [];
  });
  await ana.shoot(current.deg, current.power);
  await until(
    async () =>
      (await page.evaluate(() => window.__ppApp.putt?.player?.mode)) === "sunk",
    { label: "centred shot captures" },
  );
  const capture = await page.evaluate(() => {
    cancelAnimationFrame(window.__s2Observer);
    return {
      trace: window.__s2Trace,
      mode: window.__ppApp.putt.player.mode,
      strokes: window.__ppApp.putt.player.strokes,
    };
  });
  expect(capture.strokes).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("cup-capture.png") });
  await testInfo.attach("cup-trajectories", {
    body: JSON.stringify({ legacy, current, miss, capture }, null, 2),
    contentType: "application/json",
  });
  expect(ana.errors, "no page or console errors").toEqual([]);
});
