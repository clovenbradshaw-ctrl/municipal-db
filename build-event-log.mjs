// build-event-log.mjs — construct the real municipal event log from our
// actual eoreader7 extraction output (Middletown Ch.98, Chicago Ch.4-14),
// as real INS/CON/EVA/REC events in the exact shape src/operators.js's
// ins()/con()/eva()/rec() produce, then fold() them with the REAL,
// unmodified (bar one import line) src/fold.js to verify correctness.

import fs from "node:fs";
import { fold } from "./real-fold.js";
import { buildIns, buildCon, buildDef, buildEva, buildRec, buildSeg } from "./real-operators-pure.js";

const SENDER = "@michael:hyphae.social"; // placeholder holder identity for constructed events
let ts = Date.parse("2026-09-10T00:00:00Z");
const events = [];
const anchors = {}; // convenience: name -> anchor
const obligationKeys = []; // tracked automatically below so the figure-extraction pass can iterate every one, regardless of city

function ins(entityType, key, payload) {
  const e = buildIns(entityType, payload, { sender: SENDER, ts: ts++ });
  events.push(e);
  anchors[key] = e.anchor;
  if (entityType === "obligation") obligationKeys.push(key);
  return e.anchor;
}
function con(sourceKey, targetKey, relationType) {
  const e = buildCon(anchors[sourceKey], anchors[targetKey], relationType, { sender: SENDER, ts: ts++, id: `$con_${sourceKey}_${targetKey}_${relationType}` });
  events.push(e);
}
function def(key, path, value) {
  const e = buildDef(anchors[key], path, value, { sender: SENDER, ts: ts++, id: `$def_${key}_${path}` });
  events.push(e);
}
function eva(key, criterion, result, note) {
  const e = buildEva(anchors[key], criterion, result, note, { sender: SENDER, ts: ts++, id: `$eva_${key}_${criterion}` });
  events.push(e);
}
function rec(key, scope, before, after) {
  const e = buildRec(scope, before, after, { sender: SENDER, ts: ts++, id: `$rec_${key}_${scope}` });
  events.push(e);
}

// ── 1. Holders (municipalities) — INS ──
ins("municipality", "middletown", {
  name: "Middletown, RI", state: "Rhode Island", county: "Newport County",
  code_url: "https://codelibrary.amlegal.com/codes/middletown/latest/middletown_ri/0-0-0-4587",
  chapter: "Chapter 98 — Short-Term Rental Leases",
});
ins("municipality", "chicago", {
  name: "Chicago, IL", state: "Illinois", county: "Cook County",
  code_url: "https://codelibrary.amlegal.com/codes/chicago/latest/chicago_il/0-0-0-2611518",
  chapter: "Chapter 4-14 — Shared Housing Units",
});
ins("municipality", "staugustine", {
  name: "St. Augustine, FL", state: "Florida", county: "St. Johns County",
  code_url: "https://oldcitysouth.org/wp-content/uploads/2017/08/CoSA-Ordinance-2010-24-regulating-Short-Term-Rentals-1.pdf",
  chapter: "Code § 28-159 (Ord. 2010-24; fee schedule now set separately by Resolution 2025-41, most recently amended Aug. 2026)",
});
ins("municipality", "talent", {
  name: "Talent, OR", state: "Oregon", county: "Jackson County",
  code_url: "https://talent.municipal.codes/TMC/18.137.070",
  chapter: "TMC 18.137.070 (Ord. 952 § 1 (Exh. A), 2019)",
});
ins("municipality", "ftworth", {
  name: "Fort Worth, TX", state: "Texas", county: "Tarrant County",
  code_url: "https://codelibrary.amlegal.com/codes/ftworth/latest/ftworth_tx/0-0-0-73452",
  chapter: "Code Ch. 7, Art. XIII — Short-Term Rental Registration (Ord. 26005-02-2023)",
});

// ── 2. Jurisdiction reachability (holder-scope) — CON ──
ins("jurisdiction", "state-ri", { name: "Rhode Island (state)" });
ins("jurisdiction", "state-il", { name: "Illinois (state)" });
ins("jurisdiction", "state-fl", { name: "Florida (state)" });
ins("jurisdiction", "state-or", { name: "Oregon (state)" });
con("middletown", "state-ri", "reachable-from");
con("chicago", "state-il", "reachable-from");
con("staugustine", "state-fl", "reachable-from");
con("talent", "state-or", "reachable-from");
ins("jurisdiction", "state-tx", { name: "Texas (state)" });
con("ftworth", "state-tx", "reachable-from");
// Florida's own preemption is real and on the record (found reading St.
// Augustine's ordinance history): Fla. Stat. 509.032(7)(b) bars a city from
// banning or regulating STR duration/frequency UNLESS its ordinance predates
// June 1, 2011 — St. Augustine's does (2010-24), so it's grandfathered.
// That grandfathering is itself a fact worth a DEF on the holder, not prose
// I'd otherwise have to remember out-of-band.
def("staugustine", "state_preemption_status",
  "grandfathered under Fla. Stat. 509.032(7)(b) — ordinance predates the June 1, 2011 cutoff (Ord. 2010-24)");

