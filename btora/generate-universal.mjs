// generate-universal.mjs — ONE universal Btora dataset, partitioned by city.
//
// Universal row = current-state listing + full asserted calendar. Every window
// carries first_observed_pull / last_observed_pull so all three ingress modes
// (event stream / static export / static-state API) derive from this one file
// without re-generation:
//
//   stream  = explode each window at first_observed_pull  -> one event per assertion
//   export  = filter windows with first_observed_pull <= N -> snapshot N
//   api     = latest snapshot only (current state, no history)
//
// Deterministic (mulberry32). Default 2,400 listings/city x 5 cities = 12,000
// listings, ~35k windows. Override: SCALE_PER_CITY=400 node generate-universal.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "universal");
const PER_CITY = Number(process.env.SCALE_PER_CITY || 2400);

const CITIES = [
  { key: "middletown", muni: "Middletown, RI", lat: 41.545, lng: -71.291, streets: ["Aquidneck Ave", "Green End Ave", "Oliphant Ln", "Valley Rd", "Miantonomi Ave"] },
  { key: "chicago", muni: "Chicago, IL", lat: 41.878, lng: -87.63, streets: ["W Grand Ave", "N Hoyne Ave", "W Division St", "N Milwaukee Ave", "W Chicago Ave"] },
  { key: "staugustine", muni: "St. Augustine, FL", lat: 29.901, lng: -81.313, streets: ["Sea Wall Ln", "Marine St", "Cordova St", "King St", "Aviles St"] },
  { key: "talent", muni: "Talent, OR", lat: 42.245, lng: -122.788, streets: ["Wagner Creek Rd", "Talent Ave", "Colver Rd", "Anderson Creek Rd", "Gibson Rd"] },
  { key: "ftworth", muni: "Fort Worth, TX", lat: 32.756, lng: -97.335, streets: ["Bomber Dr", "S Main St", "W Magnolia Ave", "Camp Bowie Blvd", "E Berry St"] },
];
const PLATFORMS = [["airbnb", 0.5], ["vrbo", 0.8], ["booking.com", 1.0]];
const PULLS = [
  { pull_id: "btora-2026-09-01", observed_at: "2026-09-01" },
  { pull_id: "btora-2026-09-15", observed_at: "2026-09-15" },
  { pull_id: "btora-2026-10-01", observed_at: "2026-10-01" },
];
// candidate windows (genuine Sep-Oct 2026 stay dates)
const WINDOWS = [
  ["2026-09-15", "2026-09-18"], ["2026-09-17", "2026-09-20"], ["2026-09-18", "2026-09-22"],
  ["2026-09-19", "2026-09-21"], ["2026-09-20", "2026-09-25"], ["2026-09-21", "2026-09-24"],
  ["2026-09-22", "2026-09-25"], ["2026-09-23", "2026-09-26"], ["2026-09-24", "2026-09-27"],
  ["2026-09-25", "2026-09-28"], ["2026-09-26", "2026-09-30"], ["2026-09-28", "2026-10-01"],
  ["2026-09-30", "2026-10-02"], ["2026-10-01", "2026-10-04"], ["2026-10-03", "2026-10-06"],
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const pickPlatform = (r) => { const x = r(); for (const [p, c] of PLATFORMS) if (x < c) return p; return "airbnb"; };

let totalListings = 0, totalWindows = 0;
const manifest = { provider: "btora", pulls: PULLS, per_city: PER_CITY, generated_at: new Date().toISOString().slice(0, 10), files: [] };

for (const city of CITIES) {
  const rnd = mulberry32(hashStr(city.key));
  const outPath = path.join(OUT, `listings_${city.key}.jsonl`);
  const ws = fs.createWriteStream(outPath);
  for (let i = 0; i < PER_CITY; i++) {
    const n = i + 1;
    const platform = pickPlatform(rnd);
    const street = city.streets[Math.floor(rnd() * city.streets.length)];
    const num = 10 + Math.floor(rnd() * 2900);
    const unit = city.key === "chicago" && rnd() < 0.3 ? ` Unit ${1 + Math.floor(rnd() * 8)}` : "";
    const address = `${num} ${street}${unit}, ${city.muni}`;
    const mRoll = rnd();
    const match = mRoll < 0.85 ? "CLEAR" : mRoll < 0.95 ? "MARGINAL" : "UNLOCATED";
    const lRoll = rnd();
    // license shown on the listing (what the platform displays; may be null)
    const licenseShown = lRoll < 0.55 ? `STR-${city.key.slice(0, 2).toUpperCase()}-2026-${String(10000 + Math.floor(rnd() * 89999))}` : null;
    const bedrooms = 1 + Math.floor(rnd() * 4);
    const rate = 90 + Math.floor(rnd() * 260);
    const lat = +(city.lat + (rnd() - 0.5) * 0.09).toFixed(5);
    const lng = +(city.lng + (rnd() - 0.5) * 0.11).toFixed(5);
    const lid = `${platform === "airbnb" ? "AB" : platform === "vrbo" ? "VR" : "BC"}-${city.key.slice(0, 2).toUpperCase()}-${String(n).padStart(5, "0")}`;
    // 0-4 windows, biased to 1-3
    const nw = Math.floor(rnd() * rnd() * 5);
    const used = new Set();
    const calendar = [];
    for (let w = 0; w < nw; w++) {
      const wi = Math.floor(rnd() * WINDOWS.length);
      if (used.has(wi)) continue;
      used.add(wi);
      const [from, to] = WINDOWS[wi];
      // earlier windows observed in earlier pulls (genuine history, not invented)
      const firstPull = from < "2026-09-20" ? 1 : from < "2026-10-01" ? (rnd() < 0.6 ? 1 : 2) : (rnd() < 0.5 ? 2 : 3);
      calendar.push({ from, to, status: "booked", first_observed_pull: firstPull, last_observed_pull: 3 });
    }
    totalWindows += calendar.length;
    const row = {
      provider: "btora", pull_id: "btora-2026-10-01", observed_at: "2026-10-01",
      platform, listing_id: lid, url: `https://${platform.replace(".com", "")}.com/rooms/${lid}`,
      title: `${street.split(" ")[0].toLowerCase()} ${bedrooms}br near ${city.key}`,
      listed_at: "2026-08-01",
      host: { name: `Host LLC ${city.key}-${1 + Math.floor(rnd() * 400)}`, phone: null, address: null },
      property: { address: match === "UNLOCATED" ? null : address, city: city.muni, lat: match === "UNLOCATED" ? null : lat, lng: match === "UNLOCATED" ? null : lng, bedrooms, beds: bedrooms + (rnd() < 0.3 ? 1 : 0), units: 1, max_occupancy: bedrooms * 2, property_type: "residential", zoning_claim: null, parking_plan: rnd() < 0.5 ? "driveway" : "street", license_number: licenseShown },
      nightly_rate: rate, calendar, match_hint: match,
    };
    ws.write(JSON.stringify(row) + "\n");
    totalListings++;
  }
  ws.end();
  manifest.files.push(path.basename(outPath));
  await new Promise((r) => ws.on("finish", r));
}
fs.writeFileSync(path.join(OUT, "pulls_manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`universal: ${totalListings} listings, ${totalWindows} windows across ${CITIES.length} cities -> ${OUT}/`);
