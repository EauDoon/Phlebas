import assert from "node:assert/strict";
import test from "node:test";

import { cancelOrder, expireRestingOrders, levelsFromBook, submitOrder, type Book, type OrderSide, type TimeInForce } from "./matcher.ts";
import {
  applySubmit,
  applyUserFills,
  availableQuote,
  availableZec,
  canCover,
  describeSubmit,
  inventoryRejectCopy,
  isTicketRejectCopy,
  releaseRestingOrder,
  seedBook,
  seedPaperAccount,
  selfTradeRejectCopy,
  ticketRejectCopy,
  userOrders,
  wouldSelfTrade,
  type PaperAccount,
} from "./session.ts";
import { retargetSettlementCopy } from "./evm-wallet.ts";
import { markets } from "./market-data.ts";
import { quoteAtomsForFill, quoteAtomsForFills, worstPriceTicks } from "./units.ts";

test("seeds the USDC book from fixture levels with integer ticks", () => {
  const book = seedBook("ZEC/USDC");
  const bids = levelsFromBook(book, "buy");
  const asks = levelsFromBook(book, "sell");
  assert.equal(asks[0]?.priceTicks, 5291n);
  assert.equal(bids[0]?.priceTicks, 5278n);
  assert.equal(book.lastTicks, 5284n);
});

test("blocks a buy that exceeds session quote inventory", () => {
  const account = seedPaperAccount();
  assert.equal(canCover(account, "buy", 1_000_00000000n, 5291n), false);
  assert.equal(canCover(account, "sell", 10_00000000n, 5278n), true);
});

test("submit copy names a local book fill and no chain submission", () => {
  const result = submitOrder(seedBook("ZEC/USDC"), {
    id: "user-1",
    side: "buy",
    tif: "IOC",
    priceTicks: 5291n,
    sizeAtoms: 10_00000000n,
  });
  const copy = describeSubmit(result, "ZEC/USDC");
  assert.match(copy, /Filled against the local ZEC\/USDC book/);
  assert.match(copy, /Nothing was signed or submitted to a chain/);
  assert.doesNotMatch(copy, /\blive\b/i);
});

test("credits ZEC and debits quote on a buy fill", () => {
  const book = seedBook("ZEC/USDC");
  const account = seedPaperAccount();
  const result = submitOrder(book, {
    id: "user-1",
    side: "buy",
    tif: "IOC",
    priceTicks: 5291n,
    sizeAtoms: 10_00000000n,
  });
  const applied = applySubmit(account, { side: "buy", sizeAtoms: 10_00000000n, priceTicks: 5291n, tif: "IOC" }, result);
  assert.equal(result.status, "filled");
  assert.equal(applied.account.zecAtoms, account.zecAtoms + 10_00000000n);
  assert.equal(applied.account.quoteAtoms, account.quoteAtoms - quoteAtomsForFill(10_00000000n, 5291n, "up"));
  assert.equal(applied.account.reservedQuoteAtoms, 0n);
});

test("reserves leftover GTC size and releases it on cancel", () => {
  const book = seedBook("ZEC/USDC");
  const account = seedPaperAccount();
  const result = submitOrder(book, {
    id: "user-rest",
    side: "buy",
    tif: "GTC",
    priceTicks: 5200n,
    sizeAtoms: 2_00000000n,
  });
  const applied = applySubmit(account, { side: "buy", sizeAtoms: 2_00000000n, priceTicks: 5200n, tif: "GTC" }, result);
  assert.equal(result.status, "open");
  assert.equal(applied.account.reservedQuoteAtoms, quoteAtomsForFill(2_00000000n, 5200n, "up"));
  assert.ok(availableQuote(applied.account) < availableQuote(account));

  const resting = userOrders(result.book)[0];
  assert.ok(resting);
  const released = releaseRestingOrder(applied.account, resting);
  assert.equal(released.reservedQuoteAtoms, 0n);
});

test("flags a taker that would match a user maker", () => {
  assert.equal(wouldSelfTrade([{ makerId: "user-1", takerSide: "sell", priceTicks: 1n, sizeAtoms: 1n }]), true);
  assert.equal(wouldSelfTrade([{ makerId: "venue-ask-0", takerSide: "buy", priceTicks: 1n, sizeAtoms: 1n }]), false);
});

