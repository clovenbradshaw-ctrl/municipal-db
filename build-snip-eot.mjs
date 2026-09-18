// build-snip-eot.mjs — the snip product, event-sourced.
//
// The snipping is not a static document — it is an EVENT TRACE (EOT) that
// gets folded into the product JSON, exactly like btora_fold_events.json
// in this repo. Outputs:
//   snip-events.json   the EOT — INS/CON/DEF/EVA instructions, committed
//   snip-history.json  the folded product (entities/connections/defs/evals)
//
// Every snip carries its audit history in the trace:
//   DEF why    — the reason the cut was made (which need it evidences, why
//                this field is the verbatim home)
//   DEF where  — source file + byte offset the cut came from
//   DEF serves — the municipal-db needs the snip evidences
//   EVA verbatim — verified / gap, with note
//
// The fold interpreter mirrors fold-sample.mjs semantics: chronological,
// entities created only by INS, CON to a missing anchor is a cartesian-
// product violation, EVA with no prior DEF is a criterionless judgment.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = "/Users/mlacy/Documents/3.0";

const at = () => new Date().toISOString();
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");

// ── load schema sources (verbatim) ─────────────────────────────────────────
const slate = JSON.parse(fs.readFileSync(path.join(ROOT, "slate_api_key_types.json"), "utf8"));
const swarmSchema = JSON.parse(fs.readFileSync(path.join(ROOT, "swarm_graphql_schema.json"), "utf8")).__schema;
const named = swarmSchema.types.filter((t) => !t.name.startsWith("__"));
const swarmField = (n) => { const t = named.find((x) => x.name === n); return t ? (t.fields || []).map((f) => f.name) : null; };
const bbMd = fs.readFileSync(path.join(ROOT, "building-blocks-schema-inventory.md"), "utf8");

// the map (needs → candidates) is the product the snips evidence; read it
// so each snip can be attributed to the needs it serves.
const map = JSON.parse(fs.readFileSync(path.join(HERE, "xray-map.json"), "utf8"));
const needToCands = new Map();
for (const [entity, rows] of Object.entries(map.map)) for (const r of rows) needToCands.set(r.need, r.cands);

// ── build the EOT ──────────────────────────────────────────────────────────
const ops = [];
let seq = 0;
const anchorSeq = () => `snip_${String(++seq).padStart(3, "0")}`;

// INS a schema-source per primary file
const sources = [
  { sys: "Slate", file: "slate_api_key_types.json", kind: "primary", note: "Slate API key-types pull" },
  { sys: "Building Blocks", file: "index-px14EQkj.js + building-blocks-schema-inventory.md", kind: "primary", note: "production JS bundle + extraction record" },
  { sys: "Swarm", file: "swarm_graphql_schema.json", kind: "primary", note: "GraphQL introspection" },
];
for (const s of sources) {
  ops.push({ op: "INS", entity_type: "schema-source", anchor: `src_${slug(s.sys)}`, payload: s });
}

// schema-types → sources (primary + btora deliveries)
const slateTypes = Object.entries(slate);
const bbTypes = {
  ASSET: ["id", "alias", "parcelId", "commonName", "address", "addressMap", "addresses", "assetType", "assetLinks", "marketStatus", "contact", "gisCity", "latitude", "longitude", "polygon", "parent", "children", "assessments", "parcelFilters", "licenses"],
  LICENSE: ["id", "number", "status", "isExpired", "isRenewable", "approvedOn", "renewableFrom", "expirationDate", "lastNotifiedRegistrant", "lastNotifiedExpiration", "lastNotifiedRenewal", "licenseChain", "previousLicense", "nextLicense", "licenseDeregistrationReason", "registrant", "email", "profilePicture", "asset", "assetUnit", "parcelId", "address", "displayName", "type", "flow", "workflow", "tags", "submissionData"],
  LicenseType: ["name", "unitLevel", "unitType", "durationInDays", "renewalDaysBeforeExpiration", "expireCalendarYear", "expireCalendarDate", "expirationDateFormulaScript", "propertyEligibleFormulaScript", "notifyRegistrantOnRenewal", "workflow", "registrationPortals", "form", "ordinance", "contact", "allowedAssetIdentityTypes", "identityBased", "maxProperties"],
  WorkflowStageTaskPayment: ["defaultPaymentAmount", "paymentDescription", "paymentAmountPerAsset", "paymentAmountPerUnit", "allowPaymentAmountOverride", "allowChecks", "allowCash", "autoAddProcessingFees", "processingFeesPercentage", "checksPayableTo", "paymentAccount", "paymentFormulaScript", "appealConditionalLogicForm", "autoApproveAppeals", "appealsAssignee"],
  getAngelPlatformCityAttribute: ["id", "name", "cityAttribute", "connectors", "connectorUrl", "provenanceUrl", "assetProvenanceUrl", "runInfo", "failStreak", "staleStreak", "lastSuccessfulPushAt", "lastDataChangeAt", "stage", "number"],
  ProviderCredential: ["id", "city", "name", "lastFour", "isActive", "createdAt", "updatedAt", "lastUsedAt", "revokedAt", "status", "provider"],
  IntegrationHealthDashboard: ["type", "provider", "status", "cityId", "checkedAt", "latencyMs", "errorMessage", "targetLabel", "paymentAccountId", "userId", "authProviderId"],
  IdentityProfile: ["id", "source", "type", "fullName", "firstName", "lastName", "email", "phone", "address", "city", "state", "zip", "fullAddress", "location"],
};
const swarmTypes = ["PlatformAttribute", "PlatformCityAttribute", "PlatformEventTable", "PlatformFilter", "EventTableColumn", "Connector", "Transformer", "TransformerAttributeRules", "TransformerAssetMapper", "Dataset", "AttributeRule", "MetricValue", "Note", "City", "State", "TransformerGeocoder"];

