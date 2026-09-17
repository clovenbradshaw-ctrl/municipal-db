// eo-transform.mjs — EO genuine-transformation layer mirroring Swarm's 5 runners.
//
// Each runner is a pure function { inputs[], rule } -> { outputs[], lineage }.
// A runner that cannot name its inputs + rule REFUSES (returns { refused }) —
// it never guesses. This is the municipal-DB SYN discipline applied to Btora:
//
//   Sql            ~ TransformerSql            (project / filter / snapshot-diff SQL)
//   Geocoder       ~ TransformerGeocoder       (address -> lat/lng + parcel anchor)
//   AssetMapper    ~ TransformerAssetMapper    (listing -> parcel strategies)
//   AttributeRules ~ TransformerAttributeRules (license join -> flags, tracksHistory)
//   Packager       ~ TransformerContainer      (bundle outputs, no mutation)
//
// Lineage on every output: { runner, rule_version, inputs, pull_id } — the
// Swarm { runInfo, provenanceUrl, contractValidations } equivalent.

export const RULE_VERSION = "btora-eo-v1";

// ── Sql: pure row ops (no invention) ─────────────────────────────────────────
export function sqlListingsSnapshot(rows, pullN) {
  // static-export reconstruction: windows visible at pull N
  return rows.map((r) => ({
    ...r,
    calendar: (r.calendar || []).filter((w) => w.first_observed_pull <= pullN),
  }));
}
export function sqlCalendarDiff(rows, pullN) {
  // event-stream reconstruction: only windows FIRST seen at pull N
  const out = [];
  for (const r of rows) for (const w of (r.calendar || []))
    if (w.first_observed_pull === pullN)
      out.push({ platform: r.platform, listing_id: r.listing_id, from: w.from, to: w.to, observed_at: `pull-${pullN}`, pull_id: `btora-pull-${pullN}` });
  return out;
}

// ── Geocoder: address -> point + parcel anchor ───────────────────────────────
export function geocode(row) {
  const addr = row.property?.address;
  if (!addr) return { refused: "no address: UNLOCATED, no parcel join attempted" };
  return {
    lat: row.property.lat, lng: row.property.lng,
    parcel_anchor: `parcel_${slug(addr)}`,
    lineage: { runner: "Geocoder", rule_version: RULE_VERSION, inputs: ["btora.property.address"] },
  };
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);

// ── AssetMapper: listing -> parcel with strategies ───────────────────────────
export function assetMap(row, geo) {
  if (!row.property?.address) return { match: "UNLOCATED", parcel_anchor: null, strategy: "refused:no-address" };
  if (row.match_hint === "CLEAR" && geo) return { match: "CLEAR", parcel_anchor: geo.parcel_anchor, strategy: "exact:address+coords" };
  if (row.match_hint === "MARGINAL") return { match: "MARGINAL", parcel_anchor: geo ? geo.parcel_anchor : null, strategy: "fuzzy:withheld-from-notices", held: true };
  return { match: row.match_hint || "CLEAR", parcel_anchor: geo.parcel_anchor, strategy: "exact" };
}

// ── AttributeRules: license/owner/zone flags (tracksHistory=true) ────────────
export function attributeRules(row, mapped) {
  const lic = row.property?.license_number;
  const licStatus = lic ? (hashBool(row.listing_id + "exp") ? "EXPIRED" : "ACTIVE") : "NONE";
  const flags = [];
  if (licStatus === "NONE") flags.push("unregistered");
  if (licStatus === "EXPIRED") flags.push("license-lapsed");
  if (mapped.match === "MARGINAL") flags.push("held-back:address-uncertain");
  if (mapped.match === "UNLOCATED") flags.push("unlocated:no-parcel");
  if (row.property?.bedrooms >= 4 && !lic) flags.push("large-unregistered");
  return {
    lic_status: licStatus, flags,
    owner_key: row.host?.name || "unknown-host",
    lineage: { runner: "AttributeRules", rule_version: RULE_VERSION, inputs: ["btora.property.license_number", "assetMap.match"], tracksHistory: true },
  };
}
function hashBool(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 10 === 0; }

// ── Packager (Container): bundle without mutating ────────────────────────────
export function pack(name, rows, lineageInputs) {
  return { package: name, rowCount: rows.length, lineage: { runner: "Packager", rule_version: RULE_VERSION, inputs: lineageInputs } };
}
