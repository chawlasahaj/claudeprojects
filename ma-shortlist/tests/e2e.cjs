// Clicks through the site in a real browser with the fixture data and saves screenshots.
// Run: npm run e2e   (needs the global Playwright and http-server; screenshots go to $SHOTS or ./shots)

const { execSync, execFileSync, spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const globalRoot = execSync("npm root -g").toString().trim();
const { chromium, devices } = require(path.join(globalRoot, "playwright"));

const ROOT = path.join(__dirname, "..");
const FIX = path.join(__dirname, "fixtures");
const SHOTS = process.env.SHOTS || path.join(ROOT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

// A copy of the site with data built from the fixtures, plus the real site as it is (maybe without data).
function buildSite() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mas-e2e-"));
  const site = path.join(tmp, "site");
  const data = path.join(tmp, "data");
  fs.cpSync(path.join(ROOT, "web"), site, { recursive: true });
  fs.rmSync(path.join(site, "data"), { recursive: true, force: true });
  fs.mkdirSync(data);
  for (const f of ["geocode-cache.json", "accreditation.json"]) fs.copyFileSync(path.join(FIX, f), path.join(data, f));
  const node = (...a) => execFileSync(process.execPath, a, { cwd: ROOT, stdio: "pipe" });
  node("scripts/fetch-mcst.mjs", "--csv", path.join(FIX, "mcst-sample-earlier.csv"), "--data", data, "--date", "2026-03-01");
  node("scripts/fetch-mcst.mjs", "--csv", path.join(FIX, "mcst-sample.csv"), "--data", data, "--date", "2026-10-01");
  node("scripts/landuse.mjs", "--data", data, "--geojson", path.join(FIX, "landuse.geojson"));
  node("scripts/build-data.mjs", "--data", data, "--out", path.join(site, "data"), "--aliases", path.join(ROOT, "data", "ma-aliases.json"));
  const empty = path.join(tmp, "empty");
  fs.cpSync(path.join(ROOT, "web"), empty, { recursive: true });
  fs.rmSync(path.join(empty, "data"), { recursive: true, force: true });
  return { site, empty };
}

function serve(root, port) {
  const bin = path.join(globalRoot, "http-server", "bin", "http-server");
  const p = spawn(process.execPath, [bin, root, "-p", String(port), "-c-1", "-s"], { stdio: "ignore" });
  return new Promise((resolve) => setTimeout(() => resolve(p), 800));
}

function check(cond, msg) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const PAGES = ["", "shortlist.html", "agents.html", "agent.html?id=alpha-estate-management", "rfp.html", "compare.html", "guide.html", "methodology.html", "about.html"];

async function run(name, device, base) {
  console.log(`\n${name}`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...device });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/favicon|onemap/i.test(m.text()) && errors.push(m.text()));
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${name}-${n}.png`), fullPage: true });

  for (const p of PAGES) {
    await page.goto(base + p);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `${p || "home"}: no sideways scrolling (${overflow}px)`);
  }

  // Home
  await page.goto(base);
  await page.waitForSelector("#data-line:not(:empty)");
  check(/20 condos and the 5 managing agents/.test(await page.textContent("#data-line")), "home shows the data counts");
  // Link previews (LinkedIn, WhatsApp, X) read these from the HTML as served, before any script runs.
  const ogImage = await page.getAttribute('meta[property="og:image"]', "content");
  check(ogImage === "https://stratamatch.pages.dev/images/og-banner.jpg", "home page has an absolute og:image");
  const banner = await page.request.get(base + "images/og-banner.jpg");
  check(banner.ok() && banner.headers()["content-type"] === "image/jpeg", "the share image is served as a JPEG");
  const robots = await page.request.get(base + "robots.txt");
  check(robots.ok() && /^text\/plain/.test(robots.headers()["content-type"]) && /User-agent: LinkedInBot\nAllow: \//.test(await robots.text()), "robots.txt is plain text and lets LinkedIn in");
  check(!(await page.isVisible(".hello")), "no LinkedIn hello on a normal visit");
  await page.goto(base + "?hi=linkedin");
  await page.waitForSelector(".hello");
  check(/Hi, LinkedIn/.test(await page.textContent(".hello")) && !/hi=/.test(page.url()), "the README's LinkedIn link says hi, then tidies the address");
  await page.click(".hello button");
  check(!(await page.isVisible(".hello")), "the hello closes");
  await page.goto(base + "?hi=linkedin");
  await page.waitForSelector(".site-header");
  check(!(await page.isVisible(".hello")), "the hello shows only once");
  // In its own tab: the browser logs the 404 itself as a console error.
  const lost = await ctx.newPage();
  const missing = await lost.goto(base + "no/such/page");
  check(missing.status() === 404 && (await lost.textContent("h1")) === "Page not found", "a missing page is a real 404");
  await lost.waitForSelector(".site-header .brand");
  check((await lost.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== "rgba(0, 0, 0, 0)", "the 404 page has the site's header and styles, even on a deep path");
  await lost.close();
  await shot("1-home");

  // Shortlist
  await page.goto(base + "shortlist.html");
  await page.fill("#dev-search", "test hill");
  await page.waitForSelector("#dev-list li");
  await page.click("#dev-list li >> nth=0");
  await page.waitForSelector(".result");
  check(!(await page.isVisible("#tray")), "no picks bar before anything is picked");
  const resultNames = () => page.$$eval(".result h3 a", (as) => as.map((a) => a.textContent));
  let names = await resultNames();
  check(names.length === 2, `two other agents suggested (${names.join(", ")})`);
  check(!names.some((n) => /Delta/.test(n)), "offices don't count: Delta runs only one condo");
  check(!names.some((n) => /Evergreen/.test(n)), "a one-condo firm isn't suggested");
  check(!names.some((n) => /Alpha/.test(n)), "current agent left out");
  const reasons = await page.textContent("#results");
  check(/Manages 2 condos within 3 km/.test(reasons), "reasons mention nearby condos");
  check(/Lost 2 of 6 clients since/.test(reasons), "retention reason shown for Brightway");
  check(/160–640 strata lots/.test(await page.textContent("#size-hint")), "size filter shows the range");
  await page.selectOption("#o-size", "similar");
  await page.waitForFunction(() => document.querySelectorAll(".result").length === 1);
  names = await resultNames();
  check(names.length === 1 && /Brightway/.test(names[0]), `similar size only: Coral has just 2 condos of that size (${names.join(", ")})`);
  check(/similar-size condos within 3 km/.test(await page.textContent("#results")), "reasons count similar-size condos");
  await page.selectOption("#o-size", "any");
  await page.waitForFunction(() => document.querySelectorAll(".result").length === 2);
  await page.check("#o-current");
  await page.waitForFunction(() => [...document.querySelectorAll(".result h3 a")].some((a) => /Alpha/.test(a.textContent)));
  check(true, "including the current agent brings it back");
  for (const i of [0, 1, 2]) await page.check(`.result >> nth=${i} >> [data-pick]`);
  check(/3 agents picked/.test(await page.textContent("#tray")), "tray counts 3 picks");
  await shot("2-shortlist");

  // Agents and an agent page
  await page.goto(base + "agents.html");
  check((await page.$$(".agent-row:not(.head)")).length === 5, "agents page lists 5 firms");
  await page.fill("#q", "coral");
  check((await page.$$(".agent-row:not(.head)")).length === 1, "search narrows the list");
  await shot("3-agents");
  await page.goto(base + "agent.html?id=brightway-property-services");
  await page.waitForSelector("#devs tr");
  const agentText = await page.textContent("#body");
  check(/Left this agent/.test(agentText) && /EAST FIXTURE/.test(agentText), "agent page lists developments that left");
  check((await page.$$("#devs tr")).length === 5, "agent page lists its 5 developments");
  await shot("4-agent");

  // RFP pack
  await page.goto(base + "rfp.html");
  check((await page.inputValue("#development")) === "TEST HILL RESIDENCES", "RFP prefilled from the shortlist");
  check((await page.inputValue("#invited")).split("\n").length === 3, "RFP lists the 3 picked agents");
  await page.fill("#startDate", "2027-07-01");
  await page.fill("#contactEmail", "council@example.com");
  await page.waitForFunction(() => /1 Jul 2027/.test(document.querySelector("#doc").textContent));
  const doc = await page.textContent("#doc");
  check(/Annex A: Price schedule/.test(doc) && /Management fee/.test(doc), "document has the price schedule");
  check(/council@example.com/.test(doc), "document updates as you type");
  check((await page.$$(".timeline li")).length >= 9, "timeline shows every step");
  await page.fill("#w-price", "50");
  check(/Make it add up to 100/.test(await page.textContent("#weight-sum")), "weights must add to 100");
  await page.fill("#w-price", "40");
  await shot("5-rfp");

  // Compare
  await page.goto(base + "compare.html");
  const cards = await page.$$(".quote-card");
  check(cards.length === 3, "compare starts with one quote per invited agent");
  check((await page.inputValue("#units")) === "320", "units carried over");
  const fill = async (i, fee, hours, rating) => {
    const card = `.quote-card >> nth=${i}`;
    await page.fill(`${card} >> [data-f="managementFee"]`, String(fee));
    await page.fill(`${card} >> [data-f="managerHours"]`, String(hours));
    await page.fill(`${card} >> [data-f="termMonths"]`, "24");
    for (const r of ["manpower", "references", "proposal"]) await page.selectOption(`${card} >> [data-r="${r}"]`, String(rating));
  };
  await fill(0, 5000, 44, 3);
  await fill(1, 4000, 22, 2);
  await fill(2, 5500, 44, 5);
  const table = await page.textContent("#results");
  check(/S\$65,400/.test(table), "yearly cost includes GST (5,000 × 12 × 1.09)");
  const rank1 = await page.textContent("#results tr.rank-1");
  check(rank1.length > 0, `a quote is ranked first: ${rank1.slice(0, 40)}`);
  await page.reload();
  check((await page.inputValue('.quote-card >> nth=1 >> [data-f="managementFee"]')) === "4000", "quotes survive a reload");
  await shot("6-compare");

  check(errors.length === 0, `no script errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await browser.close();
}

async function runEmpty(base) {
  console.log("\nBefore the first data refresh");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const p of ["shortlist.html", "agents.html", "agent.html?id=x"]) {
    await page.goto(base + p);
    await page.waitForSelector(".notice.warn");
  }
  check(true, "pages say the data isn't loaded yet");
  await page.goto(base + "rfp.html");
  await page.waitForSelector("#doc h1");
  check(true, "RFP pack works without data");
  check(errors.length === 0, `no script errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await browser.close();
}

(async () => {
  const { site, empty } = buildSite();
  const port = 4300 + Math.floor(Math.random() * 500);
  const servers = [await serve(site, port), await serve(empty, port + 1)];
  try {
    await run("phone", devices["iPhone 13"], `http://localhost:${port}/`);
    await run("desktop", { viewport: { width: 1280, height: 900 } }, `http://localhost:${port}/`);
    await runEmpty(`http://localhost:${port + 1}/`);
    console.log(`\nAll good. Screenshots in ${SHOTS}`);
  } finally {
    servers.forEach((s) => s.kill());
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
