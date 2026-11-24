// Unit tests for the Settled core. Kane is MOCKED here (test/mock-kane.js) to conserve credits;
// mocked results are only accepted because these tests set allowMock=true on a throwaway copy of the repo.
// A few tests also validate the REAL committed baseline evidence read-only (no Kane calls).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const core = require("../cli/lib/core");
const ledger = require("../cli/lib/ledger");
const evidence = require("../cli/lib/evidence");
const fingerprint = require("../cli/lib/fingerprint");
const { mockRunner, mockApp } = require("./mock-kane");

const REPO = path.join(__dirname, "..");
const ID = "cart-badge-wrong";
const REAL_BASELINE = "evidence/cart-badge-wrong/20261124T171620Z";
const REAL_V1 = "evidence/cart-badge-wrong/regression/v1-false-pass-20261124T165309Z";
const REAL_RETRY = "evidence/cart-badge-wrong/verify-20261124T175732Z-4b024942"; // guard: assertion_error.checkpoint_failed
const REAL_TARGETS = { locked: "the header cart badge shows exactly 3", guard: "charged amount of exactly $54.00" };
const setRealTargets = (root) => { const b = bounty(root); b.baseline_expectations = REAL_TARGETS; fs.writeFileSync(path.join(root, ".settled/bounties", ID + ".json"), JSON.stringify(b)); };

function makeRoot({ withRealBaseline = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "settled-test-"));
  fs.mkdirSync(path.join(root, ".settled", "bounties"), { recursive: true });
  fs.cpSync(path.join(REPO, ".settled", "flows"), path.join(root, ".settled", "flows"), { recursive: true });
  fs.cpSync(path.join(REPO, "demo-shop"), path.join(root, "demo-shop"), { recursive: true });
  const b = JSON.parse(fs.readFileSync(path.join(REPO, ".settled", "bounties", ID + ".json"), "utf8"));
  b.status = "draft";
  for (const k of ["locked", "claim", "last_verification", "payout"]) delete b[k];
  b.activation = { rule: b.activation && b.activation.rule };
  b.baseline_expectations = { locked: "TARGET CHECK locked", guard: "TARGET CHECK guard" };
  for (const k of ["cancellation", "superseded_by"]) delete b[k];
  b.proof_run_id = null;
  fs.writeFileSync(path.join(root, ".settled", "bounties", ID + ".json"), JSON.stringify(b, null, 2));
  if (withRealBaseline) fs.cpSync(path.join(REPO, REAL_BASELINE), path.join(root, REAL_BASELINE), { recursive: true });
  return root;
}
const ctxFor = (root, scenario, extra = {}) => ({ root, runner: mockRunner(scenario), app: mockApp(), allowMock: true, now: () => new Date(), log: () => {}, ...extra });
const bounty = (root) => JSON.parse(fs.readFileSync(path.join(root, ".settled", "bounties", ID + ".json"), "utf8"));
const rejects = (p, re) => assert.rejects(p, (e) => { assert.match(e.message + " " + JSON.stringify(e.details || ""), re); return true; });
const throws = (fn, re) => assert.throws(fn, (e) => { assert.match(e.message + " " + JSON.stringify(e.details || ""), re); return true; });

async function postedRoot() {
  const root = makeRoot();
  await core.post(ctxFor(root, { locked: "fail", guard: "fail" }), ID, { runBaseline: true });
  return root;
}
async function verifiedRoot() {
  const root = await postedRoot();
  core.claim(ctxFor(root, {}), ID, { solver: "alice" });
  const r = await core.verify(ctxFor(root, { locked: "pass", guard: "pass" }), ID);
  assert.equal(r.passed, true, r.errors.join("; "));
  return root;
}

