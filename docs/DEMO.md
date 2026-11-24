# Settled: 3-minute demo storyboard

**Story:** "An AI agent fixes the bug, an AI judge checks it, and the escrow keeps both honest." Show a bounty that can't be gamed by a half fix, a flaky run or replayed evidence, and then an agent earning it on its own.

**Recording cost: zero Kane credits.** Every Kane result shown comes from real recorded runs in `evidence/`. Terminal commands run in a sandbox: `scripts/demo-sandbox.sh ~/settled-demo && cd ~/settled-demo`.

| Time | Screen | Voice-over (approximate) |
|---|---|---|
| **0:00–0:15** · Hook | Shop: click "Add shirt" 3×, badge shows **2**. Checkout: total **$54.00**, receipt **Charged $60.00**. | "Two bugs: the cart badge lags behind, and checkout overcharges. There's a 50 USDC bounty. How do you pay a stranger, or an AI agent, only when it's *really* fixed?" |
| **0:15–0:35** · The trap | `evidence/cart-badge-wrong/regression/v1-false-pass…/screenshots`: cart with **4** shirts; empty-cart checkout **$0.00**. | "Our first attempt: Kane said PASS on buggy code. It clicked until the lagging badge read 3, and checked out an empty cart. An AI judge needs guard rails. That's Settled." |
| **0:35–0:55** · Lock it | `node cli/settled.js post cart-badge-wrong-v3 --baseline evidence/cart-badge-wrong-v3/baseline-20261124T181329Z` → `open`. | "Posting requires proof: both flows must fail on the buggy app, as a confirmed product bug, on the exact check they target. The flows are SHA-256 fingerprinted and pinned in a hash-chained ledger." |
| **0:55–1:20** · Half fix rejected | Recorded run 3: locked ✅, guard ❌ **Charged $60.00**. `claim`, then `payout` → `cannot pay out`. | "A solver fixes only the badge. Settled starts the app itself and runs Kane on both flows. The guard catches the overcharge. No payout." |
| **1:20–1:35** · Flaky runs don't pay | Quick cuts: run 4 `agent_error`, run 6 `TargetClosedError` → `inconclusive`. | "Agents are flaky. An agent error or a browser crash is never a pass, and never bug evidence." |
| **1:35–2:25** · **An agent earns it** | `evidence/autonomous-sandbox/README.md`: the one-line instruction. Then `agent-fix.patch` (2 lines), the Kane runs table, recorded run 9 screenshot **Charged $54.00**. Then `settled status` → `verify_passed → paid`, `payout` again → refused. | "Now the real test. A fresh Claude Code agent gets one instruction: claim this bounty and solve it with the Settled skill. It has 3 attempts and 300 credits, and no hints. It reads Kane's failure evidence, finds both bugs, fixes them in one attempt and passes Kane verification. 147 credits. The maintainer checks the sealed evidence and releases the escrow, exactly once." |
| **2:25–2:45** · Honest books | `node cli/settled.js escrow` (deposited = balances + held ✓), `npm test` (52 passing). | "Escrow is derived from the ledger and conserves every cent. Every Kane run is redacted, sealed and in the repo." |
| **2:45–3:00** · Close | README "Trust model". | "Payments are simulated and trust is single-machine today; anchoring the ledger off-repo is next. Settled: agents fix, Kane judges, the escrow keeps it honest." |

## Shot list and assets
- Sandbox autonomous run: `evidence/autonomous-sandbox/` (README, `sandbox-records/agent-fix.patch`, `sandbox-records/ledger-cart-badge-wrong-v3.ndjson`). Screenshots are inside `verify-20261124T185519Z-57cf4f94/guard.evidence` under `tests/*/steps/*/screenshot.jpg` (the final step shows Charged $54.00).
- v1 trap: `evidence/cart-badge-wrong/regression/v1-false-pass-20261124T165309Z/screenshots/`
- Half fix (run 3) and flaky runs (4–6): `evidence/cart-badge-wrong/verify-*` and `evidence/cart-badge-wrong-v3/baseline-20261124T180739Z`, each with its `*.evidence` pack.
- Kane's hosted run reports aren't linked; their share tokens were redacted.
- Keep commands on screen for 2 s or more and increase the font size.

## Claims to make, and not to make
- ✅ "Kane judged every run. A half fix was rejected. Inconclusive runs never counted."
- ✅ "A fresh agent, given one instruction and no hints, fixed both bugs in one attempt and passed Kane verification in a sandbox, for 147 credits."
- ❌ Don't claim Kane feedback *steered* the agent through failures. It diagnosed from recorded failures plus the code, and Kane confirmed.
- ❌ Don't imply hard bugs, enforced isolation, real payments or decentralised trust (see README, "What has actually been demonstrated" and "Trust model").
