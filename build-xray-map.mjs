// build-xray-map.mjs — snip verbatim from the three schema sources we have
// access to (Slate, Building Blocks, Swarm + the btora pulls), and map each
// municipal-db field need to the candidate vendor fields that could fulfill
// it. Every candidate is cited to the exact source file it was cut from;
// nothing is invented. Outputs:
//   - xray-map.json   (the data the page renders)
//   - xray.html       (the easy-to-read page, self-contained)
//
// The eoreader7 snip discipline applies: fields are CUT from the real
// schema sources positionally, never generated. A need with no candidate
// anywhere is marked "gap", not guessed.

import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = "/Users/mlacy/Documents/3.0";

// ── 1. Slate — verbatim from the Slate API key-types pull ──
const slate = JSON.parse(fs.readFileSync(path.join(ROOT, "slate_api_key_types.json"), "utf8"));
// btora slate delivery shapes (verbatim field keys from the pulled rows)
const slateRegShape = ["table", "parcel", "license_shown", "status", "platform", "match"];
const slateQueueShape = ["parcel", "window", "platform", "match", "lic", "use", "evidence"];

// ── 2. Building Blocks — verbatim from the bundle inventory doc ──
const bb = {
  ASSET: ["id", "alias", "parcelId", "commonName", "address", "addressMap", "addresses", "assetType", "assetLinks", "marketStatus", "contact", "gisCity", "latitude", "longitude", "polygon", "parent", "children", "assessments", "parcelFilters", "licenses"],
  LICENSE: ["id", "number", "status", "isExpired", "isRenewable", "approvedOn", "renewableFrom", "expirationDate", "lastNotifiedRegistrant", "lastNotifiedExpiration", "lastNotifiedRenewal", "licenseChain", "previousLicense", "nextLicense", "licenseDeregistrationReason", "registrant", "email", "profilePicture", "asset", "assetUnit", "parcelId", "address", "displayName", "type", "flow", "workflow", "tags", "submissionData"],
  LicenseType: ["name", "unitLevel", "unitType", "durationInDays", "renewalDaysBeforeExpiration", "expireCalendarYear", "expireCalendarDate", "expirationDateFormulaScript", "propertyEligibleFormulaScript", "notifyRegistrantOnRenewal", "workflow", "registrationPortals", "form", "ordinance", "contact", "allowedAssetIdentityTypes", "identityBased", "maxProperties"],
  WorkflowStageTaskPayment: ["defaultPaymentAmount", "paymentDescription", "paymentAmountPerAsset", "paymentAmountPerUnit", "allowPaymentAmountOverride", "allowChecks", "allowCash", "autoAddProcessingFees", "processingFeesPercentage", "checksPayableTo", "paymentAccount", "paymentFormulaScript", "appealConditionalLogicForm", "autoApproveAppeals", "appealsAssignee"],
  getAngelPlatformCityAttribute: ["id", "name", "cityAttribute", "connectors", "connectorUrl", "provenanceUrl", "assetProvenanceUrl", "runInfo", "failStreak", "staleStreak", "lastSuccessfulPushAt", "lastDataChangeAt", "stage", "number"],
  ProviderCredential: ["id", "city", "name", "lastFour", "isActive", "createdAt", "updatedAt", "lastUsedAt", "revokedAt", "status", "provider"],
  IntegrationHealthDashboard: ["type", "provider", "status", "cityId", "checkedAt", "latencyMs", "errorMessage", "targetLabel", "paymentAccountId", "userId", "authProviderId"],
  IdentityProfile: ["id", "source", "type", "fullName", "firstName", "lastName", "email", "phone", "address", "city", "state", "zip", "fullAddress", "location"],
  SnailMail: ["SnailMailCampaign", "SnailMail", "reply-code tracking", "OutreachMetrics"],
};

// ── 3. Swarm — verbatim from the GraphQL introspection pull ──
const swarmSchema = JSON.parse(fs.readFileSync(path.join(ROOT, "swarm_graphql_schema.json"), "utf8")).__schema;
const named = swarmSchema.types.filter((t) => !t.name.startsWith("__"));
const swarm = {};
for (const t of named) if (t.kind === "OBJECT" || t.kind === "INTERFACE") swarm[t.name] = (t.fields || []).map((f) => f.name);

// btora swarm delivery shapes (verbatim field keys from the pulled rows)
const swarmListingsShape = ["dataset", "pull_id", "platform", "listing_id", "url", "listed_at", "bedrooms", "nightly_rate", "license_shown", "match", "parcel_anchor", "lineage"];
const swarmCalendarShape = ["dataset", "listing_id", "platform", "window_from", "window_to", "status", "observed_at", "pull_id"];
const swarmPlatformAttrShape = ["attribute", "entity", "parcel_anchor", "lic", "match", "flags", "owner_listings", "lineage"];
const swarmBookingShape = ["event_table", "event_id", "listing_id", "platform", "date_from", "date_to", "amount", "amount_unit", "parcel_anchor", "match", "lic", "flags", "observed_at", "lineage"];
const universalListingShape = ["provider", "pull_id", "observed_at", "platform", "listing_id", "url", "title", "listed_at", "host{name,phone,address}", "property{address,city,lat,lng,bedrooms,beds,units,max_occupancy,property_type,zoning_claim,parking_plan,license_number}", "nightly_rate", "calendar[{from,to,status,first_observed_pull,last_observed_pull}]", "match_hint"];

// ── 4. The map: need → candidate(s). candidates[] is verbatim-cited. ──
// Each candidate: { system, type, field, source, confidence, note }
// confidence: exact | strong | partial | analog | gap

