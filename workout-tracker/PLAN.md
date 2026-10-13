# Plan

**For:** Mom (on an iPad) and 1–2 PT clients.
**What they do:** open an icon on their phone or iPad, see the next session from the coach's plan, watch the YouTube demo for each exercise, and log kg, reps and RIR per set.

## Decisions

| Decision | Why |
|---|---|
| A web app saved to the home screen, not an App Store app | No store, no install friction. "Add to Home Screen" gives a full-screen app with its own icon. |
| A Google Sheet as the database, Apps Script as the API | S$0 a month, nothing to maintain, no free-tier pausing, and the coach already lives in spreadsheets. Plans are written there and logs land there. |
| GitHub Pages for hosting | Free, no new account, publishes on every push to `main` after the tests pass. Cloudflare Pages is the fallback if commercial-use terms ever matter. |
| A private link per person, no passwords | Three users. The link is remembered on the device. The data is sets and reps, never health forms. |
| Offline first | Every set is saved on the device the moment it's ticked and synced when there's signal. A workout survives closing the app. |
| Sessions in order, not by weekday | A missed day doesn't skip anything. The plan waits for the client. |
| RIR asked after each working set, in words | "How many more could you have done?" with 0 to 5+ buttons. Can be switched off per client (`show_rir`). |
| Suggestions in grey | Each box suggests the coach's target load if set, otherwise last time's. Ticking accepts the suggestion. |
| No client data in this repo | The repo is public. |

## Phases

- [x] **0 · Sheet backend:** tabs, a test client, data validation, the Coach menu with per-client links, optional finish emails.
- [x] **1 · The app:**
  - home: next session, target-muscle cards, exercise list, estimated time
  - workout: elapsed and rest timers, exercise strip, Video / Info / Warm Up / Note, set table with a Target ⇄ Last toggle and an RIR picker
  - finish summary, history, offline sync, demo mode
- [x] **Sheet set up and script deployed.**
- [ ] **Go live:** turn on GitHub Pages and merge to `main`, test with the Test client, then load Mom's plan and the current clients' blocks.
- [ ] **2 · Polish from real use:**
  - supersets (C1/C2 pairs)
  - a progress chart per exercise
  - pull-to-refresh
  - better thumbnails for exercises without a video
- [ ] **3 · Coach features:**
  - suggest the next load with the double-progression rule (top of the range on every set → add the smallest increment)
  - the flags guard from the PT memo (warn when a flagged movement's load goes up)
  - a weekly summary

## Open questions

- Mom's plan: coming from her iPad.
- Who is the second client, and do they train between sessions on their own?
- Does Mom find RIR easy, or should she get Easy / Good / Hard for the first month?
