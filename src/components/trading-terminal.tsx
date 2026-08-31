"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { disconnectedWallet, type WalletState } from "@/lib/evm-wallet";

import type { ChartRange, MarketId } from "@/lib/market-data";
import { formatSignedChange, markets, pools, recentTrades } from "@/lib/market-data";
import { type FeedStatus } from "@/lib/market-state";
import type { SessionLogEvent } from "@/lib/replay";
import { cancelOrder, emptyBook, expireRestingOrders, submitOrder, type RestingOrder, type TimeInForce } from "@/lib/matcher";
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
  USER_ORDER_PREFIX,
  userOrders,
  wouldSelfTrade,
  type PaperAccount,
  type UserFill,
} from "@/lib/session";
import { PZEC_DECIMALS, PRICE_DECIMALS, formatAtomicUnits } from "@/lib/units";

import { ArchitecturePanel } from "./architecture-panel";
import { BridgePanel } from "./bridge-panel";
import { LiquidityPanel } from "./liquidity-panel";
import { NativeSwapPanel } from "./native-swap-panel";
import { OrderBlotter } from "./order-blotter";
import { OrderBook } from "./order-book";
import { PriceChart } from "./price-chart";
import { TradeTicket } from "./trade-ticket";
import { WalletBar } from "./wallet-bar";
import styles from "./terminal.module.css";

type View = "trade" | "settlement" | "liquidity" | "bridge" | "architecture";

const views: { id: View; label: string }[] = [
  { id: "trade", label: "Trade" },
  { id: "settlement", label: "Settlement" },
  { id: "liquidity", label: "Liquidity" },
  { id: "bridge", label: "ZEC gateway" },
  { id: "architecture", label: "Architecture" },
];

