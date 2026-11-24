// Real side effects: running Kane CLI and starting the app under test.
// Tests replace both with test/mock-kane.js; the CLI only ever uses these.
const fs = require("fs");
const net = require("net");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { expandHome, SettledError } = require("./util");
const { parseNdjson } = require("./evidence");

// Run one flow through Kane CLI and write <kind>.ndjson / <kind>.run_end.json / <kind>.evidence / <kind>.stderr.
function kaneRunner({ timeoutMs = 20 * 60 * 1000 } = {}) {
  return {
    name: "kane-cli",
    mock: false,
    run({ flowText, url, outDir, kind }) {
      return new Promise((resolve, reject) => {
        const out = fs.openSync(path.join(outDir, `${kind}.ndjson`), "w");
        const err = fs.openSync(path.join(outDir, `${kind}.stderr`), "w");
        const child = spawn("kane-cli", ["run", flowText, "--url", url, "--agent", "--headless"], { stdio: ["ignore", out, err] });
        const timer = setTimeout(() => { child.kill("SIGTERM"); }, timeoutMs);
        child.on("error", (e) => { clearTimeout(timer); reject(new SettledError(`could not start kane-cli: ${e.message}`)); });
        child.on("close", (code) => {
          clearTimeout(timer);
          fs.closeSync(out); fs.closeSync(err);
          fs.writeFileSync(path.join(outDir, `${kind}.exit`), `exit=${code}\n`);
          const events = parseNdjson(path.join(outDir, `${kind}.ndjson`));
          const end = events.filter((e) => (e.type || e.event) === "run_end").pop();
          if (!end) return resolve({ kind, runEnd: null, error: `no run_end (exit ${code})` });
          fs.writeFileSync(path.join(outDir, `${kind}.run_end.json`), JSON.stringify(end, null, 2));
          try {
            const evDir = path.join(expandHome(end.session_dir), "evidence");
            const packs = fs.readdirSync(evDir).filter((f) => f.endsWith(".evidence"));
            if (packs.length === 1) fs.copyFileSync(path.join(evDir, packs[0]), path.join(outDir, `${kind}.evidence`));
          } catch { /* validation will report the missing pack */ }
          resolve({ kind, runEnd: end });
        });
      });
    },
  };
}

function portInUse(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const s = net.connect({ port, host }, () => { s.destroy(); resolve(true); });
    s.on("error", () => resolve(false));
  });
}
const httpOk = (url) => new Promise((resolve) => {
  http.get(url, (r) => { r.resume(); resolve(r.statusCode < 500); }).on("error", () => resolve(false));
});

// Start the candidate app fresh from its own directory. Refuses if something already holds the port,
// because verification must exercise the candidate code, not whatever happens to be running.
function appControl() {
  return {
    async start({ root, appDir, startCmd, url }) {
      const port = Number(new URL(url).port || 80);
      if (await portInUse(port)) throw new SettledError(`port ${port} is already in use. Stop the running server so verify can start the candidate code itself.`);
      const [cmd, ...args] = startCmd;
      const log = fs.openSync(path.join(root, ".settled", `app-${port}.log`), "w");
      const child = spawn(cmd, args, { cwd: path.join(root, appDir), env: { ...process.env, PORT: String(port) }, stdio: ["ignore", log, log] });
      for (let i = 0; i < 40; i++) {
        if (await httpOk(url)) return { stop: () => { child.kill("SIGTERM"); fs.closeSync(log); }, pid: child.pid };
        await new Promise((r) => setTimeout(r, 250));
      }
      child.kill("SIGTERM");
      throw new SettledError(`candidate app did not come up at ${url}`);
    },
  };
}

module.exports = { kaneRunner, appControl, portInUse };
