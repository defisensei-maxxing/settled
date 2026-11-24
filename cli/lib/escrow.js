// Simulated escrow, DERIVED from the hash-chained bounty ledgers (never edited directly).
//
//   posted     maintainer deposits the reward (+A available), which is immediately held (-A available, +A escrow)
//   cancelled  held reward is refunded to the depositing maintainer (-A escrow, +A maintainer)
//   paid       held reward is released to the claimant (-A escrow, +A solver)
//
// Conservation invariant, per currency:  sum(account balances) + sum(held) == total deposited.
// .settled/escrow.json is only a snapshot of compute(); `settled escrow` reports any drift from it.
// No real funds move anywhere: this is a simulation for the hackathon demo.
const fs = require("fs");
const path = require("path");
const { readJSON, writeJSONAtomic, SettledError } = require("./util");
const ledger = require("./ledger");

const MICRO = 1e6; // integer micro-units avoid floating point drift
const toMicro = (n) => Math.round(Number(n) * MICRO);
const fromMicro = (m) => m / MICRO;
const snapshotPath = (root) => path.join(root, ".settled", "escrow.json");

function compute(root) {
  const dir = path.join(root, ".settled", "ledger");
  const ids = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".ndjson")).map((f) => f.replace(/\.ndjson$/, "")).sort() : [];
  const balances = {}; const deposited = {}; const held = {}; const holds = {}; const journal = [];
  const add = (map, k, m) => { map[k] = (map[k] || 0) + m; };
  const post = (bounty, e, kind, account, m, cur) => {
    if (account) add(balances, `${account}:${cur}`, kind === "hold" ? -m : m);
    journal.push({ bounty, seq: e.seq, at: e.at, kind, account, amount: fromMicro(m), currency: cur });
  };

  for (const id of ids) {
    const { events } = ledger.replay(root, id); // verifies the hash chain and transitions
    const bPath = path.join(root, ".settled", "bounties", id + ".json");
    const bounty = fs.existsSync(bPath) ? readJSON(bPath) : {};
    for (const e of events) {
      const d = e.data || {};
      if (e.type === "posted") {
        const esc = d.escrow || {};
        const m = toMicro(esc.amount != null ? esc.amount : bounty.reward);
        const cur = esc.currency || bounty.currency;
        const from = esc.from || e.actor;
        if (!(m > 0) || !cur) throw new SettledError(`escrow: ${id} posted without a positive reward`);
        add(deposited, cur, m); post(id, e, "deposit", from, m, cur);
        post(id, e, "hold", from, m, cur); add(held, cur, m);
        holds[id] = { amount: fromMicro(m), currency: cur, from, state: "held", posted_seq: e.seq };
      } else if (e.type === "cancelled" || e.type === "paid") {
        const h = holds[id];
        if (!h || h.state !== "held") throw new SettledError(`escrow: ${id} ${e.type} at seq ${e.seq} without held funds`);
        const m = toMicro(h.amount);
        if (d.amount != null && toMicro(d.amount) !== m) throw new SettledError(`escrow: ${id} seq ${e.seq} records ${d.amount}, but ${h.amount} was held`);
        const to = e.type === "paid" ? d.solver : h.from;
        if (!to) throw new SettledError(`escrow: ${id} seq ${e.seq} has no recipient`);
        add(held, h.currency, -m);
        post(id, e, e.type === "paid" ? "release" : "refund", to, m, h.currency);
        Object.assign(h, { state: e.type === "paid" ? "released" : "refunded", to, settled_seq: e.seq });
      }
    }
  }

  const currencies = [...new Set([...Object.keys(deposited), ...Object.keys(held)])].sort();
  const conservation = {};
  for (const cur of currencies) {
    const sumBalances = Object.entries(balances).filter(([k]) => k.endsWith(":" + cur)).reduce((s, [, v]) => s + v, 0);
    conservation[cur] = {
      deposited: fromMicro(deposited[cur] || 0), balances: fromMicro(sumBalances), held: fromMicro(held[cur] || 0),
      ok: sumBalances + (held[cur] || 0) === (deposited[cur] || 0),
    };
  }
  const negative = Object.entries(balances).filter(([, v]) => v < 0).map(([k]) => k);
  return {
    simulated: true,
    note: "Simulated escrow derived from .settled/ledger/*.ndjson. No real funds move. Do not edit; run `settled escrow`.",
    balances: Object.fromEntries(Object.entries(balances).filter(([, v]) => v !== 0).sort().map(([k, v]) => [k, fromMicro(v)])),
    holds, conservation, negative_balances: negative,
    ok: Object.values(conservation).every((c) => c.ok) && negative.length === 0,
    journal,
  };
}

// Recompute and persist the snapshot; throws if the books do not balance.
function writeSnapshot(root) {
  const esc = compute(root);
  if (!esc.ok) throw new SettledError("escrow does not conserve balances", esc.conservation);
  writeJSONAtomic(snapshotPath(root), esc);
  return esc;
}

// Compare the on-disk snapshot with the ledger-derived truth.
function audit(root) {
  const esc = compute(root);
  const p = snapshotPath(root);
  const snap = fs.existsSync(p) ? readJSON(p) : null;
  const strip = (x) => JSON.stringify({ balances: x.balances, holds: x.holds });
  return { ...esc, snapshot_matches: !!snap && strip(snap) === strip(esc) };
}

module.exports = { compute, writeSnapshot, audit };
