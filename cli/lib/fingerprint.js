// settled-fp-v2: full SHA-256 over the trimmed locked flow, the trimmed guard flow, and a combined hash.
//   combined = sha256("settled-fp-v2\n" + id + "\n" + lockedHash + "\n" + guardHash)
const fs = require("fs");
const path = require("path");
const { sha256, readJSON } = require("./util");

const SCHEME = "settled-fp-v2";

function readFlows(root, id) {
  const f = (kind) => fs.readFileSync(path.join(root, ".settled", "flows", `${id}.${kind}.md`), "utf8").trim();
  return { locked: f("locked"), guard: f("guard") };
}

function computeFromText(id, flows) {
  const fp = { algorithm: "sha256", scheme: SCHEME, locked: sha256(flows.locked), guard: sha256(flows.guard) };
  fp.combined = sha256(`${SCHEME}\n${id}\n${fp.locked}\n${fp.guard}`);
  return fp;
}

// Compare flow files, the bounty JSON copy of the flow text, and the stored hashes.
function check(root, id) {
  const flows = readFlows(root, id);
  const computed = computeFromText(id, flows);
  const bounty = readJSON(path.join(root, ".settled", "bounties", id + ".json"));
  const stored = bounty.fingerprint || {};
  const checks = {
    locked_hash: stored.locked === computed.locked,
    guard_hash: stored.guard === computed.guard,
    combined_hash: stored.combined === computed.combined,
    locked_text: (bounty.locked_flow || "").trim() === flows.locked,
    guard_text: (bounty.guard_flow || "").trim() === flows.guard,
  };
  return { id, match: Object.values(checks).every(Boolean), checks, computed, stored, flows };
}

module.exports = { SCHEME, readFlows, computeFromText, check };
