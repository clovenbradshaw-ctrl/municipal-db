// seed-workbench.mjs — add the compliance-workbench data layer to the corpus.
//
// THE THING THIS SCRIPT IS TESTING — DATA ARCHITECTURE:
//
//   1. EVENT-STREAMING SUBSTRATE. Everything the compliance workbench reads is
//      derived by folding an append-only event log. No new table lives in code;
//      every new concept is a stream of INS/DEF/CON/REC events appended below.
//
//   2. SCHEMA CHANGE IS A FIRST-CLASS EVENT. Two complementary mechanisms:
//      (a) REC — a restructuring frame declares the transition. This script
//          emits one REC per schema phase (baseline → workbench types →
//          actor-edge types), each carrying before_frame/after_frame so the
//          transition itself is inspectable history, not a code change.
//      (b) _schema.* DEFs — the machine-typed data dictionary. Every new type's
//          field spec, every new relation's source/target vocabulary, the
//          workbench personas, and the listing-required-items checklist are all
//          DEF events on the `_schema.*` path. The UI reads these from the fold;
//          code never hard-codes a shape that the log owns.
//
//   3. REFUSE, DON'T GUESS. Delegated fee instruments (Chicago §4-5-010, Talent
//      resolution) are modeled as `delegated` shapes with a citation, NOT given
//      invented amounts. Tax schedules carry citations; the estimator multiplies
//      whatever the schedule says.
//
// Same discipline as the rest of the pipeline: fold with the REAL fold(),
// assert zero violations, append, write back.

import fs from "node:fs";

const EVENTS_PATH = "municipal-events.json";
const HTML_PATH = "municipal-db.html";
const SENDER = "@michael:hyphae.social";

const events = JSON.parse(fs.readFileSync(EVENTS_PATH, "utf8"));
let ts = 1 + events.reduce((m, e) => Math.max(m, e.origin_server_ts || 0), 0);
const nextTs = () => ts++;

const insByAnchor = new Map();
for (const e of events) if (e.type === "io.matrix-events.ins") insByAnchor.set(e.content.anchor, e);
const payloadOf = (a) => insByAnchor.get(a)?.content?.payload;
const byType = new Map();
for (const e of events) if (e.type === "io.matrix-events.ins") {
  if (!byType.has(e.content.entity_type)) byType.set(e.content.entity_type, []);
  byType.get(e.content.entity_type).push(e.content);
}
const cons = events.filter((e) => e.type === "io.matrix-events.con").map((e) => e.content);
const consFor = (anchor) => cons.filter((c) => c.source_anchor === anchor || c.target_anchor === anchor);

// the real fold, extracted verbatim from the app's own <script>
function loadRealFold() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const start = html.indexOf("let NS = ");
  const end = html.indexOf("/* ── storage ── */");
  if (start < 0 || end < 0 || end <= start) throw new Error("could not locate the app's fold code");
  const head = html.slice(start, end);
  const factory = new Function(`return (() => { ${head}\nreturn { fold, OP, eventType, buildIns, buildDef, buildCon, buildEva, buildSeg, buildRec, buildSyn, chronological, dispatch }; })();`);
  return factory();
}

// ── 1. resolve lookup helpers against the folded baseline ──
function loadBaseline() {
  const real = loadRealFold();
  const state = real.fold(events);
  return { real, state };
}
let real, state;
const entitiesByType = (t) => Object.values(state.entities).filter((e) => e._type === t);
const findByAddress = (sub) => entitiesByType("parcel").find((p) => (p.address || "").toLowerCase().includes(sub.toLowerCase()));
const ownerOf = (parcelAnchor) => state.connections.find((c) => c.type === "owns" && c.target === parcelAnchor)?.source;
const cityOf = (parcelAnchor) => {
  const a = state.entities[parcelAnchor]?.address || "";
  if (/middletown/i.test(a)) return "middletown";
  if (/chicago/i.test(a)) return "chicago";
  if (/augustine/i.test(a)) return "staugustine";
  if (/talent/i.test(a)) return "talent";
  if (/fort worth/i.test(a)) return "ftworth";
  return null;
};
const MUNI_ANCHOR = {
  middletown: "municipality_1b09307071e888",
  chicago: "municipality_a8035cf65308a",
  staugustine: "municipality_348f9b351b965",
  talent: "municipality_12ffea31677787",
  ftworth: "municipality_c79c856993a8f",
};
const apple = (t, payload) => { const ev = real.buildIns(t, payload, { sender: SENDER, ts: nextTs() }); newEv.push(ev); return ev.content.anchor; };
const edge = (src, tgt, rel) => newEv.push(real.buildCon(src, tgt, rel, { sender: SENDER, ts: nextTs() }));
const def = (anchor, path, value) => newEv.push(real.buildDef(anchor, path, value, { sender: SENDER, ts: nextTs(), id: `$def_${(anchor || "_schema").slice(-8)}_${path.replace(/[^A-Za-z0-9]/g, "_")}` }));
const schemaNote = (key, value) => newEv.push(real.buildDef(undefined, `_schema.${key}`, value, { sender: SENDER, ts: nextTs(), id: `$def_schema_${key.replace(/[^A-Za-z0-9]/g, "_")}` }));
const frame = (scope, beforeFrame, afterFrame, note) => newEv.push(real.buildRec(scope, beforeFrame, afterFrame, { sender: SENDER, ts: nextTs(), id: `$rec_${scope.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${afterFrame.frame || "v4"}` }));

