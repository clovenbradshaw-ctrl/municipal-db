// build-nashville-demo.mjs — build the 3-layer Nashville demo's two data inputs
// from REAL Eviction-Overwatch snapshots:
//
//   LAYER 1 · read-only public data  → nashville-geo.json
//     Real GeoJSON FeatureCollections, read-only, nothing writable. Three
//     datasets: eviction properties (landlordmapper.org), Metro Nashville 311
//     code violations, and 35 council districts (Know Your Community 2026).
//
//   LAYER 3 · the bridge (the real thing) → nashville-bridge-events.json
//     A fold event log that DRAWS from that public data: the repeat-eviction
//     properties (>=2 evictions) become `parcel` entities with their real
//     lat/lng, their unique landlords become `owner` entities, and every OPEN
//     311 code violation is materialized as a `standing` (case) — the thing
//     the workflow-only product (layer 2) can never produce. A few seeded
//     inspections/notices show workflow actions that DID materialize.
//
// The whole log is folded with the REAL fold() extracted verbatim from
// municipal-db.html; violations are asserted 0 before anything is written.

import fs from "node:fs";
import zlib from "node:zlib";

const EVENTS_PATH = "nashville-bridge-events.json";
const GEO_PATH = "nashville-geo.json";
const HTML_PATH = "municipal-db.html";
const EO = "/Users/mlacy/Documents/3.0/Eviction-Overwatch/data";

const loadGz = (p) => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));
const propertyData = loadGz(`${EO}/landlord-mapper-snapshot.json.gz`);
const violationData = loadGz(`${EO}/code-violations-snapshot.json.gz`);
const districts = JSON.parse(fs.readFileSync(`${EO}/nashville_council_district_demographics.json`, "utf8")).districts;

// ── mirror of the app's operators (verbatim shape) ──
const NS = "io.matrix-events";
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
const OP = {
  NUL: { key: "nul", order: 0 }, SIG: { key: "sig", order: 1 },
  INS: { key: "ins", order: 2 }, SEG: { key: "seg", order: 3 },
  CON: { key: "con", order: 4 }, SYN: { key: "syn", order: 5 },
  DEF: { key: "def", order: 6 }, EVA: { key: "eva", order: 7 },
  REC: { key: "rec", order: 8 },
};
const eventType = (op) => `${NS}.${op.key}`;

function buildIns(entityType, payload, { sender, ts }) {
  const input = `${entityType}\0${JSON.stringify(payload)}\0${sender}\0${ts}`;
  const hash = cyrb53(input);
  const anchor = `${entityType}_${hash.toString(16)}`;
  return { type: eventType(OP.INS), content: { anchor, entity_type: entityType, payload }, origin_server_ts: ts, sender, event_id: `$${entityType}_${hash.toString(16)}`, anchor };
}
function buildDef(anchorOrUndefined, path, value, { sender, ts, id }) {
  const content = anchorOrUndefined ? { anchor: anchorOrUndefined, path, value } : { path, value };
  return { type: eventType(OP.DEF), content, origin_server_ts: ts, sender, event_id: id };
}
function buildCon(sourceAnchor, targetAnchor, relationType, payload, { sender, ts, id }) {
  const content = { source_anchor: sourceAnchor, target_anchor: targetAnchor, relation_type: relationType };
  if (payload !== undefined) content.payload = payload;
  return { type: eventType(OP.CON), content, origin_server_ts: ts, sender, event_id: id };
}
function buildSeg(anchor, partition, { sender, ts, id }) {
  return { type: eventType(OP.SEG), content: { anchor, partition }, origin_server_ts: ts, sender, event_id: id };
}

// ── ── ── LAYER 1 — read-only public data (nashville-geo.json) ── ── ──
const props = propertyData.properties;
const viols = violationData.violations;
const openViols = viols.filter((v) => v.status === "OPEN");
const doneViols = viols.filter((v) => v.status !== "OPEN").sort((a, b) => (b.dateReceived || 0) - (a.dateReceived || 0)).slice(0, 1500);

