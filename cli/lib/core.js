// Settled core: post -> claim -> verify -> payout over a persistent, hash-chained ledger.
// Side effects are injected through ctx so tests can use mocked Kane without touching real evidence:
//   ctx = { root, runner, app, allowMock, now, log }
// The CLI always passes the real kane-cli runner and allowMock=false.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { hashDir, readJSON, writeJSONAtomic, nonce, SettledError } = require("./util");
const fingerprint = require("./fingerprint");
const evidence = require("./evidence");
const ledger = require("./ledger");
const { processDir } = require("../../scripts/redact-evidence");

const bountyPath = (root, id) => path.join(root, ".settled", "bounties", id + ".json");
const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const rel = (root, p) => path.relative(root, p).split(path.sep).join("/");
const SOLVER_RE = /^[A-Za-z0-9_.@-]{2,64}$/;

function candidateState(root, bounty) {
  const appDir = bounty.app_dir || "demo-shop";
  let gitHead = null;
  try { gitHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {}
  return { app_dir: appDir, app_hash: hashDir(path.join(root, appDir)), git_head: gitHead };
}

// Load the bounty and refuse to continue unless file, ledger and fingerprints all agree.
function preflight(ctx, id) {
  const p = bountyPath(ctx.root, id);
  if (!fs.existsSync(p)) throw new SettledError(`unknown bounty ${id}`);
  const bounty = readJSON(p);
  const { status, events } = ledger.replay(ctx.root, id);
  if ((bounty.status || "draft") !== status) throw new SettledError(`bounty file says "${bounty.status}" but the ledger says "${status}": state was edited outside settled`);
  const fp = fingerprint.check(ctx.root, id);
  if (!fp.match) throw new SettledError("fingerprint mismatch between flow files and bounty", fp.checks);
  const posted = events.find((e) => e.type === "posted");
  if (posted && posted.data.fingerprint.combined !== fp.computed.combined) {
    throw new SettledError(`flows changed after the bounty was locked: locked ${posted.data.fingerprint.combined}, now ${fp.computed.combined}`);
  }
  return { bounty, status, events, fp, posted };
}

function saveBounty(ctx, id, bounty) { writeJSONAtomic(bountyPath(ctx.root, id), bounty); }

// Start the app from current code, run both flows through ctx.runner into outDir.
async function runFlows(ctx, bounty, fp, outDir, extra) {
  fs.mkdirSync(outDir, { recursive: true });
  const candidate = candidateState(ctx.root, bounty);
  fs.writeFileSync(path.join(outDir, "fingerprint.json"), JSON.stringify({ id: bounty.id, match: fp.match, computed: fp.computed }, null, 2));
  fs.writeFileSync(path.join(outDir, "candidate.json"), JSON.stringify(candidate, null, 2));
  if (extra) fs.writeFileSync(path.join(outDir, extra.name), JSON.stringify(extra.data, null, 2));
  const server = await ctx.app.start({ root: ctx.root, appDir: candidate.app_dir, startCmd: bounty.app_start || ["node", "server.js"], url: bounty.demo_url });
  const results = {};
  try {
    for (const kind of evidence.KINDS) {
      ctx.log(`running ${kind} flow via ${ctx.runner.name}${ctx.runner.mock ? " (MOCK, not real Kane evidence)" : ""}`);
      results[kind] = await ctx.runner.run({ flowText: fp.flows[kind], url: bounty.demo_url, outDir, kind });
    }
  } finally { server.stop(); }
  const after = candidateState(ctx.root, bounty);
  processDir(outDir, false); // redact identity/session data and seal SHA256SUMS
  return { candidate, codeChangedDuringRun: after.app_hash !== candidate.app_hash, results };
}

// ---------- post ----------
async function post(ctx, id, opts = {}) {
  return ledger.withLockAsync(ctx.root, async () => {
    const { bounty, status, fp } = preflight(ctx, id);
    if (status !== "draft") throw new SettledError(`bounty is already ${status}; post locks a draft once`);
    const maintainer = opts.maintainer || "maintainer";
    const exp = bounty.baseline_expectations || {};
    if (!evidence.KINDS.every((k) => typeof exp[k] === "string" && exp[k].trim().length >= 8)) {
      throw new SettledError("bounty must declare baseline_expectations.locked and .guard: the target check each flow must fail on against the buggy app");
    }
    const current = candidateState(ctx.root, bounty);
    let dir, notBefore = null, legacy = false;
    if (opts.runBaseline) {
      notBefore = ctx.now();
      dir = path.join(ctx.root, "evidence", id, `baseline-${stamp(notBefore)}`);
      const r = await runFlows(ctx, bounty, fp, dir);
      if (r.codeChangedDuringRun) throw new SettledError("app code changed while the baseline was running");
    } else if (opts.baselineDir) {
      dir = path.resolve(ctx.root, opts.baselineDir);
      const candPath = path.join(dir, "candidate.json");
      if (fs.existsSync(candPath)) {
        if (readJSON(candPath).app_hash !== current.app_hash) throw new SettledError("baseline evidence was recorded against different app code than the code being posted");
      } else if (opts.acceptLegacyBaseline) legacy = true;
      else throw new SettledError("baseline has no candidate.json binding it to the app code; re-run it, or pass --accept-legacy-baseline to record it as a legacy, maintainer-attested baseline");
    } else throw new SettledError("post requires --baseline <evidence-dir> or --run-baseline");

    const expectations = bounty.baseline_expectations;
    const v = evidence.validateRunDir(dir, { flows: fp.flows, combined: fp.computed.combined, mode: "fail", allowMock: ctx.allowMock, notBefore, usedSessions: ledger.usedSessions(ctx.root), expectations });
    if (!v.ok) throw new SettledError("baseline does not prove both planted bugs are detected; bounty stays draft", v.errors);

    const sessions = [v.runs.locked.sessionId, v.runs.guard.sessionId];
    const ref = nonce();
    ledger.hold(ctx.root, id, { amount: bounty.reward, currency: bounty.currency, from: maintainer, ref });
    const { event, status: next } = ledger.append(ctx.root, id, "posted", maintainer, {
      fingerprint: fp.computed, baseline_dir: rel(ctx.root, dir), baseline_sums_sha256: v.sumsHash, sessions,
      verdicts: { locked: v.runs.locked.reason, guard: v.runs.guard.reason },
      app_hash: current.app_hash, git_head: current.git_head, legacy_baseline: legacy, escrow_ref: ref, mock: v.mock,
      baseline_expectations: bounty.baseline_expectations,
    }, ctx.now);
    bounty.status = next;
    bounty.locked = { at: event.at, by: maintainer, fingerprint_combined: fp.computed.combined, baseline_dir: rel(ctx.root, dir), legacy_baseline: legacy, ledger_seq: event.seq };
    bounty.activation = { ...(bounty.activation || {}), baseline_run: rel(ctx.root, dir), activated_at: event.at,
      locked_detects_bug: { verdict: v.runs.locked.status, reason_code: v.runs.locked.reason_code, reason: v.runs.locked.reason, credits: v.runs.locked.credits_consumed },
      guard_detects_bug: { verdict: v.runs.guard.status, reason_code: v.runs.guard.reason_code, reason: v.runs.guard.reason, credits: v.runs.guard.credits_consumed } };
    saveBounty(ctx, id, bounty);
    return { status: next, event, validation: v, mock: v.mock };
  });
}

// ---------- claim ----------
function claim(ctx, id, opts = {}) {
  return ledger.withLock(ctx.root, () => {
    const { bounty, status } = preflight(ctx, id);
    if (status !== "open") throw new SettledError(`cannot claim: bounty is ${status}`);
    if (!SOLVER_RE.test(opts.solver || "")) throw new SettledError("claim requires --solver <name> (2-64 chars: letters, digits, _ . @ -)");
    const claimId = nonce();
    const { event, status: next } = ledger.append(ctx.root, id, "claimed", opts.solver, { solver: opts.solver, claim_id: claimId }, ctx.now);
    bounty.status = next;
    bounty.claim = { solver: opts.solver, claim_id: claimId, at: event.at, ledger_seq: event.seq };
    saveBounty(ctx, id, bounty);
    return { status: next, event };
  });
}

// ---------- verify ----------
async function verify(ctx, id, opts = {}) {
  return ledger.withLockAsync(ctx.root, async () => {
    const { bounty, status, fp } = preflight(ctx, id);
    if (status !== "claimed" && status !== "verified") throw new SettledError(`cannot verify: bounty is ${status}`);
    const issuedAt = ctx.now();
    const n = nonce();
    const dir = path.join(ctx.root, "evidence", id, `verify-${stamp(issuedAt)}-${n.slice(0, 8)}`);
    const run = await runFlows(ctx, bounty, fp, dir, { name: "verify.json", data: { bounty: id, nonce: n, issued_at: issuedAt.toISOString(), verifier: opts.verifier || "settled", claim_id: bounty.claim && bounty.claim.claim_id } });
    // runFlows sealed SHA256SUMS over everything in dir (including verify.json) after redaction.
    const v = evidence.validateRunDir(dir, { flows: fp.flows, combined: fp.computed.combined, mode: "pass", allowMock: ctx.allowMock, notBefore: issuedAt, usedSessions: ledger.usedSessions(ctx.root) });
    const errors = [...v.errors];
    if (run.codeChangedDuringRun) errors.push("candidate code changed while Kane was running");
    const passed = errors.length === 0;
    const sessions = [v.runs.locked.sessionId, v.runs.guard.sessionId].filter(Boolean);
    const data = {
      nonce: n, issued_at: issuedAt.toISOString(), candidate_hash: run.candidate.app_hash, git_head: run.candidate.git_head,
      fingerprint_combined: fp.computed.combined, evidence_dir: rel(ctx.root, dir), sums_sha256: v.sumsHash, sessions,
      verdicts: Object.fromEntries(evidence.KINDS.map((k) => [k, { status: v.runs[k].status || "no run_end", reason: v.runs[k].reason, reason_code: v.runs[k].reason_code, credits: v.runs[k].credits_consumed }])),
      errors: passed ? undefined : errors, mock: v.mock,
    };
    const { event, status: next } = ledger.append(ctx.root, id, passed ? "verify_passed" : "verify_failed", opts.verifier || "settled", data, ctx.now);
    bounty.status = next;
    bounty.last_verification = { result: passed ? "passed" : "failed", at: event.at, evidence_dir: data.evidence_dir, ledger_seq: event.seq, mock: v.mock || undefined };
    saveBounty(ctx, id, bounty);
    return { status: next, passed, errors, event, validation: v, mock: v.mock };
  });
}

// ---------- payout ----------
function payout(ctx, id) {
  return ledger.withLock(ctx.root, () => {
    const { bounty, status, events, fp } = preflight(ctx, id);
    if (status !== "verified") throw new SettledError(`cannot pay out: bounty is ${status}`);
    const lastVerify = [...events].reverse().find((e) => e.type === "verify_passed" || e.type === "verify_failed");
    if (!lastVerify || lastVerify.type !== "verify_passed") throw new SettledError("latest verification did not pass");
    const vd = lastVerify.data;
    if (events.some((e) => e.type === "paid" && e.data.verification_nonce === vd.nonce)) throw new SettledError("this verification was already paid out: replay rejected");
    if (vd.mock && !ctx.allowMock) throw new SettledError("verification used MOCK Kane results; refusing to release escrow");
    if (vd.fingerprint_combined !== fp.computed.combined) throw new SettledError("flows changed since verification");
    const now = candidateState(ctx.root, bounty);
    if (now.app_hash !== vd.candidate_hash) throw new SettledError("candidate code changed since verification; run settled verify again");

    const dir = path.join(ctx.root, vd.evidence_dir);
    const used = ledger.usedSessions(ctx.root);
    vd.sessions.forEach((s) => used.delete(s));
    const v = evidence.validateRunDir(dir, { flows: fp.flows, combined: fp.computed.combined, mode: "pass", allowMock: ctx.allowMock, notBefore: new Date(vd.issued_at), usedSessions: used, expectSessions: { locked: vd.sessions[0], guard: vd.sessions[1] } });
    const errors = [...v.errors];
    if (v.sumsHash !== vd.sums_sha256) errors.push("evidence seal (SHA256SUMS) differs from the one recorded at verification");
    if (errors.length) throw new SettledError("evidence no longer proves both flows passed; escrow stays held", errors);

    const solver = bounty.claim && bounty.claim.solver;
    const ref = nonce();
    const held = ledger.release(ctx.root, id, { to: solver, ref });
    const { event, status: next } = ledger.append(ctx.root, id, "paid", "settled", { verification_nonce: vd.nonce, verification_seq: lastVerify.seq, solver, amount: held.amount, currency: held.currency, escrow_ref: ref, simulated: true, mock: vd.mock }, ctx.now);
    bounty.status = next;
    bounty.payout = { to: solver, amount: held.amount, currency: held.currency, at: event.at, simulated: true, ledger_seq: event.seq, mock: vd.mock || undefined };
    bounty.proof_run_id = vd.nonce;
    saveBounty(ctx, id, bounty);
    return { status: next, event, amount: held.amount, currency: held.currency, solver, mock: vd.mock };
  });
}

// ---------- cancel ----------
function cancel(ctx, id, opts = {}) {
  return ledger.withLock(ctx.root, () => {
    const { bounty, status, events } = preflight(ctx, id);
    if (status !== "open" && status !== "claimed") throw new SettledError(`cannot cancel: bounty is ${status}`);
    const posted = events.find((e) => e.type === "posted");
    if ((opts.maintainer || "maintainer") !== posted.actor) throw new SettledError(`only the posting maintainer (${posted.actor}) can cancel`);
    if (!opts.reason || opts.reason.trim().length < 10) throw new SettledError("cancel requires --reason (at least 10 characters)");
    if (opts.supersededBy && !fs.existsSync(bountyPath(ctx.root, opts.supersededBy))) throw new SettledError(`superseding bounty ${opts.supersededBy} does not exist`);
    const ref = nonce();
    const held = ledger.refund(ctx.root, id, { ref });
    const { event, status: next } = ledger.append(ctx.root, id, "cancelled", posted.actor, {
      reason: opts.reason, superseded_by: opts.supersededBy || null, refunded_to: held.from, amount: held.amount, currency: held.currency,
      escrow_ref: ref, simulated: true, claimant_at_cancel: (bounty.claim && bounty.claim.solver) || null,
    }, ctx.now);
    bounty.status = next;
    bounty.cancellation = { at: event.at, reason: opts.reason, superseded_by: opts.supersededBy || null, refunded_to: held.from, amount: held.amount, currency: held.currency, simulated: true, ledger_seq: event.seq };
    saveBounty(ctx, id, bounty);
    return { status: next, event, refunded_to: held.from, amount: held.amount, currency: held.currency };
  });
}

function statusOf(ctx, id) {
  const { bounty, status, events, fp, posted } = preflight(ctx, id);
  return { id, status, reward: `${bounty.reward} ${bounty.currency}`, fingerprint: fp.computed.combined, locked_to: posted && posted.data.fingerprint.combined, solver: bounty.claim && bounty.claim.solver, events: events.map((e) => `${e.seq} ${e.at} ${e.type}${e.data && e.data.mock ? " (MOCK)" : ""}`), escrow: ledger.loadEscrow(ctx.root).holds[id] || null };
}

module.exports = { post, claim, verify, payout, cancel, statusOf, preflight, candidateState };