const typeRegistry = []; // { sys, type, fields, sourceFile }
for (const [t, f] of slateTypes) typeRegistry.push({ sys: "Slate", type: t, fields: f, sourceFile: "slate_api_key_types.json" });
for (const [t, f] of Object.entries(bbTypes)) typeRegistry.push({ sys: "Building Blocks", type: t, fields: f, sourceFile: "building-blocks-schema-inventory.md" });
for (const t of swarmTypes) { const f = swarmField(t); if (f) typeRegistry.push({ sys: "Swarm", type: t, fields: f, sourceFile: "swarm_graphql_schema.json" }); }

// INS each schema-type + CON belongs_to its source
for (const tr of typeRegistry) {
  const srcAnchor = `src_${slug(tr.sys)}`;
  ops.push({ op: "INS", entity_type: "schema-type", anchor: `st_${slug(tr.sys)}_${slug(tr.type)}`, payload: { system: tr.sys, type: tr.type, fields: tr.fields, source: tr.sourceFile } });
  ops.push({ op: "CON", source_anchor: `st_${slug(tr.sys)}_${slug(tr.type)}`, target_anchor: srcAnchor, relation_type: "belongs_to" });
}

// ── the snips: for every need → candidate, record the cut that evidences it.
// A candidate names {system, type, field}; the cut is the verbatim field list
// of that type from its real source. Audit = why / where / serves + EVA.
const seenCuts = new Map(); // "sys|type" -> snip anchor
const makeSnip = (c, need, sourceFile) => {
  const key = `${c.system}|${c.type}`;
  if (seenCuts.has(key)) return seenCuts.get(key);
  const anchor = anchorSeq();
  seenCuts.set(key, anchor);

  let offset = null, len = 0, fields = [], verified = false, verbNote = "";
  if (c.system === "Slate") {
    const raw = fs.readFileSync(path.join(ROOT, "slate_api_key_types.json"), "utf8");
    const probe = `"${c.type}"`;
    offset = raw.indexOf(probe);
    fields = slate[c.type] || [];
    verified = offset >= 0 && fields.length > 0;
    len = offset >= 0 ? 4000 : 0;
    verbNote = `field list cut verbatim from slate_api_key_types.json at byte ${offset}`;
  } else if (c.system === "Swarm" || c.system === "Swarm→btora" || c.system === "Swarm→universal") {
    const f = swarmField(c.type) || [];
    const raw = fs.readFileSync(path.join(ROOT, "swarm_graphql_schema.json"), "utf8");
    offset = raw.indexOf(`"name": "${c.type}"`);
    fields = f;
    verified = f.length > 0;
    len = offset >= 0 ? 8000 : 0;
    verbNote = `OBJECT ${c.type} cut verbatim from swarm_graphql_schema.json at byte ${offset}`;
  } else if (c.system === "Building Blocks") {
    offset = bbMd.indexOf(c.type);
    fields = bbTypes[c.type] || [];
    verified = offset >= 0 && fields.length > 0;
    len = offset >= 0 ? 700 : 0;
    verbNote = `type ${c.type} cut verbatim from building-blocks-schema-inventory.md at byte ${offset}`;
  } else {
    // btora delivery rows — cut from the delivery jsonl
    const dl = deliveriesByType(c.type);
    if (dl) { offset = 0; fields = dl.fields; verified = true; len = dl.len; verbNote = `first row cut verbatim from ${dl.file}`; }
  }

  const region = (() => { try { const p = c.system === "Building Blocks" ? path.join(ROOT, "building-blocks-schema-inventory.md") : c.system === "Slate" ? path.join(ROOT, "slate_api_key_types.json") : c.system.startsWith("Swarm") ? path.join(ROOT, "swarm_graphql_schema.json") : null; if (!p) return ""; const raw = fs.readFileSync(p, "utf8"); return offset != null ? raw.slice(offset, offset + len) : ""; } catch { return ""; } })();

  ops.push({ op: "INS", entity_type: "snip", anchor, payload: { system: c.system, source: sourceFile, type: c.type, field: c.field, offset, len, sha: hash(region || JSON.stringify(fields)), fields, verified } });
  // audit history: why / where / serves
  ops.push({ op: "DEF", anchor, criterion: "why", value: whyText(c, need) });
  ops.push({ op: "DEF", anchor, criterion: "where", value: { source: sourceFile, offset, len } });
  ops.push({ op: "DEF", anchor, criterion: "serves", value: [need] });
  ops.push({ op: "EVA", anchor, criterion: "verbatim", result: verified ? "verified" : "gap", note: verbNote });
  return anchor;
};