// ── 3. Load real obligation extractions and INS each clause + CON to its holder ──
//
// This pass follows a direct instruction to actually read the 154 admitted
// clauses rather than trust that "admitted" meant "sensible obligation."
// Findings, disclosed here rather than silently fixed:
//
//   - admitObligations() is a FLAT clause splitter — it has no concept of
//     nesting. A section with two SEPARATE numbered sub-lists under two
//     different letters (Chicago 4-14-040(b)'s 1-9 AND (d)'s 1-4) emits both
//     lists at the SAME mark level, so "mark: 1" collides between two
//     unrelated real clauses. Both clauses are individually correct; only
//     grouping-by-mark-alone is unsafe. Not fixed here (would need a real
//     nesting-aware organ) — noted so it isn't mistaken for corruption.
//   - Five Middletown sections and three Chicago sections were "refused"
//     (single sentence, nothing to enumerate) and stored with text:null.
//     Read the real section text for all eight: five of them (Middletown's
//     98.03/98.05/98.06/98.07/98.08) are genuine, substantive obligations
//     that were simply never captured — restored below with their real
//     text. The other three (Chicago's 010, 070) are a definitions section
//     and a rule-making-authority grant — real text, but not obligations by
//     the standard the rest of this pass applies, so left out entirely
//     rather than padded in with a technicality.
//   - Chicago 4-14-040(d) has two roman-numeral sub-items — "(ii)" under
//     both (1) and (3) — that admitObligations() never emitted at all
//     (missed, not dropped). Added back below, verbatim from the same
//     primary source already on file, clearly marked as a manual addition.
//   - Two Chicago 4-14-100 entries are bare sentence fragments ("(1) the
//     operation of a shared housing unit located in:" / "(i) a single
//     family home that is not the shared housing host's primary
//     residence; or") that don't stand as sensible obligations on their
//     own once pulled out of their parent clause. Dropped.
//   - Non-obligation content elsewhere: legislative-findings recitals
//     (Middletown 98.01), a definitions-section intro and its interpretive
//     rules (98.02), and one purely permissive "may" grant with no
//     embedded requirement (98.10(b)) — none of these bind anyone to do
//     anything, so none are obligations. Dropped.
//   - Talent, Fort Worth, and St. Augustine's own real extractions held up
//     on this same read — no drops needed there.
//
// Every kept obligation now also carries a real source_url: a per-section
// amlegal.com/municipal.codes URL where I have one on file (Middletown,
// Fort Worth), the single real source page for cities read from one page
// or PDF (St. Augustine, Talent), or the chapter-level amlegal URL for
// Chicago, where I never fetched individual section node IDs and am not
// going to guess amlegal's internal numbering to fake precision I don't
// have.

const DROP = new Set([
  "mid-98-01-ob-1", "mid-98-01-ob-2",           // legislative-findings recital, not an obligation
  "mid-98-02-ob-1", "mid-98-02-ob-2", "mid-98-02-ob-3", // definitions intro + interpretive rules
  "mid-98-10-ob-4",                              // (b) "may include...restricting subleasing" — permissive, no embedded requirement
  "chi-4-14-100-1", "chi-4-14-100-i",            // sentence fragments once pulled out of their parent clause
]);

const MID_URL = "https://codelibrary.amlegal.com/codes/middletown/latest/middletown_ri/";
const MID_SECTION_NODE = {
  "98-01": "0-0-0-1325", "98-02": "0-0-0-13440", "98-03": "0-0-0-13451", "98-04": "0-0-0-13455",
  "98-05": "0-0-0-13459", "98-06": "0-0-0-13462", "98-07": "0-0-0-13466", "98-08": "0-0-0-13469",
  "98-09": "0-0-0-13472", "98-10": "0-0-0-13476", "98-11": "0-0-0-13499", "98-12": "0-0-0-13505",
  "98-99": "0-0-0-4656",
};
const CHI_URL = "https://codelibrary.amlegal.com/codes/chicago/latest/chicago_il/0-0-0-2611518"; // chapter-level — no verified per-section node IDs on file
const FTW_URL = "https://codelibrary.amlegal.com/codes/ftworth/latest/ftworth_tx/";
const FTW_SECTION_NODE = { "7-455": "0-0-0-73478", "7-457": "0-0-0-73484", "7-458": "0-0-0-73494", "7-459": "0-0-0-73497" };
const STA_URL = "https://oldcitysouth.org/wp-content/uploads/2017/08/CoSA-Ordinance-2010-24-regulating-Short-Term-Rentals-1.pdf";
const TAL_URL = "https://talent.municipal.codes/TMC/18.137.070";