{ const b = loadBaseline(); real = b.real; state = b.state; }

const newEv = [];
const CLAUSIFY = (s) => (s.startsWith("§") ? s : `§${s}`);

// ── 2. schema phase (a): workbench type dictionary in the log ──
// Every discriminator the workbench reads, declared as data. The UI's table
// list, required-listing-items checklist, and verification boards all read
// these DEFs; the log — not the code — is the data dictionary.
const WORKBENCH_TYPES = {
  "fee-schedule": {
    fields: [
      ["for", "text"], ["shape", "text"], ["amount", "number"], ["floor", "number"],
      ["basis", "text"], ["principal_residence_flat", "number"], ["unit_amount", "number"],
      ["per_room", "number"], ["initial", "number"], ["renewal", "number"],
      ["instrument", "text"], ["renewal_cycle", "text"], ["due", "text"], ["citation", "text"],
    ],
    purpose: "A municipality's short-term-rental registration fee, read as the machine-usable form of the fee clause. Shapes: per-bedroom-with-floor | flat | two-tier | per-unit-plus-per-bedroom | delegated. A `delegated` shape carries the instrument citation and NO invented amount (refuse, don't guess).",
  },
  "tax-schedule": {
    fields: [
      ["subject", "text"], ["components", "json"], ["total", "number"],
      ["remittance", "text"], ["due_day", "number"], ["citation", "text"],
    ],
    purpose: "Hotel & occupancy tax components per municipality. Each component is {label, rate, basis, citation}. total is the sum the estimator applies to booking revenue. Citations distinguish corpus clauses from external statutory defaults.",
  },
  "compliance-rule": {
    fields: [
      ["measure", "text"], ["scope", "text"], ["value", "number"], ["unit", "text"],
      ["subject", "text"], ["zone", "text"], ["demo", "boolean"], ["citation", "text"],
    ],
    purpose: "A machine-readable rule the government boards apply. measure is one of contact-distance | proximity-distance | count-per-street | count-per-owner | zone-restricted | occupancy-cap. demo=true marks thresholds the corpus has no verbatim clause for (surfaced honestly, never disguised as law).",
  },
  registration: {
    fields: [
      ["license_number", "text"], ["status", "text"], ["issued_at", "date"], ["expires_at", "date"],
      ["holder", "text"], ["units", "number"], ["bedrooms", "number"], ["guest_rooms", "number"],
      ["max_occupancy", "number"], ["parking_plan", "text"], ["citation", "text"],
    ],
    purpose: "The registry-side record a registration stands for: what was submitted and what was granted. Verification compares this to what the listing displays; absence of a registration entity for a listed parcel is itself the 'unlicensed STR' signal.",
  },
  listing: {
    fields: [
      ["platform", "text"], ["listing_id", "text"], ["url", "text"], ["title", "text"],
      ["listed_at", "date"], ["host", "json"], ["property", "json"], ["bookings", "json"], ["nightly_rate", "number"],
    ],
    purpose: "A listing-platform capture. property holds what the platform SHOWS (bedrooms, units, parking plan, displayed license number, occupancy) — the thing the registry claims should match. bookings hold dated stays: the raw material for inspector evidence-window planning.",
    required_on_listing: ["license_number", "parking_plan", "units", "bedrooms", "max_occupancy", "host_contact"],
  },
  notice: {
    fields: [
      ["kind", "text"], ["to", "anchors"], ["about", "anchors"], ["channel", "text"],
      ["subject", "text"], ["body", "textarea"], ["amounts", "json"], ["sent_at", "date"],
    ],
    purpose: "A registrar→registrant communication, emitted as a real event. Communicating obligations/amounts-owed through the system writes the notice back to the log, so outreach is auditable and undoable like every other event.",
  },
  inspection: {
    fields: [
      ["planned_for", "date"], ["listing", "anchors"], ["parcel", "anchors"],
      ["focus", "text"], ["note", "text"], ["created_at", "date"],
    ],
    purpose: "An inspector task pinned to a booking window — the 'gather evidence on this date' action. Created from an evidence board row as a real event, foldable and undoable.",
  },
};
const WORKBENCH_RELATIONS = [
  ["fee-schedule", "municipality", "levied_by", "a municipality's registration fee schedule"],
  ["tax-schedule", "municipality", "levied_by", "a municipality's hotel & occupancy tax components"],
  ["tax-schedule", "obligation", "mentioned_by", "the corpus clause (if any) that requires tax compliance"],
  ["compliance-rule", "obligation", "enforced_by", "the verbatim clause the rule operationalizes (null for demo thresholds)"],
  ["compliance-rule", "municipality", "applies_in", "a municipality a rule applies to"],
  ["registration", "parcel", "registers", "the parcel a registry certificate covers"],
  ["registration", "municipality", "issued_by", "the municipality that issued a certificate"],
  ["listing", "parcel", "hosted_at", "the parcel a listing advertises"],
  ["listing", "owner", "listed_by", "the owner who listed it"],
  ["notice", "parcel", "notifies_about", "the parcel a notice concerns"],
  ["notice", "owner", "sent_to", "the registrant a notice was sent to"],
  ["inspection", "parcel", "targets", "the parcel an inspection is planned against"],
  ["inspection", "listing", "scheduled_for", "the listing (booking window) an inspection is pinned to"],
];