const propFeatures = props.map((p) => ({
  type: "Feature",
  properties: {
    address: p.addressDisplay,
    evictions: p.evictionCount,
    landlord: p.primaryLandlord,
    landlord_properties: p.landlordMapperAssertion?.data?.otherPropertiesCount ?? null,
    first_file: p.firstFileDate,
    last_file: p.lastFileDate,
  },
  geometry: { type: "Point", coordinates: [Number(p.lng), Number(p.lat)] },
}));
const violFeature = (v) => ({
  type: "Feature",
  properties: {
    request_nbr: v.requestNbr,
    status: v.status,
    problem: (v.subtypeDescription || v.reportedProblem || "").slice(0, 80),
    district: v.cnclDist,
    owner: v.propertyOwner,
    received: new Date(v.dateReceived).toISOString().slice(0, 10),
    result: v.lastActResult || null,
  },
  geometry: { type: "Point", coordinates: [Number(v.lon), Number(v.lat)] },
});
const violFeatures = [...openViols.map(violFeature), ...doneViols.map(violFeature)];
const distRows = Object.values(districts).map((d, i) => ({
  district: i + 1,
  population: d.population,
  median_age: d.median_age,
  pct_black: d.race_ethnicity?.pct_black,
  pct_hispanic: d.race_ethnicity?.pct_hispanic,
  pct_white: d.race_ethnicity?.pct_white,
  median_household_income: d.income?.median_household_income,
  pct_child_poverty: d.poverty?.pct_child_poverty,
  unemployment_rate: d.employment?.unemployment_rate,
  pct_renter: d.housing?.pct_renter ?? null,
}));

const geo = {
  metadata: {
    name: "nashville public data — read-only",
    readOnly: true,
    source: "Eviction-Overwatch snapshots: landlordmapper.org property map + Metro Nashville 311 code violations + Know Your Community 2026",
    asOf: propertyData.exportedAt,
  },
  datasets: {
    properties: { name: "eviction property map", description: "22,988 properties with eviction filings and inferred owners (landlordmapper.org)", count: propFeatures.length, features: propFeatures },
    violations: { name: "code violations (311)", description: "Metro Nashville code-enforcement requests with geo, status, council district", count: 43298, loaded: violFeatures.length, features: violFeatures },
    districts: { name: "council districts", description: "35 metro council districts, Know Your Community 2026", count: distRows.length, rows: distRows },
  },
};
fs.writeFileSync(GEO_PATH, JSON.stringify(geo));

// ── ── ── LAYER 3 — the bridge fold corpus (nashville-bridge-events.json) ── ── ──
const SENDER = "@eviction-overwatch:hyphae.social";
let tsSeq = 1;
const nextTs = () => tsSeq++;
const events = [];
const push = (e) => { events.push(e); return e; };

const repeatProps = props.filter((p) => p.evictionCount >= 2);
const repeatKeys = new Set(repeatProps.map((p) => p.key));
const uniqueLandlords = [...new Set(repeatProps.map((p) => p.primaryLandlord))];
console.log(`bridge parcels (>=2 evictions): ${repeatProps.length}, unique landlords: ${uniqueLandlords.length}`);

// municipality — the real holder
const muniIns = buildIns("municipality", {
  name: "Nashville (Metro Nashville-Davidson County)",
  state: "Tennessee",
  source: "Eviction-Overwatch / landlordmapper.org",
}, { sender: SENDER, ts: nextTs() });
push(muniIns);