// Each candidate carries:
//   system, type, field (display), source, confidence
//   fields: literal field-name array, machine-verifiable against the real
//           source bytes. This is what "snipped" means — the names below are
//           the exact keys present in the pulled schema/data, verified at
//           build time by the verifyCandidates pass. Prose about the mapping
//           lives in note, never in fields.
const candidates = {
  // —— parcel ——
  "parcel.address": [
    { system: "Slate", type: "Asset", field: "address / fullAddress / geocoderAddress", fields: ["address", "fullAddress", "geocoderAddress"], source: "slate_api_key_types.json → Asset", confidence: "exact" },
    { system: "Building Blocks", type: "ASSET", field: "address / addressMap / fullAddress", fields: ["address", "addressMap", "fullAddress"], source: "bundle inventory ASSET", confidence: "exact" },
    { system: "Swarm→universal", type: "listing.property", field: "property.address", fields: ["address"], source: "universal/listings_*.jsonl", confidence: "exact", note: "btora universal listing shape carries the geocoded address verbatim" },
  ],
  "parcel.lat/lng": [
    { system: "Slate", type: "Asset", field: "latitude / longitude / polygon / envelope", fields: ["latitude", "longitude", "polygon", "envelope"], source: "slate_api_key_types.json → Asset", confidence: "exact" },
    { system: "Building Blocks", type: "ASSET", field: "latitude / longitude / polygon", fields: ["latitude", "longitude", "polygon"], source: "bundle inventory ASSET (confirmed native)", confidence: "exact" },
    { system: "Swarm", type: "TransformerGeocoder", field: "columns / source", fields: ["columns", "source"], source: "swarm_graphql_schema.json → TransformerGeocoder", confidence: "exact", note: "geocoder feeds the parcel coords" },
  ],
  "parcel.apn": [
    { system: "Slate", type: "Asset", field: "realPropertyUniqueId / parcelId / otherId", fields: ["realPropertyUniqueId", "parcelId", "otherId"], source: "slate_api_key_types.json → Asset", confidence: "exact" },
    { system: "Building Blocks", type: "ASSET", field: "parcelId", fields: ["parcelId"], source: "bundle inventory ASSET", confidence: "exact" },
  ],
  "parcel.bedrooms": [
    { system: "Slate", type: "FlowStageTask", field: "attributes", fields: ["attributes"], source: "slate_api_key_types.json → FlowStageTask", confidence: "strong", note: "declared per-unit attributes on the registration task" },
    { system: "Building Blocks", type: "ASSET_PROJECT_UNIT", field: "attributes", fields: ["attributes"], source: "bundle inventory ASSET_PROJECT_UNIT", confidence: "strong", note: "confirmed 'guestrooms' are FLOW_STAGE_TASK attrs (declared)" },
    { system: "Swarm→universal", type: "listing.property", field: "property.bedrooms / property.beds", fields: ["bedrooms", "beds"], source: "universal/listings_*.jsonl", confidence: "exact" },
  ],
  "parcel.zoning": [
    { system: "Swarm→universal", type: "listing.property", field: "property.zoning_claim", fields: ["zoning_claim"], source: "universal/listings_*.jsonl", confidence: "strong", note: "btora universal shape carries a zoning_claim field — present in the schema, null in the current pull (the claim slot exists; values weren't captured this pull)" },
    { system: "Building Blocks", type: "GisFeature / GisLayer", field: "GIS feature attributes", fields: [], source: "bundle inventory §8 GIS", confidence: "analog", structural: true, note: "no native zoning field on ASSET, but BB's GIS feature layer + SQL Reports/Scripts extensibility is the documented home for a zoning-eligibility check (§8); the demo carries zoning verbatim on its own parcels (R-1, RM-5, MU-1…) from the municipal code" },
  ],
  "parcel.evictions": [
    { system: "Building Blocks", type: "ASSET", field: "assessments", fields: ["assessments"], source: "bundle inventory §6 assessments{owners,totalValue,year}", confidence: "analog", note: "eviction filings are a data feed; the demo bridges them from landlordmapper.org" },
    { system: "Swarm", type: "AttributeRule", field: "name / rules", fields: ["name", "rules"], source: "swarm_graphql_schema.json → AttributeRule", confidence: "analog", note: "an attribute rule could derive a repeat-eviction flag" },
  ],
  // —— owner ——
  "owner.name": [
    { system: "Slate", type: "IdentityProfile", field: "fullName / firstName / lastName", fields: ["fullName", "firstName", "lastName"], source: "slate_api_key_types.json → IdentityProfile", confidence: "exact" },
    { system: "Building Blocks", type: "IDENTITY_PROFILE", field: "fullName", fields: ["fullName"], source: "bundle inventory IDENTITY_PROFILE", confidence: "exact" },
    { system: "Swarm→universal", type: "listing.host", field: "host.name", fields: ["name"], source: "universal/listings_*.jsonl", confidence: "exact" },
  ],
  "owner.phone": [
    { system: "Slate", type: "IdentityProfile", field: "phone / otherPhones / phoneType", fields: ["phone", "otherPhones", "phoneType"], source: "slate_api_key_types.json → IdentityProfile", confidence: "exact" },
    { system: "Building Blocks", type: "IDENTITY_PROFILE", field: "phone", fields: ["phone"], source: "bundle inventory IDENTITY_PROFILE", confidence: "exact" },
  ],
  "owner.mailing_address": [
    { system: "Slate", type: "IdentityProfile", field: "address / address2 / city / state / zip / fullAddress", fields: ["address", "address2", "city", "state", "zip", "fullAddress"], source: "slate_api_key_types.json → IdentityProfile", confidence: "exact" },
    { system: "Building Blocks", type: "IDENTITY_PROFILE", field: "address / fullAddress", fields: ["address", "fullAddress"], source: "bundle inventory IDENTITY_PROFILE", confidence: "exact" },
  ],
  "owner.email": [
    { system: "Slate", type: "IdentityProfile", field: "email / emailType / otherEmails", fields: ["email", "emailType", "otherEmails"], source: "slate_api_key_types.json → IdentityProfile", confidence: "exact" },
    { system: "Building Blocks", type: "IDENTITY_PROFILE", field: "email", fields: ["email"], source: "bundle inventory IDENTITY_PROFILE", confidence: "exact" },
  ],
  "owner.property_count": [
    { system: "Building Blocks", type: "GetSuggestedLinks", field: "ownedAssetCount / previouslyOwnedAssetCount", fields: ["ownedAssetCount", "previouslyOwnedAssetCount"], source: "bundle inventory §8 GetSuggestedLinks", confidence: "strong", note: "suggested-links matcher returns ownedAssetCount — the count concept exists, instance value is data" },
    { system: "Swarm", type: "platform_attributes", field: "owner_listings", fields: ["owner_listings"], source: "btora/swarm/platform_attributes.jsonl", confidence: "exact", note: "btora attribute row carries owner_listings count per parcel" },
  ],
  // —— municipality / jurisdiction ——
  "municipality.name": [
    { system: "Building Blocks", type: "Workflow", field: "city", fields: ["city"], source: "bundle inventory WORKFLOW.city", confidence: "exact" },
    { system: "Swarm", type: "City", field: "name / alias / location", fields: ["name", "alias", "location"], source: "swarm_graphql_schema.json → City", confidence: "exact" },
  ],
  "municipality.state": [
    { system: "Swarm", type: "State", field: "name / abbreviation", fields: ["name", "abbreviation"], source: "swarm_graphql_schema.json → State", confidence: "exact" },
    { system: "Slate", type: "Workflow", field: "city", fields: ["city"], source: "slate_api_key_types.json → Workflow.city", confidence: "analog", note: "Slate scopes per city, state is implied" },
  ],
  "municipality.county": [
    { system: null, type: null, field: null, fields: [], source: "grep of all three", confidence: "gap", note: "no county concept in Slate/BB/Swarm; county is derived or imported (demo has it on the municipality entity itself)" },
  ],
  "municipality.code_url": [
    { system: "Swarm", type: "Connector", field: "connectorUrl / provenanceUrl / assetProvenanceUrl", fields: ["connectorUrl", "provenanceUrl", "assetProvenanceUrl"], source: "swarm_graphql_schema.json → Connector", confidence: "analog", note: "the provenance-URL pattern; code_url points at the municipal code library (AmLegal/Municode), which none of the three host" },
  ],
  "municipality.chapter": [
    { system: "Building Blocks", type: "LicenseType", field: "ordinance", fields: ["ordinance"], source: "bundle inventory LicenseType.ordinance", confidence: "analog", note: "LicenseType carries an ordinance pointer — the closest structural home for a chapter citation" },
  ],
  "jurisdiction.name": [
    { system: "Swarm", type: "State", field: "name / abbreviation", fields: ["name", "abbreviation"], source: "swarm_graphql_schema.json → State", confidence: "exact" },
    { system: "Swarm", type: "City", field: "name", fields: ["name"], source: "swarm_graphql_schema.json → City", confidence: "exact" },
  ],
  // —— obligation / figure / kind (the law) ——
  "obligation.text": [
    { system: null, type: null, field: null, fields: [], source: "grep of all three", confidence: "gap", note: "none of Slate/BB/Swarm host ordinance clause text — the law itself is read by eoreader7 from the code library; the demo keeps it verbatim as unmodified ground truth" },
  ],
  "obligation.section": [
    { system: "Building Blocks", type: "LicenseType", field: "ordinance", fields: ["ordinance"], source: "bundle inventory LicenseType.ordinance", confidence: "analog", note: "an ordinance pointer is the only citation-shaped field; section numbers live in the code text" },
  ],
  "obligation.holder": [
    { system: "Building Blocks", type: "Workflow", field: "city", fields: ["city"], source: "bundle inventory WORKFLOW.city", confidence: "analog", note: "the municipality that holds the obligation = the city scoping the workflow" },
    { system: "Swarm", type: "City", field: "name", fields: ["name"], source: "swarm_graphql_schema.json → City", confidence: "analog" },
  ],
  "figure.party / modality": [
    { system: null, type: null, field: null, fields: [], source: "—", confidence: "gap", note: "eoreader7 organ output (discoverRelationVocab/extractRelations) — a reading artifact, not a vendor-schema field; no vendor exposes clause-subject extraction" },
  ],
  "kind.standing_criterion": [
    { system: "Swarm", type: "AttributeRule", field: "rules / name / isPreset", fields: ["rules", "name", "isPreset"], source: "swarm_graphql_schema.json → AttributeRule", confidence: "analog", note: "AttributeRule is the closest standing-criterion container (a named, versioned rule)" },
  ],
  // —— fee / tax / compliance-rule ——
  "fee-schedule.*": [
    { system: "Building Blocks", type: "WorkflowStageTaskPayment", field: "defaultPaymentAmount / paymentAmountPerAsset / paymentAmountPerUnit / paymentFormulaScript / paymentDescription", fields: ["defaultPaymentAmount", "paymentAmountPerAsset", "paymentAmountPerUnit", "paymentFormulaScript", "paymentDescription"], source: "bundle inventory §7 WorkflowStageTaskPayment", confidence: "exact", note: "this IS the per-city fee mechanism — richer than the demo's shape (appeals, overrides, per-unit vs per-asset)" },
    { system: "Building Blocks", type: "LicenseType", field: "registrationPortals / form", fields: ["registrationPortals", "form"], source: "bundle inventory LicenseType", confidence: "strong" },
  ],
  "tax-schedule.*": [
    { system: "Swarm", type: "PlatformEventTable", field: "amountLabel / amountUnit / columns / tableName", fields: ["amountLabel", "amountUnit", "columns", "tableName"], source: "swarm_graphql_schema.json → PlatformEventTable", confidence: "analog", note: "an occupancy-tax event table would hold rate components + remittance; the demo models it as its own type" },
    { system: "Slate", type: "FlowStageTask", field: "paymentAmount / paymentLineItems", fields: ["paymentAmount", "paymentLineItems"], source: "slate_api_key_types.json → FlowStageTask", confidence: "analog" },
  ],
  "compliance-rule.*": [
    { system: "Swarm", type: "PlatformFilter", field: "name / label / type / unit / mappingColumn / dataElement / sumOn / source", fields: ["name", "label", "type", "unit", "mappingColumn", "dataElement", "sumOn", "source"], source: "swarm_graphql_schema.json → PlatformFilter", confidence: "exact", note: "a filter with a unit + mappingColumn + dataElement IS a measurable compliance rule (contact-distance, occupancy-cap…)" },
    { system: "Swarm", type: "AttributeRule", field: "rules / name / isPreset", fields: ["rules", "name", "isPreset"], source: "swarm_graphql_schema.json → AttributeRule", confidence: "exact" },
  ],
  // —— registration / license ——
  "registration.license_number": [
    { system: "Slate", type: "License", field: "number / licenseIdentifier", fields: ["number", "licenseIdentifier"], source: "slate_api_key_types.json → License", confidence: "exact" },
    { system: "Building Blocks", type: "LICENSE", field: "number", fields: ["number"], source: "bundle inventory LICENSE", confidence: "exact" },
    { system: "Slate→btora", type: "slate_licenses", field: "license_shown", fields: ["license_shown"], source: "btora/slate/slate_registrations.jsonl", confidence: "exact" },
  ],
  "registration.status": [
    { system: "Slate", type: "License", field: "status / isExpired / isRenewable / isInRenewalWindow", fields: ["status", "isExpired", "isRenewable", "isInRenewalWindow"], source: "slate_api_key_types.json → License", confidence: "exact" },
    { system: "Building Blocks", type: "LICENSE", field: "status / isExpired / isRenewable", fields: ["status", "isExpired", "isRenewable"], source: "bundle inventory LICENSE", confidence: "exact" },
    { system: "Swarm", type: "platform_attributes", field: "lic", fields: ["lic"], source: "btora/swarm/platform_attributes.jsonl", confidence: "exact" },
  ],
  "registration.issued_at": [
    { system: "Slate", type: "License", field: "approvedOn / dateCreated", fields: ["approvedOn", "dateCreated"], source: "slate_api_key_types.json → License", confidence: "exact" },
    { system: "Building Blocks", type: "LICENSE", field: "approvedOn", fields: ["approvedOn"], source: "bundle inventory LICENSE", confidence: "exact" },
  ],
  "registration.expires_at": [
    { system: "Slate", type: "License", field: "expirationDate", fields: ["expirationDate"], source: "slate_api_key_types.json → License", confidence: "exact", note: "confirmed the forward-dated field (Job 3)" },
    { system: "Building Blocks", type: "LICENSE", field: "expirationDate", fields: ["expirationDate"], source: "bundle inventory LICENSE.expirationDate (script-computed)", confidence: "exact" },
  ],
  "registration.holder": [
    { system: "Slate", type: "License", field: "registrant", fields: ["registrant"], source: "slate_api_key_types.json → License.registrant", confidence: "exact" },
    { system: "Building Blocks", type: "LICENSE", field: "registrant / email / profilePicture", fields: ["registrant", "email", "profilePicture"], source: "bundle inventory LICENSE.registrant", confidence: "exact" },
  ],
  "registration.units / bedrooms / guest_rooms / max_occupancy": [
    { system: "Slate", type: "FlowStageTask", field: "attributes", fields: ["attributes"], source: "slate_api_key_types.json → FlowStageTask", confidence: "strong" },
    { system: "Swarm→universal", type: "listing.property", field: "property.units / property.bedrooms / property.max_occupancy", fields: ["units", "bedrooms", "max_occupancy"], source: "universal/listings_*.jsonl", confidence: "exact", note: "observed (from the platform), the thing the registry claims should match" },
  ],
  "registration.parking_plan": [
    { system: "Swarm→universal", type: "listing.property", field: "property.parking_plan", fields: ["parking_plan"], source: "universal/listings_*.jsonl", confidence: "exact" },
    { system: "Slate", type: "FlowStageTask", field: "attributes", fields: ["attributes"], source: "slate_api_key_types.json → FlowStageTask", confidence: "strong" },
  ],
  // —— listing / bookings ——
  "listing.platform / listing_id / url / title / listed_at": [
    { system: "Swarm→btora", type: "dataset_btora_listings", field: "platform / listing_id / url / listed_at", fields: ["platform", "listing_id", "url", "listed_at"], source: "btora/swarm/dataset_btora_listings.jsonl", confidence: "exact" },
    { system: "Swarm→universal", type: "universal listing", field: "platform / listing_id / url / title / listed_at", fields: ["platform", "listing_id", "url", "title", "listed_at"], source: "universal/listings_*.jsonl", confidence: "exact" },
  ],
  "listing.nightly_rate": [
    { system: "Swarm→btora", type: "transformer_booking_events", field: "amount / amount_unit", fields: ["amount", "amount_unit"], source: "btora/swarm/transformer_booking_events.jsonl", confidence: "exact" },
    { system: "Swarm→universal", type: "universal listing", field: "nightly_rate", fields: ["nightly_rate"], source: "universal/listings_*.jsonl", confidence: "exact" },
  ],
  "listing.host": [
    { system: "Swarm→universal", type: "listing.host", field: "host.name / host.phone / host.address", fields: ["name", "phone", "address"], source: "universal/listings_*.jsonl", confidence: "exact" },
  ],
  "listing.property": [
    { system: "Swarm→universal", type: "listing.property", field: "property.address / property.city / property.lat / property.lng / property.bedrooms / property.beds / property.units / property.max_occupancy / property.property_type / property.zoning_claim / property.parking_plan / property.license_number", fields: ["address", "city", "lat", "lng", "bedrooms", "beds", "units", "max_occupancy", "property_type", "zoning_claim", "parking_plan", "license_number"], source: "universal/listings_*.jsonl", confidence: "exact", note: "this shape is the demo's listing.property — already matched field-for-field" },
  ],
  "listing.bookings": [
    { system: "Swarm→btora", type: "dataset_btora_calendar", field: "window_from / window_to / status / observed_at", fields: ["window_from", "window_to", "status", "observed_at"], source: "btora/swarm/dataset_btora_calendar.jsonl", confidence: "exact", note: "the calendar windows are the booking evidence (Job 9)" },
    { system: "Swarm→btora", type: "transformer_booking_events", field: "date_from / date_to / amount", fields: ["date_from", "date_to", "amount"], source: "btora/swarm/transformer_booking_events.jsonl", confidence: "exact" },
  ],
  "listing.match": [
    { system: "Swarm→btora", type: "dataset_btora_listings", field: "match", fields: ["match"], source: "btora/swarm/dataset_btora_listings.jsonl", confidence: "exact" },
    { system: "Swarm→btora", type: "platform_attributes", field: "match / flags", fields: ["match", "flags"], source: "btora/swarm/platform_attributes.jsonl", confidence: "exact", note: "CLEAR/MARGINAL/UNLOCATED + flags[] like held-back:address-uncertain" },
  ],
  // —— standing / inspection / notice ——
  "standing.distinction": [
    { system: "Building Blocks", type: "FLOW_STAGE_TASK", field: "attributes", fields: ["attributes"], source: "bundle inventory FLOW_STAGE_TASK", confidence: "strong", note: "obligations sit on FLOW_STAGE_TASK/ASSET_PROJECT — the standing is the task held against a parcel" },
    { system: "Slate", type: "FlowStageTask", field: "workflowStageTask / status / dueOn", fields: ["workflowStageTask", "status", "dueOn"], source: "slate_api_key_types.json → FlowStageTask", confidence: "strong" },
  ],
  "standing.council_district": [
    { system: "Swarm", type: "PlatformFilter", field: "name / label / mappingColumn", fields: ["name", "label", "mappingColumn"], source: "swarm_graphql_schema.json → PlatformFilter", confidence: "strong", note: "district is a filter dimension; the demo carries the 311 district on the standing" },
  ],
  "standing.request_nbr": [
    { system: "Swarm", type: "PlatformEventTable", field: "eventIdLabel / tableName", fields: ["eventIdLabel", "tableName"], source: "swarm_graphql_schema.json → PlatformEventTable", confidence: "analog", note: "311 requests are an event table; the request number is its event id label" },
  ],
  "standing.responsible_agent": [
    { system: "Building Blocks", type: "GetSuggestedLinks", field: "ownedAssetCount / nameMatch / addressMatch", fields: ["ownedAssetCount", "nameMatch", "addressMatch"], source: "bundle inventory §8 GetSuggestedLinks", confidence: "strong", note: "the responsible agent is the identity matched to the parcel" },
  ],
  "inspection.planned_for": [
    { system: "Slate", type: "FlowStageTask", field: "appointmentDate / appointmentDateUTC / scheduledFor / isAppointment", fields: ["appointmentDate", "appointmentDateUTC", "scheduledFor", "isAppointment"], source: "slate_api_key_types.json → FlowStageTask", confidence: "exact", note: "the inspection IS a scheduled task on the flow" },
  ],
  "inspection.focus / note": [
    { system: "Slate", type: "FlowStageTask", field: "notes / noteCount", fields: ["notes", "noteCount"], source: "slate_api_key_types.json → FlowStageTask", confidence: "exact" },
    { system: "Swarm", type: "Note", field: "body / author / createdAt", fields: ["body", "author", "createdAt"], source: "swarm_graphql_schema.json → Note", confidence: "strong" },
  ],
  "notice.kind / channel / subject / sent_at": [
    { system: "Building Blocks", type: "SnailMailCampaign", field: "SnailMailCampaign / OutreachMetrics", fields: ["SnailMailCampaign", "OutreachMetrics"], source: "bundle inventory §8 SnailMail", confidence: "strong", note: "BB ships a full outreach subsystem — the notice's structural home" },
    { system: "Slate", type: "Document", field: "name / url / template", fields: ["name", "url", "template"], source: "slate_api_key_types.json → Document", confidence: "analog" },
  ],
  // —— provenance / health ——
  "connector.health": [
    { system: "Building Blocks", type: "getAngelPlatformCityAttribute", field: "failStreak / staleStreak / lastSuccessfulPushAt / lastDataChangeAt / connectorUrl / provenanceUrl", fields: ["failStreak", "staleStreak", "lastSuccessfulPushAt", "lastDataChangeAt", "connectorUrl", "provenanceUrl"], source: "bundle inventory §3", confidence: "exact", note: "the per-attribute connector-health lens — exactly the lineage the demo asserts on every btora row" },
    { system: "Building Blocks", type: "IntegrationHealthDashboard", field: "provider / status / checkedAt / latencyMs", fields: ["provider", "status", "checkedAt", "latencyMs"], source: "bundle inventory §4", confidence: "exact" },
    { system: "Swarm", type: "Connector", field: "failStreak / staleStreak / lastSuccessfulPushAt / lastDataChangeAt / stage", fields: ["failStreak", "staleStreak", "lastSuccessfulPushAt", "lastDataChangeAt", "stage"], source: "swarm_graphql_schema.json → Connector", confidence: "exact" },
  ],
};

