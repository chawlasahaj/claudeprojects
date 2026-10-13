// The app talking to the real Code.gs, served the way Apps Script serves it:
// every response is a 302 to a different origin that carries the JSON and CORS header.
// Run: npm run e2e:sheet   (needs Playwright + Chromium)

import http from "node:http";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { makeEnv, rowsOf } from "./fake-sheets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const globalRoot = execSync("npm root -g").toString().trim();
const require = createRequire(path.join(globalRoot, "noop.js"));
const { chromium, devices } = require("playwright");

const APP = 5300 + Math.floor(Math.random() * 300);
const SCRIPT = APP + 1;
const ECHO = APP + 2;

const env = makeEnv();
env.ctx.setup();
const token = rowsOf(env.sheets.get("Clients"))[0].token;

// script.google.com stand-in → 302 → googleusercontent.com stand-in
const echoed = new Map();
let n = 0;
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = new URL(req.url, `http://localhost:${SCRIPT}`);
      if (req.method === "OPTIONS") {
        res.writeHead(405); // Apps Script has no preflight support; the app must never trigger one
        return res.end();
      }
      const out =
        req.method === "POST"
          ? env.ctx.doPost({ postData: { contents: body } })
          : env.ctx.doGet({ parameter: Object.fromEntries(url.searchParams) });
      const id = ++n;
      echoed.set(id, out.body);
      // The real /exec redirect carries the CORS header too; without it browsers refuse to follow.
      res.writeHead(302, { Location: `http://localhost:${ECHO}/echo?id=${id}`, "Access-Control-Allow-Origin": "*" });
      res.end();
    });
  })
  .listen(SCRIPT);
http
  .createServer((req, res) => {
    const id = Number(new URL(req.url, "http://x").searchParams.get("id"));
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(echoed.get(id) || "{}");
  })
  .listen(ECHO);

const bin = path.join(globalRoot, "http-server", "bin", "http-server");
const site = spawn(process.execPath, [bin, path.join(here, "..", "web"), "-p", String(APP), "-c-1", "-s"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

const check = (cond, msg) => {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
};

try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"], serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/config.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export const API_URL = "http://localhost:${SCRIPT}/exec"; export const APP_NAME = "Coach Saj";`,
    }),
  );

  console.log("app ↔ Code.gs");
  await page.goto(`http://localhost:${APP}/?u=${token}`);
  await page.waitForSelector(".exlist");
  check((await page.textContent(".eyebrow")).includes("Hi Test · Session 1 of 2"), "plan loads from the Sheet");
  await page.click("[data-a=start]");
  await page.waitForSelector(".srow");
  await page.click('.chk[data-si="0"]'); // warm-up from suggestions
  await page.fill('input[data-si="1"][data-f="kg"]', "9");
  await page.fill('input[data-si="1"][data-f="reps"]', "12");
  await page.click('.chk[data-si="1"]');
  await page.click('.rirbtn[data-v="3"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(`wt.queue.${new URL(location.href).searchParams.get("u")}`) || "[]").length === 0, null, { timeout: 8000 });
  let log = rowsOf(env.sheets.get("Log"));
  check(log.length === 2, "ticked sets land in the Log tab as you go");
  check(log.some((r) => r.kg === 9 && r.reps === 12 && r.rir === "3" && r.set_type === "N" && r.client_id === "test"), "kg, reps and RIR stored");

  // Lose signal, finish, then get it back.
  await ctx.setOffline(true);
  await page.click('.chk[data-si="2"]');
  await page.click('.rirbtn[data-v="2"]');
  await page.click("[data-a=menu]");
  await page.click(".panel [data-a=finish]");
  await page.click("[data-a=finishSave]");
  await page.waitForSelector(".donecheck");
  await page.waitForTimeout(1500);
  check((await page.textContent(".syncline")).includes("Saved on this phone"), "offline finish is kept on the phone");
  check(rowsOf(env.sheets.get("Sessions")).length === 0, "nothing reached the Sheet while offline");
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForFunction(() => document.querySelector(".syncline")?.textContent.includes("coach can see"), null, { timeout: 8000 });
  check(true, "syncs by itself when back online");
  log = rowsOf(env.sheets.get("Log"));
  const sessions = rowsOf(env.sheets.get("Sessions"));
  check(log.length === 3 && sessions.length === 1, "all 3 sets and the session are in the Sheet");
  check(sessions[0].sets_done === 2 && sessions[0].session === 1, "session row records 2 working sets");

  await page.click("[data-a=home]");
  await page.waitForSelector(".exlist");
  check((await page.textContent(".eyebrow")).includes("Session 2 of 2"), "next session comes up");
  await page.click("[data-a=start]");
  await page.waitForSelector(".srow");
  check((await page.inputValue('input[data-si="1"][data-f="kg"]')) === "" && (await page.getAttribute('input[data-si="1"][data-f="kg"]', "placeholder")) === "8", "coach's target load is suggested");
  await page.click("[data-a=toggleLast]");
  check((await page.textContent('.srow:nth-of-type(3) .tgt')).includes("9 kg") || (await page.locator(".tgt", { hasText: "9 kg" }).count()) > 0, "Last shows what was lifted last time");

  // Coach revokes the link.
  env.sheets.get("Clients").getRange(2, 5).setValue(false);
  await page.goto(`http://localhost:${APP}/?u=nottherightone`);
  await page.waitForSelector("[data-a=retry]");
  check((await page.textContent(".title")).includes("isn't recognised"), "unknown links get a clear message");

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await browser.close();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  site.kill();
  process.exit(process.exitCode || 0);
}
