# Plan

**For:** the councils of condominiums and other strata developments in Singapore that are choosing a managing agent.
**The problem:** agents are hard to find, quotes come back in different formats, and the process is opaque to owners.
**What already exists:** [comparemanagingagents.com](https://comparemanagingagents.com/singapore/) has a directory built from the same BCA data, Google ratings and a "request proposals" form. MA Shortlist focuses on what that site doesn't have: a shortlist based on nearby developments of a similar size and on agent switches, a standard RFP, and like-for-like quote comparison.

## Decisions

| Decision | Why |
|---|---|
| Public data only; no reviews or fee sharing yet | Nothing to moderate, no defamation risk, and every firm is treated the same way. Ratings and fee sharing can come later. |
| The council sends the RFP itself | The site stays neutral and needs no backend, no agent emails and no spam handling. |
| A static site on Cloudflare Pages, data refreshed by a GitHub Action | Costs S$0. Commercial use is allowed. A custom domain can be added later without changing anything. |
| Everything a council types stays in its browser | No accounts and no personal data to look after. |
| Strata lots from BCA's data for size matching | The dataset has them, so "similar size" works from day one. |
| Switches counted only after 3 months of records, and only between snapshots that share MCST numbers | A firm that only changed the spelling of its name, or a snapshot in a different format, must not look like lost clients. |
| Accreditation counts in the score only once the copied list is complete | A partial list would mark down accredited firms we missed. |

## Phases

- [x] **1 · Data:** fetch BCA's list, tidy the columns, merge firm spellings, geocode postal codes with OneMap, keep monthly history, and build the site's JSON.
- [x] **2 · Shortlist:** search by name or postal code, or enter a postal code and size. Reasons for each suggestion, nearby developments as references, picks carried into the RFP.
- [x] **3 · RFP pack and guide:** scope, timeline, evaluation weights and the Annex A price schedule. Print, PDF, Word and the cover email. The guide cites the Act and BCA's guides.
- [x] **4 · Compare:** yearly cost with GST, cost per unit and per manager-hour, cost over the term, weighted score, printable summary.
- [ ] **Go live:**
  - Run the data workflow and check the counts and possible duplicates.
  - Connect Cloudflare Pages and merge to `main`.
  - Spot-check five developments against BCA.
  - Complete `data/accreditation.json`.
- [ ] **5 · After launch:**
  - Share in condo council groups.
  - Add a custom domain.
  - Anonymous fee sharing (a Google Sheet backend, like the workout tracker).
  - Verified council ratings.
  - A "residential / commercial" filter, if a data source for it turns up.

## Open questions

- Is the older "MCST information" dataset an older snapshot or the same data? The first workflow run seeds history from it if its date is earlier. The build ignores it if its MCST numbers don't line up with today's.
- Should development type (residential, commercial, mixed) be used? BCA's dataset doesn't say.
