// Clicks through a demo workout in a real browser and saves screenshots.
// Run: npm run e2e   (needs Playwright + Chromium; screenshots go to $SHOTS or ./shots)

const { execSync, spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const globalRoot = execSync("npm root -g").toString().trim();
const { chromium, devices } = require(path.join(globalRoot, "playwright"));

const PORT = 4173 + Math.floor(Math.random() * 500);
const SHOTS = process.env.SHOTS || path.join(__dirname, "..", "shots");
fs.mkdirSync(SHOTS, { recursive: true });

function serve() {
  const root = path.join(__dirname, "..", "web");
  const bin = path.join(globalRoot, "http-server", "bin", "http-server");
  const p = spawn(process.execPath, [bin, root, "-p", String(PORT), "-c-1", "-s"], { stdio: "ignore" });
  return new Promise((resolve) => setTimeout(() => resolve(p), 800));
}

function check(cond, msg) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function run(name, device) {
  console.log(`\n${name}`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...device, serviceWorkers: "block" });
  const page = await ctx.newPage();
  // The demo never calls the Sheet; keep these runs offline from Google whatever config.js says.
  await page.route("**/config.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: 'export const API_URL = ""; export const APP_NAME = "Coach Sahaj";' }),
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text()) && errors.push(m.text()));
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${name}-${n}.png`), fullPage: false });

  await page.goto(`http://localhost:${PORT}/?u=demo`);
  await page.waitForSelector(".exlist");
  check((await page.textContent(".eyebrow")).includes("Session 2 of 4"), "demo opens on session 2 (session 1 already done)");
  check((await page.textContent(".title")).includes("Week 1 · Day B"), "shows Week 1 · Day B");
  check((await page.locator(".mcard").count()) >= 3, "target muscle cards render");
  await shot("1-home");

  await page.click("[data-a=start]");
  await page.waitForSelector(".srow");
  check((await page.textContent(".extitle")).trim() === "DB Hip Thrust", "workout starts on the first exercise");
  check((await page.locator(".srow").count()) === 4, "1 warm-up + 3 working sets");
  await shot("2-workout");

  // Tick the warm-up (uses the suggested numbers), then type a working set.
  await page.click('.chk[data-si="0"]');
  check(await page.locator('.srow.done').count() === 1, "warm-up ticked from suggestions");
  const kg = page.locator('input[data-si="1"][data-f="kg"]');
  await kg.fill("12");
  await page.locator('input[data-si="1"][data-f="reps"]').fill("11");
  await page.click('.chk[data-si="1"]');
  await page.waitForSelector(".rirgrid");
  await page.waitForTimeout(400);
  await shot("3-rir");
  await page.click('.rirbtn[data-v="2"]');
  check((await page.textContent('.cell.rir[data-si="1"]')).trim() === "2", "RIR saved on the set");
  check((await page.textContent("[data-rest]")).trim() !== "0:00", "rest timer started");
  check((await page.textContent(".setlabel")).includes("Set 2 of 3"), "label moves to set 2 of 3");
  await shot("4-logged");

  await page.click("[data-a=toggleLast]");
  check((await page.textContent(".tgl")).includes("Last"), "target/last toggle flips");
  await page.click("[data-a=toggleLast]");

  // Persisted across reload mid-workout.
  await page.reload();
  await page.waitForSelector(".srow");
  check(await page.locator(".srow.done").count() === 2, "workout survives a reload");

  await page.click("[data-a=info]");
  await page.waitForSelector(".sh-title");
  await page.waitForTimeout(400);
  await shot("5-info");
  await page.click(".backdrop", { position: { x: 10, y: 10 } });

  // Go to the bodyweight exercise (no kg column).
  await page.click('.tile[data-i="3"]');
  check((await page.textContent(".extitle")).trim() === "Glute Bridge", "jump via the exercise strip");
  check(await page.locator('input[data-f="kg"]').count() === 0, "bodyweight exercise hides kg");
  await page.click("[data-a=tickAll]");
  check(await page.locator(".srow.done").count() === 2, "tick-all completes every set");
  await shot("6-bodyweight");

  await page.click("[data-a=finish]");
  await page.waitForSelector(".stats");
  await page.fill("#fnote", "Felt strong today");
  await shot("7-finish");
  await page.click("[data-a=finishSave]");
  await page.waitForSelector(".donecheck");
  await page.waitForTimeout(300);
  await shot("8-done");

  await page.click("[data-a=home]");
  await page.waitForSelector(".exlist");
  check((await page.textContent(".eyebrow")).includes("Session 3 of 4"), "home moves on to session 3");
  await page.click("[data-a=history]");
  await page.waitForSelector(".hcard");
  check(await page.locator(".hcard").count() === 2, "history lists both finished sessions");
  await page.click(".hhead");
  await shot("9-history");

  await page.waitForFunction(() => JSON.parse(localStorage.getItem("wt.queue.demo") || "[]").length === 0, null, { timeout: 5000 });
  const db = await page.evaluate(() => JSON.parse(localStorage.getItem("wt.demo.db")));
  const mine = db.log.filter((r) => r.session === 2);
  check(mine.length === 4, `4 sets reached the store (got ${mine.length})`);
  check(mine.some((r) => r.kg === "12" && r.reps === "11" && r.rir === "2" && r.set_no === 1), "typed set stored with RIR");
  check(db.sessions.some((s) => s.session === 2 && s.note === "Felt strong today"), "session note stored");

  // Second pass over the less common controls.
  await page.click("[data-a=home]");
  await page.click("[data-a=pick]");
  await page.click('.sh-item[data-n="4"]');
  check((await page.textContent(".title")).includes("Week 2 · Day B"), "a different session can be picked");
  await page.click("[data-a=start]");
  await page.waitForSelector(".srow");
  await page.click("[data-a=note]");
  await page.fill('textarea[data-f="exnote"]', "Left hip a bit tight");
  await page.click(".panel [data-a=closeSheet]");
  check(await page.locator(".pill.has").count() === 1, "exercise note marks the Note pill");
  const before = await page.locator(".srow").count();
  await page.click('.badge[data-si="1"]');
  await page.click("[data-a=toggleType]");
  check(await page.locator(".badge.w").count() === 2, "a working set can become a warm-up");
  await page.click('.badge[data-si="0"]');
  await page.click("[data-a=deleteSet]");
  check(await page.locator(".srow").count() === before - 1, "a set can be deleted");
  await page.click("[data-a=rest]");
  await page.click('[data-a=restStart][data-v="60"]');
  await page.click('[data-a=restAdj][data-v="15"]');
  check(["1:15", "1:14"].includes((await page.textContent(".bigclock")).trim()), "rest +15s works");
  await page.click("[data-a=restSkip]");
  check((await page.textContent("[data-rest]")).trim() === "0:00", "rest can be skipped");
  await page.click('.chk[data-si="0"]');
  await page.click("[data-a=menu]");
  await page.click("[data-a=discard]");
  await page.click("[data-a=discardYes]");
  await page.waitForSelector(".exlist");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("wt.queue.demo") || "[]").length === 0, null, { timeout: 5000 });
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("wt.demo.db")).log.filter((r) => r.session === 4).length);
  check(after === 0, "discarding removes the sets it had saved");

  // Landing page without a link, and a real-looking link before the Sheet is connected.
  await page.evaluate(() => localStorage.clear());
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector("[data-a=demo]");
  check(true, "landing page shows without a link");
  await page.goto(`http://localhost:${PORT}/?u=abc123def456`);
  await page.waitForSelector("[data-a=retry]");
  check((await page.textContent(".title")).includes("Not connected"), "unconnected app explains itself");

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await browser.close();
}

(async () => {
  const server = await serve();
  try {
    await run("iphone", devices["iPhone 13"]);
    await run("ipad", devices["iPad (gen 7)"]);
    await run("small-android", { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    console.log(`\nScreenshots in ${SHOTS}`);
  } finally {
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
