# Settled: 3-minute demo storyboard

**Story:** "An AI judge is only as good as the escrow around it." Show a bounty that can't be gamed: not by a half fix, not by a flaky run, and not by replaying evidence.

**Setup before recording (zero credits):** `scripts/demo-sandbox.sh ~/settled-demo`, then `cd ~/settled-demo`, with a terminal and a browser tab open. All the live Kane footage is pre-recorded from the real runs in `evidence/`, so the demo spends **no credits**. Optionally re-run one `verify --yes` live (about 60–90 credits) if approved.

| Time | Screen | Voice-over (approximate) |
|---|---|---|
| **0:00–0:20** · Hook | Shop page: click "Add shirt to cart" 3×, badge shows **2**. Checkout: total **$54.00**, receipt **Charged $60.00**. | "Two bugs: the cart badge lags behind, and checkout charges the list price. Someone posts a 50 USDC bounty for the badge. How do you pay a stranger only when it's *really* fixed?" |
| **0:20–0:45** · The trap | `evidence/cart-badge-wrong/regression/v1-false-pass…/screenshots`: cart with **4** shirts; empty-cart checkout **$0.00**. | "Our first attempt: Kane said PASS on buggy code. It clicked until the lagging badge read 3, and checked out an empty cart. An AI judge needs guard rails. That's what Settled is." |
| **0:45–1:15** · Lock the bounty | `node cli/settled.js post cart-badge-wrong-v3 --baseline evidence/cart-badge-wrong-v3/baseline-20261124T181329Z` → `open`. Flash `fingerprint`, `verdicts`. | "Posting requires proof the bug exists. Both flows must fail on the buggy app, as a confirmed product bug, on the exact check they target. The flows are fingerprinted with SHA-256 and pinned in a hash-chained ledger, so nobody can soften the test later." |
| **1:15–1:50** · Half fix rejected | `claim --solver judge`, `patch -p1 < patches/half-fix.patch`. Cut to recorded run 3: locked ✅, guard ❌ **Charged $60.00**. `payout` → `cannot pay out`. | "A solver fixes only the badge. Settled starts the candidate app itself and runs Kane on both flows. The locked flow passes, but the guard catches the overcharge. No payout." |
| **1:50–2:15** · Flaky runs don't pay | Quick montage: run 4 `agent_error`, run 6 `TargetClosedError`. `settled status cart-badge-wrong` shows `verify_failed ×3 → cancelled`. | "Real agents are flaky. An agent error or a browser crash is *inconclusive*: never a pass, never bug evidence. When the flows needed rewording, the maintainer cancelled through the ledger and the escrow was refunded." |
| **2:15–2:40** · Full fix pays | Apply `solver-fix.patch`. Cut to recorded run 8: badge **3**, **Charged $54.00**, both ✅. `payout` → `paid 50 USDC`, then `payout` again → refused. | "Both bugs fixed: both flows pass on fresh, sealed evidence bound to this exact code. Escrow releases once. Replaying the payout is refused." |
| **2:40–3:00** · Close | `node cli/settled.js escrow` (conservation ✓), then `npm test` (52 passing). README "Trust model". | "Every Kane run is redacted, sealed and in the repo. Payments are simulated and trust is single-machine today; anchoring the ledger off-repo is next. Settled: Kane judges, the escrow keeps it honest." |

## Shot list and assets
- Screenshots (already in the repo, redacted):
  - v1 trap: `evidence/cart-badge-wrong/regression/v1-false-pass-20261124T165309Z/screenshots/`
  - v2 baseline: `evidence/cart-badge-wrong/20261124T171620Z/screenshots/`
  - every other run: inside each `*.evidence` pack (`unzip -l`) under `tests/*/steps/*/screenshot.jpg`
- Kane's hosted run reports aren't linked; their share tokens were redacted.
- Keep each terminal command on screen for 2 s or more and increase the font size; pipe JSON through `jq -c '{status, passed, verdicts}'` if available.

## Claims to make, and not to make
- ✅ "Kane judged every run; a half fix was rejected; the full fix was paid in simulated escrow."
- ✅ "Inconclusive Kane runs never count."
- ❌ Don't claim real payments, decentralised trust, or that the Settled skill repaired the bug autonomously. The fixes were directed by a human working with Claude Code (see README, "What has actually been demonstrated").