test("does not execute a one-base-atom fill below one quote atom at maker price", () => {
  const account = seedPaperAccount();
  const result = submitOrder(seedBook("ZEC/USDC"), {
    id: "user-price-improved",
    side: "buy",
    tif: "IOC",
    priceTicks: 10_000n,
    sizeAtoms: 1n,
  });
  const applied = applySubmit(account, {
    side: "buy",
    tif: "IOC",
    priceTicks: 10_000n,
    sizeAtoms: 1n,
  }, result);

  assert.equal(result.status, "cancelled");
  assert.equal(applied.blockedReason, undefined);
  assert.deepEqual(applied.account, account);
});

test("rounds a defensive one-base-atom buy settlement up to one quote atom", () => {
  const account = seedPaperAccount();
  const result = {
    book: seedBook("ZEC/USDC"),
    fills: [{ makerId: "venue-ask", takerSide: "buy" as const, priceTicks: 5291n, sizeAtoms: 1n }],
    remainingAtoms: 0n,
    status: "filled" as const,
  };
  const applied = applySubmit(account, {
    side: "buy",
    tif: "IOC",
    priceTicks: 10_000n,
    sizeAtoms: 1n,
  }, result);

  assert.equal(applied.blockedReason, undefined);
  assert.equal(applied.account.zecAtoms, account.zecAtoms + 1n);
  assert.equal(applied.account.quoteAtoms, account.quoteAtoms - 1n);
});

test("aggregates mixed-price fragments before side-aware settlement", () => {
  const account = seedPaperAccount();
  const fills = [
    { makerId: "venue-a", takerSide: "buy" as const, priceTicks: 5291n, sizeAtoms: 1n },
    { makerId: "venue-b", takerSide: "buy" as const, priceTicks: 5297n, sizeAtoms: 1n },
  ];
  const bought = applyUserFills(account, "buy", fills);
  assert.equal(bought.zecAtoms, account.zecAtoms + 2n);
  assert.equal(bought.quoteAtoms, account.quoteAtoms - 2n);

  const sold = applyUserFills(account, "sell", fills);
  assert.equal(sold.zecAtoms, account.zecAtoms - 2n);
  assert.equal(sold.quoteAtoms, account.quoteAtoms + 1n);
});

test("blocks a zero-quote sell settlement without mutating inventory", () => {
  const account = seedPaperAccount();
  const result = {
    book: seedBook("ZEC/USDC"),
    fills: [{ makerId: "venue-bid", takerSide: "sell" as const, priceTicks: 5291n, sizeAtoms: 1n }],
    remainingAtoms: 0n,
    status: "filled" as const,
  };
  const applied = applySubmit(account, {
    side: "sell",
    tif: "IOC",
    priceTicks: 10_000n,
    sizeAtoms: 1n,
  }, result);

  assert.match(applied.blockedReason ?? "", /at least one quote atom/);
  assert.deepEqual(applied.account, account);
});

test("checks exact fill debit plus rounded remainder reservation", () => {
  const account = {
    zecAtoms: 0n,
    quoteAtoms: 2n,
    reservedZecAtoms: 0n,
    reservedQuoteAtoms: 0n,
  };
  const result = {
    book: seedBook("ZEC/USDC"),
    fills: [{ makerId: "venue-ask", takerSide: "buy" as const, priceTicks: 5291n, sizeAtoms: 1n }],
    remainingAtoms: 2n,
    status: "open" as const,
  };
  const applied = applySubmit(account, {
    side: "buy",
    tif: "GTC",
    priceTicks: 5291n,
    sizeAtoms: 3n,
  }, result);

  assert.equal(canCover(account, "buy", 3n, 5291n), true);
  assert.equal(applied.blockedReason, "Session quote inventory is insufficient.");
  assert.deepEqual(applied.account, account);
  assert.equal(availableQuote(applied.account), 2n);
});

test("IOC market buy at lastTicks does not fill beyond the signed worst price", () => {
  const book = seedBook("ZEC/USDC");
  const lastTicks = markets["ZEC/USDC"].lastTicks;
  const priceTicks = worstPriceTicks(lastTicks, "buy", 0n);
  assert.equal(priceTicks, lastTicks);
  assert.ok(priceTicks < 5291n);
  const result = submitOrder(book, {
    id: "taker",
    side: "buy",
    tif: "IOC",
    priceTicks,
    sizeAtoms: 1_00000000n,
  });
  assert.equal(result.status, "cancelled");
  assert.equal(result.fills.length, 0);
  assert.equal(result.fills.every((fill) => fill.priceTicks <= priceTicks), true);
  assert.match(describeSubmit(result, "ZEC/USDC"), /no fills/);
  assert.match(describeSubmit(result, "ZEC/USDC"), /Unfilled size was cancelled/);
  const crossing = submitOrder(book, {
    id: "control",
    side: "buy",
    tif: "IOC",
    priceTicks: 5291n,
    sizeAtoms: 1_00000000n,
  });
  assert.equal(crossing.status, "filled");
  assert.equal(crossing.fills[0]?.priceTicks, 5291n);
});