// ---------------- real evidence (read-only, no Kane calls) ----------------
test("real v2 baseline evidence validates as a conclusive double failure", () => {
  const fp = fingerprint.check(REPO, ID);
  const v = evidence.validateRunDir(path.join(REPO, REAL_BASELINE), { flows: fp.flows, combined: fp.computed.combined, mode: "fail", allowMock: false, usedSessions: new Map(), expectations: REAL_TARGETS });
  assert.equal(v.ok, true, v.errors.join("; "));
  assert.equal(v.mock, false);
  assert.equal(v.runs.locked.reason_code, "assertion_error.confirmed_product_bug");
  assert.equal(v.runs.guard.reason_code, "assertion_error.confirmed_product_bug");
});

test("real baseline cannot be passed off as a passing verification", () => {
  const fp = fingerprint.check(REPO, ID);
  const v = evidence.validateRunDir(path.join(REPO, REAL_BASELINE), { flows: fp.flows, combined: fp.computed.combined, mode: "pass", allowMock: false, usedSessions: new Map() });
  assert.equal(v.ok, false);
});

test("v1 false-pass regression evidence is rejected against the v2 lock", () => {
  const fp = fingerprint.check(REPO, ID);
  const v = evidence.validateRunDir(path.join(REPO, REAL_V1), { flows: fp.flows, combined: fp.computed.combined, mode: "pass", allowMock: false, usedSessions: new Map() });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /fingerprint/.test(e)));
});

test("post with the real legacy baseline needs explicit maintainer attestation", async () => {
  const root = makeRoot({ withRealBaseline: true });
  setRealTargets(root);
  const ctx = { ...ctxFor(root, {}), allowMock: false };
  await rejects(core.post(ctx, ID, { baselineDir: REAL_BASELINE }), /candidate\.json|legacy/);
  const r = await core.post(ctx, ID, { baselineDir: REAL_BASELINE, acceptLegacyBaseline: true });
  assert.equal(r.status, "open");
  assert.equal(r.mock, false);
  assert.equal(r.event.data.legacy_baseline, true);
  assert.equal(ledger.loadEscrow(root).holds[ID].state, "held");
});

test("the same real baseline sessions cannot be used to post twice (replay)", async () => {
  const root = makeRoot({ withRealBaseline: true });
  setRealTargets(root);
  const ctx = { ...ctxFor(root, {}), allowMock: false };
  await core.post(ctx, ID, { baselineDir: REAL_BASELINE, acceptLegacyBaseline: true });
  // Second bounty id pointing at the same flows/evidence.
  fs.copyFileSync(path.join(root, ".settled/flows", ID + ".locked.md"), path.join(root, ".settled/flows/dup.locked.md"));
  fs.copyFileSync(path.join(root, ".settled/flows", ID + ".guard.md"), path.join(root, ".settled/flows/dup.guard.md"));
  const b = bounty(root); b.id = "dup"; b.status = "draft"; b.fingerprint = fingerprint.computeFromText("dup", fingerprint.readFlows(root, "dup"));
  fs.writeFileSync(path.join(root, ".settled/bounties/dup.json"), JSON.stringify(b));
  // Evidence is bound to the bounty id through the combined fingerprint...
  await rejects(core.post(ctx, "dup", { baselineDir: REAL_BASELINE, acceptLegacyBaseline: true }), /produced for fingerprint/);
  // ...and even if an attacker re-points and re-seals a copy, the Kane sessions are already spent.
  const copy = "evidence/dup/replayed";
  fs.cpSync(path.join(root, REAL_BASELINE), path.join(root, copy), { recursive: true });
  fs.writeFileSync(path.join(root, copy, "fingerprint.json"), JSON.stringify({ computed: b.fingerprint }));
  require("../scripts/redact-evidence").writeSums(path.join(root, copy));
  await rejects(core.post(ctx, "dup", { baselineDir: copy, acceptLegacyBaseline: true }), /already used.*replay rejected/);
  assert.equal(bounty(root).status, "open");
});

// ---------------- post ----------------
test("post activates and locks only on a conclusive double failure", async () => {
  const root = makeRoot();
  const r = await core.post(ctxFor(root, { locked: "fail", guard: "fail" }), ID, { runBaseline: true });
  assert.equal(r.status, "open");
  assert.equal(r.mock, true, "mock evidence must be labelled as mock");
  const b = bounty(root);
  assert.equal(b.status, "open");
  assert.equal(b.locked.fingerprint_combined, fingerprint.check(root, ID).computed.combined);
  assert.equal(ledger.replay(root, ID).events[0].data.mock, true);
});

