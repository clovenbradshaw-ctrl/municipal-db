// to-swarm-slate-bb.mjs — fold universal Btora rows into Swarm / Slate / BB formats.
//
// Reads btora/universal/listings_*.jsonl, runs eo-transform runners, writes:
//   swarm/dataset_btora_listings.jsonl      (Dataset btora_listings raw table)
//   swarm/dataset_btora_calendar.jsonl      (Dataset btora_calendar raw table)
//   swarm/transformer_booking_events.jsonl  (PlatformEventTable str_booking rows)
//   swarm/platform_attributes.jsonl         (PlatformAttribute per-parcel rollups)
//   swarm/platform_filters.json             (FilterGroup + 6 PlatformFilters)
//   swarm/swarm_ingest.graphql              (createDataset/Connector/Transformer/...)
//   swarm/swarm_package.json                (CityPackage deploy plan)
//   slate/slate_registrations.jsonl         (Slate license-table projection)
//   slate/slate_inspection_queue.jsonl      (Job-9 evidence windows)
//   bb/bb_assets.jsonl                      (Building Blocks Asset projection)
//   bb/bb_map_flags.geojson                 (filterable map pins)
//   bb/bb_filters.json                      (map facet config, mirrors Swarm filters)
//   fold/btora_fold_events.json             (municipal-DB INS/CON/EVA sample, 500)
// Kilograms, not poetry: every emitted row carries lineage {runner, rule, pull}.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RULE_VERSION, sqlCalendarDiff, geocode, assetMap, attributeRules } from "./eo-transform.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const U = path.join(HERE, "universal");
const SW = path.join(HERE, "swarm"), SL = path.join(HERE, "slate"), BB = path.join(HERE, "bb"), FO = path.join(HERE, "fold");
for (const d of [SW, SL, BB, FO]) fs.mkdirSync(d, { recursive: true });

const files = fs.readdirSync(U).filter((f) => f.startsWith("listings_"));
let listings = 0, windows = 0, assertions = 0, refused = 0;
const calOut = fs.createWriteStream(path.join(SW, "dataset_btora_calendar.jsonl"));
const listOut = fs.createWriteStream(path.join(SW, "dataset_btora_listings.jsonl"));
const evtOut = fs.createWriteStream(path.join(SW, "transformer_booking_events.jsonl"));
const attrOut = fs.createWriteStream(path.join(SW, "platform_attributes.jsonl"));
const slateReg = fs.createWriteStream(path.join(SL, "slate_registrations.jsonl"));
const slateQ = fs.createWriteStream(path.join(SL, "slate_inspection_queue.jsonl"));
const bbAssets = fs.createWriteStream(path.join(BB, "bb_assets.jsonl"));
const foldEv = [];
const features = [];
const perOwner = new Map();

const allRows = [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(U, f), "utf8").split("\n").filter(Boolean);
  for (const ln of lines) allRows.push(JSON.parse(ln));
}
// owner concentration (per-host listing count) — needs global pass, still genuine (counted, not guessed)
for (const r of allRows) perOwner.set(r.host?.name || "unknown", (perOwner.get(r.host?.name || "unknown") || 0) + 1);

