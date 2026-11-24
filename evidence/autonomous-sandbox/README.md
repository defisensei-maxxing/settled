# Autonomous repair through the Settled skill (sandbox run, 2026-11-24)

A fresh Claude Code agent, given a single instruction and no information about the bugs, claimed bounty `cart-badge-wrong-v3` in an isolated sandbox, found and fixed both bugs in one attempt, and passed real Kane verification through `settled verify`. Simulated escrow was released only after the maintainer independently checked the evidence.

## Setup (maintainer, 0 Kane credits)
1. Copied the repo with `scripts/demo-sandbox.sh` to a separate folder; `cart-badge-wrong-v3` reset to `draft` there.
2. `settled post` from the **recorded real baseline** (`evidence/cart-badge-wrong-v3/baseline-20261124T181329Z`), so the bounty was `open` with 50 USDC (simulated) held.
3. **Removed answer hints** from the sandbox: `patches/`, `docs/`, the detailed README, the tests, the history of the fixed runs, the v2 bounty, and comment lines in the shop that named the bugs. That edit was **comments and a package description only**; the code is identical (see [`sandbox-records/setup-hint-removal.diff`](sandbox-records/setup-hint-removal.diff)). The bounty's flows and fingerprint (`c5bda0a8…`) were unchanged.
4. Fresh git repo in the sandbox (`16f5137`) so the agent's changes are an exact diff.

## The single instruction
> Claim bounty cart-badge-wrong-v3 as solver `settled-agent` and solve it using the Settled skill.

Operating limits only (no hints): work only inside the sandbox and never read the original project; at most 3 repair attempts; at most 300 Kane credits; may run `settled verify`, may not run `payout`; may change only `demo-shop/`.

## What the agent did (its report, checked against the evidence below)
- Read the Settled skill from the sandbox copy and claimed the bounty.
- Diagnosed from the bounty's recorded Kane failures (badge 2 while the cart held 3; charged $60.00 against a $54.00 total) and then the code: `addToCart` rendered the badge before adding the item; `chargeFor` used `listPrice`.
- One repair attempt ([`sandbox-records/agent-fix.patch`](sandbox-records/agent-fix.patch), two single-line changes), sanity-checked the charge with curl, ran each flow once in Kane, stopped its server, then ran `settled verify`.

## Kane runs

| # | Run | Verdict | Credits | Evidence |
|---|---|---|---|---|
| 1 | Practice run, locked flow | passed `success.complete` | 34.90 | [`adhoc-runs/locked.*`](adhoc-runs) |
| 2 | Practice run, guard flow | passed `success.complete` | 46.28 | [`adhoc-runs/guard.*`](adhoc-runs) |
| 3 | `settled verify`, locked | **passed**: badge 0, then 3 clicks, badge 3, qty 3, total $54.00 | 26.21 | [`verify-20261124T185519Z-57cf4f94`](verify-20261124T185519Z-57cf4f94) |
| 4 | `settled verify`, guard | **passed**: qty 3, $54.00 at cart/checkout, **Charged $54.00** | 39.99 | same |
| | | | **147.38** of 300 | |

Sandbox ledger ([`sandbox-records/ledger-cart-badge-wrong-v3.ndjson`](sandbox-records/ledger-cart-badge-wrong-v3.ndjson)): posted, claimed (`settled-agent`), `verify_passed`, `paid`. Escrow: deposited 50 = `settled-agent` 50, held 0.

## Maintainer checks before payout
- `validateRunDir` in real mode (mocks rejected): OK. Seal intact (`SHA256SUMS` hash `f50d1164…`, identical to the sandbox original). Objective equals the v3 flow text.
- App content hash at payout (`a63c57d5…`) equals the hash recorded at verify.
- Practice-run credits confirmed from Kane's own session records.
- Agent changed only `demo-shop/` (2 lines). `.settled/` was changed only by `claim`/`verify`. The original repo was untouched.

## Limitations (read before citing this run)
- **Kane confirmed rather than steered.** The agent diagnosed from the bounty's *recorded* Kane failures plus reading the code, fixed both bugs at once, and every new Kane run passed. It never had to react to a fresh failure.
- **Easy bugs.** Two single-line bugs in a ~60-line app; diagnosis by reading the code was straightforward.
- **Same model family.** The agent started with no access to the conversation, but it's the same kind of model that fixed these bugs earlier in this project. Its fix is identical to `patches/solver-fix.patch`.
- **Isolation is by instruction.** "Don't read the original project" was an instruction, not a sandbox boundary. The agent reported reading nothing outside the sandbox except Kane's session records; this can't be independently proven.
- **Sandbox replay registry.** The sandbox re-posted using the recorded baseline's Kane sessions. That's allowed only because the replay registry is per repository (see the main README, "Trust model").
- **Simulated payment.** The 50 USDC is bookkeeping in the sandbox ledger, not money.

## Layout
- `verify-20261124T185519Z-57cf4f94/`: copied verbatim from the sandbox, original seal preserved.
- `adhoc-runs/`: the agent's practice runs (NDJSON, `run_end`, Kane evidence packs), redacted and sealed on import.
- `sandbox-records/`: sandbox ledger, bounty file, escrow snapshot, the agent's patch, the hint-removal diff, the sandbox git log; sealed on import.
