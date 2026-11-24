# Regression evidence: v1 flows false-passed against the buggy shop

Run: 2026-11-24T16:53Z, kane-cli 0.10.9, demo shop with both planted bugs present.
v1 fingerprint (16-hex, locked flow only): `0ad2826969a0880a`. The flow texts are in `flows-v1/`.

| Flow | Kane verdict | What really happened | Credits |
|---|---|---|---|
| locked | `passed` (success.complete) | Kane turned "Add 3 shirts" into a loop: "click until the badge shows 3" (`retries: 4`). Because the badge lags one behind, the cart held **4 shirts, $72.00** when Kane read "Cart 3". Screenshot: `screenshots/locked-cart-qty4-total72.jpg`. | 25.67 |
| guard | `passed` (success.complete) | Kane started a fresh browser session, so the cart in localStorage was empty. It checked out **"Cart is empty", Order total $0.00, Charged $0.00**, and 0 − 0 = 0 passed. Screenshot: `screenshots/guard-empty-cart-charged0.jpg`. | 20.24 |

Lessons carried into v2 flows:
1. Never let the badge (the thing under test) act as a loop or stop condition: click a fixed number of times.
2. Assert absolute expected values ($54.00, qty 3), not values derived from the same buggy page.
3. Each flow sets up its own state; an empty-cart checkout must fail.

`SHA256SUMS` covers every file in this folder except this note.