for (const [name, scenario, re] of [
  ["locked flow passes on buggy code", { locked: "pass", guard: "fail" }, /expected a failure/],
  ["guard flow passes on buggy code", { locked: "fail", guard: "pass" }, /expected a failure/],
  ["infrastructure error instead of a product-bug assertion", { locked: "infra", guard: "fail" }, /not a confirmed product bug/],
  ["a setup checkpoint failed (assertion_error.checkpoint_failed)", { locked: "fail", guard: "setup_fail" }, /guard: not conclusive: failure is not a confirmed product bug \(reason_code assertion_error\.checkpoint_failed\)/],
  ["product bug reported on a different check than the declared target", { locked: "wrong_target", guard: "fail" }, /locked: not conclusive: failure is on a different check/],
  ["Kane produced no run_end", { locked: { verdict: "fail", noRunEnd: true }, guard: "fail" }, /missing locked\.run_end/],
  ["Kane ran a different objective", { locked: { verdict: "fail", title: "Add 4 shirts" }, guard: "fail" }, /different objective/],
]) {
  test(`post refuses: ${name}`, async () => {
    const root = makeRoot();
    await rejects(core.post(ctxFor(root, scenario), ID, { runBaseline: true }), re);
    assert.equal(bounty(root).status, "draft");
    assert.equal(ledger.replay(root, ID).events.length, 0);
    assert.equal(ledger.loadEscrow(root).holds[ID], undefined);
  });
}

test("post never accepts mocked Kane results in real mode", async () => {
  const root = makeRoot();
  await rejects(core.post(ctxFor(root, { locked: "fail", guard: "fail" }, { allowMock: false }), ID, { runBaseline: true }), /MOCK/);
  assert.equal(bounty(root).status, "draft");
});

test("post refuses when flow text no longer matches the stored fingerprint", async () => {
  const root = makeRoot();
  fs.appendFileSync(path.join(root, ".settled/flows", ID + ".guard.md"), "Also accept $60.00.\n");
  await rejects(core.post(ctxFor(root, { locked: "fail", guard: "fail" }), ID, { runBaseline: true }), /fingerprint mismatch/);
});

test("post cannot run twice", async () => {
  const root = await postedRoot();
  await rejects(core.post(ctxFor(root, { locked: "fail", guard: "fail" }), ID, { runBaseline: true }), /already open/);
});

// ---------------- claim ----------------
test("claim assigns the bounty to one solver", async () => {
  const root = await postedRoot();
  const r = core.claim(ctxFor(root, {}), ID, { solver: "alice" });
  assert.equal(r.status, "claimed");
  assert.equal(bounty(root).claim.solver, "alice");
  throws(() => core.claim(ctxFor(root, {}), ID, { solver: "bob" }), /bounty is claimed/);
});

test("claim refuses drafts and bad solver names", async () => {
  const root = makeRoot();
  throws(() => core.claim(ctxFor(root, {}), ID, { solver: "alice" }), /bounty is draft/);
  const root2 = await postedRoot();
  throws(() => core.claim(ctxFor(root2, {}), ID, { solver: "a b; rm -rf" }), /--solver/);
});

// ---------------- verify ----------------
test("verify passes only when both flows conclusively pass", async () => {
  const root = await verifiedRoot();
  const b = bounty(root);
  assert.equal(b.status, "verified");
  assert.equal(b.last_verification.mock, true);
});

