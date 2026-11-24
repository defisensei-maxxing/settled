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

## Layout

```
.settled/
  bounties/cart-badge-wrong.json        # bounty: reward, fingerprint, flows, status
  flows/cart-badge-wrong.locked.md      # the flow the fix must pass
  flows/cart-badge-wrong.guard.md       # regression guard that must also pass
.claude/skills/settled/SKILL.md         # Claude Code skill that runs Kane and reacts to its verdicts
demo-shop/                              # buggy target app (plain HTML + Node, zero deps)
scripts/fingerprint.js                  # recompute / verify a bounty fingerprint
```