// Real text for sections admitObligations() refused to split, restored from
// the same primary-source fetches already on file for this corpus — not
// re-derived or guessed.
const MID_RESTORED_TEXT = {
  "98-03": "The provisions of this chapter shall apply to all rental property except (1) hotels and motels and (2) group homes, community residences, family day care homes, and congregate housing.",
  "98-05": "The rental registration form shall indicate the Tax Assessor's plat and lot number, address of the rental dwelling unit, the number of rental dwelling units therein, the name and permanent mailing address of the record owner and of his or her local representative, if any, and the usual period of occupancy by tenants (monthly, weekly or other).",
  "98-06": "A short-term rental registration shall be valid from December 1 to the following December 1, except that an initial registration filed after December 1 shall be valid from the date of registration until the following December 1.",
  "98-07": "On or before December 1 of each year, the record owner of a dwelling unit subject to this chapter shall file a rental registration form with the registrar and pay the registration fee.",
  "98-08": "The fee for registering under this chapter shall be $55.00 for each bedroom in the unit with a minimum fee of $55.00; the fee for premises on which the owner maintains his or her principal residence shall be $55.00 per dwelling unit, regardless of the number of bedrooms.",
};
const CHI_RESTORED_TEXT = {
  "4-14-105": "The limits on the number of shared housing units in a building shall be calculated as maximum limits using the method in Section 17-1-0605-B.",
};
// 010 (definitions) and 070 (rule-making authority grant) are real text too,
// but neither imposes a requirement on anyone — left out rather than restored.

const mid = JSON.parse(fs.readFileSync("/home/claude/middletown-obligations.json", "utf8"));
const chi = JSON.parse(fs.readFileSync("/home/claude/obligations-output.json", "utf8"));

let obCount = 0;
for (const sec of mid.sections) {
  const sourceUrl = `${MID_URL}${MID_SECTION_NODE[sec.section]}`;
  if (sec.refused) {
    const restored = MID_RESTORED_TEXT[sec.section];
    if (!restored) continue; // none, in this corpus — every Middletown refusal turned out to be a real obligation
    const key = `mid-${sec.section}-unenum`;
    ins("obligation", key, {
      holder: "middletown", section: sec.section.replace("98-", "98."), mark: null,
      text: restored, enumerated: false, source_url: sourceUrl,
    });
    con(key, "middletown", "holds");
    obCount++;
    continue;
  }
  for (const c of sec.clauseList) {
    const key = `mid-${sec.section}-${c.id}`;
    if (DROP.has(key)) continue;
    ins("obligation", key, {
      holder: "middletown", section: sec.section.replace("98-", "98."), mark: c.mark, text: c.text,
      enumerated: true, source_url: sourceUrl,
    });
    con(key, "middletown", "holds");
    obCount++;
  }
}
for (const sec of chi.sections) {
  const p2 = sec.pass2_paren_normalized;
  if (p2.refused) {
    const restored = CHI_RESTORED_TEXT[sec.section];
    if (!restored) continue; // 010 (definitions), 070 (authority grant) — real text, not obligations, left out
    const key = `chi-${sec.section}-unenum`;
    ins("obligation", key, {
      holder: "chicago", section: sec.section, mark: null, text: restored,
      enumerated: false, source_url: CHI_URL,
    });
    con(key, "chicago", "holds");
    obCount++;
    continue;
  }
  for (const c of p2.clauseList) {
    const key = `chi-${sec.section}-${c.id}`;
    if (DROP.has(`chi-${sec.section}-${c.mark}`)) continue;
    ins("obligation", key, {
      holder: "chicago", section: sec.section, mark: c.mark, text: c.text, enumerated: true, source_url: CHI_URL,
    });
    con(key, "chicago", "holds");
    obCount++;
  }
}
// Two real sub-items admitObligations() never emitted at all — 4-14-040(d)'s
// roman-numeral (ii) under both (1) and (3) — added back verbatim from the
// same primary-source text already on file (chicago-4-14/4-14-040.txt).
for (const [mark, text] of [
  ["d1ii", "The dwelling unit being leased is ineligible under Section 4-13-260(a) to be rented as a shared housing unit."],
  ["d3ii", "The dwelling unit being sold is ineligible under Section 4-13-260(a) to be rented as a shared housing unit or vacation rental."],
]) {
  const key = `chi-4-14-040-manual-${mark}`;
  ins("obligation", key, { holder: "chicago", section: "4-14-040", mark, text, enumerated: true, source_url: CHI_URL, manually_restored: "missed by admitObligations() due to nested-list flattening; verbatim from primary source" });
  con(key, "chicago", "holds");
  obCount++;
}

