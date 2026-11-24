---
name: settled
description: Claim and solve Settled bug bounties. Calls kane-cli itself, reads structured verdicts, retries on failure, and only submits when both the locked flow and guard flow pass.
---

# Settled Skill

You are solving a Settled bounty. Kane CLI is the only judge. You must call it yourself and react to its evidence.

## Ready check

Before any run, confirm Kane is available:

```bash
kane-cli whoami
```

If not authenticated, tell the user to run `kane-cli login --oauth` once.

## Claim and solve loop

When the user says "claim bounty" or you are given a bounty folder:

1. Read `.settled/bounties/<bounty-id>.json` and the flow files. Only an `open` bounty can be claimed.
2. Check state and lock: `node cli/settled.js status <bounty-id>`. It refuses if the flows, the bounty file or the ledger disagree. Report the error and stop if it does.
3. Claim it for the solver: `node cli/settled.js claim <bounty-id> --solver <name>`.
4. Iterate on the fix with ad-hoc Kane runs (each run consumes Kane credits, so tell the user before running):

   ```bash
   cd demo-shop && node server.js     # restart after every code change; serves http://localhost:3000
   kane-cli run "<exact flow text from the .md file>" --url http://localhost:3000 --agent --headless
   ```

   Parse the NDJSON stream up to `run_end`: status, reason, reason_code, final_state, credits_consumed.
5. Decision:
   - Either flow fails → summarise Kane's reason, make a small code change, restart the app, re-run both flows. Max 3 attempts.
   - Both pass → stop your own server (verify must start the candidate itself on the same port) and ask the user to run
     `node cli/settled.js verify <bounty-id> --yes`. Verify runs Kane independently, seals the evidence and records it in the ledger.
6. Payout is `node cli/settled.js payout <bounty-id>`. It releases simulated escrow only for the latest passing verification, with unchanged code, flows and evidence.
7. Never claim done without a fresh pass from Kane. Never edit the locked flow text, the ledger, the escrow or the evidence. Never present mocked Kane results as real.

## Output style

After every Kane run show:

- Status: passed / failed
- Reason (from Kane)
- What you will change next (if failed)