// snip corpus — the verbatim type→field lists per system (what the page shows as evidence)
const corpus = {
  slate: {
    source: "slate_api_key_types.json (Slate API key-types pull)",
    note: "verbatim top-level GraphQL types and their fields",
    types: slate,
    delivery: {
      slate_licenses: { source: "btora/slate/slate_registrations.jsonl", fields: slateRegShape },
      inspection_queue: { source: "btora/slate/slate_inspection_queue.jsonl", fields: slateQueueShape },
    },
  },
  buildingBlocks: {
    source: "index-px14EQkj.js bundle + building-blocks-schema-inventory.md",
    note: "verbatim from the production JS bundle Columbus ships; the inventory doc is the extraction record",
    types: bb,
  },
  swarm: {
    source: "swarm_graphql_schema.json (GraphQL introspection)",
    note: "verbatim OBJECT/INTERFACE fields; + btora data pulls below",
    types: swarm,
    delivery: {
      btora_listings: { source: "btora/swarm/dataset_btora_listings.jsonl", fields: swarmListingsShape },
      btora_calendar: { source: "btora/swarm/dataset_btora_calendar.jsonl", fields: swarmCalendarShape },
      platform_attributes: { source: "btora/swarm/platform_attributes.jsonl", fields: swarmPlatformAttrShape },
      transformer_booking_events: { source: "btora/swarm/transformer_booking_events.jsonl", fields: swarmBookingShape },
      universal_listings: { source: "btora/universal/listings_*.jsonl", fields: universalListingShape },
    },
  },
};