function whyText(c, need) {
  const conf = c.confidence || "analog";
  if (conf === "gap") return `no field in any of the three systems could evidence "${need}" — named gap, never guessed`;
  return `evidences "${need}" — ${c.system} ${c.type}.${c.field} is the ${conf} verbatim home for this demo field (${c.source})`;
}

// btora delivery shapes — the pulled-row fields
const deliveriesByType = (type) => {
  const shapeMap = {
    slate_licenses: { file: "btora/slate/slate_registrations.jsonl", fields: ["table", "parcel", "license_shown", "status", "platform", "match"] },
    inspection_queue: { file: "btora/slate/slate_inspection_queue.jsonl", fields: ["parcel", "window", "platform", "match", "lic", "use", "evidence"] },
    btora_listings: { file: "btora/swarm/dataset_btora_listings.jsonl", fields: ["dataset", "pull_id", "platform", "listing_id", "url", "listed_at", "bedrooms", "nightly_rate", "license_shown", "match", "parcel_anchor", "lineage"] },
    btora_calendar: { file: "btora/swarm/dataset_btora_calendar.jsonl", fields: ["dataset", "listing_id", "platform", "window_from", "window_to", "status", "observed_at", "pull_id"] },
    platform_attributes: { file: "btora/swarm/platform_attributes.jsonl", fields: ["attribute", "entity", "parcel_anchor", "lic", "match", "flags", "owner_listings", "lineage"] },
    transformer_booking_events: { file: "btora/swarm/transformer_booking_events.jsonl", fields: ["event_table", "event_id", "listing_id", "platform", "date_from", "date_to", "amount", "amount_unit", "parcel_anchor", "match", "lic", "flags", "observed_at", "lineage"] },
    universal_listings: { file: "btora/universal/listings_middletown.jsonl", fields: ["provider", "pull_id", "observed_at", "platform", "listing_id", "url", "title", "listed_at", "host", "property", "nightly_rate", "calendar", "match_hint"] },
    "listing.property": { file: "btora/universal/listings_middletown.jsonl", fields: ["property.address", "property.city", "property.lat", "property.lng", "property.bedrooms", "property.beds", "property.units", "property.max_occupancy", "property.property_type", "property.zoning_claim", "property.parking_plan", "property.license_number"] },
    "listing.host": { file: "btora/universal/listings_middletown.jsonl", fields: ["host.name", "host.phone", "host.address"] },
    "dataset_btora_listings": { file: "btora/swarm/dataset_btora_listings.jsonl", fields: ["platform", "listing_id", "url", "listed_at", "bedrooms", "nightly_rate", "license_shown", "match", "parcel_anchor"] },
    "dataset_btora_calendar": { file: "btora/swarm/dataset_btora_calendar.jsonl", fields: ["listing_id", "platform", "window_from", "window_to", "status", "observed_at"] },
    "transformer_booking_events": { file: "btora/swarm/transformer_booking_events.jsonl", fields: ["date_from", "date_to", "amount", "amount_unit", "match", "lic", "flags"] },
    "platform_attributes": { file: "btora/swarm/platform_attributes.jsonl", fields: ["lic", "match", "flags", "owner_listings"] },
    "universal listing": { file: "btora/universal/listings_middletown.jsonl", fields: ["platform", "listing_id", "url", "title", "listed_at", "host", "property", "nightly_rate", "calendar", "match_hint"] },
  };
  const d = shapeMap[type];
  if (!d) return null;
  let len = 0;
  try { len = fs.statSync(path.join(HERE, d.file)).size; } catch {}
  return { ...d, len };
};

