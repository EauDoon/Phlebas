"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { AccessDemo } from "@/lib/access-demo";
import { CHART_RANGES, nextChartRange } from "@/lib/chart-ranges";
import { disconnectedWallet, type WalletState } from "@/lib/evm-wallet";

import type { ChartRange, MarketId } from "@/lib/market-data";
import { formatSignedChange, markets, pools, recentTrades } from "@/lib/market-data";
import { MARKET_ID_LABELS, MARKET_IDS, nextMarketId } from "@/lib/market-ids";
import {
  FEED_STATUS_LABELS,
  FEED_STATUSES,
  feedSurface,
  nextFeedStatus,
  type FeedStatus,
} from "@/lib/market-state";
import { interpretRovingKey } from "@/lib/roving-keys";
import {
  nextTerminalView,
  TERMINAL_VIEW_LABELS,
  TERMINAL_VIEWS,
  type TerminalView,
} from "@/lib/terminal-views";
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
import { CountryBlock } from "./country-block";
import { LiquidityPanel } from "./liquidity-panel";
import { OrderBlotter } from "./order-blotter";
import { OrderBook } from "./order-book";
import { PreviewEducation } from "./preview-education";
import { PriceChart } from "./price-chart";
import { TradeTicket } from "./trade-ticket";
import { WalletBar } from "./wallet-bar";
import styles from "./terminal.module.css";