test("describeSubmit names settlement on a real FOK miss", () => {
  const book = seedBook("ZEC/USDC");
  const result = submitOrder(book, {
    id: "taker",
    side: "buy",
    tif: "FOK",
    priceTicks: 5291n,
    sizeAtoms: 100_00000000n,
  });
  assert.equal(result.status, "rejected");
  assert.equal(
    describeSubmit(result, "ZEC/USDC"),
    "Rejected. Fill-or-kill could not fill in full. Settled as ZEC-USDC.",
  );
  assert.equal(
    describeSubmit(result, "ZEC/USDT"),
    "Rejected. Fill-or-kill could not fill in full. Settled as ZEC-USDT.",
  );
  assert.equal(isTicketRejectCopy(describeSubmit(result, "ZEC/USDC")), true);
});

test("FOK reject copy follows the selected market after a switch", () => {
  const book = seedBook("ZEC/USDC");
  const result = submitOrder(book, {
    id: "taker",
    side: "buy",
    tif: "FOK",
    priceTicks: 5291n,
    sizeAtoms: 100_00000000n,
  });
  assert.equal(result.status, "rejected");
  const usdc = describeSubmit(result, "ZEC/USDC");
  const usdt = describeSubmit(result, "ZEC/USDT");
  assert.equal(usdc, "Rejected. Fill-or-kill could not fill in full. Settled as ZEC-USDC.");
  assert.equal(usdt, "Rejected. Fill-or-kill could not fill in full. Settled as ZEC-USDT.");
  assert.equal(isTicketRejectCopy(usdc), true);
  assert.equal(
    retargetSettlementCopy(usdc, markets["ZEC/USDT"].settlementPair),
    usdt,
  );
  assert.equal(
    retargetSettlementCopy(ticketRejectCopy("Order expiry has passed", "ZEC/USDC"), markets["ZEC/USDT"].settlementPair),
    ticketRejectCopy("Order expiry has passed", "ZEC/USDT"),
  );
  assert.doesNotMatch(retargetSettlementCopy(usdc, markets["ZEC/USDT"].settlementPair), /native ZEC/);
});

test("inventory reject copy starts from session seed inventory", () => {
  const account = seedPaperAccount();
  assert.equal(canCover(account, "buy", 1_000_00000000n, 5291n), false);
  assert.equal(
    inventoryRejectCopy("buy", "ZEC/USDC"),
    "Rejected. Session quote inventory is insufficient. Settled as ZEC-USDC.",
  );
  assert.equal(canCover(account, "sell", 10_00000000n, 5278n), true);
  assert.equal(
    inventoryRejectCopy("sell", "ZEC/USDT"),
    "Rejected. Session ZEC inventory is insufficient. Settled as ZEC-USDT.",
  );
  assert.equal(
    selfTradeRejectCopy("ZEC/USDC"),
    "Rejected. Self-trade prevented. Cancel the resting session order or choose another price. Settled as ZEC-USDC.",
  );
  assert.equal(isTicketRejectCopy(ticketRejectCopy("Order expiry has passed", "ZEC/USDC")), true);
  assert.doesNotMatch(inventoryRejectCopy("buy", "ZEC/USDC"), /native ZEC/);
});

// --- Conservation property test -------------------------------------------
//
// Drives real submitOrder / applySubmit / releaseRestingOrder / cancelOrder /
// expireRestingOrders through randomized sequences (weighted toward the dust
// boundary, since that is where rounding bugs hide) and checks, after every
// mutation, that:
//   1. zecAtoms/quoteAtoms move by exactly what the fills moved -- nothing
//      more, nothing less.
//   2. Neither balance, nor either reservation, nor either "available" value
//      ever goes negative.
//   3. reservedZecAtoms/reservedQuoteAtoms return to exactly zero once every
//      still-resting user order has been released.
// This is the top-priority check for this module: a paper-trading account
// that can drift its own balances, or overdraw past zero, defeats the whole
// point of a non-custodial simulator standing in for real settlement.

function deterministicRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value;
  };
}

function pickOne<T>(random: () => number, options: readonly T[]): T {
  return options[random() % options.length] as T;
}