(() => {
  const beforeTypes = [...byType.keys()].sort();
  frame("_schema", {
    frame: "v3-baseline",
    note: "the 7-table registry before the workbench: municipality jurisdiction obligation kind parcel owner standing",
    types: beforeTypes,
    relations: [...new Set(cons.map((c) => c.relation_type))].sort(),
  }, {
    frame: "v4-compliance-workbench",
    note: "schema extended with workbench discriminators carried as events (below) — no code change, REC is the record of the transition.",
    types: [...new Set([...beforeTypes, ...Object.keys(WORKBENCH_TYPES)])].sort(),
    relations: [...new Set([...cons.map((c) => c.relation_type), ...WORKBENCH_RELATIONS.map((r) => r[2])])].sort(),
  });
  for (const [t, spec] of Object.entries(WORKBENCH_TYPES)) {
    def(undefined, `_schema.types.${t}`, spec);
  }
  for (const [src, tgt, rel, desc] of WORKBENCH_RELATIONS) {
    schemaNote(`relations.${rel}`, { source: src, target: tgt, description: desc });
  }
  schemaNote("workbench", {
    personas: ["landlord", "government"],
    demo: "all surfaces in municipal-db.html are read-only projections over the folded state except two write-actions (record notice, create inspection) which append real INS+CON events — indistinguishable from the seed corpus.",
  });
})();

// ── 3. schema phase (b): actor-edge types, added by a SECOND REC — schema
//      evolution shown twice, incrementally, as events. ──
(() => {
  frame("_schema.workbench", {
    frame: "v4a-base",
    note: "workbench types exist; registrant communication and inspector tasking were designed as part of the discriminator set, so this frame only adds the relation vocabulary — no data migration was needed, which is the point of an event-sourced dictionary.",
    types: Object.keys(WORKBENCH_TYPES).sort(),
    relations: WORKBENCH_RELATIONS.map((r) => r[2]).filter((r) => !["notifies_about", "sent_to", "targets", "scheduled_for"].includes(r)),
  }, {
    frame: "v4b-actor-edges",
    note: "notice→parcel/owner and inspection→parcel/listing edges accepted into the dictionary; actor-emitted records share the same log as the registry.",
    types: Object.keys(WORKBENCH_TYPES).sort(),
    relations: WORKBENCH_RELATIONS.map((r) => r[2]),
  });
})();

// ── 4. fee schedules — the machine-usable registration fees ──
// Mechanical shapes from real clauses; delegated shapes refuse the amount.
const FEES = [
  { scope: "middletown", shape: "per-bedroom-with-floor", amount: 55, floor: 55, basis: "bedroom", principal_residence_flat: 55, renewal_cycle: "annual", due: "on or before December 1", citation: "Middletown Ch.98 §98.08 / §98.07" },
  { scope: "ftworth", shape: "two-tier", initial: 150, renewal: 100, renewal_cycle: "annual", due: "at application and each renewal", citation: "Fort Worth Ch.7 Art.XIII §7-459(a),(b)" },
  { scope: "staugustine", shape: "per-unit-plus-per-bedroom", unit_amount: 303.03, per_room: 79.3, renewal_cycle: "annual (October 1 cycle)", due: "fiscal-year registration cycle", citation: "St. Augustine §28-159; fee schedule Resolution 2025-41" },
  { scope: "chicago", shape: "delegated", instrument: "Section 4-5-010 — handwritten fee schedule, not read into this corpus", renewal_cycle: "annual", due: "annually", citation: "Chicago 4-14-020(j)" },
  { scope: "talent", shape: "delegated", instrument: "city council resolution or ordinance — amount not read into this corpus", renewal_cycle: "annual", due: "within 60 days of ordinance approval (initial)", citation: "Talent 18.137.070A(5)" },
];
for (const f of FEES) {
  const anchor = apple("fee-schedule", { for: "short-term-rental-registration", ...f });
  edge(anchor, MUNI_ANCHOR[f.scope], "levied_by");
}

