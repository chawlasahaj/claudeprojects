// Renders the screenshots on the repo's front page (design/screenshots/*.png) from the real
// data in web/data. Run: npm run screenshots (needs the global Playwright and http-server).
// The compare screenshot uses made-up quotes from "Agent A/B/C", never real firms.

const { execSync, spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const globalRoot = execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(globalRoot, "playwright"));

const ROOT = path.join(__dirname, "..");
const OUT = path.join(__dirname, "screenshots");
const PORT = 4996;
const BASE = `http://localhost:${PORT}/`;
const CONDO = "THE INTERLACE";

// The union of the boxes of `from` and `to`, in page coordinates, with some room around it.
async function crop(page, file, from, to = from, pad = 16) {
  const clip = await page.evaluate(
    ([from, to, pad]) => {
      const a = document.querySelector(from).getBoundingClientRect();
      const b = document.querySelector(to).getBoundingClientRect();
      const x = Math.max(0, Math.min(a.left, b.left) - pad);
      const y = Math.min(a.top, b.top) + scrollY - pad;
      return { x, y, width: Math.min(innerWidth, Math.max(a.right, b.right) + pad) - x, height: Math.max(a.bottom, b.bottom) + scrollY + pad - y };
    },
    [from, to, pad],
  );
  await page.screenshot({ path: path.join(OUT, file), fullPage: true, clip });
  console.log(`Wrote design/screenshots/${file} (${Math.round(fs.statSync(path.join(OUT, file)).size / 1024)} KB)`);
}

// The sticky header would otherwise sit on top of whatever is scrolled under it.
const unstick = (page) => page.addStyleTag({ content: ".site-header { position: static !important }" });

(async () => {
  const server = spawn(process.execPath, [path.join(globalRoot, "http-server", "bin", "http-server"), path.join(ROOT, "web"), "-p", String(PORT), "-c-1", "-s"], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  fs.mkdirSync(OUT, { recursive: true });
  try {
    await shortlistAndRfp(await browser.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 }));
    // A fresh browser, so no real condo's name goes next to the made-up quotes, and wide
    // enough for the whole table.
    await compare(await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 }));
  } finally {
    await browser.close();
    server.kill();
  }
})();

async function shortlistAndRfp(page) {
  // Shortlist: the first two suggestions and their reasons.
  await page.goto(BASE + "shortlist.html");
  await unstick(page);
  await page.fill("#dev-search", CONDO.toLowerCase());
  await page.click("#dev-list li >> nth=0");
  await page.waitForSelector(".result >> nth=1");
  await crop(page, "shortlist.png", "#results h2", "#results article.result:nth-of-type(2)");

  // RFP pack: the price schedule every agent fills in.
  await page.goto(BASE + "rfp.html");
  await unstick(page);
  await page.fill("#startDate", "2027-07-01");
  await page.waitForFunction(() => /Annex A/.test(document.querySelector("#doc").textContent));
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("#doc h2")].find((e) => /Annex A/.test(e.textContent));
    const table = h.nextElementSibling.nextElementSibling;
    h.id = "annex-a";
    table.id = "annex-a-table";
    table.nextElementSibling.style.visibility = "hidden";
  });
  await crop(page, "rfp.png", "#annex-a", "#annex-a-table");
}

// Compare: three made-up quotes side by side.
async function compare(page) {
  await page.goto(BASE + "compare.html");
  await unstick(page);
  // Room for every column, not just the 1040px the site normally allows.
  await page.addStyleTag({ content: ".wrap { max-width: none !important } #summary .table-wrap ~ * { visibility: hidden }" });
  await page.fill("#units", "1040");
  const quotes = [
    ["Agent A", 9800, 44, 4],
    ["Agent B", 8600, 44, 3],
    ["Agent C", 7900, 22, 3],
  ];
  for (const [i, [name, fee, hours, rating]] of quotes.entries()) {
    const card = `.quote-card >> nth=${i}`;
    await page.fill(`${card} >> [data-name]`, name);
    await page.fill(`${card} >> [data-f="managementFee"]`, String(fee));
    await page.fill(`${card} >> [data-f="managerHours"]`, String(hours));
    await page.fill(`${card} >> [data-f="termMonths"]`, "24");
    for (const r of ["manpower", "references", "proposal"]) await page.selectOption(`${card} >> [data-r="${r}"]`, String(rating));
  }
  await crop(page, "compare.png", "#summary h2", "#summary .table-wrap");
}
