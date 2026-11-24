// Evidence validation. A run directory holds, per flow kind (locked|guard):
//   <kind>.ndjson        raw Kane NDJSON stream      <kind>.run_end.json  the run_end event
//   <kind>.evidence      Kane evidence pack (zip)    plus fingerprint.json, SHA256SUMS, optional candidate.json
// A verdict only counts if it is CONCLUSIVE and provably from a fresh Kane run of the exact locked text.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { sha256, canonical, walk, readJSON } = require("./util");

const KINDS = ["locked", "guard"];

function parseNdjson(p) {
  return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const evType = (e) => e.type || e.event;

// Minimal YAML field readers for Kane's evidence pack (run.yaml / result.yaml).
function yamlBlock(text, key) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.startsWith(key + ":"));
  if (i < 0) return null;
  const rest = lines[i].slice(key.length + 1).trim();
  if (rest === "|-" || rest === "|" || rest === ">-") {
    const out = [];
    for (let j = i + 1; j < lines.length && (lines[j].startsWith("  ") || lines[j] === ""); j++) out.push(lines[j].slice(2));
    return out.join("\n").replace(/\n+$/, "");
  }
  return rest.replace(/^['"]|['"]$/g, "");
}
const yamlField = (text, re) => { const m = text.match(re); return m ? m[1].replace(/^['"]|['"]$/g, "") : null; };

function readPack(packPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "settled-pack-"));
  try {
    execFileSync("unzip", ["-oq", packPath, "-d", tmp]);
    const runYaml = fs.readFileSync(path.join(tmp, "run.yaml"), "utf8");
    const results = walk(tmp).filter((f) => f.endsWith(path.sep + "result.yaml"));
    const resultYaml = results.length === 1 ? fs.readFileSync(results[0], "utf8") : null;
    return {
      title: yamlBlock(runYaml, "title"),
      producer: yamlField(runYaml, /producer:\s*\n\s+name:\s*(\S+)/),
      started: yamlField(runYaml, /^started:\s*(\S+)/m),
      ended: yamlField(runYaml, /^ended:\s*(\S+)/m),
      testCount: results.length,
      resultStatus: resultYaml && yamlField(resultYaml, /^status:\s*(\S+)/m),
      sessionId: resultYaml && yamlField(resultYaml, /session_id:\s*(\S+)/),
    };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// Conclusiveness rules.
function conclusive(runEnd, mode) {
  const meta = runEnd.per_flow_metadata || [];
  const assertions = Object.keys((runEnd.context && runEnd.context.memory) || {}).length;
  if (mode === "fail") {
    if (runEnd.status !== "failed") return `expected a failure, Kane reported ${runEnd.status}`;
    if (!String(runEnd.reason_code || "").startsWith("assertion_error.")) return `failure is not a product-bug assertion (reason_code ${runEnd.reason_code}); infrastructure/agent errors are inconclusive`;
    if (!meta.some((m) => m.error_message)) return "failure has no assertion error message";
    return null;
  }
  if (runEnd.status !== "passed") return `Kane reported ${runEnd.status}: ${runEnd.reason}`;
  if (runEnd.reason_code !== "success.complete" || Number(runEnd.result_code) !== 100) return `pass is not success.complete/100 (${runEnd.reason_code}/${runEnd.result_code})`;
  if (assertions < 1) return "pass recorded no assertions (vacuous pass)";
  if (meta.some((m) => m.error_message)) return "pass carries an error message";
  return null;
}

// Validate one flow run inside a run directory.
//   opts: { flowText, mode: 'pass'|'fail', allowMock, notBefore (Date), usedSessions (Map), expectSessions }
function validateRun(dir, kind, opts) {
  const errors = [];
  const facts = { kind };
  const p = (f) => path.join(dir, `${kind}.${f}`);
  for (const f of ["ndjson", "run_end.json", "evidence"]) if (!fs.existsSync(p(f))) errors.push(`missing ${kind}.${f}`);
  if (errors.length) return { ok: false, errors, facts };

  const events = parseNdjson(p("ndjson"));
  const ends = events.filter((e) => evType(e) === "run_end");
  const start = events.find((e) => evType(e) === "stream_start");
  const rec = events.find((e) => evType(e) === "recording_state");
  if (ends.length !== 1) errors.push(`expected exactly one run_end in ${kind}.ndjson, found ${ends.length}`);
  if (!start) errors.push(`no stream_start in ${kind}.ndjson`);
  const runEnd = ends[0] || {};
  if (canonical(runEnd) !== canonical(readJSON(p("run_end.json")))) errors.push(`${kind}.run_end.json does not match the run_end in ${kind}.ndjson`);

  facts.status = runEnd.status; facts.reason = runEnd.reason; facts.reason_code = runEnd.reason_code;
  facts.credits_consumed = runEnd.credits_consumed; facts.ts = runEnd.ts;
  facts.sessionId = rec && rec.session_id;
  facts.mock = !!(runEnd.mock || runEnd.source === "mock" || (start && start.mock));

  if (facts.mock && !opts.allowMock) errors.push(`${kind}: MOCK Kane result; mocked results are never accepted as execution evidence`);

  let pack = null;
  try { pack = readPack(p("evidence")); } catch (e) { errors.push(`${kind}.evidence is not a readable Kane evidence pack: ${e.message}`); }
  if (pack) {
    facts.producer = pack.producer;
    if (pack.producer !== "kane-cli" && !(opts.allowMock && pack.producer === "kane-cli-mock")) errors.push(`${kind}: evidence pack producer is ${pack.producer}, expected kane-cli`);
    if (pack.producer === "kane-cli-mock") facts.mock = true;
    if ((pack.title || "").trim() !== opts.flowText) errors.push(`${kind}: Kane ran a different objective than the locked ${kind} flow text`);
    if (pack.testCount !== 1) errors.push(`${kind}: evidence pack has ${pack.testCount} tests, expected 1`);
    if (!facts.sessionId || pack.sessionId !== facts.sessionId) errors.push(`${kind}: session id mismatch between stream (${facts.sessionId}) and evidence pack (${pack.sessionId})`);
    // Kane marks agent/infrastructure errors as "broken" in the pack; that is a (non-conclusive) failure, not a contradiction.
    const okPackStatuses = runEnd.status === "passed" ? ["passed"] : ["failed", "broken"];
    if (!okPackStatuses.includes(pack.resultStatus)) errors.push(`${kind}: evidence pack status ${pack.resultStatus} contradicts run_end ${runEnd.status}`);
  }

  // Freshness / replay.
  const startTs = start && Date.parse(start.ts);
  const endTs = Date.parse(runEnd.ts);
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs < startTs) errors.push(`${kind}: missing or inconsistent timestamps`);
  if (opts.notBefore && Number.isFinite(startTs) && startTs < opts.notBefore.getTime()) errors.push(`${kind}: run started ${start.ts}, before this verification was issued (${opts.notBefore.toISOString()}): stale or replayed evidence`);
  if (facts.sessionId && opts.usedSessions && opts.usedSessions.has(facts.sessionId)) errors.push(`${kind}: Kane session ${facts.sessionId} was already used (${opts.usedSessions.get(facts.sessionId)}): replay rejected`);
  if (opts.expectSessions && facts.sessionId !== opts.expectSessions[kind]) errors.push(`${kind}: session ${facts.sessionId} is not the one recorded at verification (${opts.expectSessions[kind]})`);

  const why = conclusive(runEnd, opts.mode);
  if (why) errors.push(`${kind}: not conclusive: ${why}`);
  return { ok: errors.length === 0, errors, facts };
}

// Every file listed, every file present, every hash right. Returns sha256 of SHA256SUMS itself.
function checkSums(dir) {
  const sumsPath = path.join(dir, "SHA256SUMS");
  if (!fs.existsSync(sumsPath)) return { ok: false, errors: ["missing SHA256SUMS"] };
  const errors = [];
  const listed = new Map();
  for (const line of fs.readFileSync(sumsPath, "utf8").split("\n").filter(Boolean)) {
    const m = line.match(/^([0-9a-f]{64})\s+\.?\/?(.+)$/);
    if (!m) { errors.push(`bad SHA256SUMS line: ${line}`); continue; }
    listed.set(m[2], m[1]);
  }
  const actual = walk(dir).map((f) => path.relative(dir, f).split(path.sep).join("/")).filter((f) => f !== "SHA256SUMS");
  for (const f of actual) if (!listed.has(f)) errors.push(`unlisted file in evidence: ${f}`);
  for (const [f, h] of listed) {
    const fp = path.join(dir, f);
    if (!fs.existsSync(fp)) errors.push(`listed file missing: ${f}`);
    else if (sha256(fs.readFileSync(fp)) !== h) errors.push(`file modified after sealing: ${f}`);
  }
  return { ok: errors.length === 0, errors, sumsHash: sha256(fs.readFileSync(sumsPath)) };
}

// Validate a whole run directory against the locked flows and fingerprint.
function validateRunDir(dir, { flows, combined, mode, allowMock, notBefore, usedSessions, expectSessions }) {
  const errors = [];
  if (!fs.existsSync(dir)) return { ok: false, errors: [`evidence dir not found: ${dir}`], runs: {} };
  const sums = checkSums(dir);
  errors.push(...sums.errors);
  const fpPath = path.join(dir, "fingerprint.json");
  if (!fs.existsSync(fpPath)) errors.push("missing fingerprint.json");
  else {
    const fp = readJSON(fpPath);
    const got = (fp.computed && fp.computed.combined) || fp.combined;
    if (got !== combined) errors.push(`evidence was produced for fingerprint ${got}, bounty is locked to ${combined}`);
  }
  const runs = {};
  for (const kind of KINDS) {
    const r = validateRun(dir, kind, { flowText: flows[kind], mode, allowMock, notBefore, usedSessions, expectSessions });
    runs[kind] = r.facts;
    errors.push(...r.errors);
  }
  if (runs.locked.sessionId && runs.locked.sessionId === runs.guard.sessionId) errors.push("locked and guard runs share one Kane session");
  return { ok: errors.length === 0, errors, runs, sumsHash: sums.sumsHash, mock: runs.locked.mock || runs.guard.mock };
}

module.exports = { KINDS, parseNdjson, readPack, conclusive, validateRun, checkSums, validateRunDir };
