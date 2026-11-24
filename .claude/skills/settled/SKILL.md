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

1. Read `.settled/bounties/<bounty-id>.json` and the locked flow file(s).
2. Confirm the fingerprint matches the current flow text (hash). If it does not, refuse and report the mismatch.
3. Start the demo app if needed and note the local URL.
4. For the locked flow (and any guard flow), run:

   ```bash
   kane-cli run "<flow text>" --url <local-url> --agent --headless
   ```

5. Parse the NDJSON stream. Stop at the `run_end` event. Extract status, reason/summary, final_state, duration, and any evidence path.
6. Decision:
   - If both locked flow and guard flow return status `passed` → stop and tell the user to run `settled verify`.
   - If either fails → summarise the reason, make a small code change, re-run both flows. Max 3 attempts.
7. Never claim done without a fresh pass from Kane. Never edit the locked flow text.

## Output style

After every Kane run show:

- Status: passed / failed
- Reason (from Kane)
- What you will change next (if failed)