// ── 5. tax schedules — hotel & occupancy tax components ──
// Components carry citations. Corpus clauses that reference tax (Chicago
// 4-14-040(e), Talent 18.137.070B(10)) are wired via mentioned_by; the rest are
// statutory defaults on file with citations, surfaced honestly as such.
const TAXES = [
  { scope: "middletown", total: 0.07, remittance: "monthly (state STR return)", due_day: 20, components: [
    { label: "whole home short-term rental tax (residential dwelling, entire)", rate: 0.05, basis: "gross booking revenue (stays <=30 days)", citation: "R.I. Gen. Laws §44-18-36.1(d)" },
    { label: "local hotel tax", rate: 0.02, basis: "gross booking revenue", citation: "R.I. Gen. Laws §44-18-36.1(b)" },
  ], citation: "external statutory (effective 2026-01-01)" },
  { scope: "chicago", total: 0.105, remittance: "monthly (Form 7520)", due_day: 15, components: [
    { label: "hotel accommodations tax — base", rate: 0.045, basis: "gross rental or leasing charge", citation: "Chicago Municipal Code Ch 3-24" },
    { label: "vacation rental / shared housing unit surcharge", rate: 0.06, basis: "gross rental or leasing charge", citation: "Ch 3-24 (effective 2018-12-01)" },
  ], citation: "required by Chicago 4-14-040(e)" },
  { scope: "staugustine", total: 0.05, remittance: "monthly (St. Johns County Tax Collector)", due_day: 1, components: [
    { label: "St. Johns County tourist development tax", rate: 0.05, basis: "gross rent, stays <=6 months", citation: "St. Johns County Ordinance 2021-43" },
  ], citation: "external statutory" },
  { scope: "talent", total: 0.015, remittance: "quarterly (state return)", due_day: 90, components: [
    { label: "Oregon state transient lodging tax", rate: 0.015, basis: "amount charged for occupancy", citation: "ORS 320.305" },
    { label: "local transient lodging tax (Jackson County / City of Talent)", rate: 0, basis: "set by local resolution", citation: "not read into corpus — default 0, refuse to guess" },
  ], citation: "registration evidence required by Talent 18.137.070B(10)" },
  { scope: "ftworth", total: 0.09, remittance: "monthly (Localgov filing)", due_day: 25, components: [
    { label: "hotel occupancy tax (7% hotel + 2% convention)", rate: 0.09, basis: "room receipts", citation: "Fort Worth Ch.32 §32-17" },
  ], citation: "external statutory" },
];
const TAX_OBLIGATION = { middletown: null, chicago: null, staugustine: null, talent: null, ftworth: null };
const taxRefOf = (scope) => {
  if (scope === "chicago") return "obligation_18886c4e3baad7"; // 4-14-040(e)
  if (scope === "talent") return "obligation_1bffec250ead3e"; // 18.137.070B(10)
  return null;
};
for (const t of TAXES) {
  const { scope, ...payload } = t;
  const anchor = apple("tax-schedule", { subject: "hotel-and-occupancy", ...payload });
  edge(anchor, MUNI_ANCHOR[scope], "levied_by");
  const obRef = taxRefOf(scope);
  if (obRef) edge(anchor, obRef, "mentioned_by");
}

