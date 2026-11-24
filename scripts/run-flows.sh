#!/usr/bin/env bash
# Settled: verify fingerprint, start the demo shop, run locked + guard flows through Kane CLI,
# save raw NDJSON and print each run_end verdict. Usage: scripts/run-flows.sh [bounty-id]
set -uo pipefail
ID="${1:-cart-badge-wrong}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
URL="$(node -e "console.log(require('./.settled/bounties/$ID.json').demo_url)")"
OUT="evidence/$ID/$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -p "$OUT"

echo "== kane-cli $(kane-cli --version)"
kane-cli whoami >/dev/null 2>&1 || { echo "Kane not authenticated: run kane-cli login --oauth"; exit 2; }

echo "== fingerprint"
node scripts/fingerprint.js "$ID" | tee "$OUT/fingerprint.json" || { echo "Fingerprint mismatch: refusing to run"; exit 3; }

if ! curl -fs -o /dev/null "$URL"; then
  echo "== starting demo shop"
  (cd demo-shop && PORT="${URL##*:}" node server.js > "$ROOT/$OUT/shop.log" 2>&1 &)
  for i in $(seq 1 20); do curl -fs -o /dev/null "$URL" && break; sleep 0.5; done
fi
curl -fs -o /dev/null "$URL" || { echo "Demo shop not reachable at $URL"; exit 4; }

for kind in locked guard; do
  flow="$(tr -d '\n' < ".settled/flows/$ID.$kind.md")"
  echo "== $kind flow: $flow"
  kane-cli run "$flow" --url "$URL" --agent --headless > "$OUT/$kind.ndjson" 2> "$OUT/$kind.stderr"
  echo "exit=$?" > "$OUT/$kind.exit"
  node -e '
    const fs=require("fs"); const lines=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean);
    let end=null; for (const l of lines){ try{const e=JSON.parse(l); if((e.type||e.event)==="run_end") end=e;}catch{} }
    if(!end){ console.log("NO run_end event found ("+lines.length+" lines). See "+process.argv[1]); process.exit(0); }
    fs.writeFileSync(process.argv[2], JSON.stringify(end,null,2)); console.log(JSON.stringify(end,null,2));
  ' "$OUT/$kind.ndjson" "$OUT/$kind.run_end.json"
done
echo "== evidence saved in $OUT"
