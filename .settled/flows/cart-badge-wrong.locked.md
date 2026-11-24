Open http://localhost:3000/cart. If the cart lists any items, click "Empty cart". Verify the cart shows "Cart is empty" and the header cart badge shows 0.
Go to http://localhost:3000/ and click the "Add shirt to cart" button exactly 3 times in total, one click after another. Do not repeat, retry, or add clicks based on the cart badge or any other page state; the badge must never be used as a loop or stop condition.
Without reloading or leaving the page, verify the header cart badge shows exactly 3. If it shows any other number, the test fails.
Open the cart page. Verify the Settled Tee row shows a quantity of exactly 3.
Verify the cart total is exactly $54.00.