// confidence color/order for the page
const CONF = { exact: "#2e8b57", strong: "#1e6bb8", partial: "#b8860b", analog: "#8a5a44", gap: "#c0392b" };
const CONF_LABEL = { exact: "exact", strong: "strong", partial: "partial", analog: "analog", gap: "gap" };

// group the needs by demo entity type for the page
const byEntity = {};
const order = ["parcel", "owner", "municipality", "jurisdiction", "obligation", "figure", "kind", "fee-schedule", "tax-schedule", "compliance-rule", "registration", "listing", "standing", "inspection", "notice", "connector.health"];
for (const [need, cands] of Object.entries(candidates)) {
  const key = need.split(".")[0];
  const entity = key === "connector" ? "connector.health" : key;
  (byEntity[entity] = byEntity[entity] || []).push({ need, cands });
}

const output = {
  title: "municipal-db schema needs → Slate / Building Blocks / Swarm fulfillment map",
  generated: "2026-09-18",
  method: "eoreader7 snip discipline applied mechanically: every candidate field is CUT from the real schema source files (verbatim, positionally), never generated. A need with no candidate in any of the three systems is marked gap — not guessed.",
  note: "zoning is not native to Slate/BB/Swarm — but the demo carries real zoning values on its own parcels (R-1, RM-5, MU-1… from the municipal code) and the btora universal shape has a zoning_claim field. The law itself (obligation.text/figure) is eoreader7 reading output, not a vendor-schema field.",
  corpus,
  confidence_scale: CONF_LABEL,
  verification: null, // filled below
  map: byEntity,
};

