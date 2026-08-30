"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { ChartRange, MarketId } from "@/lib/market-data";
import { markets, recentTrades } from "@/lib/market-data";
import { cancelOrder, submitOrder, type TimeInForce } from "@/lib/matcher";
import {
  applySubmit,
  availablePzec,
  availableQuote,
  canCover,
  describeSubmit,
  formatFillTime,
  releaseRestingOrder,
  seedBook,
  seedPaperAccount,
  userOrders,
  wouldSelfTrade,
  type PaperAccount,
  type UserFill,
} from "@/lib/session";
import { PZEC_DECIMALS, PRICE_DECIMALS, formatAtomicUnits } from "@/lib/units";

import { ArchitecturePanel } from "./architecture-panel";
import { BridgePanel } from "./bridge-panel";
import { LiquidityPanel } from "./liquidity-panel";
import { OrderBlotter } from "./order-blotter";
import { OrderBook } from "./order-book";
import { PriceChart } from "./price-chart";
import { TradeTicket } from "./trade-ticket";
import styles from "./terminal.module.css";

type View = "trade" | "liquidity" | "bridge" | "architecture";

const views: { id: View; label: string }[] = [
  { id: "trade", label: "Trade" },
  { id: "liquidity", label: "Liquidity" },
  { id: "bridge", label: "ZEC gateway" },
  { id: "architecture", label: "Architecture" },
];

function viewUrl(view: View, market: MarketId) {
  if (view === "liquidity") {
    return `/liquidity?${new URLSearchParams({ market }).toString()}`;
  }

  return `/trade?${new URLSearchParams({ view, market }).toString()}`;
}

function seedBooks() {
  return {
    "ZEC/USDC": seedBook("ZEC/USDC"),
    "ZEC/USDT": seedBook("ZEC/USDT"),
  };
}

function seedAccounts(): Record<MarketId, PaperAccount> {
  return {
    "ZEC/USDC": seedPaperAccount(),
    "ZEC/USDT": seedPaperAccount(),
  };
}

