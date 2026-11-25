# Autonomous repair driven by Kane feedback (sandbox run, 2026-11-25)

A fresh Claude Code agent claimed bounty `cart-badge-wrong-v3` in an isolated sandbox that started from a **half fix** (badge fixed, overcharge still there). It ran both Kane flows against the code as it stood, saw the locked flow pass and the guard flow fail with **Charged $60.00**, fixed only what Kane flagged, and passed real Kane verification through `settled verify`. Simulated escrow was released only after the maintainer independently checked the evidence.

This run answers the main limitation of the [first autonomous run](../autonomous-sandbox/README.md), where Kane only confirmed a fix the agent had already worked out from the code.

## Setup (maintainer, 0 Kane credits)
1. Copied the repo with `scripts/demo-sandbox.sh ~/settled-sandbox-loop`; `cart-badge-wrong-v3` reset to `draft` there.
2. `settled post` from the **recorded real baseline** (`evidence/cart-badge-wrong-v3/baseline-20261124T181329Z`), so the bounty was `open` with 50 USDC (simulated) held. Posting happened *before* the half fix because the baseline is bound to the original buggy code.
3. Applied `patches/half-fix.patch`: the badge is rendered after the item is added; checkout still charges the list price.
4. **Removed answer hints**, as in the first sandbox: `patches/`, `docs/`, the detailed README, the tests, the fixed-run history (including `evidence/autonomous-sandbox/`), the v2 bounty, the `// BUG` comments, and the `// Fixed (bounty …)` comment the half-fix patch adds. Compared with the original buggy shop, the starting code differs only by the half fix plus removed comments ([`sandbox-records/setup-starting-code.diff`](sandbox-records/setup-starting-code.diff)). The bounty's flows and fingerprint (`c5bda0a8…`) were unchanged.
5. Fresh git repo in the sandbox (`660e5f9`) so the agent's changes are an exact diff.

## The single instruction
> Claim bounty cart-badge-wrong-v3 as solver loop-agent and solve it using the Settled skill. Before changing any code, run both Kane flows against the current code and use Kane's result to decide what to fix.

Operating limits only (no hints): work only inside the sandbox and never read the original project or other demo folders; at most 3 repair attempts; at most 300 Kane credits; may run `settled verify`, may not run `payout`; may change only `demo-shop/`; save every ad-hoc Kane run's NDJSON for audit.

## What happened

| # | Time (UTC) | Run | Verdict | Observed | Credits | Running |
|---|---|---|---|---|---|---|
| 1 | 01:32:19 | Practice, locked, **unmodified code** | passed `success.complete` | badge 3, qty 3, $54.00 | 33.91 | 33.91 |
| 2 | 01:33:56 | Practice, guard, **unmodified code** | **failed** `assertion_error.confirmed_product_bug` | order total $54.00, **Charged $60.00** | 47.16 | 81.08 |
| – | 01:36:19 | **Agent edits `demo-shop/server.js`** (file modification time) | | | | |
| 3 | 01:36:29 | Practice, guard, attempt 1 | passed `success.complete` | **Charged $54.00** | 36.47 | 117.55 |
| 4 | 01:38:51 | Practice, locked, attempt 1 | passed `success.complete` | badge 3, qty 3, $54.00 | 30.35 | 147.90 |
| 5 | 01:40:30 | `settled verify`, locked | **passed** | badge 0, then 3 clicks, badge 3, qty 3, $54.00 | 22.72 | 170.63 |
| 6 | | `settled verify`, guard | **passed** | qty 3, $54.00 at cart/checkout, **Charged $54.00** | 35.72 | **206.34** |

The agent's diagnosis, from run 2: only the server-side charge is wrong. $60 / 3 = $20, the list price, while the page shows the $18 sale price. It changed `chargeFor` to use `salePrice` ([`sandbox-records/agent-fix.patch`](sandbox-records/agent-fix.patch), one line) and left the badge code alone because Kane showed it already worked. **1 of 3 repair attempts, 206.34 of 300 credits**, no agent or infrastructure errors.

Sandbox ledger ([`sandbox-records/ledger-cart-badge-wrong-v3.ndjson`](sandbox-records/ledger-cart-badge-wrong-v3.ndjson)): posted, claimed (`loop-agent`), `verify_passed`, `paid`. Escrow: deposited 50 = `loop-agent` 50, held 0. A second `payout` was refused: `settled: cannot pay out: bounty is paid`.

## Maintainer checks before payout
- `validateRunDir` in real mode (mocks rejected): OK. Seal intact (`SHA256SUMS` hash `bbc6629d…`, equal to the `sums_sha256` in the sandbox ledger's `verify_passed` event). Objective equals the v3 flow text.
- App content hash at payout (`a63c57d5…`) equals the hash recorded at verify, and it's the same fully fixed code as the [first autonomous run](../autonomous-sandbox/README.md) and the human-directed run 8.
- All four practice runs were compared with Kane's own session records (status, reason code, credits): all match.
- Order of events: run 2 observed $60.00 *before* `server.js` was modified; run 3 observed $54.00 after. Kane's failure came first and the fix followed it.
- Agent changed one line in `demo-shop/`. `.settled/` was changed only by `claim`/`verify`. The original repo was untouched.

## Limitations (read before citing this run)
- **The answer was also in the recorded baseline.** The bounty's baseline evidence (needed to post it) shows the same $60.00 failure, so the agent could have read it there. Its saved runs show it ran Kane against the current code first, as instructed, and acted after that failure; it reported not reading other sources, which can't be independently proven.
- **One loop iteration.** The first fix passed, so this shows fail → fix → pass once, not repeated failing attempts.
- **Easy bug.** One line in a ~60-line app, and the $60 / 3 = $20 arithmetic points straight at it.
- **Same model family** as the earlier fixes in this project, with no access to that conversation.
- **Isolation is by instruction**, not an enforced boundary.
- **Sandbox replay registry.** The sandbox re-posted with the recorded baseline's Kane sessions, which is allowed only because the replay registry is per repository (see the main README, "Trust model").
- **Simulated payment.** The 50 USDC is bookkeeping in the sandbox ledger, not money.

## Layout
- `verify-20261125T014030Z-c673ea9a/`: copied verbatim from the sandbox, original seal preserved.
- `adhoc-runs/`: the agent's four practice runs (NDJSON as saved by the agent, `run_end`, Kane evidence packs), redacted and sealed on import.
- `sandbox-records/`: sandbox ledger, bounty file, escrow snapshot, the agent's patch, the starting-code diff, the sandbox git log; sealed on import.
