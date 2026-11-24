// Shared cart logic. Cart lives in localStorage as [{id, qty}].
const money = (n) => "$" + n.toFixed(2);
const loadCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } };
const saveCart = (c) => localStorage.setItem("cart", JSON.stringify(c));
const cartCount = (c) => c.reduce((n, i) => n + i.qty, 0);
let CATALOG = {};

function renderBadge(cart) {
  document.getElementById("cart-badge").textContent = cartCount(cart);
}

function addToCart(id) {
  const cart = loadCart();
  // BUG (locked flow): badge is rendered from the cart *before* the new item is added,
  // so it always lags one behind. Add 3 shirts -> badge shows 2.
  renderBadge(cart);
  const line = cart.find((i) => i.id === id);
  if (line) line.qty += 1; else cart.push({ id, qty: 1 });
  saveCart(cart);
  const msg = document.getElementById("added-msg");
  if (msg) msg.textContent = "Added " + CATALOG[id].name;
}

function cartTotal(cart) {
  return cart.reduce((t, i) => t + CATALOG[i.id].salePrice * i.qty, 0);
}

async function boot(page) {
  CATALOG = await (await fetch("/api/catalog")).json();
  renderBadge(loadCart());
  if (page && window[page]) window[page]();
}
