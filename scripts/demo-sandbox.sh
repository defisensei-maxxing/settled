#!/usr/bin/env bash
# Create a throwaway copy of this repo where bounty cart-badge-wrong-v3 is reset to DRAFT, so the full
# post -> claim -> verify -> payout story can be replayed without touching the recorded history here.
#
# Usage: scripts/demo-sandbox.sh [target-dir]      (default: a new temp dir)
#
# Zero-credit steps: post (re-uses the recorded REAL baseline evidence), claim, half-fix, payout refusal.
# Steps marked (credits) run real Kane CLI.
#
# Trust note: the replay registry is per repository. A fresh copy has no record of the recorded
# baseline's Kane sessions, which is why the sandbox can re-post with them. See README "Trust model".
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="${1:-$(mktemp -d "${TMPDIR:-/tmp}/settled-demo-XXXXXX")}"
ID=cart-badge-wrong-v3
mkdir -p "$DST"
rsync -a --exclude .git --exclude node_modules --exclude '.settled/.lock' --exclude '.settled/app-*.log' "$SRC/" "$DST/"
cd "$DST"
rm -f ".settled/ledger/$ID.ndjson"
node -e '
  const fs=require("fs"),p=".settled/bounties/"+process.argv[1]+".json",b=JSON.parse(fs.readFileSync(p));
  b.status="draft"; for (const k of ["locked","claim","last_verification","payout","cancellation"]) delete b[k];
  b.activation={rule:b.activation&&b.activation.rule,baseline_run:null}; b.proof_run_id=null;
  fs.writeFileSync(p, JSON.stringify(b,null,2)+"\n");
  require("./cli/lib/escrow").writeSnapshot(".");
' "$ID"
node scripts/fingerprint.js "$ID" >/dev/null
BASE="$(ls -d evidence/$ID/baseline-20261124T181329Z)"
cat <<EOF
Sandbox ready: $DST   (demo-shop has both planted bugs; $ID is draft)

  cd "$DST"
  S="node cli/settled.js"
  \$S status $ID
  \$S post   $ID --baseline $BASE          # real recorded baseline: both flows fail on target
  \$S claim  $ID --solver judge
  git apply patches/half-fix.patch 2>/dev/null || patch -p1 < patches/half-fix.patch
  \$S payout $ID                            # refused: nothing verified
  \$S verify $ID --yes                      # (credits) expect locked PASS, guard FAIL (Charged \$60.00)
  patch -p1 -R < patches/half-fix.patch && patch -p1 < patches/solver-fix.patch
  \$S verify $ID --yes                      # (credits) expect both PASS
  \$S payout $ID                            # releases simulated 50 USDC to judge
  \$S escrow                                # conservation audit
EOF