function viewUrl(view: TerminalView, market: MarketId, feed: FeedStatus) {
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
  initialAccess = "open",
  forceEducation = false,
}: {
  initialView?: TerminalView;
  initialMarket?: MarketId;
  initialFeed?: FeedStatus;
  initialAccess?: AccessDemo;
  forceEducation?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<TerminalView>(initialView);
  const [viewFocusId, setViewFocusId] = useState<TerminalView>(initialView);
  const [marketId, setMarketId] = useState<MarketId>(initialMarket);
  const [marketFocusId, setMarketFocusId] = useState<MarketId>(initialMarket);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>(initialFeed);
  const [feedFocusId, setFeedFocusId] = useState<FeedStatus>(initialFeed);
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
  const rangeRefs = useRef<Partial<Record<ChartRange, HTMLButtonElement | null>>>({});
  const viewRefs = useRef<Partial<Record<TerminalView, HTMLButtonElement | null>>>({});
  const marketRefs = useRef<Partial<Record<MarketId, HTMLButtonElement | null>>>({});
  const feedRefs = useRef<Partial<Record<FeedStatus, HTMLButtonElement | null>>>({});
  const market = markets[marketId];
  const book = books[marketId];
  const feed = feedSurface(feedStatus);
  const displayedBook = feed.showFixtures ? book : emptyBook(book.lastTicks);
  const account = accounts[marketId];

  function selectView(nextView: TerminalView) {
    setView(nextView);
    setViewFocusId(nextView);
    router.replace(viewUrl(nextView, marketId, feedStatus), { scroll: false });
  }

  function moveViewFocus(next: TerminalView) {
    setViewFocusId(next);
    viewRefs.current[next]?.focus();
  }

  function onViewKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: TerminalView) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveViewFocus(nextTerminalView(id, 1));
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveViewFocus(nextTerminalView(id, -1));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      moveViewFocus("trade");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      moveViewFocus("architecture");
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectView(id);
    }
  }

  function selectMarket(nextMarket: MarketId) {
    setMarketId(nextMarket);
    setMarketFocusId(nextMarket);
    router.replace(viewUrl(view, nextMarket, feedStatus), { scroll: false });
  }

  function selectFeed(nextFeed: FeedStatus) {
    setFeedStatus(nextFeed);
    setFeedFocusId(nextFeed);
    router.replace(viewUrl(view, marketId, nextFeed), { scroll: false });
  }

  function moveMarketFocus(next: MarketId) {
    setMarketFocusId(next);
    marketRefs.current[next]?.focus();
  }

  function moveFeedFocus(next: FeedStatus) {
    setFeedFocusId(next);
    feedRefs.current[next]?.focus();
  }

  function onMarketKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: MarketId) {
    const action = interpretRovingKey(event.key);
    if (!action) {
      return;
    }
    event.preventDefault();
    if (action === "next") {
      moveMarketFocus(nextMarketId(id, 1));
      return;
    }
    if (action === "prev") {
      moveMarketFocus(nextMarketId(id, -1));
      return;
    }
    if (action === "home") {
      moveMarketFocus(MARKET_IDS[0]);
      return;
    }
    if (action === "end") {
      moveMarketFocus(MARKET_IDS[MARKET_IDS.length - 1]);
      return;
    }
    selectMarket(id);
  }

  function onFeedKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: FeedStatus) {
    const action = interpretRovingKey(event.key);
    if (!action) {
      return;
    }
    event.preventDefault();
    if (action === "next") {
      moveFeedFocus(nextFeedStatus(id, 1));
      return;
    }
    if (action === "prev") {
      moveFeedFocus(nextFeedStatus(id, -1));
      return;
    }
    if (action === "home") {
      moveFeedFocus(FEED_STATUSES[0]);
      return;
    }
    if (action === "end") {
      moveFeedFocus(FEED_STATUSES[FEED_STATUSES.length - 1]);
      return;
    }
    selectFeed(id);
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

  function onRangeKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: ChartRange) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = nextChartRange(id, 1);
      setRange(next);
      rangeRefs.current[next]?.focus();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = nextChartRange(id, -1);
      setRange(next);
      rangeRefs.current[next]?.focus();
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setRange("1H");
      rangeRefs.current["1H"]?.focus();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setRange("1D");
      rangeRefs.current["1D"]?.focus();
    }
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
  const fixtureTape = feed.showFixtures ? recentTrades[marketId] : [];

  return (
    <div className={styles.shell}>
      <nav className={styles.skipNav} aria-label="Skip links">
        <a className={styles.skipLink} href="#main-content">Skip to main content</a>
        {initialAccess === "blocked" ? (
          <a className={styles.skipLink} href="#country-block">Skip to country-block notice</a>
        ) : null}
        {initialAccess === "open" && view === "trade" ? (
          <>
            <a className={styles.skipLink} href="#order-ticket">Skip to order ticket</a>
            <a className={styles.skipLink} href="#price-chart">Skip to price chart</a>
            <a className={styles.skipLink} href="#order-book">Skip to order book</a>
            <a className={styles.skipLink} href="#session-blotter">Skip to blotter</a>
            <a className={styles.skipLink} href="#recent-trades">Skip to recent trades</a>
          </>
        ) : null}
        {initialAccess === "open" && view === "architecture" ? (
          <>
            <a className={styles.skipLink} href="#honesty-bar">Skip to honesty bar</a>
            <a className={styles.skipLink} href="#incident-demonstration">Skip to incident demonstration</a>
          </>
        ) : null}
        {initialAccess === "open" && view === "liquidity" ? (
          <>
            <a className={styles.skipLink} href="#liquidity-pools">Skip to pool tabs</a>
            <a className={styles.skipLink} href="#pool-stats">Skip to pool stats</a>
          </>
        ) : null}
        {initialAccess === "open" && view === "bridge" ? (
          <>
            <a className={styles.skipLink} href="#destination-inspector">Skip to destination inspector</a>
            <a className={styles.skipLink} href="#privacy-callouts">Skip to privacy callouts</a>
          </>
        ) : null}
      </nav>
      <div className={styles.simulationBanner} role="status" aria-label="Simulation disclosure">
        <strong>Protocol preview</strong>
        <span>Local in-browser matcher by default. Optional Arbitrum Sepolia wallet and local testnet services do not move mainnet funds. This matcher is not trustless.</span>
      </div>

      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="Phlebas home">
          <span className={styles.brandMark}>P</span>
          <span>PHLEBAS</span>
        </Link>
        <nav
          className={styles.nav}
          role="tablist"
          aria-label="Primary navigation"
          aria-orientation="horizontal"
        >
          {TERMINAL_VIEWS.map((id) => (
            <button
              type="button"
              key={id}
              role="tab"
              id={`terminal-view-${id}`}
              aria-controls="main-content"
              aria-selected={view === id}
              tabIndex={viewFocusId === id ? 0 : -1}
              className={view === id ? styles.navActive : undefined}
              ref={(node) => {
                viewRefs.current[id] = node;
              }}
              onClick={() => selectView(id)}
              onKeyDown={(event) => onViewKeyDown(event, id)}
            >
              {TERMINAL_VIEW_LABELS[id]}
            </button>
          ))}
        </nav>
        <WalletBar wallet={wallet} onChange={setWallet} />
      </header>

      <PreviewEducation force={forceEducation} />

      <main id="main-content" tabIndex={-1}>
        <h1 className={styles.srOnly}>Phlebas ZEC trading terminal</h1>
        {initialAccess === "blocked" && <CountryBlock />}
        {initialAccess === "open" && view === "trade" && (
          <>
            <section className={styles.marketBar} aria-label="Selected market summary">
              <div className={styles.marketSelectorWrap}>
                <span className={styles.coinMark}>Z</span>
                <div>
                  <span>Market</span>
                  <div className={styles.selectorTabs} role="radiogroup" aria-label="Selected market">
                    {MARKET_IDS.map((id) => (
                      <button
                        type="button"
                        key={id}
                        role="radio"
                        aria-checked={marketId === id}
                        tabIndex={marketFocusId === id ? 0 : -1}
                        className={marketId === id ? styles.selectorActive : undefined}
                        ref={(node) => {
                          marketRefs.current[id] = node;
                        }}
                        onClick={() => selectMarket(id)}
                        onKeyDown={(event) => onMarketKeyDown(event, id)}
                      >
                        {MARKET_ID_LABELS[id]}
                      </button>
                    ))}
                  </div>
                </div>
                <span className={styles.settlementBadge}>settles {market.settlementPair}</span>
                {marketId === "ZEC/USDT" && <span className={styles.gateBadge}>Later listing gate</span>}
                <div>
                  <span>Market data</span>
                  <div className={styles.selectorTabs} role="radiogroup" aria-label="Market data state">
                    {FEED_STATUSES.map((id) => (
                      <button
                        type="button"
                        key={id}
                        role="radio"
                        aria-checked={feedStatus === id}
                        tabIndex={feedFocusId === id ? 0 : -1}
                        className={feedStatus === id ? styles.selectorActive : undefined}
                        ref={(node) => {
                          feedRefs.current[id] = node;
                        }}
                        onClick={() => selectFeed(id)}
                        onKeyDown={(event) => onFeedKeyDown(event, id)}
                      >
                        {FEED_STATUS_LABELS[id]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <dl className={styles.marketStats}>
                <div className={styles.priceStat}>
                  <dt>Session last</dt>
                  <dd>{formatAtomicUnits(book.lastTicks, PRICE_DECIMALS, 2)}</dd>
                </div>
                <div>
                  <dt>24h change</dt>
                  <dd className={feed.showFixtures ? (market.changeBps >= 0 ? styles.buyText : styles.sellText) : undefined}>
                    {feed.showFixtures ? formatSignedChange(market.changeBps) : "—"}
                  </dd>
                </div>
                <div><dt>24h high</dt><dd>{feed.showFixtures ? formatAtomicUnits(market.highTicks, PRICE_DECIMALS, 2) : "—"}</dd></div>
                <div><dt>24h low</dt><dd>{feed.showFixtures ? formatAtomicUnits(market.lowTicks, PRICE_DECIMALS, 2) : "—"}</dd></div>
                <div><dt>24h volume</dt><dd>{feed.showFixtures ? `Fixture ${market.volume}` : "—"}</dd></div>
              </dl>
              <p className={styles.inlineNotice}>{feed.statsNote}</p>
            </section>

            <div className={styles.tradeGrid}>
              <section id="price-chart" tabIndex={-1} className={`${styles.panel} ${styles.chartPanel}`} aria-labelledby="chart-title">
                <div className={styles.panelHeader}>
                  <div><span className={styles.eyebrow}>{feed.eyebrow}</span><h2 id="chart-title">{marketId}</h2></div>
                  <div className={styles.rangeTabs} role="radiogroup" aria-label="Chart range">
                    {CHART_RANGES.map((item) => (
                      <button
                        type="button"
                        key={item}
                        role="radio"
                        aria-checked={range === item}
                        tabIndex={range === item ? 0 : -1}
                        className={range === item ? styles.textActive : undefined}
                        ref={(node) => {
                          rangeRefs.current[item] = node;
                        }}
                        onClick={() => setRange(item)}
                        onKeyDown={(event) => onRangeKeyDown(event, item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
                <PriceChart marketId={marketId} range={range} feedStatus={feedStatus} />
              </section>

              <OrderBook
                marketId={marketId}
                book={displayedBook}
                feedStatus={feedStatus}
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

              <section id="recent-trades" tabIndex={-1} className={`${styles.panel} ${styles.tradesPanel}`} aria-labelledby="recent-trades-title">
                <div className={styles.panelHeader}>
                  <h2 id="recent-trades-title">Recent trades</h2>
                  <span className={styles.miniLabel}>
                    {sessionTape.length > 0
                      ? (feed.showFixtures ? "Session + fixture" : "Session tape")
                      : (feed.showFixtures ? "Fixture tape" : feed.eyebrow)}
                  </span>
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
                    {fixtureTape.map((trade) => (
                      <tr key={`fixture-${trade.time}-${trade.priceTicks.toString()}`}>
                        <th scope="row" className={trade.side === "buy" ? styles.buyText : styles.sellText}>
                          <span className={styles.srOnly}>{trade.side === "buy" ? "Buy" : "Sell"} </span>
                          {formatAtomicUnits(trade.priceTicks, PRICE_DECIMALS, 2)}
                        </th>
                        <td>{formatAtomicUnits(trade.sizeAtoms, PZEC_DECIMALS, 2)}</td>
                        <td>{trade.time}</td>
                      </tr>
                    ))}
                    {sessionTape.length === 0 && fixtureTape.length === 0 && (
                      <tr>
                        <td colSpan={3}>
                          <p className={styles.emptyState}>{feed.heading}. {feed.message}</p>
                        </td>
                      </tr>
                    )}
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

        {initialAccess === "open" && view === "liquidity" && (
          <LiquidityPanel
            marketId={marketId}
            feedStatus={feedStatus}
            onMarketChange={selectMarket}
            onFeedChange={selectFeed}
            onRetryFeed={() => selectFeed("illustrative")}
          />
        )}
        {initialAccess === "open" && view === "bridge" && <BridgePanel />}
        {initialAccess === "open" && view === "architecture" && <ArchitecturePanel />}
      </main>

      <footer className={styles.footer}>
        <span>Phlebas is a protocol preview, not a live exchange or an offer of financial services.</span>
        <nav aria-label="Footer">
          <Link href="/trade?view=architecture">Architecture</Link>
          <Link href="/legal">Legal and compliance</Link>
          <Link href="/#launch-gates">Launch gates</Link>
          <Link href="/security">Security</Link>
          <Link href="/status">Status</Link>
        </nav>
      </footer>
    </div>
  );
}
