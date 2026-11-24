# Settled

Kane CLI Online Hackathon entry.

**Settled** is an escrow for bug bounties where Kane CLI is the neutral judge. A maintainer locks a bounty to a plain-English test flow. A solver's fix is paid out only when Kane CLI runs that locked flow, plus a guard flow, against the app and both pass.

## Layout

```
.settled/
  bounties/cart-badge-wrong.json        # bounty: reward, fingerprint, flows, status
  flows/cart-badge-wrong.locked.md      # the flow the fix must pass
  flows/cart-badge-wrong.guard.md       # regression guard that must also pass
.claude/skills/settled/SKILL.md         # Claude Code skill that runs Kane and reacts to its verdicts
```
