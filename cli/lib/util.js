// Small shared helpers: hashing, canonical JSON, file walking, atomic writes.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

// Stable JSON (sorted keys) so hashes don't depend on key order.
function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

function walk(dir, skip = () => false) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (skip(p, e)) continue;
    if (e.isDirectory()) out.push(...walk(p, skip)); else out.push(p);
  }
  return out;
}

// Content hash of a directory tree: sha256 over "relpath\0sha256(content)\n" for every file, sorted.
function hashDir(dir) {
  const skip = (p, e) => e.isDirectory() && (e.name === "node_modules" || e.name === ".git");
  const files = walk(dir, skip).map((f) => path.relative(dir, f).split(path.sep).join("/")).sort();
  return sha256(files.map((f) => `${f}\0${sha256(fs.readFileSync(path.join(dir, f)))}\n`).join(""));
}

const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
function writeJSONAtomic(p, obj) {
  const tmp = p + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n");
  fs.renameSync(tmp, p);
}

const nonce = () => crypto.randomBytes(16).toString("hex");
const expandHome = (p) => (p && p.startsWith("~/") ? path.join(require("os").homedir(), p.slice(2)) : p);

class SettledError extends Error {
  constructor(message, details) { super(message); this.name = "SettledError"; this.details = details; }
}

module.exports = { sha256, canonical, walk, hashDir, readJSON, writeJSONAtomic, nonce, expandHome, SettledError };
