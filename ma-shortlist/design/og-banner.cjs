// Renders the link-preview image (web/images/og-banner.jpg, 1200×627) that LinkedIn, WhatsApp
// and X show when someone shares the site. Run: npm run og-banner (needs the global Playwright).
// It has no counts on it, so it only needs redoing if the branding or wording changes.

const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const OUT = path.join(__dirname, "..", "web", "images", "og-banner.jpg");
const W = 1200;
const H = 627;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${W}px; height: ${H}px; background: #f7f7f3; color: #1b2220;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    display: grid; grid-template-columns: 1fr 420px; overflow: hidden; }
  .left { padding: 56px 40px 52px 72px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 16px; font-size: 34px; font-weight: 800; }
  .brand svg { width: 46px; height: 46px; fill: #0d6b57; }
  .eyebrow { margin-top: 30px; color: #5a6661; font-size: 23px; }
  h1 { margin-top: 12px; font-size: 54px; line-height: 1.08; font-weight: 800; letter-spacing: -0.01em; }
  .steps { margin-top: 26px; display: flex; flex-direction: column; gap: 10px; font-size: 23px; color: #2b3430; }
  .steps div { display: flex; align-items: center; gap: 14px; }
  .steps b { color: #0d6b57; font-size: 23px; width: 22px; flex: none; }
  .foot { margin-top: auto; display: flex; justify-content: space-between; font-size: 21px; color: #5a6661; }
  .foot strong { color: #0d6b57; }
  .right { background: #0d6b57; padding: 56px 40px; display: flex; flex-direction: column; gap: 18px; justify-content: center; }
  .card { background: #fff; border-radius: 8px; padding: 22px 24px; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; }
  .name { height: 16px; width: 170px; border-radius: 8px; background: #1b2220; opacity: 0.85; }
  .sub { margin-top: 10px; height: 11px; width: 120px; border-radius: 6px; background: #dfe2dc; }
  .score { text-align: center; color: #0d6b57; font-size: 34px; font-weight: 800; line-height: 1; }
  .score small { display: block; font-size: 13px; font-weight: 600; color: #5a6661; margin-top: 4px; }
  ul { list-style: none; padding: 0; margin-top: 14px; font-size: 16.5px; color: #2b3430; }
  li { display: flex; gap: 10px; align-items: center; margin-top: 7px; }
  li::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: #1d7448; flex: none; }
  .card.dim { opacity: 0.75; }
</style></head><body>
  <div class="left">
    <div class="brand"><svg viewBox="0 0 32 32"><path fill-rule="evenodd" d="M16 3 30.5 15.5H27V29H5V15.5H1.5ZM13 29v-8h6v8Z"/></svg>StrataMatch</div>
    <div class="eyebrow">For condo councils in Singapore</div>
    <h1>Changing managing agent? Start with a fair shortlist.</h1>
    <div class="steps">
      <div><b>1</b>Shortlist agents that run condos near you</div>
      <div><b>2</b>Send every agent one standard RFP</div>
      <div><b>3</b>Compare the quotes like-for-like</div>
    </div>
    <div class="foot"><span>Free and independent</span><strong>stratamatch.pages.dev</strong></div>
  </div>
  <div class="right">
    <div class="card">
      <div class="row"><div><div class="name"></div><div class="sub"></div></div><div class="score">82<small>match</small></div></div>
      <ul><li>Manages 3 condos within 3 km</li><li>13 condos of a similar size</li><li>AMA accredited</li></ul>
    </div>
    <div class="card dim">
      <div class="row"><div><div class="name" style="width: 140px"></div><div class="sub"></div></div><div class="score">58<small>match</small></div></div>
      <ul><li>Manages 2 condos within 3 km</li><li>73 condos of a similar size</li></ul>
    </div>
  </div>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(html);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT, type: "jpeg", quality: 88 });
  await browser.close();
  console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
})();
