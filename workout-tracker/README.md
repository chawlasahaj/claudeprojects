# Coach Saj workout tracker

A phone and iPad web app for your clients: it shows the next session from your plan, a YouTube video for each exercise, and lets them log kg, reps and RIR for every set. The look follows MacroFactor Workouts.

You write plans in a Google Sheet. Everything clients log lands back in that Sheet. Running it costs nothing.

**Try it first:** once the app is hosted (step 3), open `https://<your-site>/?u=demo`. Locally, run `npm run serve` and open <http://localhost:4173/?u=demo>. The demo saves only on that device.

```
workout-tracker/
  web/                 the app: static files, no build step
  apps-script/Code.gs  the Google Sheet side
  tests/               npm test, npm run e2e, npm run e2e:sheet
  PLAN.md              what's built, what's next
```

This repo is public, so no client names, plans or health notes go in it. Those live only in your Sheet.

---

## One-time setup (about 20 minutes)

### 1. Make the Sheet

1. Go to [sheets.new](https://sheets.new) and name it something like *Coach Saj · Training*.
2. Open **Extensions → Apps Script**. Delete the sample code, paste in everything from [`apps-script/Code.gs`](apps-script/Code.gs), and save.
3. Pick **setup** in the function dropdown at the top and press **Run**.
   - Google will ask for permission: **Review permissions** → choose your account → **Advanced** → **Go to … (unsafe)** → **Allow**.
   - "Unsafe" only means Google hasn't reviewed the script. It's your own code, running in your account.
4. Go back to the Sheet and reload it. You'll see six tabs (Clients, Exercises, Program, Log, Sessions, Settings), a **Coach** menu, and a *Test* client with a small sample plan.

### 2. Turn the script into a web address

1. In Apps Script: **Deploy → New deployment**. Click the gear and choose **Web app**.
2. Set **Execute as: Me** and **Who has access: Anyone**, then press **Deploy**.
3. Copy the **Web app URL** (it ends in `/exec`).
4. Put it in [`web/config.js`](web/config.js) as `API_URL`, or send it to me to commit.

"Anyone" means anyone holding that URL can call the script. They still need a client's private link to read or write anything.

### 3. Host the app (Cloudflare Pages, free)

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com). The free plan is fine and, unlike Vercel's free tier, allows commercial use.
2. Go to **Workers & Pages → Create → Pages → Connect to Git** and pick `chawlasahaj/claudeprojects`.
3. Settings:
   - Production branch: `main`
   - Build command: *(leave empty)*
   - Build output directory: `workout-tracker/web`
4. Deploy. You get an address like `https://coach-saj.pages.dev`. Every push to `main` redeploys it.

The dashboard wording changes from time to time. The two settings that matter are no build command and that output folder.

5. In the Sheet's **Settings** tab, put that address in `app_url`.

### 4. Add a client and send their link

1. In **Clients**, add a row:
   - `client_id`: a short id, e.g. `mom`
   - `name`: what the app greets them with
   - tick `show_rir` and `active`
   - `notes` is yours only; the app never sends it
2. Click that row, then **Coach → Make link for selected client**. Copy the link and send it on WhatsApp.
3. Try the *Test* client's link yourself first.

### 5. Install it on their phone or iPad

- **iPhone / iPad:** open the link in **Safari** → Share button → **Add to Home Screen** → **Add**.
- **Android:** open it in **Chrome** → **⋮** → **Add to Home screen** (or **Install app**).

It then opens full screen from its own icon, keeps the screen awake during a workout, and keeps working on bad gym signal.

---

## Writing a plan (Program tab)

Use one row per exercise per session.

| Column | What to put |
|---|---|
| `client_id` | Same id as in Clients. |
| `session` | 1, 2, 3… in the order they should be done. The app always offers the lowest-numbered session not yet finished, so a missed day never skips anything. |
| `session_name` | e.g. `Week 1 · Day A` |
| `order` | Exercise order within the session. Optional; row order is used otherwise. |
| `exercise` | Pick from the dropdown. It lists the Exercises tab. |
| `sets` | Number of working sets. |
| `reps` | `8-10`, `12`, or text like `30s`. |
| `target_kg` | Optional. When blank, the app suggests last time's weight. |
| `target_rir` | Optional, e.g. `2` or `1-2`. |
| `rest_sec` | Rest timer after each set. Defaults to 90. |
| `warmup_sets` | Warm-up rows added at the top. Defaults to 0. |
| `note` | Shown to the client under the exercise name, e.g. "Pain-free depth only". |

To build a block quickly, copy one week's rows, paste them below, then change the session numbers and loads.

**Exercises tab:**

- `video_url`: any YouTube link, including Shorts. If it's blank, the Video button searches YouTube for the exercise.
- `primary_muscles`: comma-separated. These drive the "Target Muscles" cards.
- `secondary_muscles`: shown as outlined chips.
- `bodyweight`: tick it to hide the kg box.
- `cues`: shown under **Info**.

The body diagram knows these muscles: Chest, Front Delts, Side Delts, Rear Delts, Shoulders, Biceps, Triceps, Forearms, Abs, Core, Obliques, Quads, Adductors, Hamstrings, Glutes, Calves, Lats, Upper Back, Traps and Lower Back. Any other name gets a plain figure.

## Seeing what they did

- **Log tab:** every set they tick (kg, reps, RIR), written as they go.
- **Sessions tab:** one row per finished workout, with its duration and their notes.
- **Email when someone finishes:** put your address in Settings → `notify_email`.
- **Your own columns:** you can add columns to Log or Sessions (a `coach_comment`, say) and the app leaves them alone.

## Changing things later

- **Plan edits** show up the next time the client opens the app.
- **After editing `Code.gs`:** use **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. Making a *new* deployment changes the URL; editing the existing one keeps it.
- **App changes:** push to `main`. Phones pick up the new version the next time it's opened, occasionally the time after.
- **Renaming the app:** change "Coach Saj" in `web/config.js`, `web/index.html` and `web/manifest.webmanifest`.
- **A link leaks:** clear that client's `token` in Clients and make a new link.

Keep PAR-Q and health declarations out of this Sheet, as the PT practice memo recommends.

## Development

```bash
npm test             # logic + Code.gs against an in-memory Google Sheets fake
npm run e2e          # browser walkthrough of the demo at iPhone, iPad and small Android sizes
npm run e2e:sheet    # the app talking to Code.gs over HTTP the way Apps Script serves it, incl. offline
npm run serve        # http://localhost:4173/?u=demo
```

The e2e scripts need Playwright with Chromium. Screenshots go to `./shots`, or to `$SHOTS` if set.