function viewUrl(view: View, market: MarketId, feed: FeedStatus) {
  const params = new URLSearchParams({ market });
  if (feed !== "illustrative") {
    params.set("feed", feed);
  }
  if (view === "liquidity") {
    return `/liquidity?${params.toString()}`;
  }
  params.set("view", view);
  return `/trade?${params.toString()}`;
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
  initialFeed = "illustrative",
}: {
  initialView?: View;
  initialMarket?: MarketId;
  initialFeed?: FeedStatus;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(initialView);
  const [marketId, setMarketId] = useState<MarketId>(initialMarket);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>(initialFeed);
  const [range, setRange] = useState<ChartRange>("4H");
  const [books, setBooks] = useState(seedBooks);
  const [accounts, setAccounts] = useState(seedAccounts);
  const [fills, setFills] = useState<UserFill[]>([]);
  const [events, setEvents] = useState<SessionLogEvent[]>([]);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const [priceSelection, setPriceSelection] = useState<{ ticks: bigint; nonce: number } | null>(null);
  const [wallet, setWallet] = useState<WalletState>(disconnectedWallet);
  const nextOrderId = useRef(1);
  const nextPriceNonce = useRef(1);
  const nextFillId = useRef(1);
  const market = markets[marketId];
  const book = books[marketId];
  const displayedBook = feedStatus === "empty" ? emptyBook(book.lastTicks) : book;
  const account = accounts[marketId];

  function selectView(nextView: View) {
    setView(nextView);
    router.replace(viewUrl(nextView, marketId, feedStatus), { scroll: false });
  }

  function selectMarket(nextMarket: MarketId) {
    setMarketId(nextMarket);
    router.replace(viewUrl(view, nextMarket, feedStatus), { scroll: false });
  }

  function selectFeed(nextFeed: FeedStatus) {
    setFeedStatus(nextFeed);
    router.replace(viewUrl(view, marketId, nextFeed), { scroll: false });
  }

  function sweepExpired(sourceBook = book, sourceAccount = account) {
    const nowUnix = BigInt(Math.floor(Date.now() / 1000));
    const { book: nextBook, expired } = expireRestingOrders(sourceBook, nowUnix);
    const userExpired = expired.filter((order) => order.id.startsWith(USER_ORDER_PREFIX));
    let nextAccount = sourceAccount;
    for (const resting of userExpired) {
      nextAccount = releaseRestingOrder(nextAccount, resting);
    }
    return { nowUnix, nextBook, nextAccount, userExpired };
  }

  function expireEvents(userExpired: RestingOrder[]): SessionLogEvent[] {
    return userExpired.map((resting) => ({ kind: "cancel" as const, marketId, orderId: resting.id }));
  }

  function submitUserOrder(order: {
    side: "buy" | "sell";
    tif: TimeInForce;
    priceTicks: bigint;
    sizeAtoms: bigint;
    expiryUnix: bigint;
  }): string {
    const { nowUnix, nextBook, nextAccount, userExpired } = sweepExpired();
    if (!canCover(nextAccount, order.side, order.sizeAtoms, order.priceTicks)) {
      if (userExpired.length > 0) {
        setBooks({ ...books, [marketId]: nextBook });
        setAccounts({ ...accounts, [marketId]: nextAccount });
        setEvents((current) => [...current, ...expireEvents(userExpired)]);
      }
      return order.side === "buy"
        ? "Session quote inventory is insufficient."
        : "Session pZEC inventory is insufficient.";
    }

    const id = `user-${nextOrderId.current}`;
    nextOrderId.current += 1;
    const { expiryUnix, ...matcherOrder } = order;
    const result = submitOrder(nextBook, { id, ...matcherOrder, expiryUnix, nowUnix });
    if (wouldSelfTrade(result.fills)) {
      if (userExpired.length > 0) {
        setBooks({ ...books, [marketId]: nextBook });
        setAccounts({ ...accounts, [marketId]: nextAccount });
        setEvents((current) => [...current, ...expireEvents(userExpired)]);
      }
      return "Self-trade prevented. Cancel the resting session order or choose another price.";
    }

    const applied = applySubmit(nextAccount, order, result);
    if (applied.blockedReason) {
      if (userExpired.length > 0) {
        setBooks({ ...books, [marketId]: nextBook });
        setAccounts({ ...accounts, [marketId]: nextAccount });
        setEvents((current) => [...current, ...expireEvents(userExpired)]);
      }
      return applied.blockedReason;
    }

    setBooks({ ...books, [marketId]: result.book });
    setAccounts({ ...accounts, [marketId]: applied.account });
    setEvents((current) => [...current, ...expireEvents(userExpired), { kind: "submit", marketId, id, ...order }]);
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
    setEvents((current) => [...current, { kind: "cancel", marketId, orderId }]);
  }

  function cancelAllUserOrders() {
    const open = userOrders(book);
    let nextBook = book;
    let nextAccount = account;
    for (const order of open) {
      nextBook = cancelOrder(nextBook, order.id);
      nextAccount = releaseRestingOrder(nextAccount, order);
    }
    setBooks({ ...books, [marketId]: nextBook });
    setAccounts({ ...accounts, [marketId]: nextAccount });
    setEvents((current) => [
      ...current,
      ...open.map((order) => ({ kind: "cancel" as const, marketId, orderId: order.id })),
    ]);
    setAccountEpoch((epoch) => epoch + 1);
  }

  function resetSession() {
    setBooks(seedBooks());
    setAccounts(seedAccounts());
    setFills([]);
    setEvents((current) => [...current, { kind: "reset" }]);
    setAccountEpoch((epoch) => epoch + 1);
    nextOrderId.current = 1;
    nextFillId.current = 1;
  }

  const sessionTape = fills.filter((fill) => fill.marketId === marketId).slice(0, 6);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">Skip to main content</a>
      <div className={styles.simulationBanner} role="status">
        <strong>{view === "settlement" ? "No-value walkthrough" : "Protocol preview"}</strong>
        <span>
          {view === "settlement"
            ? "No-value native settlement walkthrough. It prepares no transaction, connects no wallet, and moves no asset."
            : "Local in-browser matcher by default. Optional Arbitrum Sepolia wallet and local testnet services do not move mainnet funds. This matcher is not trustless."}
        </span>
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
        {view === "settlement"
          ? <span className={styles.fixturePill}>Fixture only</span>
          : <WalletBar wallet={wallet} onChange={setWallet} />}
      </header>

      <main id="main-content" tabIndex={-1}>
        <h1 className={styles.srOnly}>
          {view === "settlement" ? "Phlebas native ZEC atomic settlement walkthrough" : "Phlebas ZEC trading terminal"}
        </h1>
        {view === "trade" && (
          <>
            <section className={styles.marketBar} aria-label="Selected market summary">
              <div className={styles.marketSelectorWrap}>
                <span className={styles.coinMark}>Z</span>
                <label>
                  <span>Market</span>
                  <select
                    value={marketId}
                    aria-label="Selected market"
                    onChange={(event) => selectMarket(event.target.value as MarketId)}
                  >
                    <option value="ZEC/USDC">ZEC / USDC</option>
                    <option value="ZEC/USDT">ZEC / USDT</option>
                  </select>
                </label>
                <span className={styles.settlementBadge}>legacy simulation: {market.settlementPair}</span>
                {marketId === "ZEC/USDT" && <span className={styles.gateBadge}>Later listing gate</span>}
                <label>
                  <span>Market data</span>
                  <select
                    value={feedStatus}
                    aria-label="Market data state"
                    onChange={(event) => selectFeed(event.target.value as FeedStatus)}
                  >
                    <option value="illustrative">Illustrative</option>
                    <option value="loading">Loading</option>
                    <option value="empty">Empty</option>
                    <option value="stale">Stale</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                </label>
              </div>
              <dl className={styles.marketStats}>
                <div className={styles.priceStat}>
                  <dt>Session last</dt>
                  <dd>{formatAtomicUnits(book.lastTicks, PRICE_DECIMALS, 2)}</dd>
                </div>
                <div>
                  <dt>24h change</dt>
                  <dd className={market.changeBps >= 0 ? styles.buyText : styles.sellText}>
                    {formatSignedChange(market.changeBps)}
                  </dd>
                </div>
                <div><dt>24h high</dt><dd>{formatAtomicUnits(market.highTicks, PRICE_DECIMALS, 2)}</dd></div>
                <div><dt>24h low</dt><dd>{formatAtomicUnits(market.lowTicks, PRICE_DECIMALS, 2)}</dd></div>
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
                book={displayedBook}
                onPriceSelect={(ticks) => {
                  setPriceSelection({ ticks, nonce: nextPriceNonce.current });
                  nextPriceNonce.current += 1;
                }}
              />
              <TradeTicket
                key={`${marketId}:${feedStatus}`}
                market={market}
                book={displayedBook}
                lastTicks={book.lastTicks}
                priceSelection={priceSelection}
                availablePzecAtoms={availablePzec(account)}
                availableQuoteAtoms={availableQuote(account)}
                reservePzecAtoms={(marketId === "ZEC/USDT" ? pools[1] : pools[0]).reserveZecAtoms}
                reserveQuoteAtoms={(marketId === "ZEC/USDT" ? pools[1] : pools[0]).reserveQuoteAtoms}
                accountEpoch={accountEpoch}
                feedStatus={feedStatus}
                walletAddress={wallet.address}
                onRetryFeed={() => selectFeed("illustrative")}
                onSubmit={submitUserOrder}
              />

              <section className={`${styles.panel} ${styles.tradesPanel}`} aria-labelledby="recent-trades-title">
                <div className={styles.panelHeader}>
                  <h2 id="recent-trades-title">Recent trades</h2>
                  <span className={styles.miniLabel}>{sessionTape.length > 0 ? "Session + fixture" : "Fixture tape"}</span>
                </div>
                <table className={styles.dataTable}>
                  <caption className={styles.srOnly}>Recent {marketId} trades settled as {market.settlementPair}. Session fills appear first.</caption>
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
                      <tr key={`fixture-${trade.time}-${trade.priceTicks.toString()}`}>
                        <th scope="row" className={trade.side === "buy" ? styles.buyText : styles.sellText}>
                          <span className={styles.srOnly}>{trade.side === "buy" ? "Buy" : "Sell"} </span>
                          {formatAtomicUnits(trade.priceTicks, PRICE_DECIMALS, 2)}
                        </th>
                        <td>{formatAtomicUnits(trade.sizeAtoms, PZEC_DECIMALS, 2)}</td>
                        <td>{trade.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <OrderBlotter
                marketId={marketId}
                account={account}
                lastTicks={book.lastTicks}
                openOrders={userOrders(book)}
                fills={fills}
                events={events}
                onCancel={cancelUserOrder}
                onCancelAll={cancelAllUserOrders}
                onReset={resetSession}
                accountEpoch={accountEpoch}
              />
            </div>
          </>
        )}

        {view === "liquidity" && <LiquidityPanel marketId={marketId} onMarketChange={selectMarket} />}
        {view === "settlement" && (
          <NativeSwapPanel key={marketId} marketId={marketId} onMarketChange={selectMarket} />
        )}
        {view === "bridge" && <BridgePanel />}
        {view === "architecture" && <ArchitecturePanel />}
      </main>

      <footer className={styles.footer}>
        <span>Phlebas protocol preview, 31-08-2026</span>
        <Link href="/status">Status</Link>
        <Link href="/legal">Legal</Link>
        <Link href="/security">Security</Link>
        <span>Research repository candidate, not a live exchange or an offer of financial services</span>
      </footer>
    </div>
  );
}