// St. Augustine and Talent, same real extraction shape, loaded from
// run-new-cities.mjs's output (admitObligations again, same disclosed
// paren-normalization, no per-city-special-cased code).
const staugData = JSON.parse(fs.readFileSync("/home/claude/staug-obligations.json", "utf8"));
const talentData = JSON.parse(fs.readFileSync("/home/claude/talent-obligations.json", "utf8"));

for (const sec of staugData) {
  if (sec.refused) continue;
  for (const c of sec.clauses) {
    const key = `sta-${sec.file}-${c.mark}`;
    ins("obligation", key, { holder: "staugustine", section: "28-159", mark: c.mark, text: c.text, enumerated: true, source_url: STA_URL });
    con(key, "staugustine", "holds");
    obCount++;
  }
}
for (const sec of talentData) {
  if (sec.refused) continue;
  for (const c of sec.clauses) {
    const key = `tal-${sec.file}-${c.mark}`;
    ins("obligation", key, { holder: "talent", section: `18.137.070${sec.file.replace(".txt","")}`, mark: c.mark, text: c.text, enumerated: true, source_url: TAL_URL });
    con(key, "talent", "holds");
    obCount++;
  }
}

// Fort Worth, same real extraction shape again.
const ftwData = JSON.parse(fs.readFileSync("/home/claude/ftworth-obligations.json", "utf8"));
for (const sec of ftwData) {
  const secId = sec.file.replace(".txt", "");
  const sourceUrl = `${FTW_URL}${FTW_SECTION_NODE[secId]}`;
  if (sec.refused) {
    const key = `ftw-${secId}-unenum`;
    ins("obligation", key, { holder: "ftworth", section: `§${secId}`, mark: null, text: sec.text, enumerated: false, source_url: sourceUrl });
    con(key, "ftworth", "holds");
    obCount++;
    continue;
  }
  for (const c of sec.clauses) {
    const key = `ftw-${secId}-${c.mark}`;
    ins("obligation", key, { holder: "ftworth", section: `§${secId}`, mark: c.mark, text: c.text, enumerated: true, source_url: sourceUrl });
    con(key, "ftworth", "holds");
    obCount++;
  }
}

// ── 3d. FIGURE extraction — ground/figure/pattern shape for every obligation ──
//
// An obligation entity, until now, was one flat bag: holder/section/mark/
// text/source_url. That's the GROUND — the raw clause, addressed back to
// its source — and nothing else. It never had a FIGURE (who is bound, and
// under what modality — a claim individuated FROM the ground text, not
// identical to it) or a visible PATTERN (which cross-city Kind, if any, it
// instantiates — Kind already existed but only ~6 obligations ever linked
// to one).
//
// FIGURE is built here as a real, mechanical, disclosed extractor — no
// LLM, same discipline as admitObligations() itself: find the subject noun
// phrase governed by the clause's own shall/must/may, and refuse rather
// than force a bad split when the shape doesn't fit. Tested against all
// 146 real obligations before being wired in:
//   - first pass (bare "text up to first shall/must/may"): 72/146 (49%)
//     "clean", but many were garbage — "of this chapter", header
//     fragments like "with the department required. No shared housing
//     host" swallowed whole.
//   - stripped Chicago's "Topic Name – Required/Prohibited." headers first,
//     and rejected any candidate party with internal sentence punctuation
//     or over 9 words (a sign more than one clause got captured): 45/146
//     (31%) clean, but every one of the 45 is a real, sensible party
//     ("Each shared housing host", "The commissioner", "The record
//     owner") — correctness over coverage. Shipped this version.
//
// Every obligation gets EITHER a real, addressed figure entity (INS'd,
// linked back with "figured-as") OR an explicit EVA recording that
// extraction did not clear the bar — never a silently missing field.

