# Plan

**For:** the councils of condominiums and other strata developments in Singapore that are choosing a managing agent.
**The problem:** agents are hard to find, quotes come back in different formats, and the process is opaque to owners.
**What already exists:** [comparemanagingagents.com](https://comparemanagingagents.com/singapore/) has a directory built from the same BCA data, Google ratings and a "request proposals" form. StrataMatch focuses on what that site doesn't have: a shortlist based on nearby developments of a similar size and on agent switches, a standard RFP, and like-for-like quote comparison.

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
| People's names, "MCST" and placeholders in BCA's agent column are dropped | They aren't firms, and showing individuals' names would be a privacy problem. |
| Only firms with 3+ developments are suggested | Many one- or two-building names are developers, owners or hotels running their own building. |
| Condos only: offices, shops and factories are left out everywhere | A tester found office towers in a condo's "nearby" list, and the site is for condo councils. BCA's list has no type, so we use URA's Master Plan zoning at the postal code, then the name. Condos with shops below stay in. |
| Developments are placed by the postal code in their address | BCA's postal code column is the correspondence address, often the agent's office, for about 40% of MCSTs. |

## Phases

- [x] **1 · Data:** fetch BCA's list, tidy the columns, merge firm spellings, geocode postal codes with OneMap, keep monthly history, and build the site's JSON.
- [x] **2 · Shortlist:** search by name or postal code, or enter a postal code and size. Reasons for each suggestion, nearby developments as references, picks carried into the RFP.
- [x] **3 · RFP pack and guide:** scope, timeline, evaluation weights and the Annex A price schedule. Print, PDF, Word and the cover email. The guide cites the Act and BCA's guides.
- [x] **4 · Compare:** yearly cost with GST, cost per unit and per manager-hour, cost over the term, weighted score, printable summary.
- [x] **Real data:** 3,702 MCSTs and 221 managing agents from BCA's list as of 8 Oct 2026. Typos merged, name casing fixed, and switch tracking started on 22 Oct 2026.
- [x] **Go live:** at https://condocouncil.pages.dev, published by Cloudflare Pages from `main`. 3,638 of 3,702 MCSTs are on the map, and the full SISV accreditation list (checked 22 Oct 2026) is in.
- [x] **Feedback 1, "remove office and industrial buildings":** every MCST is typed from URA's Master Plan 2025 land-use zoning, and offices, shops and factories are left out. Developments are now placed by their own postal code, not BCA's correspondence one.
- [x] **Feedback 2, "similar size to mine":** a shortlist option counts only condos with half to twice your strata lots.
- [ ] **5 · After launch:**
  - Share in condo council groups.
  - Add a custom domain.
  - Anonymous fee sharing (a Google Sheet backend, like the workout tracker).
  - Verified council ratings.

## Open questions

- BCA's older "MCST information" dataset returns no rows through the API, so there's no baseline. Switches can be shown from about January 2027.
- BCA leaves the agent blank for 803 developments, 122 of them with 200+ units. Could councils correct these through the site?
