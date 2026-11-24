#!/usr/bin/env node
// Settled CLI. Kane CLI is the only judge; this tool locks bounties to flows, runs Kane, and
// releases SIMULATED escrow only on conclusive, fresh, untampered evidence.
//
//   settled post <id> --baseline <evidence-dir> [--accept-legacy-baseline] [--maintainer <name>]
//   settled post <id> --run-baseline [--maintainer <name>]         (runs Kane: consumes credits)
//   settled claim <id> --solver <name>
//   settled verify <id> [--verifier <name>]                        (runs Kane: consumes credits)
//   settled payout <id>
//   settled cancel <id> --reason <text> [--superseded-by <id>] [--maintainer <name>]
//   settled status <id>
//   settled escrow                 audit the simulated escrow (derived from the ledgers; checks conservation)
//
// The CLI always uses the real kane-cli runner and never accepts mocked Kane results.
const path = require("path");
const core = require("./lib/core");
const { kaneRunner, appControl } = require("./lib/runtime");
const { SettledError } = require("./lib/util");

function parse(argv) {
  const [cmd, id, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) throw new SettledError(`unexpected argument ${a}`);
    const key = a.slice(2);
    if (["accept-legacy-baseline", "run-baseline", "yes"].includes(key)) flags[key] = true;
    else { if (rest[i + 1] === undefined) throw new SettledError(`--${key} needs a value`); flags[key] = rest[++i]; }
  }
  return { cmd, id, flags };
}

const USAGE = `usage:
  settled post <id> --baseline <evidence-dir> [--accept-legacy-baseline] [--maintainer <name>]
  settled post <id> --run-baseline --yes [--maintainer <name>]     (consumes Kane credits)
  settled claim <id> --solver <name>
  settled verify <id> --yes [--verifier <name>]                    (consumes Kane credits)
  settled payout <id>
  settled cancel <id> --reason <text> [--superseded-by <id>] [--maintainer <name>]
  settled status <id>
  settled escrow`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "escrow") {
    const flags = parse(["escrow", "_", ...argv.slice(1)]).flags;
    const a = core.escrow.audit(path.resolve(flags.root || path.join(__dirname, "..")));
    const { journal, ...summary } = a;
    console.log(JSON.stringify(summary, null, 2));
    if (!a.snapshot_matches) console.error("settled: .settled/escrow.json differs from the ledger-derived escrow (the ledgers are authoritative)");
    return a.ok ? 0 : 1;
  }
  const { cmd, id, flags } = parse(argv);
  if (!cmd || !id || cmd === "help") { console.log(USAGE); return cmd ? 0 : 2; }
  const ctx = {
    root: path.resolve(flags.root || path.join(__dirname, "..")),
    runner: kaneRunner(),
    app: appControl(),
    allowMock: false,
    now: () => new Date(),
    log: (m) => console.error(`settled: ${m}`),
  };
  const needsCredits = cmd === "verify" || (cmd === "post" && flags["run-baseline"]);
  if (needsCredits && !flags.yes) throw new SettledError(`${cmd} runs Kane CLI and consumes credits; re-run with --yes to proceed`);

  let out;
  switch (cmd) {
    case "post": out = await core.post(ctx, id, { baselineDir: flags.baseline, runBaseline: flags["run-baseline"], acceptLegacyBaseline: flags["accept-legacy-baseline"], maintainer: flags.maintainer }); break;
    case "claim": out = core.claim(ctx, id, { solver: flags.solver }); break;
    case "verify": out = await core.verify(ctx, id, { verifier: flags.verifier }); break;
    case "payout": out = core.payout(ctx, id); break;
    case "cancel": out = core.cancel(ctx, id, { reason: flags.reason, supersededBy: flags["superseded-by"], maintainer: flags.maintainer }); break;
    case "status": out = core.statusOf(ctx, id); break;
    default: throw new SettledError(`unknown command ${cmd}\n${USAGE}`);
  }
  const brief = { command: cmd, id, status: out.status };
  if (cmd === "post") Object.assign(brief, { locked_to: out.event.data.fingerprint.combined, baseline: out.event.data.baseline_dir, verdicts: out.event.data.verdicts, legacy_baseline: out.event.data.legacy_baseline });
  if (cmd === "claim") Object.assign(brief, { solver: out.event.data.solver, claim_id: out.event.data.claim_id });
  if (cmd === "verify") Object.assign(brief, { passed: out.passed, verdicts: out.event.data.verdicts, evidence: out.event.data.evidence_dir, errors: out.errors.length ? out.errors : undefined });
  if (cmd === "payout") Object.assign(brief, { paid_to: out.solver, amount: `${out.amount} ${out.currency}`, simulated: true });
  if (cmd === "cancel") Object.assign(brief, { refunded_to: out.refunded_to, amount: `${out.amount} ${out.currency}`, superseded_by: out.event.data.superseded_by, simulated: true });
  if (cmd === "status") Object.assign(brief, out);
  console.log(JSON.stringify(brief, null, 2));
  return cmd === "verify" && !out.passed ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => {
  console.error(`settled: ${e.message}`);
  if (e.details) console.error(Array.isArray(e.details) ? e.details.map((d) => "  - " + d).join("\n") : JSON.stringify(e.details, null, 2));
  process.exit(e instanceof SettledError ? 1 : 3);
});