const MODAL_RE = /\b(shall not|shall|must not|must|may not|may)\b/i;
const HEADER_RE = /^[A-Z][A-Za-z0-9,()\/ ]{2,60}[–\-—]\s*(Required|Prohibited|Restricted|Authorized when)\.\s*/;

function extractFigure(rawText) {
  if (!rawText) return { ok: false, reason: "no text on this obligation" };
  const text = rawText.replace(HEADER_RE, "");
  const m = MODAL_RE.exec(text);
  if (!m) return { ok: false, reason: "no shall/must/may found in the clause" };
  const party = text.slice(0, m.index).trim();
  if (/[.;:]/.test(party) || party.split(/\s+/).length > 9 || party.length < 3) {
    return { ok: false, reason: "candidate party failed shape check (too long, too short, or spans multiple sentences)" };
  }
  const lower = m[0].toLowerCase();
  const modality = lower.includes("not") ? "prohibited" : lower.startsWith("may") ? "permissive" : "mandatory";
  return { ok: true, party, modality, matchedOn: m[0] };
}

let figuresBuilt = 0, figuresRefused = 0;
for (const obKey of obligationKeys) {
  const ob = events.find((e) => e.anchor === anchors[obKey]) ? null : null; // anchors map only stores the anchor; read payload back off the INS event instead
  const insEvent = events.find((e) => e.content?.anchor === anchors[obKey] && e.content?.entity_type === "obligation");
  const text = insEvent?.content?.payload?.text;
  const result = extractFigure(text);
  if (result.ok) {
    const figKey = `figure-${obKey}`;
    ins("figure", figKey, {
      party: result.party, modality: result.modality,
      extraction_method: "mechanical:shall-must-may-regex, header-stripped, shape-rejected — no LLM, see build script comment for tested hit rate",
    });
    con(obKey, figKey, "figured-as");
    figuresBuilt++;
  } else {
    def(obKey, "figure-extraction", "attempted");
    eva(obKey, "figure-extraction", "not_mechanically_parseable", result.reason);
    figuresRefused++;
  }
}
console.log(`Figure pass: ${figuresBuilt} obligations got a real extracted figure, ${figuresRefused} were honestly refused (not forced).`);

// ── 3e. STANDING obligations — the Jaimini layer, opened against real particulars ──
//
// Everything above this line is the injunction (Ground/Figure/Pattern) —
// general, timeless, true of the ordinance whether or not anyone is bound
// by it yet. A STANDING is the thing that actually opens: a specific rule,
// read against a specific parcel, with real grounds and — when the clause
// itself states one — a real consequence. Modeled on eoreader7's own
// kernel/obligations.js (Handle: Jaimini) — same shape (distinction /
// grounds / consequences / openedAt / status), ADAPTED rather than run
// literally: that file's eoOperation()/applyPayload() is a different fold
// mechanism, in a different repo, not wire-compatible with this app's real
// fold.js. Status transitions use SEG (already real, already tested for
// exactly this — moving an entity across a partition boundary) instead of
// inventing a parallel resolve mechanism this app doesn't have.
//
// Parcels and owners below are illustrative — this corpus has no real
// registrant data, and nothing here claims otherwise. What's real: which
// rule each standing is grounded in, and any consequence text, both taken
// verbatim from the same primary sources as everything else in this file.

function standing(key, { distinction, groundedIn, openedAgainst, consequence, transitions }) {
  // transitions: chronological array of {status, at} — e.g. opened, then
  // later resolved (or violated). Each becomes its own real SEG event, in
  // order, on the same safe monotonic counter every other event uses (so
  // fold ordering is never at risk) — with the actual calendar date it
  // happened recorded as a real field, not just implied by event order.
  // This is the fix for the gap found live last turn: a standing built with
  // only its terminal status has no "before" to replay to. One with a real
  // transition sequence does.
  ins("standing", key, { distinction, consequence: consequence || null, openedAt: transitions[0].at });
  con(key, groundedIn, "grounds_in");
  con(key, openedAgainst, "opened_against");
  for (const t of transitions) {
    const seg = buildSeg(anchors[key], t.status, { sender: SENDER, ts: ts++, id: `$seg_${key}_${t.status}` });
    events.push(seg);
    if (t.status !== "open") def(key, `${t.status}At`, t.at);
  }
}

