// fold-sample.mjs — execute the Btora fold sample as an INSTRUCTION SET.
//
// The file fold/btora_fold_events.json is not data to import. It IS the
// program: a sequence of INS / CON / DEF / EVA instructions. This script is a
// small interpreter for that instruction set (same semantics as the app's
// fold: chronological order, entities created only by INS, CON against a
// missing anchor is a cartesian-product violation, EVA with no prior DEF is
// a criterionless judgment). Instructions whose target anchor lives outside
// the sample (parcel anchors in the main corpus) are reported as DEFERRED
// links, not violations — they resolve when this sample is appended to the
// full log.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ops = JSON.parse(fs.readFileSync(path.join(HERE, "fold", "btora_fold_events.json"), "utf8"));

// ── interpreter state ────────────────────────────────────────────────────────
const entities = new Map(); // anchor -> { type, payload, defs: Set, evals: [] }
const connections = [];
const violations = [];
let deferred = 0;

for (const inst of ops) {
  switch (inst.op) {
    case "INS": {
      entities.set(inst.anchor, { type: inst.entity_type, payload: inst.payload, defs: new Set(), evals: [] });
      break;
    }
    case "CON": {
      const src = entities.has(inst.source_anchor);
      const tgt = entities.has(inst.target_anchor);
      if (!src || !tgt) {
        if (inst.relation_type === "asserts_use_of" && src && !tgt) {
          deferred++; // parcel anchor lives in the main corpus — resolves on append
        } else {
          violations.push({ type: "cartesian_product", op: "CON", source: inst.source_anchor, target: inst.target_anchor });
        }
        break;
      }
      connections.push({ source: inst.source_anchor, target: inst.target_anchor, rel: inst.relation_type });
      break;
    }
    case "DEF": {
      const e = entities.get(inst.anchor);
      if (!e) { violations.push({ type: "missing_ins", op: "DEF", anchor: inst.anchor }); break; }
      e.defs.add(inst.criterion || "canon");
      break;
    }
    case "EVA": {
      const e = entities.get(inst.anchor);
      if (!e) { violations.push({ type: "missing_ins", op: "EVA", anchor: inst.anchor }); break; }
      if (e.defs.size === 0) { violations.push({ type: "criterionless_judgment", op: "EVA", anchor: inst.anchor }); break; }
      e.evals.push({ criterion: inst.criterion, result: inst.result });
      break;
    }
    default:
      violations.push({ type: "unknown_instruction", op: inst.op });
  }
}

const byType = {};
for (const e of entities.values()) byType[e.type] = (byType[e.type] || 0) + 1;
console.log(`instructions: ${ops.length}, entities: ${entities.size}, connections: ${connections.length}, deferred: ${deferred}, violations: ${violations.length}`);
if (violations.length) { console.log(violations.slice(0, 5)); process.exit(1); }
console.log("by type:", JSON.stringify(byType));
console.log("fold sample executes clean — genuine instructions only, no exports involved.");
