// Zero-dependency demo shop for the Settled bounty. Run: node server.js  (PORT defaults to 3000)
const http = require("http");
const fs = require("fs");
const path = require("path");

// Server-side catalog. The storefront shows sale prices; checkout must charge what the shopper saw.
const CATALOG = {
  shirt: { name: "Settled Tee", listPrice: 20.0, salePrice: 18.0 },
  cap: { name: "Kane Cap", listPrice: 15.0, salePrice: 15.0 },
};

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const PUBLIC = path.join(__dirname, "public");

function chargeFor(items) {
  let total = 0;
  for (const { id, qty } of items) {
    const p = CATALOG[id];
    if (!p) throw new Error("unknown item " + id);
    // BUG (guard flow): charges list price instead of the sale price the shopper was shown.
    total += p.listPrice * qty;
  }
  return Math.round(total * 100) / 100;
}

http
  .createServer((req, res) => {
    if (req.method === "GET" && req.url === "/api/catalog") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(CATALOG));
    }
    if (req.method === "POST" && req.url === "/api/checkout") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const { items } = JSON.parse(body || "{}");
          const charged = chargeFor(items || []);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ orderId: "ord_" + Date.now().toString(36), charged }));
        } catch (e) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    const urlPath = req.url.split("?")[0];
    const file = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const full = path.join(PUBLIC, path.extname(file) ? file : file + ".html");
    if (!full.startsWith(PUBLIC) || !fs.existsSync(full)) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(full)] || "text/plain" });
    fs.createReadStream(full).pipe(res);
  })
  .listen(process.env.PORT || 3000, () => console.log("Demo shop on http://localhost:" + (process.env.PORT || 3000)));