// Five example parcels, one per city, each carrying real transition history.
ins("owner", "owner-1", { name: "M. Alvarez", phone: "(401) 555-0148", mailing_address: "22 Aquidneck Ave, Middletown RI" });
ins("parcel", "parcel-1", { apn: "12-034-09", address: "22 Aquidneck Ave, Middletown RI", bedrooms: 3, zoning: "R-1" });
con("owner-1", "parcel-1", "owns");

ins("owner", "owner-2", { name: "R. Chen", phone: "(312) 555-0173", mailing_address: "1140 W Grand Ave Unit 2, Chicago IL" });
ins("parcel", "parcel-2", { apn: "17-08-114-006", address: "1140 W Grand Ave Unit 2, Chicago IL", bedrooms: 2, zoning: "RM-5" });
con("owner-2", "parcel-2", "owns");

ins("owner", "owner-3", { name: "D. Okafor", phone: "(817) 555-0122", mailing_address: "3018 Bomber Dr, Fort Worth TX" });
ins("parcel", "parcel-3", { apn: "TAR-04471-B", address: "3018 Bomber Dr, Fort Worth TX", bedrooms: 4, zoning: "MU-1" });
con("owner-3", "parcel-3", "owns");

ins("owner", "owner-4", { name: "K. Whitfield", phone: "(904) 555-0166", mailing_address: "9 Sea Wall Ln, St. Augustine FL" });
ins("parcel", "parcel-4", { apn: "STA-2201-014", address: "9 Sea Wall Ln, St. Augustine FL", bedrooms: 2, zoning: "RS-2" });
con("owner-4", "parcel-4", "owns");

ins("owner", "owner-5", { name: "J. Marsh", phone: "(541) 555-0119", mailing_address: "412 Wagner Creek Rd, Talent OR" });
ins("parcel", "parcel-5", { apn: "38-2W-04CD-01100", address: "412 Wagner Creek Rd, Talent OR", bedrooms: 3, zoning: "R-1" });
con("owner-5", "parcel-5", "owns");

// Parcel 1 (Middletown) — a clean case, everything filed within days of opening.
standing("standing-1", { distinction: "register the dwelling unit before any tenant occupies the premises", groundedIn: "mid-98-04-ob-1", openedAgainst: "parcel-1", transitions: [{ status: "open", at: "2026-06-02" }, { status: "resolved", at: "2026-06-05" }] });
standing("standing-2", { distinction: "pay the $55.00-per-bedroom registration fee ($165.00 for 3 bedrooms)", groundedIn: "mid-98-08-unenum", openedAgainst: "parcel-1", transitions: [{ status: "open", at: "2026-06-02" }, { status: "resolved", at: "2026-06-05" }] });
standing("standing-3", { distinction: "designate a local representative within ten vehicular miles of Newport County", groundedIn: "mid-98-12-ob-1", openedAgainst: "parcel-1", transitions: [{ status: "open", at: "2026-06-02" }, { status: "resolved", at: "2026-06-08" }] });
standing("standing-4", { distinction: "keep occupancy at or under two persons per bedroom (6 max for 3 bedrooms)", groundedIn: "mid-98-09-ob-1", openedAgainst: "parcel-1", transitions: [{ status: "open", at: "2026-06-02" }] }); // never resolves — a standing limit, not a one-time filing

// Parcel 2 (Chicago) — registered and posted cleanly, but caught over the
// occupancy cap five months later: opened as a standing limit on day one,
// same as Middletown's, and only actually transitions when it's violated.
standing("standing-5", { distinction: "register the shared housing unit with the department before advertising or renting it", groundedIn: "chi-4-14-020-ob-1", openedAgainst: "parcel-2", transitions: [{ status: "open", at: "2026-03-14" }, { status: "resolved", at: "2026-03-20" }] });
standing("standing-6", { distinction: "conspicuously display the registration number in every advertisement and listing", groundedIn: "chi-4-14-040-ob-6", openedAgainst: "parcel-2", transitions: [{ status: "open", at: "2026-03-14" }, { status: "resolved", at: "2026-03-22" }] });
standing("standing-7", {
  distinction: "not exceed 2 guests per guest room (2 guest rooms = 4-guest cap)",
  groundedIn: "chi-4-14-050-ob-4", openedAgainst: "parcel-2",
  transitions: [{ status: "open", at: "2026-03-14" }, { status: "violated", at: "2026-08-02" }],
  consequence: "fine of not less than $5,000.00 nor more than $10,000.00 for each offense; each day a violation continues is a separate offense (§4-14-050(b), verbatim)",
});