for (const r of allRows) {
  listings++;
  const geo = geocode(r);
  const mapped = assetMap(r, geo.refused ? null : geo);
  if (mapped.match === "UNLOCATED") refused++;
  const attrs = attributeRules(r, mapped);
  const ownerCount = perOwner.get(r.host?.name || "unknown") || 1;

  listOut.write(JSON.stringify({ dataset: "btora_listings", pull_id: r.pull_id, platform: r.platform, listing_id: r.listing_id, url: r.url, listed_at: r.listed_at, bedrooms: r.property?.bedrooms, nightly_rate: r.nightly_rate, license_shown: r.property?.license_number, match: mapped.match, parcel_anchor: mapped.parcel_anchor, lineage: { runner: "Connector:btora", rule_version: RULE_VERSION } }) + "\n");

  for (const w of (r.calendar || [])) {
    windows++;
    calOut.write(JSON.stringify({ dataset: "btora_calendar", listing_id: r.listing_id, platform: r.platform, window_from: w.from, window_to: w.to, status: w.status, observed_at: `pull-${w.first_observed_pull}`, pull_id: `btora-pull-${w.first_observed_pull}` }) + "\n");
    if (mapped.parcel_anchor) {
      assertions++;
      const evRow = { event_table: "str_booking", event_id: `${r.listing_id}:${w.from}:${w.to}`, listing_id: r.listing_id, platform: r.platform, date_from: w.from, date_to: w.to, amount: r.nightly_rate, amount_unit: "USD/night", parcel_anchor: mapped.parcel_anchor, match: mapped.match, lic: attrs.lic_status, flags: attrs.flags, observed_at: `pull-${w.first_observed_pull}`, lineage: { runner: "TransformerSql+AssetMapper", rule_version: RULE_VERSION, inputs: ["btora_calendar", "geocode", "assetMap"] } };
      evtOut.write(JSON.stringify(evRow) + "\n");
      // map pin (located only)
      if (r.property?.lat != null && features.length < 20000) {
        features.push({ type: "Feature", properties: { addr: r.property.address, platform: r.platform, beds: r.property.bedrooms, rate: r.nightly_rate, match: mapped.match, lic: attrs.lic_status, flag: attrs.flags.join(";"), from: w.from, to: w.to, owner_n: ownerCount }, geometry: { type: "Point", coordinates: [r.property.lng, r.property.lat] } });
      }
      // slate inspection queue: upcoming (to >= 2026-09-20) + flagged
      if (w.to >= "2026-09-20" && (attrs.lic_status !== "ACTIVE" || mapped.match !== "CLEAR")) {
        slateQ.write(JSON.stringify({ parcel: r.property.address, window: `${w.from} -> ${w.to}`, platform: r.platform, match: mapped.match, lic: attrs.lic_status, use: "inspection timing", evidence: `btora ${r.listing_id} observed pull-${w.first_observed_pull}` }) + "\n");
      }
    }
  }
  attrOut.write(JSON.stringify({ attribute: "str_status", entity: "ASSET", parcel_anchor: mapped.parcel_anchor, lic: attrs.lic_status, match: mapped.match, flags: attrs.flags, owner_listings: ownerCount, lineage: { runner: "AttributeRules", rule_version: RULE_VERSION, tracksHistory: true } }) + "\n");
  slateReg.write(JSON.stringify({ table: "slate_licenses", parcel: r.property?.address, license_shown: r.property?.license_number, status: attrs.lic_status, platform: r.platform, match: mapped.match }) + "\n");
  bbAssets.write(JSON.stringify({ assetType: "parcel", parcelId: mapped.parcel_anchor, address: r.property?.address, latitude: r.property?.lat ?? null, longitude: r.property?.lng ?? null, licenses: r.property?.license_number ? [{ number: r.property.license_number, status: attrs.lic_status.toLowerCase() }] : [], strFlag: attrs.flags[0] || null }) + "\n");

  // municipal fold sample (first 500 listings only — full fold is scale-out)
  if (foldEv.length < 500 * 4 && listings <= 500) {
    const la = `listing_${r.listing_id.replace(/[^A-Za-z0-9]/g, "").toLowerCase()}`;
    foldEv.push({ op: "INS", entity_type: "listing", anchor: la, payload: { platform: r.platform, listing_id: r.listing_id, nightly_rate: r.nightly_rate, property: r.property } });
    for (const w of (r.calendar || [])) {
      const ba = `booking_${r.listing_id.replace(/[^A-Za-z0-9]/g, "")}_${w.from}_${w.to}`.toLowerCase();
      foldEv.push({ op: "INS", entity_type: "booking_assertion", anchor: ba, payload: { listing: la, from: w.from, to: w.to, observed_at: `pull-${w.first_observed_pull}`, source: "btora-calendar" } });
      foldEv.push({ op: "CON", source_anchor: ba, target_anchor: la, relation_type: "observed_in" });
      if (mapped.parcel_anchor) foldEv.push({ op: "CON", source_anchor: ba, target_anchor: mapped.parcel_anchor, relation_type: "asserts_use_of" });
    }
    if (mapped.match !== "CLEAR") {
      foldEv.push({ op: "DEF", anchor: la, criterion: "canon", value: { declared: "as-vendor-signal" } });
      foldEv.push({ op: "EVA", anchor: la, criterion: "address-match", result: mapped.match.toLowerCase(), note: mapped.strategy });
    }
  }
}
for (const s of [calOut, listOut, evtOut, attrOut, slateReg, slateQ, bbAssets]) s.end();
await Promise.all([calOut, listOut, evtOut, attrOut, slateReg, slateQ, bbAssets].map((s) => new Promise((r) => s.on("finish", r))));

fs.writeFileSync(path.join(BB, "bb_map_flags.geojson"), JSON.stringify({ type: "FeatureCollection", features }));
fs.writeFileSync(path.join(FO, "btora_fold_events.json"), JSON.stringify(foldEv, null, 1));

