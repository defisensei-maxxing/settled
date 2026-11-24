// Settled fingerprint (settled-fp-v2): full SHA-256 over BOTH flows. Logic lives in cli/lib/fingerprint.js.
//   locked   = sha256(trim(locked flow text))
//   guard    = sha256(trim(guard flow text))
//   combined = sha256("settled-fp-v2\n" + id + "\n" + locked + "\n" + guard)
// Usage: node scripts/fingerprint.js [bounty-id] [--write]
//   default: verify, exit 0 on match, 1 on mismatch.
//   --write: maintainer only, on a DRAFT bounty: store computed fingerprints + flow text in the bounty.
//            Once posted, the ledger pins the fingerprint and re-pinning here cannot unlock it.
const fs = require("fs");
const path = require("path");
const fpLib = require("../cli/lib/fingerprint");

const args = process.argv.slice(2);
const write = args.includes("--write");
const id = args.find((a) => !a.startsWith("--")) || "cart-badge-wrong";
const root = path.join(__dirname, "..");

if (write) {
  const bountyPath = path.join(root, ".settled", "bounties", id + ".json");
  const bounty = JSON.parse(fs.readFileSync(bountyPath, "utf8"));
  if ((bounty.status || "draft") !== "draft") { console.error(`refusing --write: bounty is ${bounty.status}; flows are locked`); process.exit(1); }
  const flows = fpLib.readFlows(root, id);
  bounty.locked_flow = flows.locked;
  bounty.guard_flow = flows.guard;
  bounty.fingerprint = fpLib.computeFromText(id, flows);
  fs.writeFileSync(bountyPath, JSON.stringify(bounty, null, 2) + "\n");
}

const { flows, ...result } = fpLib.check(root, id);
console.log(JSON.stringify(result));
process.exit(result.match ? 0 : 1);