// parcels + owners + owns edges
const parcelNew = new Map(); // property key -> new anchor
const ownerByLandlord = new Map();
for (const p of repeatProps) {
  const ins = buildIns("parcel", {
    address: p.addressDisplay,
    evictions: p.evictionCount,
    first_file_date: p.firstFileDate,
    last_file_date: p.lastFileDate,
    lat: Number(p.lat),
    lng: Number(p.lng),
    zoning: null, // not on file — null, not guessed
  }, { sender: SENDER, ts: nextTs() });
  push(ins);
  parcelNew.set(p.key, ins.content.anchor);
}
for (const name of uniqueLandlords) {
  const count = repeatProps.filter((p) => p.primaryLandlord === name).length;
  const ins = buildIns("owner", { name, property_count: count }, { sender: SENDER, ts: nextTs() });
  push(ins);
  ownerByLandlord.set(name, ins.content.anchor);
}
let ownsEdges = 0;
for (const p of repeatProps) {
  const a = parcelNew.get(p.key), o = ownerByLandlord.get(p.primaryLandlord);
  if (a && o) {
    push(buildCon(o, a, "owns", { role: "record owner (inferred)" }, { sender: SENDER, ts: nextTs(), id: `$con_owns_${o.slice(-8)}_${a.slice(-8)}` }));
    ownsEdges++;
  }
}
console.log(`owns edges: ${ownsEdges}`);

