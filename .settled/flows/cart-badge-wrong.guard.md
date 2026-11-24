In this fresh, independent browser session, open http://localhost:3000/cart. If the cart lists any items, click "Empty cart". Verify the cart shows "Cart is empty".
Go to http://localhost:3000/ and click the "Add shirt to cart" button exactly 3 times in total. Do not add clicks based on the cart badge or any other page state.
Open the cart page. Verify the Settled Tee row shows a quantity of exactly 3 and the cart total is exactly $54.00. If the cart is empty or the quantity is not 3, the test fails.
Click Checkout. Verify the checkout summary lists 3 × Settled Tee and the order total is exactly $54.00. If the checkout page shows "Cart is empty", the test fails.
Click "Place order". Verify the order confirmation shows a charged amount of exactly $54.00. A charged amount of $0.00, or any amount other than $54.00, fails the test.