// ── 6. compliance rules — the detection knobs, as data ──
// contact-distance rules operationalize REAL clauses; the counting rules are
// demo=true (no verbatim clause — surfaced, not disguised).
const RULES = [
  { measure: "contact-distance", scope: "talent", value: 10, unit: "mi", subject: "emergency contact (adult 18+) living within 10 miles of the rental", citation: "Talent 18.137.070A(7)", demo: false, obligation: "obligation_1c268a01a629b8" },
  { measure: "contact-distance", scope: "middletown", value: 10, unit: "mi", subject: "local representative residing in Newport County, or property manager with staffed office within 10 vehicular miles", citation: "Middletown 98.12(a)", demo: false, obligation: "obligation_172ad16e0d4f41" },
  { measure: "contact-distance", scope: "ftworth", value: 1, unit: "hr", subject: "local responsible party reachable / on-site within one hour of call", citation: "Fort Worth §7-458", demo: false, obligation: "obligation_7415fba4878d7" },
  { measure: "proximity-distance", scope: "all", value: 500, unit: "m", subject: "distance between any two listed STRs below which the pair is flagged (same-block proximity)", citation: "no verbatim clause on file — demo threshold", demo: true, obligation: null },
  { measure: "count-per-street", scope: "all", value: 3, unit: "listings/street", subject: "listed STRs on a single street above which area density is flagged", citation: "no verbatim clause on file — demo threshold", demo: true, obligation: null },
  { measure: "count-per-owner", scope: "all", value: 2, unit: "listings/owner", subject: "listed STRs per owner above which concentration is flagged", citation: "no verbatim clause on file — demo threshold", demo: true, obligation: null },
  { measure: "zone-restricted", scope: "chicago", zone: "Restricted Residential Zone", subject: "advertising/booking/renting a shared housing unit inside Chicago's restricted residential zone is prohibited", citation: "Chicago 4-14-050(i)", demo: false, obligation: "obligation_362ab01d4f8c5" },
  { measure: "occupancy-cap", scope: "chicago", value: 2, unit: "persons/guest-room", subject: "maximum occupancy is two persons (not counting <18 children) per guest room", citation: "Chicago 4-14-050(b)", demo: false, obligation: "obligation_a9c6ec0591bf0" },
];
for (const r of RULES) {
  const { obligation, ...payload } = r;
  const anchor = apple("compliance-rule", payload);
  edge(anchor, MUNI_ANCHOR[r.scope === "all" ? "middletown" : r.scope], "applies_in");
  if (obligation) edge(anchor, obligation, "enforced_by");
}

// ── 7. registrations — the registry-side certificates ──
// One per registered standing-parcel. Licensing strings are illustrative (the
// corpus's parcels are illustrative); status/expiry model a live certificate.
const REG_SERVICE_PARCELLS = [
  { license: "STR-2026-00981", parcel: "22 Aquidneck Ave, Middletown RI", holder: "M. Alvarez", bedrooms: 3, units: 1, maxOcc: 6, parking: "2 off-street spaces, rear lot", expires: "2026-12-01" },
  { license: "R-2024-55190", parcel: "1140 W Grand Ave Unit 2, Chicago IL", holder: "R. Chen", bedrooms: 2, units: 1, maxOcc: 4, parking: "1 garage space", expires: "2027-03-14" },
  { license: "R-2024-55191", parcel: "1140 W Grand Ave Unit 4, Chicago IL", holder: "P. Novak", bedrooms: 2, units: 1, maxOcc: 4, parking: "1 garage space", expires: "2027-03-14" },
  { license: "R-2024-55203", parcel: "2432 N Hoyne Ave Unit 3, Chicago IL", holder: "T. Osei", bedrooms: 2, units: 1, maxOcc: 4, parking: "none on site (metered street)", expires: "2027-03-14" },
  { license: "TRT-2026-0381", parcel: "9 Sea Wall Ln, St. Augustine FL", holder: "K. Whitfield", bedrooms: 2, units: 1, maxOcc: 4, parking: "2-space driveway", expires: "2026-10-01" },
  { license: "TRT-2026-0442", parcel: "12 Marine St, St. Augustine FL", holder: "A. Vasquez", bedrooms: 2, units: 1, maxOcc: 4, parking: "street permit #124", expires: "2026-10-01" },
  { license: "TAL-2026-0117", parcel: "412 Wagner Creek Rd, Talent OR", holder: "J. Marsh", bedrooms: 3, units: 1, maxOcc: 6, parking: "1 garage + 1 driveway", expires: "2027-07-01" },
  { license: "TAL-2026-0189", parcel: "98 Valley View Rd, Talent OR", holder: "S. Lindqvist", bedrooms: 3, units: 1, maxOcc: 6, parking: "2 driveway", expires: "2027-07-01" },
  { license: "TAL-2026-0204", parcel: "211 S Pacific Hwy, Talent OR", holder: "R. Delgado", bedrooms: 2, units: 1, maxOcc: 4, parking: "1 driveway", expires: "2027-07-01" },
  { license: "STR-2026-01122", parcel: "87 Oliphant Ln, Middletown RI", holder: "F. Brennan", bedrooms: 3, units: 1, maxOcc: 6, parking: "2 off-street", expires: "2026-12-01" },
];
for (const r of REG_SERVICE_PARCELLS) {
  const parcel = findByAddress(r.parcel.split(" RI")[0].split(" IL")[0].split(" FL")[0].split(" OR")[0].split(" TX")[0]);
  if (!parcel) { console.warn("!! registration parcel not found:", r.parcel); continue; }
  const muni = cityOf(parcel._anchor);
  const anchor = apple("registration", {
    license_number: r.license, status: "active",
    issued_at: r.parcel.includes("2024") ? "2025-03-14" : "2026-01-02", expires_at: r.expires,
    holder: r.holder, units: r.units, bedrooms: r.bedrooms, guest_rooms: r.bedrooms, max_occupancy: r.maxOcc,
    parking_plan: r.parking, citation: "registry-side submission on file",
  });
  edge(anchor, parcel._anchor, "registers");
  edge(anchor, MUNI_ANCHOR[muni], "issued_by");
}