for (const [name, scenario, re] of [
  ["locked still fails", { locked: "fail", guard: "pass" }, /locked: not conclusive/],
  ["guard still fails", { locked: "pass", guard: "fail" }, /guard: not conclusive/],
  ["vacuous pass with no assertions", { locked: "vacuous", guard: "pass" }, /vacuous/],
  ["stale run started before the verification nonce", { locked: { verdict: "pass", startTs: new Date(Date.now() - 3600e3) }, guard: "pass" }, /stale or replayed/],
]) {
  test(`verify fails: ${name}`, async () => {
    const root = await postedRoot();
    core.claim(ctxFor(root, {}), ID, { solver: "alice" });
    const r = await core.verify(ctxFor(root, scenario), ID);
    assert.equal(r.passed, false);
    assert.match(r.errors.join("\n"), re);
    assert.equal(bounty(root).status, "claimed");
  });
}

test("verify rejects a replayed Kane session", async () => {
  const root = await postedRoot();
  core.claim(ctxFor(root, {}), ID, { solver: "alice" });
  const baselineSession = ledger.replay(root, ID).events[0].data.sessions[0];
  const r = await core.verify(ctxFor(root, { locked: { verdict: "pass", sessionId: baselineSession }, guard: "pass" }), ID);
  assert.equal(r.passed, false);
  assert.match(r.errors.join("\n"), /already used/);
});

test("verify refuses if the flows were softened and re-pinned after posting", async () => {
  const root = await postedRoot();
  core.claim(ctxFor(root, {}), ID, { solver: "alice" });
  const p = path.join(root, ".settled/flows", ID + ".guard.md");
  fs.writeFileSync(p, "Complete checkout. Verify an order is confirmed.\n");
  const b = bounty(root);
  const flows = fingerprint.readFlows(root, ID);
  b.guard_flow = flows.guard; b.fingerprint = fingerprint.computeFromText(ID, flows);
  fs.writeFileSync(path.join(root, ".settled/bounties", ID + ".json"), JSON.stringify(b));
  await rejects(core.verify(ctxFor(root, { locked: "pass", guard: "pass" }), ID), /changed after the bounty was locked/);
});

test("verify runs Kane itself against a freshly started candidate app", async () => {
  const root = await postedRoot();
  core.claim(ctxFor(root, {}), ID, { solver: "alice" });
  const ctx = ctxFor(root, { locked: "pass", guard: "pass" });
  await core.verify(ctx, ID);
  assert.equal(ctx.app.starts, 1);
  const fp = fingerprint.check(root, ID);
  assert.deepEqual(ctx.runner.calls.map((c) => c.flowText), [fp.flows.locked, fp.flows.guard]);
});

test("verify fails if candidate code changes while Kane is running", async () => {
  const root = await postedRoot();
  core.claim(ctxFor(root, {}), ID, { solver: "alice" });
  const ctx = ctxFor(root, {});
  ctx.runner = mockRunner({ locked: "pass", guard: "pass" }, { onRun: (k) => k === "guard" && fs.appendFileSync(path.join(root, "demo-shop/server.js"), "\n// swap\n") });
  const r = await core.verify(ctx, ID);
  assert.equal(r.passed, false);
  assert.match(r.errors.join("\n"), /changed while Kane was running/);
});

// ---------------- payout ----------------
test("payout releases simulated escrow to the solver exactly once", async () => {
  const root = await verifiedRoot();
  const r = core.payout(ctxFor(root, {}), ID);
  assert.equal(r.status, "paid");
  assert.equal(r.solver, "alice");
  const esc = ledger.loadEscrow(root);
  assert.equal(esc.simulated, true);
  assert.equal(esc.holds[ID].state, "released");
  assert.equal(esc.balances["alice:USDC"], 50);
  throws(() => core.payout(ctxFor(root, {}), ID), /bounty is paid/);
});

test("payout refuses mocked verification evidence in real mode", async () => {
  const root = await verifiedRoot();
  throws(() => core.payout(ctxFor(root, {}, { allowMock: false }), ID), /MOCK/);
});

test("payout refuses before a passing verification", async () => {
  const root = await postedRoot();
  core.claim(ctxFor(root, {}), ID, { solver: "alice" });
  throws(() => core.payout(ctxFor(root, {}), ID), /bounty is claimed/);
  await core.verify(ctxFor(root, { locked: "pass", guard: "fail" }), ID);
  throws(() => core.payout(ctxFor(root, {}), ID), /bounty is claimed/);
});