function runConservationScenario(seed: number, steps: number): void {
  const random = deterministicRandom(seed);
  let book: Book = seedBook("ZEC/USDC");
  let account: PaperAccount = seedPaperAccount();

  // Ground truth, derived only from what fills actually moved -- independent
  // of any bookkeeping inside session.ts.
  let expectedZec = account.zecAtoms;
  let expectedQuote = account.quoteAtoms;

  let userSeq = 0;
  let nowUnix = 1_700_000_000n;

  for (let step = 0; step < steps; step += 1) {
    nowUnix += BigInt(random() % 5);
    const action = pickOne(random, ["submit", "submit", "submit", "submit", "cancel", "expire"] as const);

    if (action === "expire") {
      const { book: nextBook, expired } = expireRestingOrders(book, nowUnix);
      for (const order of expired) {
        if (!order.id.startsWith("user-")) continue;
        account = releaseRestingOrder(account, order);
      }
      book = nextBook;
    } else if (action === "cancel") {
      const mine = userOrders(book);
      if (mine.length === 0) continue;
      const target = pickOne(random, mine);
      book = cancelOrder(book, target.id);
      account = releaseRestingOrder(account, target);
    } else {
      const side: OrderSide = pickOne(random, ["buy", "sell"] as const);
      const tif: TimeInForce = pickOne(random, ["GTC", "GTC", "GTC", "IOC", "FOK"] as const);
      // Prices/sizes are biased toward the dust boundary: for small
      // priceTicks, minimumSizeAtomsForQuoteSettlement is large relative to
      // these sizeAtoms, so a good fraction of submits graze the
      // dust-avoidance branch in matcher.ts.
      const priceTicks = BigInt(1 + (random() % 20_000));
      const sizeAtoms = BigInt(1 + (random() % 20));
      userSeq += 1;
      const id = `user-${userSeq}`;

      const result = submitOrder(book, { id, side, tif, priceTicks, sizeAtoms, nowUnix });
      if (wouldSelfTrade(result.fills)) continue;

      const applied = applySubmit(account, { side, sizeAtoms, priceTicks, tif }, result);
      if (applied.blockedReason) continue;

      const filledZec = result.fills.reduce((total, fill) => total + fill.sizeAtoms, 0n);
      const filledQuote = quoteAtomsForFills(result.fills, side === "buy" ? "up" : "down");
      if (side === "buy") {
        expectedZec += filledZec;
        expectedQuote -= filledQuote;
      } else {
        expectedZec -= filledZec;
        expectedQuote += filledQuote;
      }

      account = applied.account;
      book = result.book;
    }

    assert.equal(account.zecAtoms, expectedZec, `zecAtoms diverged from executed fills at step ${step} (seed ${seed})`);
    assert.equal(account.quoteAtoms, expectedQuote, `quoteAtoms diverged from executed fills at step ${step} (seed ${seed})`);
    assert.ok(account.zecAtoms >= 0n, `zecAtoms went negative at step ${step} (seed ${seed})`);
    assert.ok(account.quoteAtoms >= 0n, `quoteAtoms went negative at step ${step} (seed ${seed})`);
    assert.ok(account.reservedZecAtoms >= 0n, `reservedZecAtoms went negative at step ${step} (seed ${seed})`);
    assert.ok(account.reservedQuoteAtoms >= 0n, `reservedQuoteAtoms went negative at step ${step} (seed ${seed})`);
    assert.ok(availableZec(account) >= 0n, `availableZec went negative at step ${step} (seed ${seed})`);
    assert.ok(availableQuote(account) >= 0n, `availableQuote went negative at step ${step} (seed ${seed})`);
  }

  // Releasing every still-resting user order must zero out both reservations
  // exactly, with no residue in either direction.
  for (const order of userOrders(book)) {
    account = releaseRestingOrder(account, order);
  }
  assert.equal(account.reservedZecAtoms, 0n, `reservedZecAtoms did not zero out after releasing every resting order (seed ${seed})`);
  assert.equal(account.reservedQuoteAtoms, 0n, `reservedQuoteAtoms did not zero out after releasing every resting order (seed ${seed})`);
  assert.equal(account.zecAtoms, expectedZec, `zecAtoms mismatch after final release (seed ${seed})`);
  assert.equal(account.quoteAtoms, expectedQuote, `quoteAtoms mismatch after final release (seed ${seed})`);
}

test("submit/fill/cancel/expire sequences conserve value and never overdraw", () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    runConservationScenario(seed * 104729 + 7, 40);
  }
});