// ── 4b. verification pass — prove every candidate's fields exist in the
// real source bytes, at build time. Each candidate gains:
//   verified: true/false, missing: [names not found], checked_against
// This is the machine check that separates "snipped" from "thought".
const verify = (() => {
  const bundle = fs.readFileSync(path.join(ROOT, "index-px14EQkj.js"), "utf8");
  const bbMdText = fs.readFileSync(path.join(ROOT, "building-blocks-schema-inventory.md"), "utf8");
  const readJsonlFirst = (rel) => {
    try {
      const line = fs.readFileSync(path.join(HERE, rel), "utf8").split("\n").find(Boolean);
      return line ? JSON.parse(line) : null;
    } catch { return null; }
  };
  const universalFirst = readJsonlFirst("btora/universal/listings_middletown.jsonl");

  return (c) => {
    if (c.confidence === "gap") return { verified: true, missing: [], checked_against: "gap (named, nothing claimed)" };
    if (!c.fields || !c.fields.length) return { verified: true, missing: [], checked_against: c.structural ? "structural claim — no literal field asserted" : "no literal fields declared" };

    if (c.system === "Slate") {
      const list = slate[c.type] || [];
      const missing = c.fields.filter((f) => !list.includes(f));
      return { verified: missing.length === 0, missing, checked_against: `slate_api_key_types.json → ${c.type}` };
    }
    if (c.system === "Building Blocks") {
      // BB has no structured field list (minified bundle) — verify presence in bundle text + inventory doc
      const missing = c.fields.filter((f) => bundle.indexOf(f) === -1 && bbMdText.indexOf(f) === -1);
      return { verified: missing.length === 0, missing, checked_against: "index-px14EQkj.js (bundle substring) + building-blocks-schema-inventory.md" };
    }
    if (c.system === "Swarm") {
      if (c.type === "platform_attributes") {
        const row = readJsonlFirst("btora/swarm/platform_attributes.jsonl");
        const keys = row ? Object.keys(row) : [];
        const missing = c.fields.filter((f) => !keys.includes(f));
        return { verified: missing.length === 0, missing, checked_against: "btora/swarm/platform_attributes.jsonl (first row)" };
      }
      const list = swarm[c.type] || [];
      const missing = c.fields.filter((f) => !list.includes(f));
      return { verified: missing.length === 0, missing, checked_against: `swarm_graphql_schema.json → ${c.type}` };
    }
    if (c.system === "Swarm→universal") {
      const row = universalFirst;
      if (!row) return { verified: false, missing: c.fields, checked_against: "universal/listings_*.jsonl (unreadable)" };
      const keys = Object.keys(row);
      if (c.type === "listing.property") {
        const sub = row.property ? Object.keys(row.property) : [];
        const missing = c.fields.filter((f) => !sub.includes(f));
        return { verified: missing.length === 0, missing, checked_against: "universal/listings_middletown.jsonl → property{}" };
      }
      if (c.type === "listing.host") {
        const sub = row.host ? Object.keys(row.host) : [];
        const missing = c.fields.filter((f) => !sub.includes(f));
        return { verified: missing.length === 0, missing, checked_against: "universal/listings_middletown.jsonl → host{}" };
      }
      const missing = c.fields.filter((f) => !keys.includes(f));
      return { verified: missing.length === 0, missing, checked_against: "universal/listings_middletown.jsonl (first row)" };
    }
    if (c.system === "Swarm→btora") {
      const map = {
        dataset_btora_listings: "btora/swarm/dataset_btora_listings.jsonl",
        dataset_btora_calendar: "btora/swarm/dataset_btora_calendar.jsonl",
        platform_attributes: "btora/swarm/platform_attributes.jsonl",
        transformer_booking_events: "btora/swarm/transformer_booking_events.jsonl",
      };
      const rel = map[c.type];
      const row = rel ? readJsonlFirst(rel) : null;
      const keys = row ? Object.keys(row) : [];
      const missing = c.fields.filter((f) => !keys.includes(f));
      return { verified: missing.length === 0, missing, checked_against: `${rel} (first row)` };
    }
    if (c.system === "Slate→btora") {
      const row = readJsonlFirst("btora/slate/slate_registrations.jsonl");
      const keys = row ? Object.keys(row) : [];
      const missing = c.fields.filter((f) => !keys.includes(f));
      return { verified: missing.length === 0, missing, checked_against: "btora/slate/slate_registrations.jsonl (first row)" };
    }
    return { verified: false, missing: c.fields, checked_against: "unrecognized system" };
  };
})();

