#!/usr/bin/env node
// Redact identity / session data from Settled evidence before it is committed or shared.
// Rewrites text files in place and re-packs Kane .evidence zips (needs the system `zip`/`unzip`).
// Records what changed in <dir>/REDACTIONS.json (pre-redaction sha256 per file) and regenerates SHA256SUMS.
//
// Usage: node scripts/redact-evidence.js <evidence-dir> [...more dirs]
//        node scripts/redact-evidence.js --check <dir>   exit 1 if anything sensitive remains
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const TEXT_EXT = new Set([".json", ".ndjson", ".yaml", ".yml", ".log", ".md", ".txt", ".har", ".py", ".stderr", ".exit", ".example", ""]);

// Patterns that must never appear in committed evidence.
const RULES = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<redacted-email>"],
  [/("(?:username|user_name|tms_user|user|email|user_email)"\s*:\s*")[^"]*(")/gi, "$1<redacted-user>$2"],
  [/(\b(?:user_name|username|tms_user|user_email)\s*:\s*)\S+/gi, "$1<redacted-user>"],
  [/("(?:user_id|org_id|account_id|userId|orgId)"\s*:\s*)("?)[^,}"]+\2/g, "$1\"<redacted-id>\""],
  [/(^\s*(?:user_id|org_id|account_id):\s*)(['"]?)\d+\2/gm, "$1'<redacted-id>'"],
  [/(\/share\/)[A-Za-z0-9_-]{16,}/g, "$1<redacted-share-token>"],
  [/((?:access|refresh|id|auth|api)[_-]?(?:token|key)"?\s*[:=]\s*"?)[A-Za-z0-9._\-]{8,}/gi, "$1<redacted-token>"],
  [/(authorization"?\s*[:=]\s*"?(?:bearer|basic)\s+)[A-Za-z0-9._~+\/=-]+/gi, "$1<redacted-token>"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "<redacted-jwt>"],
  [/\/Users\/[^/"'\s]+\//g, "~/"],
  [/\/home\/[^/"'\s]+\//g, "~/"],
];
const isTextFile = (f) => TEXT_EXT.has(path.extname(f).toLowerCase());

function collectUsernames(text) {
  const names = new Set();
  for (const re of [/"(?:username|tms_user|user_name)"\s*:\s*"([^"<]+)"/gi, /\b(?:user_name|username)\s*:\s*([^\s"<]+)/gi]) {
    for (const m of text.matchAll(re)) if (m[1].length >= 3) names.add(m[1]);
  }
  return names;
}

function redactText(text, extraNames) {
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  for (const n of extraNames) out = out.split(n).join("<redacted-user>");
  return out;
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

function findings(text) {
  const hits = [];
  for (const [re] of RULES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(new RegExp(re.source, re.flags))) {
      if (!/<redacted|^~\/$/.test(m[0]) && !m[0].includes("<redacted")) hits.push(m[0].slice(0, 60));
    }
  }
  return hits;
}

function processDir(dir, check) {
  const files = walk(dir).filter((f) => !/(SHA256SUMS|REDACTIONS\.json)$/.test(f));
  // First pass: learn usernames so bare occurrences can be scrubbed too.
  const names = new Set();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "settled-redact-"));
  const zipDirs = {};
  for (const f of files) {
    if (f.endsWith(".evidence") || f.endsWith(".zip")) {
      const d = path.join(tmpRoot, sha(f).slice(0, 12));
      fs.mkdirSync(d);
      execFileSync("unzip", ["-oq", f, "-d", d]);
      zipDirs[f] = d;
      for (const g of walk(d)) if (isTextFile(g)) collectUsernames(fs.readFileSync(g, "utf8")).forEach((n) => names.add(n));
    } else if (isTextFile(f)) collectUsernames(fs.readFileSync(f, "utf8")).forEach((n) => names.add(n));
  }
  const report = { dir, redacted_at: new Date().toISOString(), rules: RULES.map(([re]) => re.source), files: {} };
  const remaining = [];
  const handle = (f, label) => {
    const before = fs.readFileSync(f, "utf8");
    if (check) { findings(before).forEach((h) => remaining.push(label + ": " + h)); for (const n of names) if (before.includes(n)) remaining.push(label + ": username"); return false; }
    const after = redactText(before, names);
    if (after !== before) { fs.writeFileSync(f, after); return sha(Buffer.from(before)); }
    return false;
  };
  for (const f of files) {
    const rel = path.relative(dir, f);
    if (zipDirs[f]) {
      const inner = {};
      for (const g of walk(zipDirs[f])) if (isTextFile(g)) { const h = handle(g, rel + "!" + path.relative(zipDirs[f], g)); if (h) inner[path.relative(zipDirs[f], g)] = h; }
      if (!check && Object.keys(inner).length) {
        const orig = sha(fs.readFileSync(f));
        fs.rmSync(f);
        execFileSync("zip", ["-qrX", path.resolve(f), "."], { cwd: zipDirs[f] });
        report.files[rel] = { pre_redaction_sha256: orig, inner_files_redacted: inner };
      }
    } else if (isTextFile(f)) {
      const h = handle(f, rel);
      if (h) report.files[rel] = { pre_redaction_sha256: h };
    }
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  if (check) return remaining;
  if (Object.keys(report.files).length) {
    const rp = path.join(dir, "REDACTIONS.json");
    const prev = fs.existsSync(rp) ? JSON.parse(fs.readFileSync(rp, "utf8")) : null;
    if (prev) report.previous = prev;
    fs.writeFileSync(rp, JSON.stringify(report, null, 2) + "\n");
  }
  writeSums(dir);
  return Object.keys(report.files);
}

function writeSums(dir) {
  const files = walk(dir).filter((f) => !f.endsWith("SHA256SUMS")).map((f) => path.relative(dir, f)).sort();
  fs.writeFileSync(path.join(dir, "SHA256SUMS"), files.map((f) => `${sha(fs.readFileSync(path.join(dir, f)))}  ./${f}`).join("\n") + "\n");
}

module.exports = { redactText, findings, processDir, writeSums };

if (require.main === module) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const dirs = args.filter((a) => !a.startsWith("--"));
  if (!dirs.length) { console.error("usage: redact-evidence.js [--check] <dir>..."); process.exit(2); }
  let bad = 0;
  for (const d of dirs) {
    const r = processDir(d, check);
    if (check) { if (r.length) { bad++; console.log(`SENSITIVE ${d}:\n  ` + [...new Set(r)].slice(0, 20).join("\n  ")); } else console.log(`clean ${d}`); }
    else console.log(`redacted ${d}: ${r.length} file(s) changed`);
  }
  process.exit(bad ? 1 : 0);
}