test("payout refuses if the candidate code changed after verification", async () => {
  const root = await verifiedRoot();
  fs.appendFileSync(path.join(root, "demo-shop/public/shop.js"), "\n// reintroduce bug\n");
  throws(() => core.payout(ctxFor(root, {}), ID), /candidate code changed since verification/);
});

test("payout refuses if sealed evidence was tampered with", async () => {
  const root = await verifiedRoot();
  const dir = path.join(root, bounty(root).last_verification.evidence_dir);
  const p = path.join(dir, "guard.run_end.json");
  const j = JSON.parse(fs.readFileSync(p, "utf8")); j.reason = "edited"; fs.writeFileSync(p, JSON.stringify(j));
  throws(() => core.payout(ctxFor(root, {}), ID), /modified after sealing|does not match/);
  assert.equal(ledger.loadEscrow(root).holds[ID].state, "held");
});

test("payout refuses if evidence was re-sealed after tampering", async () => {
  const root = await verifiedRoot();
  const dir = path.join(root, bounty(root).last_verification.evidence_dir);
  fs.writeFileSync(path.join(dir, "extra.txt"), "x");
  require("../scripts/redact-evidence").writeSums(dir);
  throws(() => core.payout(ctxFor(root, {}), ID), /seal/);
});

test("a failed re-verification blocks payout of an earlier pass", async () => {
  const root = await verifiedRoot();
  await core.verify(ctxFor(root, { locked: "pass", guard: "fail" }), ID);
  throws(() => core.payout(ctxFor(root, {}), ID), /bounty is claimed/);
});


// ---------------- tightened baseline rule: regressions ----------------
test("REGRESSION: real guard run that failed a setup checkpoint is not accepted as bug evidence", () => {
  const fp = fingerprint.check(REPO, ID);
  // Same evidence under the OLD rule (any assertion_error.*) would have counted as 'bug detected'.
  const r = evidence.validateRun(path.join(REPO, REAL_RETRY), "guard", { flowText: fp.flows.guard, mode: "fail", allowMock: false, mustFailOn: REAL_TARGETS.guard });
  assert.equal(r.facts.reason_code, "assertion_error.checkpoint_failed");
  assert.equal(r.ok, false);
  assert.match(r.errors.join("\n"), /not a confirmed product bug/);
});

test("REGRESSION: real v2 baseline is rejected if the declared target does not match Kane's failure", () => {
  const fp = fingerprint.check(REPO, ID);
  const v = evidence.validateRunDir(path.join(REPO, REAL_BASELINE), { flows: fp.flows, combined: fp.computed.combined, mode: "fail", allowMock: false, usedSessions: new Map(), expectations: { locked: REAL_TARGETS.locked, guard: "the cart badge shows exactly 3" } });
  assert.equal(v.ok, false);
  assert.match(v.errors.join("\n"), /guard: not conclusive: failure is on a different check/);
});

test("post refuses a bounty with no declared baseline_expectations, before running Kane", async () => {
  const root = makeRoot();
  const b = bounty(root); delete b.baseline_expectations;
  fs.writeFileSync(path.join(root, ".settled/bounties", ID + ".json"), JSON.stringify(b));
  const ctx = ctxFor(root, { locked: "fail", guard: "fail" });
  await rejects(core.post(ctx, ID, { runBaseline: true }), /baseline_expectations/);
  assert.equal(ctx.runner.calls.length, 0, "no Kane runs (no credits) before the bounty is well-formed");
});

test("target matching tolerates Kane's curly quotes and case", () => {
  const runEnd = { status: "failed", reason_code: evidence.PRODUCT_BUG, reason: 'Final verification failed: \u201cThe order confirmation shows a charged amount of exactly $54.00.\u201d', per_flow_metadata: [{ error_message: "x" }] };
  assert.equal(evidence.conclusive(runEnd, "fail", "charged amount of exactly $54.00"), null);
});

