#!/usr/bin/env bash
# Settled: verify the v2 fingerprint (full SHA-256 over locked + guard), start the demo shop,
# run locked + guard flows through Kane CLI, save raw NDJSON, each run_end, Kane's evidence pack,
# and a summary.json with verdicts, observed values and credits.
# Usage: scripts/run-flows.sh [bounty-id]
set -uo pipefail
ID="${1:-cart-badge-wrong}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
URL="$(node -e "console.log(require('./.settled/bounties/$ID.json').demo_url)")"
OUT="evidence/$ID/$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -p "$OUT"

echo "== kane-cli $(kane-cli --version)"
kane-cli whoami >/dev/null 2>&1 || { echo "Kane not authenticated: run kane-cli login --oauth"; exit 2; }

echo "== fingerprint"
node scripts/fingerprint.js "$ID" > "$OUT/fingerprint.json" || { cat "$OUT/fingerprint.json"; echo "Fingerprint mismatch: refusing to run"; exit 3; }
node -e 'const f=require(process.argv[1]);console.log("match="+f.match+" combined="+f.computed.combined)' "$ROOT/$OUT/fingerprint.json"

if ! curl -fs -o /dev/null "$URL"; then
  echo "== starting demo shop"
  (cd demo-shop && PORT="${URL##*:}" node server.js > "$ROOT/$OUT/shop.log" 2>&1 &)
  for i in $(seq 1 20); do curl -fs -o /dev/null "$URL" && break; sleep 0.5; done
fi
curl -fs -o /dev/null "$URL" || { echo "Demo shop not reachable at $URL"; exit 4; }

for kind in locked guard; do
  # Exactly the trimmed text that was fingerprinted, newlines preserved.
  flow="$(node -e 'process.stdout.write(require("fs").readFileSync(process.argv[1],"utf8").trim())' ".settled/flows/$ID.$kind.md")"
  echo "== $kind flow"
  kane-cli run "$flow" --url "$URL" --agent --headless > "$OUT/$kind.ndjson" 2> "$OUT/$kind.stderr"
  echo "exit=$?" > "$OUT/$kind.exit"
  node -e '
    const fs=require("fs"), path=require("path");
    const [ndjson, outDir, kind] = process.argv.slice(1);
    const lines=fs.readFileSync(ndjson,"utf8").split("\n").filter(Boolean);
    let end=null; for (const l of lines){ try{const e=JSON.parse(l); if((e.type||e.event)==="run_end") end=e;}catch{} }
    if(!end){ console.log("NO run_end event found ("+lines.length+" lines). See "+ndjson); process.exit(0); }
    fs.writeFileSync(path.join(outDir, kind+".run_end.json"), JSON.stringify(end,null,2));
    // Copy Kane evidence pack (zip with screenshots, HAR, logs) next to the run.
    try { const ev=path.join(end.session_dir,"evidence"); for (const f of fs.readdirSync(ev)) fs.copyFileSync(path.join(ev,f), path.join(outDir, kind+".evidence")); } catch {}
    const mem=(end.context&&end.context.memory)||{};
    const observed=Object.fromEntries(Object.entries(mem).map(([k,v])=>[k,{extracted:v.extracted_value,expected:v.expected_value,operator:v.operator,reasoning:v.reasoning}]));
    const s={kind,status:end.status,reason:end.reason,reason_code:end.reason_code,summary:end.summary,final_state:end.final_state,observed,
      error:(end.per_flow_metadata||[]).map(m=>m.error_message).filter(Boolean),duration:end.duration,credits_consumed:end.credits_consumed,
      session_dir:end.session_dir,test_url:end.test_url,ts:end.ts};
    const sp=path.join(outDir,"summary.json"); const all=fs.existsSync(sp)?JSON.parse(fs.readFileSync(sp,"utf8")):{};
    all[kind]=s; all.total_credits=(all.locked?.credits_consumed||0)+(all.guard?.credits_consumed||0);
    fs.writeFileSync(sp, JSON.stringify(all,null,2));
    console.log(JSON.stringify({status:s.status,reason:s.reason,reason_code:s.reason_code,final_state:s.final_state,credits:s.credits_consumed},null,2));
  ' "$OUT/$kind.ndjson" "$OUT" "$kind"
done
node -e '
  const {candidateState}=require("./cli/lib/core"); const b=require("./.settled/bounties/"+process.argv[1]+".json");
  require("fs").writeFileSync(process.argv[2]+"/candidate.json", JSON.stringify(candidateState(process.cwd(), b), null, 2));
' "$ID" "$OUT"
node scripts/redact-evidence.js "$OUT"   # scrub identity/session data, seal SHA256SUMS
echo "== evidence saved in $OUT"
