# Settled

Kane CLI Online Hackathon entry.

**Settled** is an escrow for bug bounties where Kane CLI is the neutral judge. A maintainer locks a bounty to a plain-English test flow. A solver's fix is paid out only when Kane CLI runs that locked flow, plus a guard flow, against the app and both pass.

## Run the demo shop

```bash
cd demo-shop && npm start   # http://localhost:3000, no dependencies
```

The shop ships with two planted bugs:

| Bug | Where | Caught by |
|---|---|---|
| Add 3 shirts → cart badge shows **2** (badge renders before the item is added) | `demo-shop/public/shop.js` `addToCart` | locked flow |
| Cart and checkout show the sale total (**$54.00**), but the order is charged list price (**$60.00**) | `demo-shop/server.js` `chargeFor` | guard flow |

## Fingerprint

A bounty's `fingerprint` (scheme `settled-fp-v2`) is a set of full SHA-256 hashes: one over the trimmed locked flow, one over the trimmed guard flow, and `combined = sha256("settled-fp-v2\n" + id + "\n" + lockedHash + "\n" + guardHash)`. The verifier also checks that the flow text in the bounty JSON is byte-identical to the `.md` files. This pins the bounty to both flows the maintainer funded, so nobody can soften either test after the fact.

A bounty stays `draft` until a baseline run against the unfixed shop shows both flows fail for their planted bug. See `evidence/<id>/regression/` for why: the v1 flows false-passed.

```bash
node scripts/fingerprint.js cart-badge-wrong           # verify (exit 1 on mismatch)
node scripts/fingerprint.js cart-badge-wrong --write   # maintainer only: re-pin after editing flows
scripts/run-flows.sh cart-badge-wrong                  # verify, start shop, run both flows via Kane
```

## Settled CLI

Zero-dependency Node CLI (`cli/settled.js`, also exposed as the `settled` bin). Kane CLI is the only judge; escrow is **simulated**.

```bash
node cli/settled.js post   <id> --baseline <evidence-dir> [--accept-legacy-baseline]   # lock + fund on a verified baseline
node cli/settled.js post   <id> --run-baseline --yes        # or run a fresh baseline (uses Kane credits)
node cli/settled.js claim  <id> --solver <name>
node cli/settled.js verify <id> --yes                       # starts the candidate app, runs both flows via Kane (uses credits)
node cli/settled.js payout <id>                             # releases simulated escrow
node cli/settled.js status <id>
npm test                                                    # unit tests, mocked Kane, no credits
```

State machine: `draft → open (post) → claimed (claim) → verified (verify pass) → paid (payout)`; a failed verify returns to `claimed`.

| Protection | How |
|---|---|
| Persistent, tamper-evident state | `.settled/ledger/<id>.ndjson`: append-only, hash-chained events. Every command replays the chain and refuses if the bounty file disagrees with it. |
| Lock | `post` stores the combined fingerprint in the ledger. Changing a flow later, even re-pinned with `fingerprint.js --write`, blocks verify and payout. |
| Baseline gate | `post` requires both flows to fail conclusively on the unfixed app (`assertion_error.*`, not infrastructure errors), on evidence produced for this exact fingerprint. |
| Evidence validation | The Kane evidence pack's objective must equal the locked flow text byte-for-byte, its session id must match the stream, `run_end.json` must match the NDJSON, and `SHA256SUMS` must cover every file. A pass needs `success.complete` with at least one assertion (no vacuous passes). |
| Replay protection | Each Kane session can be used once across all ledgers. Verify runs must start after the verification nonce is issued. Payout consumes one verification and needs identical app code (content hash), flows and evidence seal. |
| Independence | `verify` starts the candidate app itself (it refuses if the port is already taken) and runs Kane; solver-supplied results are never accepted. |
| Mocks | Only under `test/`, labelled `mock:true` / producer `kane-cli-mock`. The CLI always validates in real mode and rejects them. |

Evidence is scrubbed of identity, share tokens and local paths by `scripts/redact-evidence.js` before it is sealed.

## Layout

```
.settled/
  bounties/cart-badge-wrong.json        # bounty: reward, fingerprint, flows, status
  flows/cart-badge-wrong.locked.md      # the flow the fix must pass
  flows/cart-badge-wrong.guard.md       # regression guard that must also pass
.claude/skills/settled/SKILL.md         # Claude Code skill that runs Kane and reacts to its verdicts
demo-shop/                              # buggy target app (plain HTML + Node, zero deps)
scripts/fingerprint.js                  # recompute / verify a bounty fingerprint
scripts/redact-evidence.js              # scrub + seal evidence dirs
scripts/run-flows.sh                    # manual: run both flows via Kane and save evidence
cli/                                    # settled CLI (post/claim/verify/payout/status)
test/                                   # unit tests with mocked Kane (never real evidence)
.settled/ledger/, .settled/escrow.json  # persistent bounty state, simulated escrow
```
