// What goes into an RFP for managing agent services: scope items, the timeline and the cover email.

export const SCOPE_ITEMS = [
  { id: "estate", label: "Day-to-day estate management", detail: "Run the estate for the council: daily inspections, residents' feedback and requests, by-law enforcement, and a monthly management report.", on: true },
  { id: "finance", label: "Finance and accounts", detail: "Collect contributions and arrears, pay suppliers, keep the books, prepare monthly accounts and the annual budget, and support the yearly audit.", on: true },
  { id: "meetings", label: "Council and general meetings", detail: "Prepare notices, agendas, papers and minutes for council meetings and the AGM/EGMs, and attend them.", on: true },
  { id: "contractors", label: "Contractors and tenders", detail: "Prepare specifications, call tenders and quotes, evaluate them for the council, and supervise service contractors (security, cleaning, landscaping, lifts, M&E, pool).", on: true },
  { id: "maintenance", label: "Maintenance planning", detail: "Keep a maintenance schedule and a sinking fund plan, track defects, and arrange periodic statutory inspections (e.g. lifts, fire safety, facade).", on: true },
  { id: "records", label: "Records and compliance", detail: "Keep the strata roll, registers, minutes and contracts; meet deadlines under the Building (Strata Management) Act and other laws; handle personal data under the PDPA.", on: true },
  { id: "insurance", label: "Insurance and claims", detail: "Renew the estate's insurance and handle claims.", on: true },
  { id: "emergency", label: "24-hour emergency response", detail: "A number residents and guards can call at any hour, with a stated response time.", on: true },
  { id: "portal", label: "Resident app or portal", detail: "Facility booking, notices, feedback and e-voting through an app or web portal.", on: false },
  { id: "handover", label: "Handover from the current agent", detail: "Take over records, accounts, contracts, keys and access cards from the outgoing agent, and report anything missing.", on: true },
];

export const SUBMISSION_ITEMS = [
  "Company profile, ACRA business profile and AMA accreditation, if any",
  "List of developments you manage now, with the number of units in each",
  "Three references from councils of developments of a similar size, with a contact person",
  "CV of the proposed condo manager and on-site staff",
  "The completed price schedule (Annex A), with every field filled in",
  "A sample monthly management report and a sample set of monthly accounts",
  "Professional indemnity and fidelity insurance details",
  "Any legal proceedings, or complaints to BCA, involving your firm in the last three years",
  "Your proposed management agreement, with any changes from the ASM template agreement marked",
];

const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parseDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};
export const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// Adds months, clamping to the end of a shorter month (31 May - 3 months = 28 Feb).
export function addMonths(d, n) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
}

/**
 * Works back from the date the new agent should start.
 * @param start  "YYYY-MM-DD"
 * @param opts   { noticeMonths = 3, meetingNoticeDays = 14, openWeeks = 4, needsGeneralMeeting = true, today }
 */
export function buildTimeline(start, opts = {}) {
  const s = parseDate(start);
  if (!s) return null;
  const { noticeMonths = 3, meetingNoticeDays = 14, openWeeks = 4, needsGeneralMeeting = true } = opts;
  const steps = [];
  const add = (id, label, date, note = "") => steps.push({ id, label, date: iso(date), note });

  const notice = addMonths(s, -noticeMonths);
  let decide;
  if (needsGeneralMeeting) {
    const meeting = addDays(notice, -7);
    const meetingNotice = addDays(meeting, -meetingNoticeDays);
    decide = addDays(meetingNotice, -7);
    add("meetingNotice", "Send owners the notice and agenda for the general meeting", meetingNotice, `At least ${meetingNoticeDays} days before the meeting.`);
    add("meeting", "General meeting votes on appointing the new agent", meeting, "Needed unless owners authorised the council to appoint a managing agent at the last general meeting.");
  } else {
    decide = addDays(notice, -7);
  }
  const interviews = addDays(decide, -7);
  const close = addDays(interviews, -7);
  const issue = addDays(close, -openWeeks * 7);
  const siteVisits = addDays(issue, 7);
  const prep = addDays(issue, -14);

  add("prep", "Council agrees the scope, the shortlist and who evaluates", prep);
  add("issue", "Send the RFP to the shortlisted agents", issue);
  add("siteVisits", "Site visits for agents who want one", siteVisits, "Offer one or two slots in the week after the RFP goes out.");
  add("close", "Proposals due", close);
  add("interviews", "Interview the best two or three; call their references", interviews);
  add("decide", "Council meeting: choose the preferred agent", decide);
  add("notice", "Latest date to give the current agent notice", notice, `Your current contract's notice period: ${noticeMonths} month${noticeMonths === 1 ? "" : "s"}.`);
  add("handover", "Handover meetings between the outgoing and incoming agents", addDays(s, -14));
  add("start", "New agent starts", s);

  steps.sort((a, b) => a.date.localeCompare(b.date));
  const today = opts.today ? parseDate(opts.today) : new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
  return { steps, startsInPast: parseDate(steps[0].date) < today };
}

export function emailText({ development, mcstNo, closeDate, contactName, contactEmail, siteVisit }) {
  const name = development || "[development name]";
  return [
    `Subject: Request for proposal – managing agent services for ${name}${mcstNo ? ` (MCST ${mcstNo})` : ""}`,
    "",
    "Dear Sir/Madam,",
    "",
    `The council of ${name}${mcstNo ? `, MCST Plan No. ${mcstNo},` : ""} invites your firm to submit a proposal for managing agent services. The request for proposal is attached.`,
    "",
    `Please send your proposal, including the completed price schedule in Annex A, by ${closeDate || "[closing date]"}.${siteVisit ? ` You are welcome to visit the estate on ${siteVisit}; please let us know if you plan to come.` : ""}`,
    "",
    "Please send any questions by email. We will share answers with every firm invited, so that all proposals are made on the same information.",
    "",
    "Thank you,",
    contactName || "[name]",
    `On behalf of the council of ${name}`,
    contactEmail || "[email]",
  ].join("\n");
}
