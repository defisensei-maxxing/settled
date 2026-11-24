// Settled fingerprint = first 16 hex chars of SHA-256 over the locked flow text,
// trimmed of surrounding whitespace (so a trailing newline in the .md file doesn't matter).
// Usage: node scripts/fingerprint.js [bounty-id]   (default: cart-badge-wrong)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const id = process.argv[2] || "cart-badge-wrong";
const root = path.join(__dirname, "..", ".settled");
const flow = fs.readFileSync(path.join(root, "flows", id + ".locked.md"), "utf8").trim();
const fp = crypto.createHash("sha256").update(flow, "utf8").digest("hex").slice(0, 16);
const bounty = JSON.parse(fs.readFileSync(path.join(root, "bounties", id + ".json"), "utf8"));
const ok = fp === bounty.fingerprint && flow === bounty.locked_flow.trim();
console.log(JSON.stringify({ id, computed: fp, stored: bounty.fingerprint, match: ok }));
process.exit(ok ? 0 : 1);