// ── 8. listings — platform captures, shaped to exercise every verification ──
// property.license_number is what the listing DISPLAYS (null → required-item
// failure). booking windows are dated stays for the evidence boards.
const LISTINGS = [
  // registered + fully compliant + upcoming bookings
  { platform: "airbnb", id: "RI114217", title: "Aquidneck cottage, walk to Second Beach", parcel: "22 Aquidneck Ave", bedrooms: 3, units: 1, maxOcc: 6, beds: 4, license: "STR-2026-00981", parking: "2 off-street spaces, rear lot", bookings: [["2026-09-18", "2026-09-22"], ["2026-09-28", "2026-10-01"]], url: "https://airbnb.com/rooms/RI114217" },
  { platform: "vrbo", id: "VR-CHI-8841", title: "W Grand Ave 2br flat, quiet unit", parcel: "1140 W Grand Ave Unit 2", bedrooms: 2, units: 1, maxOcc: 4, beds: 2, license: "R-2024-55190", parking: "1 garage space", bookings: [["2026-09-24", "2026-09-27"]], url: "https://vrbo.com/VR-CHI-8841" },
  { platform: "vrbo", id: "VR-CHI-8842", title: "W Grand Ave 2br flat — same building", parcel: "1140 W Grand Ave Unit 4", bedrooms: 2, units: 1, maxOcc: 4, beds: 2, license: "R-2024-55191", parking: null, bookings: [["2026-09-20", "2026-09-25"]], url: "https://vrbo.com/VR-CHI-8842" },
  { platform: "airbnb", id: "FL-3904", title: "Sea Wall cottage steps from historic plaza", parcel: "9 Sea Wall Ln", bedrooms: 2, units: 1, maxOcc: 4, beds: 2, license: "TRT-2026-0381", parking: "2-space driveway", bookings: [["2026-09-19", "2026-09-21"]], url: "https://airbnb.com/rooms/FL-3904" },
  { platform: "airbnb", id: "OR-7712", title: "Wagner Creek farmhouse, near wineries", parcel: "412 Wagner Creek Rd", bedrooms: 3, units: 1, maxOcc: 6, beds: 3, license: "TAL-2026-0117", parking: "1 garage + 1 driveway", bookings: [["2026-09-26", "2026-09-30"]], url: "https://airbnb.com/rooms/OR-7712" },
  // registered parcels whose LISTING lies / omits / hides → verification + mismatch +
  // contact-distance boards light up
  { platform: "booking.com", id: "BC-10221", title: "Oliphant Ln family home (4 bedrooms)", parcel: "87 Oliphant Ln", bedrooms: 4, units: 1, maxOcc: 8, beds: 5, license: "STR-2026-01122", parking: "2 off-street", bookings: [["2026-09-15", "2026-09-18"]], url: "https://booking.com/h365712" },
  { platform: "airbnb", id: "CHI-22310", title: "Hoyne 3br — 3 bedrooms available", parcel: "2432 N Hoyne Ave Unit 3", bedrooms: 3, units: 1, maxOcc: 6, beds: 3, license: "R-2024-55203", parking: null, bookings: [["2026-10-01", "2026-10-04"]], url: "https://airbnb.com/rooms/CHI-22310" },
  { platform: "booking.com", id: "BC-8815", title: "Marine St historic unit", parcel: "12 Marine St", bedrooms: 2, units: 1, maxOcc: 4, beds: 2, license: null, parking: "street permit #124", bookings: [["2026-09-22", "2026-09-25"]], url: "https://booking.com/h8815" },
  // UNREGISTERED (Fort Worth — fee standing OPEN, no registration entity, no license)
  { platform: "airbnb", id: "TX-4451", title: "Bomber Dr ranch 4br — newly on the market", parcel: "3018 Bomber Dr", bedrooms: 4, units: 1, maxOcc: 8, beds: 4, license: null, parking: "2-car garage", bookings: [["2026-09-17", "2026-09-20"]], url: "https://airbnb.com/rooms/TX-4451" },
  { platform: "vrbo", id: "VR-FTW-009", title: "S Main 3br, firepit backyard", parcel: "3200 S Main St", bedrooms: 3, units: 1, maxOcc: 6, beds: 3, license: null, parking: "driveway", bookings: [["2026-09-21", "2026-09-24"]], url: "https://vrbo.com/VR-FTW-009" },
  // STR on a street where three more listings concentrate → density + proximity
  { platform: "airbnb", id: "TX-6621", title: "Magnolia 3br, mid-century", parcel: "227 W Magnolia Ave", bedrooms: 3, units: 1, maxOcc: 6, beds: 3, license: null, parking: null, bookings: [["2026-09-25", "2026-09-28"]], url: "https://airbnb.com/rooms/TX-6621" },
  { platform: "vrbo", id: "VR-FTW-113", title: "Magnolia bungalow — 3br", parcel: "367 W Magnolia Ave", bedrooms: 3, units: 1, maxOcc: 6, beds: 3, license: null, parking: "carport", bookings: [], url: "https://vrbo.com/VR-FTW-113" },
  { platform: "airbnb", id: "TX-6690", title: "Magnolia Place 3br", parcel: "1027 W Magnolia Ave", bedrooms: 3, units: 1, maxOcc: 6, beds: 3, license: null, parking: "driveway", bookings: [["2026-09-30", "2026-10-02"]], url: "https://airbnb.com/rooms/TX-6690" },
  { platform: "booking.com", id: "BC-7744", title: "Magnolia 4br family stay", parcel: "1205 W Magnolia Ave", bedrooms: 4, units: 1, maxOcc: 8, beds: 4, license: null, parking: null, bookings: [], url: "https://booking.com/h7744" },
  // unregistered Middletown STRs (no standing corpus-wide) with upcoming bookings
  { platform: "airbnb", id: "RI-44210", title: "Oliphant 3br oasis", parcel: "839 Oliphant Ln", bedrooms: 3, units: 1, maxOcc: 6, beds: 3, license: null, parking: "1 off-street", bookings: [["2026-09-23", "2026-09-26"]], url: "https://airbnb.com/rooms/RI-44210" },
  { platform: "vrbo", id: "VR-RI-201", title: "Aquidneck 3br + garage", parcel: "566 Aquidneck Ave", bedrooms: 3, units: 1, maxOcc: 6, beds: 3, license: null, parking: "garage", bookings: [], url: "https://vrbo.com/VR-RI-201" },
  ];
