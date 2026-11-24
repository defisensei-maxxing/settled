// Persistent, tamper-evident bounty state.
//   .settled/ledger/<id>.ndjson  append-only, hash-chained events (the source of truth for status)
//   (simulated escrow is derived from these ledgers: see escrow.js)
const fs = require("fs");
const path = require("path");
const { sha256, canonical, SettledError } = require("./util");

const GENESIS = "0".repeat(64);
// Allowed transitions: event type -> [required current status, resulting status]
const TRANSITIONS = {
  posted: [["draft"], "open"],
  claimed: [["open"], "claimed"],
  verify_failed: [["claimed", "verified"], "claimed"],
  verify_passed: [["claimed", "verified"], "verified"],
  paid: [["verified"], "paid"],
  // Maintainer withdraws the bounty (e.g. superseded by a new flow version). Not allowed once a
  // solver holds a passing verification: that solver is owed the payout.
  cancelled: [["open", "claimed"], "cancelled"],
};

const ledgerDir = (root) => path.join(root, ".settled", "ledger");
const ledgerPath = (root, id) => path.join(ledgerDir(root), id + ".ndjson");
const eventHash = (e) => sha256(canonical({ ...e, hash: undefined }));

function readEvents(root, id) {
  const p = ledgerPath(root, id);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l, i) => {
    try { return JSON.parse(l); } catch { throw new SettledError(`ledger ${id}: line ${i + 1} is not valid JSON`); }
  });
}

// Verify the hash chain and replay transitions. Returns { status, events }.
function replay(root, id) {
  const events = readEvents(root, id);
  let prev = GENESIS, status = "draft";
  events.forEach((e, i) => {
    if (e.seq !== i + 1) throw new SettledError(`ledger ${id}: event ${i + 1} has seq ${e.seq}`);
    if (e.prev !== prev) throw new SettledError(`ledger ${id}: chain broken at seq ${e.seq} (prev mismatch)`);
    if (eventHash(e) !== e.hash) throw new SettledError(`ledger ${id}: event ${e.seq} was modified (hash mismatch)`);
    const t = TRANSITIONS[e.type];
    if (!t) throw new SettledError(`ledger ${id}: unknown event type ${e.type}`);
    if (!t[0].includes(status)) throw new SettledError(`ledger ${id}: illegal transition ${status} -> ${e.type}`);
    status = t[1];
    prev = e.hash;
  });
  return { status, events };
}

function append(root, id, type, actor, data, now) {
  const { status, events } = replay(root, id);
  const t = TRANSITIONS[type];
  if (!t || !t[0].includes(status)) throw new SettledError(`cannot ${type}: bounty is ${status}`);
  const prev = events.length ? events[events.length - 1].hash : GENESIS;
  const e = { seq: events.length + 1, type, at: now().toISOString(), actor, data, prev };
  e.hash = eventHash(e);
  fs.mkdirSync(ledgerDir(root), { recursive: true });
  fs.appendFileSync(ledgerPath(root, id), JSON.stringify(e) + "\n");
  return { event: e, status: t[1] };
}

// Every Kane session id referenced by any bounty's ledger (global replay registry).
function usedSessions(root) {
  const used = new Map();
  const dir = ledgerDir(root);
  if (!fs.existsSync(dir)) return used;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".ndjson"))) {
    const id = f.replace(/\.ndjson$/, "");
    for (const e of readEvents(root, id)) for (const s of (e.data && e.data.sessions) || []) used.set(s, `${id}#${e.seq}`);
  }
  return used;
}

// Single-writer lock so two commands can't interleave ledger appends.
function withLock(root, fn) {
  const p = path.join(root, ".settled", ".lock");
  let fd;
  try { fd = fs.openSync(p, "wx"); } catch { throw new SettledError(`another settled command holds ${p} (delete it if stale)`); }
  try { return fn(); } finally { fs.closeSync(fd); fs.rmSync(p, { force: true }); }
}
async function withLockAsync(root, fn) {
  const p = path.join(root, ".settled", ".lock");
  let fd;
  try { fd = fs.openSync(p, "wx"); } catch { throw new SettledError(`another settled command holds ${p} (delete it if stale)`); }
  try { return await fn(); } finally { fs.closeSync(fd); fs.rmSync(p, { force: true }); }
}

module.exports = { TRANSITIONS, readEvents, replay, append, usedSessions, withLock, withLockAsync, ledgerPath };