// standings from code violations — the materialized cases
const normAddr = (s) => String(s || "")
  .toLowerCase().replace(/\s+/g, " ").trim()
  .replace(/\s+\w+ tn \d{5}(-\d{4})?$/, "")          // " CITY TN ZIP" tail
  .replace(/\b(unit|apt|apartment|ste|suite|bldg|lot)\s*#?\s*\d*[a-z]?$/g, "")
  .replace(/\b(unit|apt|apartment)\b.*$/, "")
  .replace(/[^a-z0-9]+/g, " ").trim();
const parcelByNorm = new Map();
for (const p of repeatProps) {
  const n = normAddr(p.key);
  if (n) parcelByNorm.set(n, parcelNew.get(p.key));
}

const ALL_STANDINGS = [...openViols.map((v) => ({ v, partition: "open" })), ...doneViols.map((v) => ({ v, partition: "resolved" }))];
let standingCount = 0, matched = 0, responsible = 0;
for (const { v, partition } of ALL_STANDINGS) {
  const distinction = (v.subtypeDescription || v.reportedProblem || "code violation").slice(0, 90);
  const ins = buildIns("standing", {
    distinction,
    consequence: partition === "open" ? `open — ${v.lastActResult || "no resolution on file"}` : `resolved — ${v.lastActResult || ""}`,
    address: v.propertyAddress,
    request_nbr: v.requestNbr,
    council_district: v.cnclDist,
    received: new Date(v.dateReceived).toISOString().slice(0, 10),
    source: "metro nashville 311",
  }, { sender: SENDER, ts: nextTs() });
  push(ins);
  push(buildSeg(ins.content.anchor, partition, { sender: SENDER, ts: nextTs(), id: `$seg_${ins.content.anchor.slice(-8)}_${partition}` }));
  standingCount++;

  const par = parcelByNorm.get(normAddr(v.addressKey));
  if (par) {
    push(buildCon(ins.content.anchor, par, "opened_against", { role: "premises read against" }, { sender: SENDER, ts: nextTs(), id: `$con_${ins.content.anchor.slice(-8)}_against_${par.slice(-8)}` }));
    matched++;
    const prop = repeatProps.find((p) => parcelNew.get(p.key) === par);
    const o = prop ? ownerByLandlord.get(prop.primaryLandlord) : null;
    if (o) {
      push(buildDef(ins.content.anchor, "responsible_agent", o, { sender: SENDER, ts: nextTs(), id: `$def_${ins.content.anchor.slice(-8)}_responsible` }));
      responsible++;
    }
  }
}
console.log(`standings seeded: ${standingCount} (${openViols.length} open, ${doneViols.length} resolved) | opened_against matched: ${matched} | responsible_agent set: ${responsible}`);

// seeded materialized artifacts — workflow actions that DID leave entities
const highEvict = [...repeatProps].sort((a, b) => b.evictionCount - a.evictionCount).slice(0, 5);
const inspTargets = highEvict.slice(0, 3);
for (const p of inspTargets) {
  const a = parcelNew.get(p.key);
  const ins = buildIns("inspection", {
    planned_for: "2026-09-20",
    focus: `repeat eviction property (${p.evictionCount} filings) — verify occupancy & code status`,
    note: "scheduled from the bridge; a real event, unlike the workflows layer.",
  }, { sender: SENDER, ts: nextTs() });
  push(ins);
  if (a) push(buildCon(ins.content.anchor, a, "targets", { role: "inspection target" }, { sender: SENDER, ts: nextTs(), id: `$con_${ins.content.anchor.slice(-8)}_targets_${a.slice(-8)}` }));
}
for (const p of highEvict.slice(0, 2)) {
  const a = parcelNew.get(p.key);
  const ins = buildIns("notice", {
    kind: "code-compliance", channel: "postcard", subject: "Outstanding code violations at this property",
    sent_at: "2026-09-11",
  }, { sender: SENDER, ts: nextTs() });
  push(ins);
  if (a) push(buildCon(ins.content.anchor, a, "about", { role: "notice addresses this property" }, { sender: SENDER, ts: nextTs(), id: `$con_${ins.content.anchor.slice(-8)}_about_${a.slice(-8)}` }));
}

// schema notes — the three-layer gates stay visible in the folded schema
const schemaNote = (key, value) => push(buildDef(undefined, `_schema.${key}`, value, { sender: SENDER, ts: nextTs(), id: `$def_schema_${key}` }));
schemaNote("three_layer", "Three-layer demo. Layer 1 (read-only public data, nashville-geo.json) holds the real portal: 22,988 eviction properties, 43,298 code violations, 35 council districts — join/pivot, never write. Layer 2 (workflows) is a separate product that runs pre-defined 2D tasks and materializes nothing. Layer 3 is THIS fold: it draws ground truth from layer 1 (the repeat-eviction parcels, their landlords, the OPEN code violations as cases) and runs layer-2-style actions as real events, so they leave entities behind.");
schemaNote("data_gates", "parcels: only the >=2-eviction flagged set (2,487 real properties) is materialized; the portal's full 22,988 stay read-only in layer 1 — the bridge does not replace the portal. zoning is null on every parcel (not on file) — null, not guessed. Owners are landlordmapper.org inferences (caveated upstream), kept as the portal asserts them. Code-violation cases: 3,432 OPEN + 1,500 most-recent resolved, all real 311 requests; opened_against/responsible_agent only where the violation address matches a bridge parcel by normalized street+number.");

// ── fold with the REAL fold; assert 0 violations ──
function loadRealFold() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const start = html.indexOf("let NS = ");
  const end = html.indexOf("/* ── storage ── */");
  if (start < 0 || end < 0 || end <= start) throw new Error("could not locate the app's fold code");
  const head = html.slice(start, end);
  const factory = new Function(`return (() => { ${head}\nreturn { fold, OP, eventType, buildIns, buildDef, buildCon, buildEva, buildSeg, chronological, dispatch }; })();`);
  return factory();
}
const real = loadRealFold();
const state = real.fold(events);
console.log("entities:", Object.keys(state.entities).length, "| connections:", state.connections.length, "| violations:", state._violations.length);
if (state._violations.length) { console.log(state._violations.slice(0, 25)); process.exit(1); }
const byType = {};
for (const e of Object.values(state.entities)) if (e._type) byType[e._type] = (byType[e._type] || 0) + 1;
console.log("by type:", JSON.stringify(byType));
console.log("schema keys:", Object.keys(state.schema || {}).length);

fs.writeFileSync(EVENTS_PATH, JSON.stringify(events));
console.log(`-> ${EVENTS_PATH} (${(fs.statSync(EVENTS_PATH).size / 1024 / 1024).toFixed(1)} MB, ${events.length} events)`);
console.log(`-> ${GEO_PATH} (${(fs.statSync(GEO_PATH).size / 1024 / 1024).toFixed(1)} MB, ${geo.datasets.properties.count} property + ${geo.datasets.violations.loaded} violation features)`);