const listingAnchors = new Map();

// three listings all carrying the SAME owner → owner-concentration board.
// Picked programmatically: first owner with >=3 owned parcels, first 3 parcels.
(() => {
  const ownedByOwner = new Map();
  for (const c of state.connections) if (c.type === "owns") {
    if (!ownedByOwner.has(c.source)) ownedByOwner.set(c.source, []);
    ownedByOwner.get(c.source).push(c.target);
  }
  const serial = [...ownedByOwner.entries()].filter(([, ps]) => ps.length >= 3)[0];
  if (!serial) return;
  const [ownerAnchor, parcelAnchors] = serial;
  const owner = state.entities[ownerAnchor];
  const picks = parcelAnchors.slice(0, 3).map((a) => state.entities[a]).filter(Boolean);
  picks.forEach((parcel, i) => {
    const anchor = apple("listing", {
      platform: "airbnb", listing_id: `SER-${i + 1}`, url: `https://airbnb.com/rooms/SER-${i + 1}`,
      title: `(serial) host-managed ${parcel.bedrooms}br — property ${i + 1}`,
      listed_at: "2026-08-01",
      host: { name: owner?.name || "—", phone: owner?.phone || "—", address: owner?.mailing_address || "—" },
      property: { address: parcel.address, bedrooms: parcel.bedrooms, beds: parcel.bedrooms, units: 1, guest_rooms: parcel.bedrooms, max_occupancy: parcel.bedrooms * 2, property_type: "residential", zoning_claim: null, parking_plan: "driveway", license_number: null },
      bookings: [[`2026-10-0${i + 1}`, `2026-10-0${i + 4}`]].map(([from, to]) => ({ from, to })),
      nightly_rate: 120,
    });
    edge(anchor, parcel._anchor, "hosted_at");
    edge(anchor, ownerAnchor, "listed_by");
    listingAnchors.set(`SER-${i + 1}`, anchor);
  });
})();
for (const L of LISTINGS) {
  const needle = L.parcel.toLowerCase();
  const parcel = entitiesByType("parcel").find((p) => (p.address || "").toLowerCase().startsWith(needle));
  if (!parcel) { console.warn("!! listing parcel not found:", L.parcel); continue; }
  const owner = ownerOf(parcel._anchor);
  const anchor = apple("listing", {
    platform: L.platform, listing_id: L.id, url: L.url, title: L.title, listed_at: "2026-08-01",
    host: { name: state.entities[owner]?.name || "—", phone: state.entities[owner]?.phone || "—", address: state.entities[owner]?.mailing_address || "—" },
    property: {
      address: parcel.address, bedrooms: L.bedrooms, beds: L.beds, units: L.units, guest_rooms: L.bedrooms,
      max_occupancy: L.maxOcc, property_type: "residential",
      zoning_claim: null, parking_plan: L.parking, license_number: L.license,
    },
    bookings: L.bookings.map(([from, to]) => ({ from, to })),
    nightly_rate: 140 + (L.bedrooms * 20),
  });
  edge(anchor, parcel._anchor, "hosted_at");
  if (owner) edge(anchor, owner, "listed_by");
  listingAnchors.set(L.id, anchor);
}