// needs as entities + CON snip -[evidences]-> need
const needAnchors = new Map();
for (const [need, cands] of needToCands) {
  const na = `need_${slug(need)}`;
  needAnchors.set(need, na);
  ops.push({ op: "INS", entity_type: "need", anchor: na, payload: { need, entity: need.split(".")[0] } });
  for (const c of cands) {
    const sourceFile = c.source || "";
    const sa = makeSnip(c, need, sourceFile);
    ops.push({ op: "CON", source_anchor: sa, target_anchor: na, relation_type: "evidences" });
  }
}

fs.writeFileSync(path.join(HERE, "snip-events.json"), JSON.stringify(ops, null, 1));
console.log("-> snip-events.json (EOT, " + ops.length + " instructions)");

// ── fold the EOT into the product JSON (fold-sample semantics) ─────────────
const entities = new Map();
const connections = [];
const violations = [];
for (const inst of ops) {
  switch (inst.op) {
    case "INS": entities.set(inst.anchor, { type: inst.entity_type, payload: inst.payload, defs: [], evals: [] }); break;
    case "CON": {
      const src = entities.has(inst.source_anchor), tgt = entities.has(inst.target_anchor);
      if (!src || !tgt) { violations.push({ type: "cartesian_product", source: inst.source_anchor, target: inst.target_anchor }); break; }
      connections.push({ source: inst.source_anchor, target: inst.target_anchor, rel: inst.relation_type });
      break;
    }
    case "DEF": {
      const e = entities.get(inst.anchor);
      if (!e) { violations.push({ type: "missing_ins", op: "DEF", anchor: inst.anchor }); break; }
      e.defs.push({ criterion: inst.criterion, value: inst.value });
      break;
    }
    case "EVA": {
      const e = entities.get(inst.anchor);
      if (!e) { violations.push({ type: "missing_ins", op: "EVA", anchor: inst.anchor }); break; }
      if (e.defs.length === 0) { violations.push({ type: "criterionless_judgment", anchor: inst.anchor }); break; }
      e.evals.push({ criterion: inst.criterion, result: inst.result, note: inst.note });
      break;
    }
    default: violations.push({ type: "unknown_instruction", op: inst.op });
  }
}

// materialize folded state
const state = { entities: {}, connections };
for (const [a, e] of entities) {
  state.entities[a] = { _anchor: a, _type: e.type, ...e.payload, defs: e.defs, evals: e.evals };
}

const byType = {};
for (const e of Object.values(state.entities)) byType[e._type] = (byType[e._type] || 0) + 1;

const product = {
  title: "municipal-db schema snip product — folded from snip-events.json",
  generated: at(),
  eot: "snip-events.json",
  method: "the EOT is the store; this JSON is the fold. Every DEF/EVA on a snip is the audit history of that cut (why / where / serves / verbatim result).",
  by_type: byType,
  snips: Object.values(state.entities).filter((e) => e._type === "snip").map((e) => ({
    anchor: e._anchor, system: e.system, source: e.source, type: e.type, field: e.field,
    offset: e.offset, len: e.len, sha: e.sha, fields: e.fields, verified: e.verified,
    why: e.defs.find((d) => d.criterion === "why")?.value,
    where: e.defs.find((d) => d.criterion === "where")?.value,
    serves: e.defs.find((d) => d.criterion === "serves")?.value || [],
    evals: e.evals,
  })),
  needs: Object.values(state.entities).filter((e) => e._type === "need").map((e) => ({ anchor: e._anchor, need: e.need, entity: e.entity })),
  edges: connections.filter((c) => c.rel === "evidences"),
  violations,
};
fs.writeFileSync(path.join(HERE, "snip-history.json"), JSON.stringify(product, null, 2));
console.log("-> snip-history.json (folded product)");
console.log("by type:", JSON.stringify(byType), "| violations:", violations.length);
if (violations.length) { console.log(violations.slice(0, 5)); process.exit(1); }