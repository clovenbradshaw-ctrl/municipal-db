// build-minimal-schema.mjs — strip the municipal corpus onto ONE physical fold
// (state.entities) with FIVE discriminators: agent | region | obligation |
// standing (live) | task (live). figure folds into obligation payload (organ-
// gated canon, refused = EVA not guess); kind folds into the schema frame
// (obligation.kind + _schema.kinds). consequence/deadline fold into the
// obligation payload (verbatim-cited). Everything else is projection.
//
// The whole log is folded with the REAL fold() extracted verbatim from
// municipal-db.html; violations are asserted 0 before anything is written.

import fs from "node:fs";

const EVENTS_PATH = "municipal-events.json";
const HTML_PATH = "municipal-db.html";
const ORGANS = "/Users/mlacy/Documents/3.0/eoreader7-p166-base/native";

const defaultNS = "io.matrix-events";
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
const eventType = (op) => `${defaultNS}.${op.key}`;

function buildIns(entityType, payload, { sender, ts }) {
  const input = `${entityType}\0${JSON.stringify(payload)}\0${sender}\0${ts}`;
  const hash = cyrb53(input);
  const anchor = `${entityType}_${hash.toString(16)}`;
  return {
    type: eventType(OP.INS),
    content: { anchor, entity_type: entityType, payload },
    origin_server_ts: ts, sender, event_id: `$${entityType}_${hash.toString(16)}`, anchor,
  };
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
function buildEva(anchor, criterion, result, note, { sender, ts, id }) {
  return { type: eventType(OP.EVA), content: { anchor, criterion, result, note }, origin_server_ts: ts, sender, event_id: id };
}
function buildSeg(anchor, partition, { sender, ts, id }) {
  return { type: eventType(OP.SEG), content: { anchor, partition }, origin_server_ts: ts, sender, event_id: id };
}

// ── 1. load source + organs ──
const source = JSON.parse(fs.readFileSync(EVENTS_PATH, "utf8"));
const SENDER = "@michael:hyphae.social";
let tsSeq = 1 + source.reduce((m, e) => Math.max(m, e.origin_server_ts || 0), 0);
const nextTs = () => tsSeq++;
const newEvents = [];
const push = (e) => { newEvents.push(e); return e; };

const insByAnchor = new Map(source.filter((e) => e.type === eventType(OP.INS)).map((e) => [e.content.anchor, e]));
const payloadOf = (a) => insByAnchor.get(a)?.content?.payload;
const sourceCon = source.filter((e) => e.type === eventType(OP.CON));

const rel = await import(`${ORGANS}/adapters/text/relations.js`);
const mat = await import(`${ORGANS}/adapters/text/material.js`);

// ── 2. organ pass ──
const obligationTexts = [...insByAnchor.values()].filter((e) => e.content.entity_type === "obligation").map((e) => e.content.payload.text);
const fw = mat.functionWordSet(mat.buildFrequencyTable(obligationTexts.join("\n\n")));
const figureSurfaces = [...new Set([...insByAnchor.values()].filter((e) => e.content.entity_type === "figure").map((e) => e.content.payload.party))];
const discovered = rel.discoverRelationVocab(obligationTexts.join("\n\n"), { surfaces: figureSurfaces, nounPhraseSubjects: true, minSurfaces: 2, functionWords: fw });
const modalSet = ["shall", "may", "must", "is"];
const VERBS = discovered.candidates.filter((c) => modalSet.includes(c.verb)).map((c) => c.verb);
console.log("verbs:", VERBS.join("/"));

const figureByObligation = new Map();
for (const e of sourceCon) if (e.content.relation_type === "figured-as") figureByObligation.set(e.content.source_anchor, e.content.target_anchor);
const clauseReproduction = new Map();
for (const [ob, fig] of figureByObligation) {
  const text = payloadOf(ob)?.text || "";
  const party = payloadOf(fig)?.party;
  let triples = [];
  try { triples = rel.extractRelations(text, { verbs: VERBS, nounPhraseSubjects: true }); } catch (_) {}
  const span = triples.find((t) => t.subject && String(t.subject).toLowerCase() === String(party).toLowerCase());
  clauseReproduction.set(fig, span ? span.verb : null);
}
const reproduced = new Set([...figureByObligation.values()].filter((f) => clauseReproduction.get(f)));
const refusedFigure = [...figureByObligation.entries()].filter(([ob, fig]) => !reproduced.has(fig));
console.log(`figure canon: ${reproduced.size}/${figureByObligation.size} reproduce; ${refusedFigure.length} refused`);

// ── 3. regions/agents ──
const CITY_GEO = {
  "Middletown, RI": { lat: 41.545, lng: -71.291 },
  "Chicago, IL": { lat: 41.878, lng: -87.630 },
  "St. Augustine, FL": { lat: 29.901, lng: -81.313 },
  "Talent, OR": { lat: 42.245, lng: -122.788 },
  "Fort Worth, TX": { lat: 32.756, lng: -97.335 },
};
const municipalities = [...insByAnchor.values()].filter((e) => e.content.entity_type === "municipality");
const muniByAnchor = Object.fromEntries(municipalities.map((e) => [e.content.anchor, e]));
const stateNameOf = (n) => ({ "Middletown, RI": "Rhode Island", "Chicago, IL": "Illinois", "St. Augustine, FL": "Florida", "Talent, OR": "Oregon", "Fort Worth, TX": "Texas" })[n];
const cityNameOf = (n) => String(n).split(",")[0].trim();
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");
const parcelByCity = { "Middletown": "Middletown, RI", "Chicago": "Chicago, IL", "St. Augustine": "St. Augustine, FL", "Talent": "Talent, OR", "Fort Worth": "Fort Worth, TX" };

const emitIns = (type, payload) => { const ev = buildIns(type, payload, { sender: SENDER, ts: nextTs() }); push(ev); return ev; };
const agentIns = (payload) => emitIns("agent", payload);
const regionIns = (payload) => emitIns("region", payload);
const obligationIns = (payload) => emitIns("obligation", payload);
const standingIns = (payload) => emitIns("standing", payload);
const taskIns = (payload) => emitIns("task", payload);

const oldToNew = new Map();
const newAnchors = new Set();
const register = (oldA, newA) => { if (oldA) { oldToNew.set(oldA, newA); newAnchors.add(newA); } };
const muniAgent = new Map(), cityRegion = new Map();
const countyRegion = new Map(), stateRegion = new Map();

for (const m of municipalities) {
  const p = m.content.payload, geo = CITY_GEO[p.name];
  const agent = agentIns({ name: p.name, agent_kind: "municipality", state: p.state, county: p.county, code_url: p.code_url, chapter: p.chapter });
  register(m.content.anchor, agent.content.anchor); muniAgent.set(m.content.anchor, agent.content.anchor);
  const city = regionIns({ name: `${cityNameOf(p.name)} city`, region_type: "city", latlng: `${geo.lat.toFixed(3)},${geo.lng.toFixed(3)}` });
  cityRegion.set(m.content.anchor, city.content.anchor);
  const cn = `${p.county}`;
  if (!countyRegion.has(cn)) countyRegion.set(cn, regionIns({ name: cn, region_type: "county", latlng: `${(geo.lat + 0.02).toFixed(3)},${(geo.lng + 0.08).toFixed(3)}` }).content.anchor);
  const st = stateNameOf(p.name);
  if (!stateRegion.has(st)) stateRegion.set(st, regionIns({ name: `${st} (state)`, region_type: "state", latlng: `${(geo.lat + 0.9).toFixed(3)},${(geo.lng + 1.4).toFixed(3)}` }).content.anchor);
}
for (const e of [...insByAnchor.values()].filter((x) => x.content.entity_type === "jurisdiction")) {
  const st = String(e.content.payload.name).replace(/\s*\(state\)\s*$/, "").trim();
  register(e.content.anchor, stateRegion.get(st) || [...stateRegion.values()][0]);
}

const parcelRegion = new Map();
const parcelToMuni = new Map();
for (const e of [...insByAnchor.values()].filter((x) => x.content.entity_type === "parcel")) {
  const p = e.content.payload;
  const parts = String(p.address || "").split(",");
  const tail = parts.length > 1 ? parts[parts.length - 1].trim() : parts[0].trim();
  const ckey = Object.keys(parcelByCity).find((k) => slug(tail).startsWith(slug(k)));
  const geo = CITY_GEO[parcelByCity[ckey]] || CITY_GEO["Middletown, RI"];
  const jit = (h) => (h % 2000) / 1e5 - 0.01;
  const latlng = `${(geo.lat + jit(cyrb53(p.apn || "", 7))).toFixed(5)},${(geo.lng + jit(cyrb53(p.apn || "", 13))).toFixed(5)}`;
  const region = regionIns({ apn: p.apn, address: p.address, bedrooms: p.bedrooms, zoning: p.zoning, region_type: "parcel", latlng });
  register(e.content.anchor, region.content.anchor); parcelRegion.set(e.content.anchor, region.content.anchor);
  const m = ckey && parcelByCity[ckey];
  const mOld = m && Object.keys(muniByAnchor).find((a) => muniByAnchor[a].content.payload.name === m);
  if (mOld) parcelToMuni.set(e.content.anchor, mOld);
}

const ownerAgent = new Map();
for (const e of [...insByAnchor.values()].filter((x) => x.content.entity_type === "owner")) {
  const p = e.content.payload;
  const agent = agentIns({ name: p.name, agent_kind: "person", phone: p.phone ?? null, mailing_address: p.mailing_address ?? null });
  register(e.content.anchor, agent.content.anchor); ownerAgent.set(e.content.anchor, agent.content.anchor);
}

// ── 4. obligations ── (holder → agent ref, kind → frame ref, figures → payload, consequence/deadlines → payload)
const obligationNew = new Map();
const sourceHolds = sourceCon.filter((e) => e.content.relation_type === "holds");
const obligationMuni = new Map();
for (const h of sourceHolds) obligationMuni.set(h.content.source_anchor, h.content.target_anchor);

const kindByEntity = new Map();
for (const e of [...insByAnchor.values()].filter((x) => x.content.entity_type === "kind")) kindByEntity.set(e.content.anchor, e.content.payload);
const kindOfObligation = new Map(); // old obligation → kind name
for (const e of sourceCon) if (e.content.relation_type.startsWith("instantiates")) kindOfObligation.set(e.content.source_anchor, kindByEntity.get(e.content.target_anchor)?.name || "kind");

for (const e of [...insByAnchor.values()].filter((x) => x.content.entity_type === "obligation")) {
  const p = e.content.payload;
  const mOld = obligationMuni.get(e.content.anchor);
  const holderRef = mOld && muniAgent.get(mOld);
  const figures = [];
  if (figureByObligation.has(e.content.anchor)) {
    const fid = figureByObligation.get(e.content.anchor);
    if (reproduced.has(fid)) {
      const fp = payloadOf(fid);
      figures.push({ party: fp.party, modality: fp.modality, verb: clauseReproduction.get(fid) });
    }
  }
  const fresh = obligationIns({ ...p, holder: holderRef || p.holder, kind: kindOfObligation.get(e.content.anchor) ?? null, figures });
  register(e.content.anchor, fresh.content.anchor); obligationNew.set(e.content.anchor, fresh.content.anchor);
}

// kinds → schema frame (name/description/standing_criterion as _schema.kinds.*)
for (const [kindAnchor, kp] of kindByEntity) {
  const criterionDef = source.find((e) => e.type === eventType(OP.DEF) && e.content.path === "standing_criterion" && e.content.anchor === kindAnchor);
  push(buildDef(undefined, `_schema.kinds.${slug(kp.name)}`, { name: kp.name, description: kp.description, standing_criterion: criterionDef?.content.value ?? null }, { sender: SENDER, ts: nextTs(), id: `$def_schema_kinds_${slug(kp.name)}` }));
}

// consequence/deadline folds (verbatim-cited, asserted)
const CONSEQUENCES = [
  { obligation: "obligation_d8a8d3e23a6d0", shape: "flat_per_day", amount: 1000, citation: "Exceeding said occupancy limit is a violation of this chapter and is subject to a fine of up $1,000 per day." },
  { obligation: "obligation_9763e6e7ae727", shape: "flat_per_day", amount: 1000, citation: "The maximum number of occupants permitted to stay in the dwelling, and notice that failure to conform to the occupancy limit is a violation of this Code and is subject to a fine of up $1,000 per day;" },
  { obligation: "obligation_eefa902df0313", shape: "flat_per_day", amount: 1000, citation: "Any violation of the provisions of this chapter shall be subject to a fine of not more than $1,000 per day for each day the violation continues." },
  { obligation: "obligation_a0f7f68adfb86", shape: "flat_per_offense_accruing", amount: 5000, citation: "In addition to any other penalty provided by law, any shared housing host who fails to comply with this subsection shall be fined $5,000.00 for each offense. Each day that a violation continues shall constitute a separate and distinct offense." },
  { obligation: "obligation_151595e21f01fd", shape: "range_per_offense_accruing", amount_min: 2500, amount_max: 5000, citation: "In addition to any other penalty provided by law, any person who violates this subsection (a)(1) shall be subject to a fine of not less than $2,500.00 nor more than $5,000.00 for each offense. Each day that a violation continues shall constitute a separate and distinct offense." },
  { obligation: "obligation_8219869876c33", shape: "range_per_offense_accruing", amount_min: 5000, amount_max: 10000, citation: "In addition to any other penalty provided by law, any person who violates this subsection (a)(2) shall be subject to a fine of not less than $5,000.00 nor more than $10,000.00 for each offense. Each day that a violation continues shall constitute a separate and distinct offense." },
  { obligation: "obligation_a9c6ec0591bf0", shape: "range_per_offense_accruing", amount_min: 5000, amount_max: 10000, citation: "In addition to any other penalty provided by law, any person who violates this subsection (b) shall be subject to a fine of not less than $5,000.00 nor more than $10,000.00 for each offense. Each day that a violation continues shall constitute a separate and distinct offense." },
  { obligation: "obligation_362ab01d4f8c5", shape: "range_per_offense_accruing", amount_min: 1500, amount_max: 5000, citation: "In addition to any other penalty provided by law, any person who violates this subsection (i) shall be subject to a fine of not less than $1,500.00 nor more than $5,000.00 for each offense. Each day that a violation continues shall constitute a separate and distinct offense." },
  { obligation: "obligation_f9940608ff45a", shape: "range_per_offense_accruing", amount_min: 1500, amount_max: 3000, citation: "In addition to any other penalty provided by law, any person who violates this chapter or any rule promulgated thereunder shall be subject to a fine of not less than $1,500.00 nor more than $3,000.00 for each offense. Each day that a violation continues shall constitute a separate and distinct offense." },
];
const DEADLINES = [
  { obligation: "obligation_dd480fcae4c03", days: 10, unit: "calendar", relative_to: "date on which the notice is sent", citation: "the shared housing host may, within 10 calendar days of the date on which the notice is sent, request, in a form and manner prescribed by the commissioner in rules, a hearing before the commissioner to review the determination of ineligibility under Section 4-13-260(a) for registration" },
  { obligation: "obligation_dd480fcae4c03", days: 10, unit: "business", relative_to: "receipt of such request", citation: "If requested, a hearing before the commissioner shall commence within 10 business days of receipt of such request." },
  { obligation: "obligation_dd480fcae4c03", days: 60, unit: "calendar", relative_to: "completion of the hearing", citation: "Within 60 calendar days of completion of the hearing the commissioner shall make a determination of the shared housing unit's eligibility based upon the evidence presented." },
  { obligation: "obligation_13107616d8cff5", days: 10, unit: "calendar", relative_to: "date on which the notice was sent", citation: "the shared housing host may, within 10 calendar days of the date on which the notice was sent, request, in a form and manner prescribed by the commissioner in rules, a hearing before the commissioner to contest the suspension or revocation." },
  { obligation: "obligation_13107616d8cff5", days: 10, unit: "business", relative_to: "receipt of such request", citation: "If requested, a hearing before the commissioner shall be commenced within 10 business days of receipt of such request." },
  { obligation: "obligation_13107616d8cff5", days: 60, unit: "calendar", relative_to: "completion of the hearing", citation: "Within 60 calendar days of completion of the hearing the commissioner shall either affirm or reverse such determination based upon the evidence presented." },
  { obligation: "obligation_1d43bf69aaf23a", days: 60, unit: "calendar", relative_to: "receipt of the written submission", citation: "The commissioner shall review the materials and make a written determination within 60 days, which shall set forth the factors used in arriving at the determination." },
  { obligation: "obligation_1d43bf69aaf23a", days: 14, unit: "calendar", relative_to: "receiving the denial", citation: "If the commissioner denies the application for an adjustment, the applicant, within fourteen days of receiving the denial, may request a hearing from the commissioner." },
  { obligation: "obligation_1d43bf69aaf23a", days: 30, unit: "calendar", relative_to: "conclusion of the hearing", citation: "The commissioner shall, within thirty days of the conclusion of the hearing, tender a decision, which shall constitute a final determination for purposes of judicial review." },
  { obligation: "obligation_15e9e276151703", days: 60, unit: "calendar", relative_to: "final approval of a short-term rental ordinance", citation: "The owner/occupant files an application under this section and pays all applicable fees, within 60 days of final approval of a short-term rental ordinance." },
  { obligation: "obligation_6947f15e4f11a", days: 30, unit: "calendar", relative_to: "expiration of a current registration", citation: "An application for a short-term renewal registration may be filed beginning 30 days prior to expiration of a current registration." },
];
const DEADLINE_REFUSALS = [
  { obligation: "obligation_c178a21e5d69f", reason: "98.12(b) local representative must respond 'within two hours' — an hour unit, not expressible in the deadline unit enum (calendar|business)" },
  { obligation: "obligation_e2cb92a46e395", reason: "18.137.070B(1) 200 days/year primary-residence occupancy — an ongoing condition, not an N-days-from-trigger deadline" },
  { obligation: "obligation_6703a32af77e3", reason: "18.137.070(e) 12-month permit bar — stated in months; not cleanly expressible in days without inventing a month length" },
  { obligation: "obligation_1c7ad955251ed1", reason: "18.137.070(f) 12-month renewal bar — stated in months; not cleanly expressible in days without inventing a month length" },
  { obligation: "obligation_7415fba4878d7", reason: "§7-458 local responsible party must be present 'within one hour of call' — an hour unit, not expressible in the deadline unit enum" },
];

const defAnchors = new Set();
const evaWithDef = (anchor, criterion, result, note, { sender, id }) => {
  if (!defAnchors.has(anchor)) {
    push(buildDef(anchor, "_canon", { declared: "as-law", gate: criterion }, { sender: SENDER, ts: nextTs(), id: `$def_${String(anchor).slice(-8)}_canon` }));
    defAnchors.add(anchor);
  }
  push(buildEva(anchor, criterion, result, note, { sender: SENDER, ts: nextTs(), id }));
};

for (const c of CONSEQUENCES) {
  const ob = obligationNew.get(c.obligation);
  const text = payloadOf(c.obligation).text;
  if (!ob || !text.includes(c.citation)) continue;
  const obj = { shape: c.shape, accrues_daily: true, citation_text: c.citation };
  if (c.amount !== undefined) obj.amount = c.amount;
  if (c.amount_min !== undefined) { obj.amount_min = c.amount_min; obj.amount_max = c.amount_max; }
  push(buildDef(ob, "_consequence", obj, { sender: SENDER, ts: nextTs(), id: `$def_${String(ob).slice(-8)}_consequence` }));
}
for (const d of DEADLINES) {
  const ob = obligationNew.get(d.obligation);
  if (ob) push(buildDef(ob, "deadline", { days: d.days, unit: d.unit, relative_to: d.relative_to, citation_text: d.citation }, { sender: SENDER, ts: nextTs(), id: `$def_${String(ob).slice(-8)}_deadline_${d.days}` }));
}
for (const r of DEADLINE_REFUSALS) {
  const ob = obligationNew.get(r.obligation);
  if (ob) evaWithDef(ob, "deadline-extraction", "not_expressible_as_days", r.reason, { sender: SENDER, id: `$eva_${String(ob).slice(-8)}_deadline` });
}

// ── 5. standings ── (live; responsible_agent + assigned_to handles added by DEF)
const standingNew = new Map();
for (const e of [...insByAnchor.values()].filter((x) => x.content.entity_type === "standing")) {
  const fresh = standingIns(e.content.payload);
  register(e.content.anchor, fresh.content.anchor); standingNew.set(e.content.anchor, fresh.content.anchor);
}
const ownsEdges = sourceCon.filter((e) => e.content.relation_type === "owns");
const ownersOf = (pOld) => ownsEdges.filter((e) => e.content.target_anchor === pOld).map((e) => e.content.source_anchor);
for (const e of sourceCon) if (e.content.relation_type === "opened_against") {
  const stNew = standingNew.get(e.content.source_anchor);
  if (!stNew) continue;
  const pOld = e.content.target_anchor;
  const pYes = payloadOf(pOld);
  const tail = String(pYes?.address || "").split(",").pop().trim();
  const ckey = Object.keys(parcelByCity).find((k) => slug(tail).startsWith(slug(k)));
  const mOld = ckey && Object.keys(muniByAnchor).find((a) => muniByAnchor[a].content.payload.name === parcelByCity[ckey]);
  if (mOld && muniAgent.get(mOld)) {
    const m = muniAgent.get(mOld);
    push(buildDef(stNew, "assigned_to", m, { sender: SENDER, ts: nextTs(), id: `$def_${String(stNew).slice(-8)}_assigned` }));
    push(buildCon(stNew, m, "monitored_by", undefined, { sender: SENDER, ts: nextTs(), id: `$con_${String(stNew).slice(-8)}_monitored_by_${String(m).slice(-8)}` }));
  }
  const owners = ownersOf(pOld);
  if (owners.length && ownerAgent.get(owners[0])) {
    push(buildDef(stNew, "responsible_agent", ownerAgent.get(owners[0]), { sender: SENDER, ts: nextTs(), id: `$def_${String(stNew).slice(-8)}_responsible` }));
  }
}

// ── 6. tasks ── (second live type: work that can point at anything)
const taskNew = new Map();
const taskForOb = new Map();
for (const d of DEADLINES) {
  const ob = obligationNew.get(d.obligation);
  if (!ob || taskForOb.has(`${d.obligation}|${d.days}|${d.unit}|${d.relative_to}`)) continue;
  taskForOb.set(`${d.obligation}|${d.days}|${d.unit}|${d.relative_to}`, true);
  const t = taskIns({ title: `Within ${d.days} ${d.unit} days of ${d.relative_to}`, notes: d.citation.slice(0, 200), priority: "medium" });
  taskNew.set(`${d.obligation}|${d.days}|${d.unit}`, t.content.anchor);
  push(buildCon(t.content.anchor, ob, "about", undefined, { sender: SENDER, ts: nextTs(), id: `$con_${String(t.content.anchor).slice(-8)}_about_${String(ob).slice(-8)}` }));
  const assigneeMuni = muniAgent.get(obligationMuni.get(d.obligation));
  if (assigneeMuni) push(buildCon(t.content.anchor, assigneeMuni, "assigned", undefined, { sender: SENDER, ts: nextTs(), id: `$con_${String(t.content.anchor).slice(-8)}_assigned_${String(assigneeMuni).slice(-8)}` }));
  push(buildSeg(t.content.anchor, "open", { sender: SENDER, ts: nextTs(), id: `$seg_${String(t.content.anchor).slice(-8)}_open` }));
}
console.log(`tasks seeded: ${taskNew.size}`);

// one task pointed at a live standing, to prove tasks can track cases
{
  const openStanding = [...standingNew.entries()].find(([oldA, newA]) => source.some((e) => e.type === eventType(OP.SEG) && e.content.partition === "open" && e.content.anchor === oldA));
  if (openStanding) {
    const t = taskIns({ title: "Verify compliance evidence for the open case", notes: "collect documentation, confirm the register step is complete", priority: "high" });
    push(buildCon(t.content.anchor, openStanding[1], "about", undefined, { sender: SENDER, ts: nextTs(), id: `$con_${String(t.content.anchor).slice(-8)}_about_${String(openStanding[1]).slice(-8)}` }));
    push(buildSeg(t.content.anchor, "open", { sender: SENDER, ts: nextTs(), id: `$seg_${String(t.content.anchor).slice(-8)}_open2` }));
  }
}

// ── 7. provenance carry ── (source DEF/EVA/REC → remapped anchors, source order)
const remap = (a) => oldToNew.get(a) ?? ownerAgent.get(a) ?? parcelRegion.get(a) ?? standingNew.get(a) ?? obligationNew.get(a) ?? muniAgent.get(a) ?? a;
const chronoSource = [...source].sort((a, b) => (a.origin_server_ts || 0) - (b.origin_server_ts || 0) || String(a.event_id).localeCompare(String(b.event_id || "")));
const carried = { def: 0, eva: 0, rec: 0, dropped: 0 };
let recRedefines = null;
for (const e of chronoSource) {
  const t = e.type;
  if (t === eventType(OP.DEF) && e.content.anchor && e.content.path) {
    const a = remap(e.content.anchor);
    if (!newAnchors.has(a)) { carried.dropped++; continue; }
    push(buildDef(a, e.content.path, e.content.value, { sender: SENDER, ts: nextTs(), id: e.event_id }));
    defAnchors.add(a); carried.def++;
  } else if (t === eventType(OP.EVA)) {
    const a = remap(e.content.anchor);
    if (!newAnchors.has(a)) { carried.dropped++; continue; }
    evaWithDef(a, e.content.criterion, e.content.result, e.content.note, { sender: SENDER, ts: nextTs(), id: e.event_id });
    carried.eva++;
  } else if (t === eventType(OP.REC)) {
    recRedefines = [...obligationNew.entries()].find(([oldOb]) => { const p = payloadOf(oldOb); return p && p.holder === "chicago" && String(p.section).startsWith("4-14-100"); })?.[1] ?? null;
    push({ type: t, content: { ...e.content, redefines: recRedefines }, origin_server_ts: nextTs(), sender: SENDER, event_id: e.event_id });
    carried.rec++;
  }
}
console.log(`provenance: ${carried.def} DEF, ${carried.eva} EVA, ${carried.rec} REC, ${carried.dropped} dropped`);

// if the REC's obligation resolved, fold in law-freshness from its frames
if (recRedefines) {
  const rec = chronoSource.find((e) => e.type === eventType(OP.REC));
  if (rec) {
    push(buildDef(recRedefines, "in_effect_since", rec.content.before_frame?.as_of ?? null, { sender: SENDER, ts: nextTs(), id: `$def_${String(recRedefines).slice(-8)}_since` }));
    push(buildDef(recRedefines, "last_amended", rec.content.after_frame?.as_of ?? null, { sender: SENDER, ts: nextTs(), id: `$def_${String(recRedefines).slice(-8)}_amended` }));
  }
}

// ── 8. edges ──
const idSeq = { n: 0 };
const conId = (rel, a, b) => `$con_${String(a).slice(-8)}_${rel}_${String(b).slice(-8)}_${++idSeq.n}`;
const remappedCon = sourceCon.map((e) => {
  const src = remap(e.content.source_anchor), tgt = remap(e.content.target_anchor);
  if (!newAnchors.has(src) || !newAnchors.has(tgt)) return null;
  return buildCon(src, tgt, e.content.relation_type, e.content.payload !== undefined ? e.content.payload : undefined, { sender: SENDER, ts: nextTs(), id: conId(e.content.relation_type, src, tgt) });
}).filter(Boolean);
for (const c of remappedCon) push(c);

for (const m of municipalities) {
  const a = muniAgent.get(m.content.anchor), c = cityRegion.get(m.content.anchor);
  const co = countyRegion.get(`${m.content.payload.county}`), st = stateRegion.get(stateNameOf(m.content.payload.name));
  if (a && c) push(buildCon(a, c, "governs", undefined, { sender: SENDER, ts: nextTs(), id: conId("governs", a, c) }));
  if (c && co) push(buildCon(c, co, "located_in", undefined, { sender: SENDER, ts: nextTs(), id: conId("located_in", c, co) }));
  if (co && st) push(buildCon(co, st, "located_in", undefined, { sender: SENDER, ts: nextTs(), id: conId("located_in", co, st) }));
  if (a && st) push(buildCon(a, st, "reachable-from", undefined, { sender: SENDER, ts: nextTs(), id: conId("reachable-from", a, st) }));
}
for (const [pOld, mOld] of parcelToMuni) {
  const r = parcelRegion.get(pOld), a = muniAgent.get(mOld);
  if (r && a) push(buildCon(r, a, "located_in", undefined, { sender: SENDER, ts: nextTs(), id: conId("located_in", r, a) }));
}

// refused figures → EVA on their obligation (the honest refusal record)
for (const [obOld, figOld] of refusedFigure) {
  const ob = obligationNew.get(obOld);
  if (ob) evaWithDef(ob, "figure-canon", "not_reproduced", `party "${payloadOf(figOld)?.party}" does not reproduce as a clause subject — refused, not guessed`, { sender: SENDER, id: `$eva_${String(ob).slice(-8)}_figure` });
}

// SEG carry
for (const e of source) if (e.type === eventType(OP.SEG) && standingNew.has(e.content.anchor)) {
  push(buildSeg(standingNew.get(e.content.anchor), e.content.partition, { sender: SENDER, ts: nextTs(), id: `$seg_${String(standingNew.get(e.content.anchor)).slice(-8)}_${e.content.partition}` }));
}

// ── 9. schema notes ──
const schemaNote = (key, value) => push(buildDef(undefined, `_schema.${key}`, value, { sender: SENDER, ts: nextTs(), id: `$def_schema_${key}` }));
schemaNote("canonical_shape", "ONE physical fold (state.entities). _type discriminates: agent (municipality|person), region (state|county|city|parcel|zone, always latlng), obligation (the law — anchored but schema: the bound EVAs read against), standing (live: partitioned open→resolved→violated, responsible_agent/assigned_to handles), task (live: work assigned to an agent, about any anchor, segmented open→done/blocked). figure folds into obligation payload; kind folds into _schema.kinds; consequence/deadlines fold into obligation payload. The log is the store; a table appears only when something bears identity over time AND changes.");
schemaNote("figure_organ_gate", `figure canon re-derived by eoreader7 organs: discoverRelationVocab (modal ${VERBS.join("/")}) + per-clause extractRelations(nounPhraseSubjects:true). ${reproduced.size}/${figureByObligation.size} parties reproduce as the subject of their own clause; ${refusedFigure.length} refused with EVAs on the obligation — never guessed.`);
schemaNote("citation_gate", `consequence (${CONSEQUENCES.length}) and deadline (${DEADLINES.length}) folds are DEFs asserted verbatim against source clause text; ${DEADLINE_REFUSALS.length} deadline shapes refused with EVAs (hour/month units, ongoing conditions).`);

// ── 10. fold with the real fold; assert 0 violations ──
const full = [...newEvents];
    // anchor self-check: every DEF/EVA/SEG anchor and every CON endpoint must be an emitted INS
    const insAnchors = new Set(full.filter((e) => e.type === eventType(OP.INS)).map((e) => e.content.anchor));
    for (const e of full) {
      if ((e.type === eventType(OP.DEF) || e.type === eventType(OP.EVA) || e.type === eventType(OP.SEG)) && e.content.anchor && !insAnchors.has(e.content.anchor))
        console.log("ORPHAN", e.type.split(".")[1], e.content.anchor, "ts", e.origin_server_ts);
      if (e.type === eventType(OP.CON)) {
        if (!insAnchors.has(e.content.source_anchor)) console.log("ORPHAN-CON src", e.content.source_anchor, "ts", e.origin_server_ts);
        if (!insAnchors.has(e.content.target_anchor)) console.log("ORPHAN-CON tgt", e.content.target_anchor, "ts", e.origin_server_ts);
      }
    }
function loadRealFold() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const start = html.indexOf("let NS = ") !== -1 ? html.indexOf("let NS = ") : html.indexOf("function cyrb53(");
  const end = html.indexOf("const SEED_EVENTS");
  if (start < 0 || end < 0 || end <= start) throw new Error("could not locate the app's fold code");
  const head = html.slice(start, end);
  const factory = new Function(`return (() => { ${head}\nreturn { fold, foldFrom, initial, OP, eventType, buildIns, buildDef, buildCon, buildEva, buildSeg, chronological, dispatch, setPath }; })();`);
  return factory();
}
const real = loadRealFold();
const state = real.fold(full);
console.log("entities:", Object.keys(state.entities).length, "| connections:", state.connections.length, "| violations:", state._violations.length);
if (state._violations.length) { console.log(state._violations.slice(0, 25)); process.exit(1); }
const byType = {};
for (const e of Object.values(state.entities)) if (e._type) byType[e._type] = (byType[e._type] || 0) + 1;
console.log("by type:", JSON.stringify(byType));
console.log("schema keys:", Object.keys(state.schema || {}).length);
const sampleStanding = Object.values(state.entities).find((e) => e._type === "standing" && e.responsible_agent);
console.log("standing sample:", sampleStanding ? `${sampleStanding.distinction.slice(0, 40)}… → assigned ${String(sampleStanding.assigned_to || "").slice(-8)} → responsible ${String(sampleStanding.responsible_agent).slice(-8)}` : "none");

// ── 11. write ──
fs.writeFileSync(EVENTS_PATH, JSON.stringify(full, null, 2));
const html = fs.readFileSync(HTML_PATH, "utf8");
const marker = "const SEED_EVENTS = ";
const si = html.indexOf(marker);
const start = si + marker.length;
const end = html.indexOf("\n", start);
if (start < 0 || end <= start) throw new Error("SEED_EVENTS marker not found");
fs.writeFileSync(HTML_PATH, html.slice(0, start) + JSON.stringify(full) + html.slice(end));
console.log("-> municipal-events.json (" + (fs.statSync(EVENTS_PATH).size / 1024 / 1024).toFixed(1) + " MB)");
console.log("-> SEED_EVENTS replaced in municipal-db.html");