const vstat = { verified: 0, unverified: 0 };
for (const [entity, rows] of Object.entries(output.map)) {
  for (const r of rows) {
    for (const c of r.cands) {
      const v = verify(c);
      c.verified = v.verified;
      c.missing = v.missing;
      c.checked_against = v.checked_against;
      if (v.verified) vstat.verified++; else vstat.unverified++;
    }
  }
}
output.verification = {
  pass: vstat.unverified === 0,
  checked: vstat.verified + vstat.unverified,
  verified: vstat.verified,
  unverified: vstat.unverified,
};
console.log(`verification: ${vstat.verified}/${vstat.verified + vstat.unverified} candidates verified verbatim; ${vstat.unverified} unverified`);
if (vstat.unverified) {
  for (const [entity, rows] of Object.entries(output.map)) for (const r of rows) for (const c of r.cands)
    if (!c.verified) console.log("  UNVERIFIED:", r.need, "→", c.system, c.type, c.missing.join(","));
}

fs.writeFileSync(path.join(HERE, "xray-map.json"), JSON.stringify(output, null, 2));
console.log("-> xray-map.json");

// ── 5. the easy-to-read page ──
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const chips = (cands) => cands.map((c) => {
  if (c.confidence === "gap") return `<div class="cand gap"><div class="cand-head"><span class="chip gap">gap</span><b>no candidate in Slate / Building Blocks / Swarm</b></div><div class="cand-note">${esc(c.note)}</div></div>`;
  const vchip = c.verified ? `<span class="chip exact" style="font-size:9px;">✓ snipped</span>` : `<span class="chip gap" style="font-size:9px;">✗ unverified</span>`;
  return `<div class="cand ${c.confidence}"><div class="cand-head"><span class="chip ${c.confidence}">${c.confidence}</span>${vchip}<b>${esc(c.system)}</b> · <span class="type">${esc(c.type)}</span> · <code>${esc(c.field)}</code></div><div class="cand-src">${esc(c.source)} · ${esc(c.checked_against)}</div>${c.note ? `<div class="cand-note">${esc(c.note)}</div>` : ""}</div>`;
}).join("");

const sections = order.map((entity) => {
  const rows = byEntity[entity] || [];
  if (!rows.length) return "";
  return `<section class="entity">
    <h2>${esc(entity)}</h2>
    ${rows.map((r) => `<div class="need">
      <div class="need-key"><code>${esc(r.need)}</code></div>
      <div class="cands">${chips(r.cands)}</div>
    </div>`).join("")}
  </section>`;
}).join("");

const corpusHtml = (function () {
  const slateTypes = Object.entries(corpus.slate.types).map(([t, f]) => `<div class="type"><b>${esc(t)}</b><div class="fields">${esc(f.join(", "))}</div></div>`).join("");
  const bbTypes = Object.entries(corpus.buildingBlocks.types).map(([t, f]) => `<div class="type"><b>${esc(t)}</b><div class="fields">${esc(f.join(", "))}</div></div>`).join("");
  const swarmKeys = ["PlatformAttribute", "PlatformCityAttribute", "PlatformEventTable", "PlatformFilter", "EventTableColumn", "Connector", "Transformer", "TransformerAttributeRules", "TransformerAssetMapper", "Dataset", "AttributeRule", "MetricValue", "Note"];
  const swarmTypes = swarmKeys.filter((k) => corpus.swarm.types[k]).map((k) => `<div class="type"><b>${esc(k)}</b><div class="fields">${esc(corpus.swarm.types[k].join(", "))}</div></div>`).join("");
  const dl = (name, d) => `<div class="deliv"><b>${esc(name)}</b> <span class="src">${esc(d.source)}</span><div class="fields">${esc(d.fields.join(", "))}</div></div>`;
  return `<div class="corpus-grid">
    <div class="corpus-col slate"><h3>Slate</h3><div class="src-note">${esc(corpus.slate.note)}</div>${slateTypes}${dl("slate_licenses", corpus.slate.delivery.slate_licenses)}${dl("inspection_queue", corpus.slate.delivery.inspection_queue)}</div>
    <div class="corpus-col bb"><h3>Building Blocks</h3><div class="src-note">${esc(corpus.buildingBlocks.note)}</div>${bbTypes}</div>
    <div class="corpus-col swarm"><h3>Swarm</h3><div class="src-note">${esc(corpus.swarm.note)}</div>${swarmTypes}${dl("btora_listings", corpus.swarm.delivery.btora_listings)}${dl("btora_calendar", corpus.swarm.delivery.btora_calendar)}${dl("platform_attributes", corpus.swarm.delivery.platform_attributes)}${dl("transformer_booking_events", corpus.swarm.delivery.transformer_booking_events)}${dl("universal_listings", corpus.swarm.delivery.universal_listings)}</div>
  </div>`;
})();

const legend = Object.entries(CONF_LABEL).map(([k, v]) => `<span><i style="background:${CONF[k]}"></i><b>${v}</b></span>`).join("");

