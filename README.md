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

A bounty's `fingerprint` is the first 16 hex chars of SHA-256 over the locked flow text, trimmed. It pins the bounty to the exact flow the maintainer funded, so nobody can soften the test after the fact.

```bash
node scripts/fingerprint.js cart-badge-wrong
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
