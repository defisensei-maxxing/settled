// TEST-ONLY mocked Kane CLI. Everything it writes is labelled as mock:
//   run_end.mock = true, run_end.source = "mock", evidence pack producer = "kane-cli-mock".
// The real CLI validates with allowMock=false, which rejects all of these.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

let counter = 0;
const uuid = () => crypto.randomUUID();

// scenario: { locked: spec, guard: spec } where spec = 'pass' | 'fail' | 'infra' | 'vacuous' | { verdict, sessionId, startTs, title, noRunEnd }
function mockRunner(scenario, { onRun } = {}) {
  return {
    name: "mock-kane",
    mock: true,
    calls: [],
    async run({ flowText, url, outDir, kind }) {
      const spec = typeof scenario[kind] === "string" ? { verdict: scenario[kind] } : { ...scenario[kind] };
      this.calls.push({ kind, flowText, url });
      if (onRun) onRun(kind);
      const sessionId = spec.sessionId || `mock-${kind}-${++counter}-${uuid()}`;
      const start = spec.startTs || new Date(Date.now() + 5);
      const end = new Date(start.getTime() + 1000);
      const v = spec.verdict;
      const runEnd = {
        type: "run_end", mock: true, source: "mock",
        status: v === "pass" || v === "vacuous" ? "passed" : "failed",
        reason: v === "pass" || v === "vacuous" ? "Objective completed" : v === "infra" ? "Browser crashed" : `Checkpoint assertion failed (${kind})`,
        reason_code: v === "pass" || v === "vacuous" ? "success.complete" : v === "infra" ? "error.browser_crash" : "assertion_error.confirmed_product_bug",
        result_code: v === "pass" || v === "vacuous" ? 100 : 200,
        context: { memory: v === "vacuous" ? {} : { check: { extracted_value: "3", expected_value: "3" } } },
        per_flow_metadata: [{ error_message: v === "pass" || v === "vacuous" ? null : v === "infra" ? null : "assertion failed" }],
        credits_consumed: 0, session_dir: `~/mock-sessions/${sessionId}`, ts: end.toISOString(),
      };
      if (v === "infra") runEnd.per_flow_metadata = [{ error_message: "browser crashed" }];
      const lines = [
        { type: "stream_start", mock: true, cli_version: "mock", ts: start.toISOString() },
        { type: "recording_state", session_id: sessionId, ts: start.toISOString() },
      ];
      if (!spec.noRunEnd) lines.push(runEnd);
      fs.writeFileSync(path.join(outDir, `${kind}.ndjson`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
      if (spec.noRunEnd) return { kind, runEnd: null };
      fs.writeFileSync(path.join(outDir, `${kind}.run_end.json`), JSON.stringify(runEnd, null, 2));
      // Evidence pack in Kane's layout.
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mock-pack-"));
      const title = (spec.title || flowText).split("\n").map((l) => "  " + l).join("\n");
      fs.writeFileSync(path.join(tmp, "run.yaml"), `evidence: '0.1'\nrun_id: ${uuid()}\nstatus: finalized\ntitle: |-\n${title}\nstarted: ${start.toISOString()}\nenvironment:\n  producer:\n    name: ${spec.producer || "kane-cli-mock"}\n    version: mock\nended: ${end.toISOString()}\n`);
      fs.mkdirSync(path.join(tmp, "tests", "t1"), { recursive: true });
      fs.writeFileSync(path.join(tmp, "tests", "t1", "result.yaml"), `evidence: '0.1'\ntest: t1\nstatus: ${runEnd.status}\nexternal_id:\n  session_id: ${sessionId}\n`);
      execFileSync("zip", ["-qrX", path.join(outDir, `${kind}.evidence`), "."], { cwd: tmp });
      fs.rmSync(tmp, { recursive: true, force: true });
      return { kind, runEnd };
    },
  };
}

const mockApp = () => ({ starts: 0, async start() { this.starts++; return { stop() {} }; } });

module.exports = { mockRunner, mockApp };