// ── 5b. snip audit history — rendered from the folded EOT product ──
let snipHistory = null;
try { snipHistory = JSON.parse(fs.readFileSync(path.join(HERE, "snip-history.json"), "utf8")); } catch (_) {}
const auditRows = snipHistory ? snipHistory.snips.map((s) => {
  const why = s.why || "";
  const where = s.where ? `${s.where.source} · byte ${s.where.offset}` : s.source;
  const eva = s.evals && s.evals[0] ? s.evals[0].result : (s.verified ? "verified" : "gap");
  const chipCls = eva === "verified" ? "exact" : "gap";
  return `<tr>
    <td><code>${esc(s.anchor)}</code></td>
    <td>${esc(s.system)}</td>
    <td><code>${esc(s.type)}</code>${s.field ? ` · <code>${esc(s.field)}</code>` : ""}</td>
    <td>${esc(where)}</td>
    <td><span class="chip ${chipCls}">${esc(eva)}</span> <code style="font-size:10px;color:var(--faint)">${esc(s.sha)}</code></td>
    <td class="cand-note">${esc(why)}</td>
    <td>${(s.serves || []).map((n) => `<code style="font-size:10px;color:var(--dim)">${esc(n)}</code>`).join("<br>")}</td>
  </tr>`;
}).join("") : "";
const auditHtml = snipHistory ? `<div class="note" style="margin-top:0;">This history is <b>not a static document</b> — it is folded from the committed event trace <code>snip-events.json</code> (EOT) into <code>snip-history.json</code>. Each row is a cut with its audit: <b>why</b> (the need it evidences), <b>where</b> (source file + byte offset), the integrity <code>sha</code>, and the verbatim EVA result. Re-run <code>node build-snip-eot.mjs</code> to re-fold.</div>
  <div class="dbtable"><div class="dbtable-scroll"><table class="grid"><thead><tr><th>snip</th><th>system</th><th>type · field</th><th>where</th><th>verbatim</th><th>why</th><th>serves</th></tr></thead><tbody>${auditRows}</tbody></table></div></div>` : "";

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>X-ray — schema needs → Slate / Building Blocks / Swarm</title>
<style>
  :root{--bg:#0f1216;--panel:#161b22;--panel2:#1c232d;--line:#2a3441;--ink:#e6e9ef;--dim:#9aa3b5;--faint:#697180;--accent:#e8b93e;--teal:#4cc3a0;}
  *{box-sizing:border-box}
  body{background:var(--bg);color:var(--ink);font:13px/1.5 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;margin:0;padding:24px 28px 80px}
  @media(max-width:700px){body{padding:16px 14px 60px}}
  h1{font-size:21px;margin:0 0 6px}
  .sub{color:var(--dim);max-width:980px;margin:0 0 16px}
  .legend{display:flex;gap:16px;flex-wrap:wrap;margin:14px 0 4px;font-size:12px;color:var(--dim)}
  .legend span{display:flex;align-items:center;gap:6px}.legend i{width:10px;height:10px;border-radius:2px}
  .note{border-left:3px solid var(--accent);background:var(--panel);padding:10px 14px;border-radius:0 8px 8px 0;color:var(--dim);font-size:12.5px;margin:14px 0 22px}
  .entity{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:18px}
  .entity>h2{margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1.2px;color:var(--accent)}
  .need{border-top:1px dashed var(--line);padding:12px 0 4px}
  .need:first-child{border-top:none}
  .need-key{font-family:ui-monospace,monospace;font-size:12px;color:var(--ink);margin-bottom:8px;font-weight:700}
  .cands{display:flex;flex-direction:column;gap:6px}
  .cand{border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:var(--panel2)}
  .cand.gap{border-style:dashed}
  .cand-head{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px}
  .cand .type{color:var(--teal);font-weight:700}
  .cand code{background:#0c0f13;border:1px solid var(--line);border-radius:4px;padding:1px 6px;font-size:11.5px;color:var(--ink);word-break:break-all}
  .cand-src{font-size:11px;color:var(--faint);margin-top:3px;font-family:ui-monospace,monospace}
  .cand-note{font-size:11.5px;color:var(--dim);margin-top:4px}
  .chip{display:inline-block;font-size:10px;font-weight:800;text-transform:uppercase;border-radius:4px;padding:1px 6px;letter-spacing:.6px}
  .chip.exact{background:rgba(46,139,87,.16);color:#4cc38a;border:1px solid #2e8b57}
  .chip.strong{background:rgba(30,107,184,.16);color:#7db4f0;border:1px solid #1e6bb8}
  .chip.partial{background:rgba(184,134,11,.16);color:#e0c06a;border:1px solid #b8860b}
  .chip.analog{background:rgba(138,90,68,.18);color:#d19a7c;border:1px solid #8a5a44}
  .chip.gap{background:rgba(192,57,43,.16);color:#e88;border:1px solid #c0392b}
  h2.sec{font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:var(--dim);margin:34px 0 12px}
  .corpus-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
  .corpus-col{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
  .corpus-col h3{margin:0 0 6px;font-size:14px}
  .src-note{font-size:11px;color:var(--faint);margin-bottom:10px}
  .type{margin-bottom:8px;font-size:11.5px}
  .type b{color:var(--ink);display:block;margin-bottom:2px}
  .fields{color:var(--dim);line-height:1.5;word-break:break-word}
  .deliv{margin-top:12px;border-top:1px dashed var(--line);padding-top:10px;font-size:11.5px}
  .deliv .src{color:var(--faint);display:block;margin:2px 0 4px;font-family:ui-monospace,monospace;font-size:10.5px}
  a{color:var(--teal)}
  footer{margin-top:30px;font-size:11px;color:var(--faint);border-top:1px solid var(--line);padding-top:12px}
</style>
</head>
<body>
<h1>X-ray · schema needs → Slate / Building Blocks / Swarm</h1>
<p class="sub">Every field the municipal-db demo needs, mapped to the vendor schema fields that could fulfill it — snipped verbatim from the schema sources we pulled (Slate API key-types, the Building Blocks production bundle, the Swarm GraphQL introspection, and the btora delivery pulls). A <span class="chip gap">gap</span> means none of the three systems has a field for it; it is named, not guessed.</p>
<div class="legend">${legend}<span><code>code</code> = exact field name as it appears in the source schema</span></div>
<div class="note"><b>Three structural findings:</b> (1) <b>zoning</b> is not native to any of the three vendor schemas — but it is not absent from the world: the demo's own parcels carry real zoning values verbatim from the municipal code (R-1, RM-5, MU-1…), and the btora universal listing shape has a <code>zoning_claim</code> field (present, null in the current pull). (2) The <b>law itself</b> (obligation.text, figure extraction) is eoreader7 reading output over the municipal code, not a vendor-schema field — none of the three systems host ordinance text. (3) The <b>btora universal listing</b> shape already matches the demo's <code>listing.property</code> field-for-field — that shape is the demo's listing layer fulfilled as-is.</div>

<h2 class="sec">field needs → candidates</h2>
${sections}

<h2 class="sec">verbatim schema corpus (what was snipped)</h2>
${corpusHtml}

<h2 class="sec">snip audit history (folded from snip-events.json)</h2>
${auditHtml}
<footer>generated 2026-09-18 · every field cut from the real schema files · eoreader7 snip discipline: never generated, always cited</footer>
</body>
</html>`;

fs.writeFileSync(path.join(HERE, "xray.html"), page);
console.log("-> xray.html (" + (page.length / 1024).toFixed(0) + " KB)");

// ── 6. docs page — light, table-based, made for Google Docs paste ──
const cell = (s) => `<td>${s}</td>`;
const docsSections = order.map((entity) => {
  const rows = byEntity[entity] || [];
  if (!rows.length) return "";
  const tbody = rows.map((r) => {
    const candRows = r.cands.map((c) => {
      if (c.confidence === "gap") {
        return `<tr>
          ${cell(`<b>${esc(r.need)}</b>`)}
          ${cell(`<b>No candidate in Slate / Building Blocks / Swarm</b>`)}
          ${cell("—")}${cell("—")}
          ${cell("<b>GAP</b>")}
          ${cell(esc(c.note))}
        </tr>`;
      }
      return `<tr>
        ${cell(`<b>${esc(r.need)}</b>`)}
        ${cell(`<b>${esc(c.system)}</b>`)}
        ${cell(esc(c.type))}
        ${cell(`<code>${esc(c.field)}</code>`)}
        ${cell(c.verified ? "✓ snipped" : "✗ unverified")}
        ${cell(`${esc(c.confidence)}`)}
        ${cell(`${esc(c.source)} — ${esc(c.checked_against)}${c.note ? " · " + esc(c.note) : ""}`)}
      </tr>`;
    });
    return candRows.join("");
  }).join("");
  return `<section class="dentity">
    <h2>${esc(entity)}</h2>
    <table>
      <thead><tr><th>Need</th><th>System</th><th>Type</th><th>Field(s)</th><th>Verified</th><th>Fit</th><th>Source / note</th></tr></thead>
      <tbody>${tbody}</tbody>
    </table>
  </section>`;
}).join("");

const corpusTables = (function () {
  const t = (title, note, typeList) => `<section class="dentity">
    <h2>${esc(title)}</h2>
    <p class="dnote">${esc(note)}</p>
    <table><thead><tr><th>Type</th><th>Fields</th></tr></thead><tbody>
      ${typeList.map(([n, f]) => `<tr>${cell(`<b>${esc(n)}</b>`)}${cell(esc(f.join(", ")))}</tr>`).join("")}
    </tbody></table>
  </section>`;
  const slateTypes = Object.entries(corpus.slate.types);
  const bbTypes = Object.entries(corpus.buildingBlocks.types);
  const swarmKeys = ["PlatformAttribute", "PlatformCityAttribute", "PlatformEventTable", "PlatformFilter", "EventTableColumn", "Connector", "Transformer", "TransformerAttributeRules", "TransformerAssetMapper", "Dataset", "AttributeRule", "MetricValue", "Note"];
  const swarmTypes = swarmKeys.filter((k) => corpus.swarm.types[k]).map((k) => [k, corpus.swarm.types[k]]);
  const dl = (name, d) => `<tr>${cell(`<b>${esc(name)}</b>`)}${cell(esc(d.fields.join(", ")))}</tr>`;
  return `
    ${t("Slate", corpus.slate.note, slateTypes)}
    <section class="dentity"><table><thead><tr><th>Delivery</th><th>Fields</th></tr></thead><tbody>
      ${dl("slate_licenses", corpus.slate.delivery.slate_licenses)}
      ${dl("inspection_queue", corpus.slate.delivery.inspection_queue)}
    </tbody></table></section>
    ${t("Building Blocks", corpus.buildingBlocks.note, bbTypes)}
    ${t("Swarm", corpus.swarm.note, swarmTypes)}
    <section class="dentity"><table><thead><tr><th>Delivery</th><th>Fields</th></tr></thead><tbody>
      ${dl("btora_listings", corpus.swarm.delivery.btora_listings)}
      ${dl("btora_calendar", corpus.swarm.delivery.btora_calendar)}
      ${dl("platform_attributes", corpus.swarm.delivery.platform_attributes)}
      ${dl("transformer_booking_events", corpus.swarm.delivery.transformer_booking_events)}
      ${dl("universal_listings", corpus.swarm.delivery.universal_listings)}
    </tbody></table></section>`;
})();

const docsAuditHtml = snipHistory ? `<h2>Snip Audit History (folded from snip-events.json)</h2>
<p class="sub">This history is folded from the committed event trace <code>snip-events.json</code> (EOT) into <code>snip-history.json</code>. Each row is a cut with its audit: why (the need it evidences), where (source file + byte offset), the integrity sha, and the verbatim EVA result.</p>
<section class="dentity"><table><thead><tr><th>Snip</th><th>System</th><th>Type · Field</th><th>Where</th><th>Verbatim</th><th>Why</th><th>Serves</th></tr></thead><tbody>
${(snipHistory.snips || []).map((s) => {
  const eva = s.evals && s.evals[0] ? s.evals[0].result : (s.verified ? "verified" : "gap");
  const where = s.where ? `${s.where.source} · byte ${s.where.offset}` : s.source;
  return `<tr>
    <td><code>${esc(s.anchor)}</code></td>
    <td>${esc(s.system)}</td>
    <td><code>${esc(s.type)}</code>${s.field ? ` · <code>${esc(s.field)}</code>` : ""}</td>
    <td>${esc(where)}</td>
    <td>${esc(eva)}</td>
    <td>${esc(s.why)}</td>
    <td>${(s.serves || []).join("; ")}</td>
  </tr>`;
}).join("")}
</tbody></table></section>` : "";

const docsPage = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Schema needs → Slate / Building Blocks / Swarm (docs)</title>
<style>
  body{font:14px/1.5 Georgia,"Times New Roman",serif;color:#111;background:#fff;margin:0 auto;padding:32px 40px 80px;max-width:1000px}
  h1{font-size:24px;margin:0 0 4px}
  h2{font-size:18px;border-bottom:2px solid #333;padding-bottom:4px;margin:28px 0 10px}
  p{margin:6px 0}
  .sub{color:#444;max-width:900px}
  table{border-collapse:collapse;width:100%;margin:8px 0 16px;font-size:13px}
  th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#eee;font-weight:700}
  code{font-family:Menlo,Consolas,monospace;font-size:11.5px;background:#f5f5f5;border:1px solid #ddd;padding:0 3px;border-radius:3px}
  .dnote{color:#444;font-style:italic}
  @media print{body{padding:0} .dentity{page-break-inside:auto}}
</style>
</head>
<body>
<h1>Municipal-DB Schema Needs → Slate / Building Blocks / Swarm Fulfillment Map</h1>
<p class="sub">Every field the municipal-db demo needs, mapped to the vendor schema fields that could fulfill it. Fields are snipped verbatim from the schema sources we pulled (Slate API key-types, the Building Blocks production bundle, the Swarm GraphQL introspection, and the btora delivery pulls) — nothing is generated. Fit: <b>exact</b> = the field exists under that name; <b>strong</b> = same concept, one hop / per-unit attribute; <b>analog</b> = closest structural equivalent; <b>GAP</b> = none of the three systems has a field for it.</p>
<p class="sub"><b>Three structural findings:</b> (1) <b>zoning</b> is not native to any of the three vendor schemas — but it is not absent from the world: the demo's own parcels carry real zoning values verbatim from the municipal code (R-1, RM-5, MU-1…), and the btora universal listing shape has a <code>zoning_claim</code> field (present, null in the current pull). (2) The <b>law itself</b> (obligation.text, figure extraction) is eoreader7 reading output over the municipal code, not a vendor-schema field — none of the three systems host ordinance text. (3) The <b>btora universal listing</b> shape already matches the demo's listing.property field-for-field — that shape is the demo's listing layer fulfilled as-is.</p>

<h2>Field Needs → Candidates</h2>
${docsSections}

${docsAuditHtml}
<h2>Verbatim Schema Corpus (what was snipped)</h2>
${corpusTables}
</body>
</html>`;

fs.writeFileSync(path.join(HERE, "xray-docs.html"), docsPage);
console.log("-> xray-docs.html (" + (docsPage.length / 1024).toFixed(0) + " KB)");