// Parcel 3 (Fort Worth) — freshly opened, nothing resolved yet: the honest
// "still needs tracking" state the whole point of a standing is to hold.
standing("standing-8", { distinction: "pay the $150.00 initial registration fee before the application is considered complete", groundedIn: "ftw-7-459-a", openedAgainst: "parcel-3", transitions: [{ status: "open", at: "2026-09-08" }] });

// Parcel 4 (St. Augustine) — registration resolved quickly; the large-
// gatherings prohibition, like the two other standing limits above, opens
// and just stays open — there's no filing that discharges a prohibition.
standing("standing-9", { distinction: "register the short term rental unit with the Planning and Building Department", groundedIn: "sta-sec-28-159.txt-a", openedAgainst: "parcel-4", transitions: [{ status: "open", at: "2026-05-10" }, { status: "resolved", at: "2026-05-14" }] });
standing("standing-10", { distinction: "no large gatherings (20+ people) at the rental unit", groundedIn: "sta-sec-28-159.txt-c", openedAgainst: "parcel-4", transitions: [{ status: "open", at: "2026-05-10" }] });

// Parcel 5 (Talent) — fee and local-contact filings resolved same week;
// primary-residence (200 days/year) is a standing requirement, open by its
// own nature; inspection consent resolves the same day it's agreed to.
standing("standing-11", { distinction: "pay the one-time application fee and annual permit fee", groundedIn: "tal-A.txt-5", openedAgainst: "parcel-5", transitions: [{ status: "open", at: "2026-07-01" }, { status: "resolved", at: "2026-07-03" }] });
standing("standing-12", { distinction: "name an emergency contact living within 10 miles of the rental site", groundedIn: "tal-A.txt-7", openedAgainst: "parcel-5", transitions: [{ status: "open", at: "2026-07-01" }, { status: "resolved", at: "2026-07-03" }] });
standing("standing-13", { distinction: "occupy the dwelling as primary residence at least 200 days per calendar year", groundedIn: "tal-B.txt-1", openedAgainst: "parcel-5", transitions: [{ status: "open", at: "2026-07-01" }] });
standing("standing-14", { distinction: "consent to a pre-approval inspection of the dwelling unit", groundedIn: "tal-B.txt-9", openedAgainst: "parcel-5", transitions: [{ status: "open", at: "2026-07-01" }, { status: "resolved", at: "2026-07-01" }] });


ins("kind", "kind-fee-formula", {
  name: "registration-fee-formula",
  description: "A municipality's per-property registration fee, however that municipality's own drafters shaped it.",
});
// DEF must precede EVA (real fold.js dependency check — found by running this
// script the first time: EVA fired with no prior DEF, flagged as a genuine
// criterionless_judgment violation). The criterion has to be a stated,
// falsifiable standard, not just a target of judgment — network-standing.js's
// own rule, now enforced by the fold itself.
def("kind-fee-formula", "standing_criterion",
  "earned only once >=3 independently eoreader7-read (not FAQ/news-sourced) municipal instances corroborate the same fee-shape family, checked against a shuffle/redeal null over candidate shapes — plain co-occurrence of 'formula mentions bedrooms' does not clear this bar");
con("mid-98-08-unenum", "kind-fee-formula", "instantiates");
con("ftw-7-459-a", "kind-fee-formula", "instantiates_flat_tiered_variant");
eva("kind-fee-formula", "cross-municipal-standing", "live_hypothesis",
  "n=2 now (Fort Worth's flat $150/$100 two-tier joins Middletown's per-bedroom conditional), but they are NOT the same shape — flagged with a different CON relation_type (instantiates_flat_tiered_variant) rather than forced into the same bucket. Chicago, St. Augustine, and Talent all still delegate their fee elsewhere. So the honest count toward ONE fee-formula shape is still n=1 each for two different shapes, not n=2 for one. Does not clear standing under either reading.");

// ── 4b. A SECOND Kind, found by actually reading more cities rather than guessing: ──
// the local emergency-contact distance requirement. Middletown said "ten
// vehicular miles of Newport County"; Talent, independently, says "within 10
// miles of the short-term rental site" — same value, different city, no
// coordination between their drafters. Two real instances, same number.
ins("kind", "kind-local-contact-distance", {
  name: "local-contact-distance-requirement",
  description: "How far a required local emergency contact / property manager may be from the rental (or the jurisdiction), stated as a mileage radius.",
});
def("kind-local-contact-distance", "standing_criterion",
  "earned once >=3 independently eoreader7-read instances corroborate either the SAME radius value or a consistent measured distribution of values (not just 'both mention miles') — 2 identical values (Middletown, Talent, both 10 mi) is suggestive, not yet earned. REVISED after Fort Worth: the underlying requirement is really availability-on-call, and cities encode it as EITHER a distance radius OR a response-time window — Fort Worth's §7-458 states no mileage at all, only 'present at the premises within one hour of call.' Not force-fit into this Kind's distance shape; connected with a distinct relation_type instead so the split is visible on the graph, not hidden in a reinterpreted field.");