const filters = {
  filterGroup: "str_booking_filters",
  filters: [
    { name: "platform", mappingColumn: "platform", type: "multi" },
    { name: "stay_window", mappingColumn: "date_from,date_to", type: "date-range" },
    { name: "match", mappingColumn: "match", type: "multi" },
    { name: "license", mappingColumn: "lic", type: "multi" },
    { name: "upcoming_only", mappingColumn: "date_to >= today", type: "binary" },
    { name: "unregistered_only", mappingColumn: "lic IN (NONE,EXPIRED)", type: "binary" },
  ],
};
fs.writeFileSync(path.join(SW, "platform_filters.json"), JSON.stringify(filters, null, 2));
fs.writeFileSync(path.join(BB, "bb_filters.json"), JSON.stringify(filters, null, 2));

const gql = `# Swarm ingest — Btora STR bookings (generated, ${RULE_VERSION})
# 1. Raw vendor tables
mutation { createDataset(cityId: "<CITY>", title: "btora_listings", pullerAdapter: "BTORA", pullerArgs: {pullMode: "snapshot"}) { id } }
mutation { createDataset(cityId: "<CITY>", title: "btora_calendar", pullerAdapter: "BTORA", pullerArgs: {pullMode: "snapshot"}) { id } }
# 2. Connector (one per city): Btora pull -> base tables
mutation { createConnector(cityId: "<CITY>", name: "btora-pull", adapter: "BTORA", adapterArgs: {datasets: ["btora_listings","btora_calendar"]}, source: {datasetIds: ["<LISTINGS_ID>","<CALENDAR_ID>"]}) { id connectorUrl provenanceUrl } }
# 3. Transformers (chained, EO rule ${RULE_VERSION})
mutation { createTransformer(cityId: "<CITY>", name: "btora-geocode", runner: {geocoder: {columns: ["property.address"], source: "btora_listings"}}, source: {datasetId: "<LISTINGS_ID>"}) { id tableName } }
mutation { createTransformer(cityId: "<CITY>", name: "btora-asset-map", runner: {assetMapper: {strategies: ["exact","fuzzy-hold","refuse-unlocated"], preFilter: "property.address IS NOT NULL"}}, source: {transformerId: "<GEOCODE_ID>"}) { id tableName } }
mutation { createTransformer(cityId: "<CITY>", name: "btora-booking-sql", runner: {sql: {createSql: "SELECT listing_id, window_from, window_to, observed_at FROM btora_calendar WHERE first_observed_pull = :pull"}}, source: {datasetId: "<CALENDAR_ID>"}) { id tableName } }
mutation { createTransformer(cityId: "<CITY>", name: "str-booking-attributes", runner: {attributeRules: {entity: "ASSET", tracksHistory: true, ruleSql: "license join + flag rules v1"}}, source: {transformerId: "<ASSETMAP_ID>"}) { id } }
# 4. Event table + filters (the filterable map)
mutation { createPlatformEventTable(input: {name: "str_booking"}) { id } }
mutation { createPlatformEventFilter(input: {eventTableId: "<STR_BOOKING_ID>", name: "platform", mappingColumn: "platform", filterGroupId: "<GROUP>"}) { id } }
mutation { createPlatformEventFilter(input: {eventTableId: "<STR_BOOKING_ID>", name: "stay_window", mappingColumn: "date_from,date_to", filterGroupId: "<GROUP>"}) { id } }
# 5. Run + contract
mutation { runTransformer(id: "<GEOCODE_ID>", isScheduled: true) { id } }
mutation { assignTransformerDataContract(dataContractId: "<CONTRACT>", transformerId: "<BOOKINGSQL_ID>") { id } }
# Slate reads: license table projection (slate/slate_registrations.jsonl) via GetLicenses{number,status,asset{parcelId}}.
# Building Blocks reads: Asset{parcelId,address,latitude,longitude,licenses{number,status}} + str_booking event table + FilterGroup.`;
fs.writeFileSync(path.join(SW, "swarm_ingest.graphql"), gql);
fs.writeFileSync(path.join(SW, "swarm_package.json"), JSON.stringify({ package: "str-booking-btora", datasets: ["btora_listings", "btora_calendar"], transformers: ["btora-geocode", "btora-asset-map", "btora-booking-sql", "str-booking-attributes"], eventTables: ["str_booking"], filterGroup: "str_booking_filters", slate: "../slate/slate_registrations.jsonl", bb: "../bb/bb_assets.jsonl", rule: RULE_VERSION }, null, 2));

console.log(`fold-ready: ${listings} listings, ${windows} windows, ${assertions} located assertions, ${refused} unlocated refusals`);
console.log(`swarm/ slate/ bb/ fold/ written under ${HERE}/`);
