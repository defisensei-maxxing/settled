// Settled fingerprint (v2): full SHA-256 over BOTH flows, so neither the locked flow nor the guard
// flow can be softened after the bounty is funded.
//   locked   = sha256(trim(locked flow text))
//   guard    = sha256(trim(guard flow text))
//   combined = sha256("settled-fp-v2\n" + id + "\n" + locked + "\n" + guard)   <- the bounty's pin
// Text is UTF-8, trimmed of surrounding whitespace (a trailing newline in the .md file doesn't matter).
// The bounty JSON must also carry the exact same flow text as the .md files.
//
// Usage: node scripts/fingerprint.js [bounty-id] [--write]
//   default: verify, exit 0 on match, 1 on mismatch.  --write: store computed fingerprints in the bounty.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = process.argv.slice(2);
const write = args.includes("--write");
const id = args.find((a) => !a.startsWith("--")) || "cart-badge-wrong";
const root = path.join(__dirname, "..", ".settled");
const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const readFlow = (kind) => fs.readFileSync(path.join(root, "flows", `${id}.${kind}.md`), "utf8").trim();

const locked = readFlow("locked");
const guard = readFlow("guard");
const computed = { algorithm: "sha256", scheme: "settled-fp-v2", locked: sha(locked), guard: sha(guard) };
computed.combined = sha(`settled-fp-v2\n${id}\n${computed.locked}\n${computed.guard}`);

const bountyPath = path.join(root, "bounties", id + ".json");
const bounty = JSON.parse(fs.readFileSync(bountyPath, "utf8"));

if (write) {
  bounty.locked_flow = locked;
  bounty.guard_flow = guard;
  bounty.fingerprint = computed;
  fs.writeFileSync(bountyPath, JSON.stringify(bounty, null, 2) + "\n");
}

const stored = bounty.fingerprint || {};
const checks = {
  locked_hash: stored.locked === computed.locked,
  guard_hash: stored.guard === computed.guard,
  combined_hash: stored.combined === computed.combined,
  locked_text: (bounty.locked_flow || "").trim() === locked,
  guard_text: (bounty.guard_flow || "").trim() === guard,
};
const match = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ id, match, checks, computed, stored }));
process.exit(match ? 0 : 1);