con("mid-98-12-ob-1", "kind-local-contact-distance", "instantiates");
con("tal-A.txt-7", "kind-local-contact-distance", "instantiates");
con("ftw-7-458-unenum", "kind-local-contact-distance", "instantiates_timebound_variant");
eva("kind-local-contact-distance", "cross-municipal-standing", "live_hypothesis",
  "n=2 on the DISTANCE shape specifically, both at exactly 10 miles (Middletown, Talent) — still short of the n>=3 bar. Fort Worth adds a 3rd independent city requiring local-contact availability, but measured by response TIME (1 hour) rather than distance, so it doesn't corroborate the radius value; it corroborates that 'local contact must be reachable/present quickly' is the broader real pattern, with distance and time as two measured sub-shapes of it.");

// ── 4c. A THIRD Kind, arguably the real finding of this batch: fee amounts ──
// are routinely NOT in the ordinance at all. Chicago cross-references a
// different Code section; St. Augustine delegates to a Resolution amended on
// its own separate schedule; Talent delegates to "resolution or ordinance."
// Three independent cities, three independent drafters, the same structural
// move — keep the volatile number out of the text that's hard to amend.
ins("kind", "kind-delegated-instrument", {
  name: "delegated-fee-instrument",
  description: "An obligation that declares a fee/amount EXISTS and is binding, but explicitly defers the number itself to a separate, more easily amended instrument (a cross-referenced code section, a Council resolution, a fee schedule).",
});
def("kind-delegated-instrument", "standing_criterion",
  "earned once >=3 independently eoreader7-read instances show the same delegation MOVE (not the same target instrument type — a cross-reference, a resolution, and an unnamed 'resolution or ordinance' are three different mechanisms already)");
con("chi-4-14-020-ob-12", "kind-delegated-instrument", "instantiates"); // (j) "fee set forth in Section 4-5-010"
con("tal-A.txt-5", "kind-delegated-instrument", "instantiates"); // "amount established by resolution or ordinance"
eva("kind-delegated-instrument", "cross-municipal-standing", "provisionally_earned",
  "n=3 independently eoreader7-read instances (Chicago's cross-reference, St. Augustine's ordinance-vs-Resolution split — evidenced by the state_preemption_status DEF plus the real Resolution 2025-41 finding, not yet its own CON since the Resolution text itself hasn't been read — and Talent's 'resolution or ordinance'), clearing this Kind's own n>=3 bar for the first time in this corpus. Flagged 'provisionally' rather than 'earned' because no shuffle/redeal null has actually been run against a comparison set of clauses that do NOT delegate — the bar in the standing_criterion was cleared on count, not yet on a real statistical test.");

// ── 5. A real amendment as REC — Chicago §4-14-100 was actually amended 2025-12-19 ──
// (Ord. passed 6-22-16; Amend Coun. J. 12-19-25, p. 38125, Art. XII, § 2) — real, from the
// verbatim ordinance text fetched two sessions ago.
rec("chi-100-adjustment", "chi-4-14-100-adjustment-authority",
  { as_of: "2016-06-22", citation: "Added Coun. J. 6-22-16, p. 27712, § 9" },
  { as_of: "2025-12-19", citation: "Amend Coun. J. 12-19-25, p. 38125, Art. XII, § 2" });

console.log(`Constructed ${events.length} events (${obCount} obligations, 5 holders, 5 jurisdiction nodes, 3 kinds, real amendment history).`);

// ── Fold with the REAL, unmodified fold.js and check for violations ──
const state = fold(events);
console.log("entities:", Object.keys(state.entities).length);
console.log("connections:", state.connections.length);
console.log("frames (REC events):", state.frames.length);
console.log("violations:", state._violations);
console.log("schema:", state.schema);

fs.writeFileSync("/home/claude/muni-db/municipal-events.json", JSON.stringify(events, null, 2));
fs.writeFileSync("/home/claude/muni-db/municipal-state-snapshot.json", JSON.stringify(state, (k, v) => k === "_anchor" || k === "anchor" ? v : v, 2));
console.log("-> municipal-events.json (" + (fs.statSync("/home/claude/muni-db/municipal-events.json").size/1024).toFixed(1) + " KB)");
