# Plan

**For:** drivers and passengers in Singapore who see dangerous or inconsiderate driving and want to report it without the hassle.
**The problem:** reporting takes 10+ minutes. You have to find the dashcam clip, work out whether it goes to the police or to LTA, find the form, log in with Singpass, then retype the plate, the car, the time and the place.
**The idea:** take or pick a photo or clip. The app reads the plate and identifies the car, you tap what happened, and it gives you a report ready to paste and opens the right official form.

## What I found (Nov 2026)

These details come from search results. The government pages themselves were blocked from my environment, so Phase 0 checks them by hand.

- **Moving offences go to the police.** The SPF i-Witness e-service is called "Submit Feedback on Road Users Committing Traffic Violations". It needs Singpass, an email address, the date, time and location, and the vehicle number. Evidence is optional, up to 2 files of 200MB each (MP4, MOV, MKV, MP3, WAV). You must undertake to testify in court. Traffic Police act when the offence is clearly recorded and posed a danger.
- **Tint and other modifications go to LTA.** Use "Report an illegal modification" in OneMotoring's digital services. LTA's Nov 2026 reply says tint must let at least 70% of light through the front windscreen and front side windows, and at least 25% at the rear.
- **Neither channel has an API, and both need Singpass.** The app can't submit for the user. It can only get them to the form with everything ready.
- **OneMotoring has plate lookups but no API.** Enquire Vehicle Details and Enquire Road Tax Expiry Date both take a plate number. I couldn't confirm what they show or whether they have a captcha. LTA DataMall has no vehicle lookup.
- **Drivers can't use the app while driving.** Holding or using a phone while driving is an offence under the Road Traffic Act.

## Decisions

| Decision | Why |
|---|---|
| Passenger mode and dashcam import; no "snap it while driving" flow | Using a phone while driving is illegal and dangerous, and moving offences need video anyway. |
| Make, model, colour and body type come from the photo (a vision model), not from OneMotoring | There's no API. Automating a form with a captcha breaks often and likely breaks LTA's terms. A photo also shows the colour, which TP asks about. |
| A "Check on OneMotoring" button copies the plate and opens LTA's lookup | The user can confirm the model in 10 seconds when it matters. |
| Plates are validated with their check letter | Singapore plates end in a letter computed from the rest, so most misreads (8 vs B, 0 vs D) get caught. This doesn't work for Malaysian plates, so mark those "foreign". |
| The app prepares a report pack and doesn't submit | Both forms need Singpass, and the user stays the reporter. |
| The app routes each offence to police or LTA | People don't know who handles what. |
| A neutral, factual description is drafted for the user | TP needs facts, and the reporter may have to repeat them in court. No insults or guesses about intent. |
| No accounts, nothing kept on a server, no public feed of plates | A public list of plates with accusations invites PDPA, defamation and harassment trouble. Same principle as StrataMatch. |
| PWA on Cloudflare Pages, plus one Worker | Same stack as StrataMatch, and it runs on iPhone and Android without the app stores. The Worker keeps the API key secret and passes the image to the vision model without storing it. |

## Where each report goes

| What you saw | Where it goes | Evidence that works |
|---|---|---|
| Cutting into a lane, no signal, tailgating, dangerous or inconsiderate driving, beating a red light, phone while driving, speeding | SPF i-Witness | Video, usually dashcam. A still photo rarely proves a moving offence. |
| Overly tinted windows, loud exhaust, coloured or decorative lights, other modifications | OneMotoring: Report an illegal modification | A clear photo of the car and plate |
| Illegal parking *(later)* | OneService app | Photo |

## The flow

1. **Add evidence.** Take a photo (passengers only) or pick a photo or video from the gallery. For a video, scrub to the frame where the plate is clearest and trim the clip to about 30 seconds around the incident.
2. **Check the car.** Plate (with a tick if the check letter matches), make, model, colour and body type, each editable and each with a confidence level. Time comes from the file. Place is a map pin that OneMap turns into the road and direction, e.g. "PIE towards Tuas, near Exit 30". iOS often strips GPS from picked photos, so default to the phone's location and let the user drag the pin.
3. **What happened.** Tap one or more offence chips and add an optional note.
4. **Report pack.** Every field in the same order as the official form, each with a Copy button. Also the drafted description, the evidence file ready to attach, and an **Open i-Witness** or **Open OneMotoring** button. After submitting, the user pastes the reference number back in.
5. **My reports.** A list kept on the phone, with reference numbers, that can be exported.

Example description: *"At about 8:42am on 24 Nov 2026, on the PIE towards Changi near Exit 30, a white Toyota Corolla Altis, SXX1234X, moved from lane 2 into lane 1 without signalling, about one car length ahead of me. I had to brake hard to avoid a collision. Dashcam footage attached."*

## Phases

- [ ] **0 · Spike (go or no-go, 1–2 days):**
  - Collect about 50 real photos and dashcam frames (day, night, rain, odd angles). Measure how often a vision model gets the plate and the make/model right, and pick the cheapest model that's good enough.
  - On a phone, open OneMotoring's Enquire Vehicle Details: what does it show without logging in? Is there a captcha? What do the terms say?
  - Go through i-Witness and LTA's form once with a real incident. Write down every field in order, and check whether i-Witness accepts photos (the listed formats are video and audio only).
  - Implement the check letter and test it against 20 real plates.
- [ ] **1 · Capture and identify:** camera and gallery picker, video frame picker and trim, Worker to vision model, check-letter validation, edit screen, time and place.
- [ ] **2 · Routing and report pack:** offence chips, police/LTA routing, field-by-field copy card, drafted description, "Open form" buttons, all form fields in one config file so a form change is a one-line fix.
- [ ] **3 · Launch:** install to home screen, drafts that work offline, test with 5 friends on real drives (as passengers or using dashcams), share in driving groups.
- [ ] **4 · Later:**
  - Share a clip straight from the dashcam app into this one (Web Share Target; Android only).
  - Illegal parking via OneService.
  - More than one vehicle per incident.
  - A native wrapper if iOS limits on camera or file metadata get in the way.

## Risks

- **Wrong car, wrong person reported.** The app shows confidence, makes the user confirm, and checks the plate's check letter.
- **Misuse to get back at someone.** Nothing is public, and the reporter is accountable through Singpass and the court undertaking.
- **Bystanders in photos, and images sent to a model provider.** Say so plainly and don't store images on the server.
- **Government forms change.** Keep the field lists in one config file and check them monthly.

## Open questions

- What does OneMotoring's public vehicle lookup show, and is there a captcha?
- Does i-Witness accept photos, or only video? If only video, should tint reports by photo go only to LTA?
- Is there a deadline for reporting after the incident? I didn't find one.
- What's the name?