// ---------------- cancel ----------------
test("cancel returns simulated escrow to the maintainer through a ledger event", async () => {
  const root = await postedRoot();
  core.claim(ctxFor(root, {}), ID, { solver: "alice" });
  const r = core.cancel(ctxFor(root, {}), ID, { reason: "superseded by a flow revision", maintainer: "maintainer" });
  assert.equal(r.status, "cancelled");
  const esc = ledger.loadEscrow(root);
  assert.equal(esc.holds[ID].state, "refunded");
  assert.equal(esc.balances["maintainer:USDC"], 50);
  const last = ledger.replay(root, ID).events.pop();
  assert.equal(last.type, "cancelled");
  assert.equal(last.data.claimant_at_cancel, "alice");
  assert.equal(bounty(root).cancellation.refunded_to, "maintainer");
});

test("cancelled bounties are terminal: no claim, verify, payout or second cancel", async () => {
  const root = await postedRoot();
  core.cancel(ctxFor(root, {}), ID, { reason: "superseded by a flow revision" });
  throws(() => core.claim(ctxFor(root, {}), ID, { solver: "bob" }), /bounty is cancelled/);
  await rejects(core.verify(ctxFor(root, { locked: "pass", guard: "pass" }), ID), /bounty is cancelled/);
  throws(() => core.payout(ctxFor(root, {}), ID), /bounty is cancelled/);
  throws(() => core.cancel(ctxFor(root, {}), ID, { reason: "superseded by a flow revision" }), /bounty is cancelled/);
});

test("cancel is refused once a solver holds a passing verification", async () => {
  const root = await verifiedRoot();
  throws(() => core.cancel(ctxFor(root, {}), ID, { reason: "trying to dodge the payout" }), /bounty is verified/);
  assert.equal(ledger.loadEscrow(root).holds[ID].state, "held");
});

test("cancel needs the posting maintainer, a reason, and an existing successor", async () => {
  const root = await postedRoot();
  throws(() => core.cancel(ctxFor(root, {}), ID, { reason: "superseded by a flow revision", maintainer: "mallory" }), /only the posting maintainer/);
  throws(() => core.cancel(ctxFor(root, {}), ID, { reason: "x" }), /--reason/);
  throws(() => core.cancel(ctxFor(root, {}), ID, { reason: "superseded by a flow revision", supersededBy: "nope" }), /does not exist/);
  assert.equal(bounty(root).status, "open");
});

// ---------------- persistent state / tamper evidence ----------------
test("editing bounty status outside settled is detected", async () => {
  const root = await postedRoot();
  const b = bounty(root); b.status = "verified";
  fs.writeFileSync(path.join(root, ".settled/bounties", ID + ".json"), JSON.stringify(b));
  throws(() => core.payout(ctxFor(root, {}), ID), /edited outside settled/);
});

test("editing a ledger event breaks the hash chain", async () => {
  const root = await verifiedRoot();
  const p = ledger.ledgerPath(root, ID);
  const lines = fs.readFileSync(p, "utf8").trim().split("\n");
  const e = JSON.parse(lines[1]); e.data.solver = "mallory"; lines[1] = JSON.stringify(e);
  fs.writeFileSync(p, lines.join("\n") + "\n");
  throws(() => core.payout(ctxFor(root, {}), ID), /modified \(hash mismatch\)/);
});

test("deleting a ledger event breaks the chain", async () => {
  const root = await verifiedRoot();
  const p = ledger.ledgerPath(root, ID);
  const lines = fs.readFileSync(p, "utf8").trim().split("\n");
  lines.splice(1, 1);
  fs.writeFileSync(p, lines.join("\n") + "\n");
  throws(() => ledger.replay(root, ID), /seq|chain/);
});

test("state survives across processes (persisted on disk)", async () => {
  const root = await verifiedRoot();
  const { status, events } = ledger.replay(root, ID);
  assert.equal(status, "verified");
  assert.deepEqual(events.map((e) => e.type), ["posted", "claimed", "verify_passed"]);
});