// ── 9. two actor-emitted sample records (as events, like any other) ──
(() => {
  // a registrar notice: communicates the outstanding Fort Worth registration fee
  const l8 = findByAddress("3018 Bomber Dr");
  const own8 = ownerOf(l8._anchor);
  const notice = apple("notice", {
    kind: "amounts-owed", channel: "portal",
    to: [own8], about: [l8._anchor],
    subject: "The short-term rental at 3018 Bomber Dr is not registered",
    body: "The registration fee of $150.00 is outstanding and the application is incomplete under Fort Worth §7-457(d). Bookings after this notice may be treated as unlicensed operation (§7-454).",
    amounts: [{ label: "initial registration fee", amount: 150, currency: "USD", citation: "Fort Worth §7-459(a)" }],
    sent_at: "2026-09-01",
  });
  edge(notice, l8._anchor, "notifies_about");
  if (own8) edge(notice, own8, "sent_to");

  // an inspector task pinned to an upcoming booking window on the same unit
  const inspection = apple("inspection", {
    planned_for: "2026-09-17", focus: "evidence of unlicensed operation — verify occupancy on arrival night",
    note: "Booking TX-4451 (09-17→09-20). Unit has no registration on file; confirm whether guests are paying and whether the unit is actually rented under the state HOT rules.",
    listing: [listingAnchors.get("TX-4451")], parcel: [l8._anchor], created_at: "2026-09-10",
  });
  edge(inspection, l8._anchor, "targets");
  edge(inspection, listingAnchors.get("TX-4451"), "scheduled_for");
})();

// ── 10. schema notes capturing the structural decisions (visible in the fold) ──
schemaNote("workbench.design_notes", [
  "REC is the record of schema change: this corpus now carries two restructuring frames (baseline→workbench types, then→actor-edge relations). The transition is inspectable history, not a code diff.",
  "_schema.types.* holds the data dictionary: type → field spec (+ purpose, and required_on_listing for listing). The UI derives table/ddl/verification checklists from these DEFs, so a future type is added by appending an event, not by editing code.",
  "edge payloads on CON are NOT relied on for anything the UI reads — the app's fold() drops them; all consumable data lives on entity payloads (INS) and _schema.* (DEF).",
  "delegated fee instruments (Chicago §4-5-010, Talent council resolution) hold a citation and NO amount — the calculator refuses rather than invents.",
  "tax components are statutory defaults with citations on file; corpus clauses that require tax compliance are wired via mentioned_by so the estimator can prove its own legal context per city.",
]);

events.push(...newEv);

// ── 11. fold with the REAL fold, assert zero violations, write ──
const baselineCount = Object.values(state.entities).length;
const { real: realFold } = loadBaseline();
const folded = realFold.fold(events);
console.log("entities:", Object.keys(folded.entities).length, `(+${Object.keys(folded.entities).length - baselineCount})`);
console.log("connections:", folded.connections.length, `(+${folded.connections.length - state.connections.length})`);
console.log("frames:", folded.frames.map((f) => f.content ? f.content.scope : f.scope));
console.log("violations:", folded._violations.length);
if (folded._violations.length) {
  console.log(JSON.stringify(folded._violations.slice(0, 10), null, 1));
  process.exit(1);
}
const byTypeOut = {};
for (const e of Object.values(folded.entities)) if (e._type) byTypeOut[e._type] = (byTypeOut[e._type] || 0) + 1;
console.log("workbench types:", JSON.stringify(Object.fromEntries(Object.entries(byTypeOut).filter(([t]) => ["listing", "fee-schedule", "tax-schedule", "compliance-rule", "registration", "notice", "inspection"].includes(t)))));
console.log("schema.types declared:", Object.keys(folded.schema?.types || {}).length);

fs.writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2));
console.log(`-> ${EVENTS_PATH} (${(fs.statSync(EVENTS_PATH).size / 1024 / 1024).toFixed(1)} MB)`);
console.log(`appended events: ${newEv.length}`);