export function TradingTerminal({
  initialView = "trade",
  initialMarket = "ZEC/USDC",
}: {
  initialView?: View;
  initialMarket?: MarketId;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(initialView);
  const [marketId, setMarketId] = useState<MarketId>(initialMarket);
  const [range, setRange] = useState<ChartRange>("4H");
  const [books, setBooks] = useState(seedBooks);
  const [accounts, setAccounts] = useState(seedAccounts);
  const [fills, setFills] = useState<UserFill[]>([]);
  const [priceSelection, setPriceSelection] = useState<{ ticks: bigint; nonce: number } | null>(null);
  const nextOrderId = useRef(1);
  const nextPriceNonce = useRef(1);
  const nextFillId = useRef(1);
  const market = markets[marketId];
  const book = books[marketId];
  const account = accounts[marketId];

  function selectView(nextView: View) {
    setView(nextView);
    router.replace(viewUrl(nextView, marketId), { scroll: false });
  }

  function selectMarket(nextMarket: MarketId) {
    setMarketId(nextMarket);
    router.replace(viewUrl(view, nextMarket), { scroll: false });
  }

  function submitUserOrder(order: {
    side: "buy" | "sell";
    tif: TimeInForce;
    priceTicks: bigint;
    sizeAtoms: bigint;
  }): string {
    if (!canCover(account, order.side, order.sizeAtoms, order.priceTicks)) {
      return order.side === "buy"
        ? "Session quote inventory is insufficient."
        : "Session pZEC inventory is insufficient.";
    }

    const id = `user-${nextOrderId.current}`;
    nextOrderId.current += 1;
    const result = submitOrder(book, { id, ...order });
    if (wouldSelfTrade(result.fills)) {
      return "Self-trade prevented. Cancel the resting session order or choose another price.";
    }

    const applied = applySubmit(account, order, result);
    if (applied.blockedReason) {
      return applied.blockedReason;
    }

    setBooks({ ...books, [marketId]: result.book });
    setAccounts({ ...accounts, [marketId]: applied.account });
    if (result.fills.length > 0) {
      const time = formatFillTime();
      setFills((current) => [
        ...result.fills.map((fill) => {
          const fillId = `fill-${nextFillId.current}`;
          nextFillId.current += 1;
          return { ...fill, id: fillId, marketId, takerId: id, time };
        }),
        ...current,
      ].slice(0, 50));
    }
    return describeSubmit(result, marketId);
  }

  function cancelUserOrder(orderId: string) {
    const resting = [...book.bids, ...book.asks].find((order) => order.id === orderId);
    if (!resting) {
      return;
    }
    setBooks({ ...books, [marketId]: cancelOrder(book, orderId) });
    setAccounts({ ...accounts, [marketId]: releaseRestingOrder(account, resting) });
  }

  function resetSession() {
    setBooks(seedBooks());
    setAccounts(seedAccounts());
    setFills([]);
    nextOrderId.current = 1;
    nextFillId.current = 1;
  }

  const sessionTape = fills.filter((fill) => fill.marketId === marketId).slice(0, 6);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">Skip to main content</a>
      <div className={styles.simulationBanner} role="status">
        <strong>Protocol preview</strong>
        <span>Local in-browser matcher only. No wallets, real assets, live prices, contracts, or deposits are connected. This matcher is not the proposed production operator and is not trustless.</span>
      </div>

      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="Phlebas home">
          <span className={styles.brandMark}>P</span>
          <span>PHLEBAS</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          {views.map((item) => (
            <button
              type="button"
              key={item.id}
              className={view === item.id ? styles.navActive : undefined}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => selectView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <span className={styles.network}><i />Arbitrum design</span>
          <button type="button" className={styles.connectButton} disabled>Wallets unavailable</button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <h1 className={styles.srOnly}>Phlebas ZEC trading terminal</h1>
        {view === "trade" && (
          <>
            <section className={styles.marketBar} aria-label="Selected market summary">
              <div className={styles.marketSelectorWrap}>
                <span className={styles.coinMark}>Z</span>
                <label>
                  <span>Market</span>
                  <select value={marketId} onChange={(event) => selectMarket(event.target.value as MarketId)}>
                    <option value="ZEC/USDC">ZEC / USDC</option>
                    <option value="ZEC/USDT">ZEC / USDT</option>
                  </select>
                </label>
                <span className={styles.settlementBadge}>settles {market.settlementPair}</span>
                {marketId === "ZEC/USDT" && <span className={styles.gateBadge}>Later listing gate</span>}
              </div>
              <dl className={styles.marketStats}>
                <div className={styles.priceStat}>
                  <dt>Session last</dt>
                  <dd>{formatAtomicUnits(book.lastTicks, PRICE_DECIMALS, 2)}</dd>
                </div>
                <div>
                  <dt>24h change</dt>
                  <dd className={market.change >= 0 ? styles.buyText : styles.sellText}>
                    {market.change > 0 ? "+" : ""}{market.change.toFixed(2)}%
                  </dd>
                </div>
                <div><dt>24h high</dt><dd>{market.high.toFixed(2)}</dd></div>
                <div><dt>24h low</dt><dd>{market.low.toFixed(2)}</dd></div>
                <div><dt>24h volume</dt><dd>{market.volume}</dd></div>
              </dl>
            </section>

            <div className={styles.tradeGrid}>
              <section className={`${styles.panel} ${styles.chartPanel}`} aria-labelledby="chart-title">
                <div className={styles.panelHeader}>
                  <div><span className={styles.eyebrow}>Illustrative market data</span><h2 id="chart-title">{marketId}</h2></div>
                  <div className={styles.rangeTabs} role="group" aria-label="Chart range">
                    {(["1H", "4H", "1D"] as ChartRange[]).map((item) => (
                      <button type="button" key={item} aria-pressed={range === item} className={range === item ? styles.textActive : undefined} onClick={() => setRange(item)}>{item}</button>
                    ))}
                  </div>
                </div>
                <PriceChart marketId={marketId} range={range} />
              </section>

              <OrderBook
                marketId={marketId}
                book={book}
                onPriceSelect={(ticks) => {
                  setPriceSelection({ ticks, nonce: nextPriceNonce.current });
                  nextPriceNonce.current += 1;
                }}
              />
              <TradeTicket
                key={marketId}
                market={market}
                lastTicks={book.lastTicks}
                priceSelection={priceSelection}
                availablePzecAtoms={availablePzec(account)}
                availableQuoteAtoms={availableQuote(account)}
                onSubmit={submitUserOrder}
              />

              <section className={`${styles.panel} ${styles.tradesPanel}`} aria-labelledby="recent-trades-title">
                <div className={styles.panelHeader}>
                  <h2 id="recent-trades-title">Recent trades</h2>
                  <span className={styles.miniLabel}>{sessionTape.length > 0 ? "Session + fixture" : "Fixture tape"}</span>
                </div>
                <table className={styles.dataTable}>
                  <caption className={styles.srOnly}>Recent {marketId} trades. Session fills appear first.</caption>
                  <thead>
                    <tr><th scope="col">Price {market.quote}</th><th scope="col">Size pZEC</th><th scope="col">Time</th></tr>
                  </thead>
                  <tbody>
                    {sessionTape.map((trade) => (
                      <tr key={trade.id}>
                        <th scope="row" className={trade.takerSide === "buy" ? styles.buyText : styles.sellText}>
                          <span className={styles.srOnly}>{trade.takerSide === "buy" ? "Buy" : "Sell"} </span>
                          {formatAtomicUnits(trade.priceTicks, PRICE_DECIMALS, 2)}
                        </th>
                        <td>{formatAtomicUnits(trade.sizeAtoms, PZEC_DECIMALS, 2)}</td>
                        <td>{trade.time}</td>
                      </tr>
                    ))}
                    {recentTrades[marketId].map((trade) => (
                      <tr key={`fixture-${trade.time}-${trade.price}`}>
                        <th scope="row" className={trade.side === "buy" ? styles.buyText : styles.sellText}>
                          <span className={styles.srOnly}>{trade.side === "buy" ? "Buy" : "Sell"} </span>
                          {trade.price.toFixed(2)}
                        </th>
                        <td>{trade.size.toFixed(2)}</td>
                        <td>{trade.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <OrderBlotter
                marketId={marketId}
                account={account}
                openOrders={userOrders(book)}
                fills={fills}
                onCancel={cancelUserOrder}
                onReset={resetSession}
              />
            </div>
          </>
        )}

        {view === "liquidity" && <LiquidityPanel marketId={marketId} onMarketChange={selectMarket} />}
        {view === "bridge" && <BridgePanel />}
        {view === "architecture" && <ArchitecturePanel />}
      </main>

      <footer className={styles.footer}>
        <span>Phlebas protocol preview, 31-08-2026</span>
        <Link href="/status">Status</Link>
        <span>Research repository candidate, not a live exchange or an offer of financial services</span>
      </footer>
    </div>
  );
}
