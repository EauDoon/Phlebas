"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { AccessDemo } from "@/lib/access-demo";
import { CHART_RANGES, nextChartRange } from "@/lib/chart-ranges";
import { disconnectedWallet, type WalletState } from "@/lib/evm-wallet";
import {
  INCIDENT_DEMO_QUERY,
  getIncidentDemoServerSnapshot,
  getIncidentDemoSnapshot,
  rememberIncidentDemo,
  subscribeIncidentDemo,
} from "@/lib/gateway-incidents";
import { PRODUCT_NAV } from "@/lib/landing-copy";
import { activateSkipLink } from "@/lib/skip-link";
import { PreviewChip } from "./preview-chip";
import { SiteFooter } from "./site-footer";
import { NO_TEX_ISSUED, ZEC_DESTINATION_LABEL } from "@/lib/wallet-bar-copy";
import { terminalUrl } from "@/lib/terminal-url";
import {
  DEFAULT_TERMINAL_MODE,
  nextTerminalMode,
  resolveTerminalMode,
  TERMINAL_MODE_STORAGE_KEY,
  TERMINAL_MODES,
  type TerminalMode,
} from "@/lib/terminal-mode";

import type { ChartRange, MarketId } from "@/lib/market-data";
import { formatSignedChange, markets, pools, recentTrades } from "@/lib/market-data";
import { MARKET_ID_LABELS, MARKET_IDS, nextMarketId } from "@/lib/market-ids";
import { NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT } from "@/lib/native-zec-usdc-matcher-manifest";
import { NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT } from "@/lib/native-zec-usdt-matcher-manifest";
import {
  FEED_STATUS_LABELS,
  FEED_STATUSES,
  chartPanelEyebrowCopy,
  chartPanelHeadingCopy,
  chartRangeTabLabel,
  feedSurface,
  feedWithheldCopy,
  nextFeedStatus,
  sessionLastStatLabel,
  tapeCaptionCopy,
  tapeMiniLabel,
  tapeSideCopy,
  type FeedStatus,
} from "@/lib/market-state";
import { interpretRovingKey } from "@/lib/roving-keys";
import {
  type RenderableTerminalView,
  type TerminalView,
} from "@/lib/terminal-views";
import type { SessionLogEvent } from "@/lib/replay";
import { cancelOrder, emptyBook, expireRestingOrders, submitOrder, type RestingOrder, type TimeInForce } from "@/lib/matcher";
import {
  nextDueTwapSlice,
  planTwap,
  TWAP_USER_CANCELLED_REASON,
  twapCancelCopy,
  twapProgressCopy,
  twapStopCopy,
  type TwapDurationSeconds,
  type TwapPlan,
  type TwapSliceCount,
} from "@/lib/twap";
import {
  applySubmit,
  availableZec,
  availableQuote,
  canCover,
  describeSubmit,
  formatFillTime,
  inventoryRejectCopy,
  selfTradeRejectCopy,
  ticketRejectCopy,
  releaseRestingOrder,
  seedBook,
  seedPaperAccount,
  USER_ORDER_PREFIX,
  userOrders,
  wouldSelfTrade,
  type PaperAccount,
  type UserFill,
} from "@/lib/session";
import { isTicketRejectCopy } from "@/lib/session";
import { ZEC_DECIMALS, PRICE_DECIMALS, formatAtomicUnits } from "@/lib/units";

import { ArchitecturePanel } from "./architecture-panel";
import { BridgePanel } from "./bridge-panel";
import { CountryBlock } from "./country-block";
import { LiquidityPanel } from "./liquidity-panel";
import { NativeMatcherOrderAction } from "./native-matcher-order-action";
import { OrderBlotter } from "./order-blotter";
import { SettlementTicket } from "./settlement-ticket";
import { OrderBook } from "./order-book";
import { PreviewEducation } from "./preview-education";
import { PriceChart } from "./price-chart";
import { TradeTicket } from "./trade-ticket";
import { WalletBar } from "./wallet-bar";
import styles from "./terminal.module.css";

function viewUrl(
  view: RenderableTerminalView,
  market: MarketId,
  feed: FeedStatus,
  demo?: string,
  mode?: TerminalMode,
) {
  return terminalUrl({ view, market, feed, demo, mode });
}

type TwapJob = {
  id: string;
  marketId: MarketId;
  side: "buy" | "sell";
  priceTicks: bigint;
  plan: TwapPlan;
  /** Mutable progress: the scheduler advances job fields in place. */
  completed: number;
  stoppedReason: string | null;
};

function readStoredMode(): string | null {
  try {
    return window.localStorage.getItem(TERMINAL_MODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistMode(mode: TerminalMode) {
  try {
    window.localStorage.setItem(TERMINAL_MODE_STORAGE_KEY, mode);
    window.dispatchEvent(new Event("phlebas-terminal-mode"));
  } catch {
    // Private mode still lets the visitor switch.
  }
}

function subscribeTerminalMode(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("phlebas-terminal-mode", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("phlebas-terminal-mode", onStoreChange);
  };
}

function getStoredTerminalMode() {
  return resolveTerminalMode(undefined, readStoredMode());
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
  initialBridgeJourney = "deposit",
  initialAccess = "open",
  forceEducation = false,
  highlightIncidents = false,
  initialMode,
}: {
  initialView?: RenderableTerminalView;
  initialMarket?: MarketId;
  initialFeed?: FeedStatus;
  initialBridgeJourney?: "deposit" | "withdrawal";
  initialAccess?: AccessDemo;
  forceEducation?: boolean;
  highlightIncidents?: boolean;
  initialMode?: TerminalMode;
}) {
  const router = useRouter();
  const view = initialView;
  const marketId = initialMarket;
  const feedStatus = initialFeed;
  const [marketFocusId, setMarketFocusId] = useState<MarketId>(initialMarket);
  const [feedFocusId, setFeedFocusId] = useState<FeedStatus>(initialFeed);
  const [range, setRange] = useState<ChartRange>("4H");
  const [books, setBooks] = useState(seedBooks);
  const [accounts, setAccounts] = useState(seedAccounts);
  const [fills, setFills] = useState<UserFill[]>([]);
  const [events, setEvents] = useState<SessionLogEvent[]>([]);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const [priceSelection, setPriceSelection] = useState<{ ticks: bigint; nonce: number } | null>(null);
  const [wallet, setWallet] = useState<WalletState>(disconnectedWallet);
  const storedMode = useSyncExternalStore(
    subscribeTerminalMode,
    getStoredTerminalMode,
    () => DEFAULT_TERMINAL_MODE,
  );
  const mode = initialMode ?? storedMode;
  const isSimple = mode === "simple";
  const storedIncidentDemo = useSyncExternalStore(
    subscribeIncidentDemo,
    getIncidentDemoSnapshot,
    getIncidentDemoServerSnapshot,
  );
  const incidentDemo = highlightIncidents || storedIncidentDemo;
  const demoQuery = incidentDemo ? INCIDENT_DEMO_QUERY : undefined;
  const nextOrderId = useRef(1);
  const nextPriceNonce = useRef(1);
  const nextFillId = useRef(1);
  const [twapJobs, setTwapJobs] = useState<TwapJob[]>([]);
  const twapJobsRef = useRef<TwapJob[]>([]);
  const executeOrderRef = useRef(executeUserOrder);
  const rangeRefs = useRef<Partial<Record<ChartRange, HTMLButtonElement | null>>>({});
  const marketRefs = useRef<Partial<Record<MarketId, HTMLButtonElement | null>>>({});
  const feedRefs = useRef<Partial<Record<FeedStatus, HTMLButtonElement | null>>>({});
  const modeRefs = useRef<Partial<Record<TerminalMode, HTMLButtonElement | null>>>({});
  const market = markets[marketId];
  const book = books[marketId];
  const feed = feedSurface(feedStatus);
  const statsSurface = feed;
  const displayedBook = feed.showFixtures ? book : emptyBook(book.lastTicks);
  const account = accounts[marketId];

  useEffect(() => {
    if (highlightIncidents) {
      rememberIncidentDemo(true);
    }
  }, [highlightIncidents]);

  function selectMode(nextMode: TerminalMode) {
    setPriceSelection(null);
    persistMode(nextMode);
    router.replace(viewUrl(view, marketId, feedStatus, demoQuery, nextMode), { scroll: false });
  }

  function moveModeFocus(nextMode: TerminalMode) {
    modeRefs.current[nextMode]?.focus();
  }

  function onModeKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: TerminalMode) {
    let nextMode: TerminalMode | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextMode = nextTerminalMode(id);
    } else if (event.key === "Home") {
      nextMode = "simple";
    } else if (event.key === "End") {
      nextMode = "advanced";
    }
    if (nextMode === null) return;
    event.preventDefault();
    moveModeFocus(nextMode);
    selectMode(nextMode);
  }

  function selectView(nextView: TerminalView) {
    router.replace(viewUrl(nextView, marketId, feedStatus, demoQuery, mode), { scroll: false });
  }

  function selectMarket(nextMarket: MarketId) {
    setPriceSelection(null);
    setMarketFocusId(nextMarket);
    router.replace(viewUrl(view, nextMarket, feedStatus, demoQuery, mode), { scroll: false });
  }

  function selectFeed(nextFeed: FeedStatus) {
    setFeedFocusId(nextFeed);
    router.replace(viewUrl(view, marketId, nextFeed, demoQuery, mode), { scroll: false });
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

  function expireEvents(userExpired: RestingOrder[], targetMarketId: MarketId = marketId): SessionLogEvent[] {
    return userExpired.map((resting) => ({ kind: "cancel" as const, marketId: targetMarketId, orderId: resting.id }));
  }

  function executeUserOrder(
    targetMarketId: MarketId,
    order: {
      side: "buy" | "sell";
      tif: TimeInForce;
      priceTicks: bigint;
      sizeAtoms: bigint;
      expiryUnix: bigint;
    },
  ): string {
    const { nowUnix, nextBook, nextAccount, userExpired } = sweepExpired();
    if (!canCover(nextAccount, order.side, order.sizeAtoms, order.priceTicks)) {
      if (userExpired.length > 0) {
        setBooks({ ...books, [targetMarketId]: nextBook });
        setAccounts({ ...accounts, [targetMarketId]: nextAccount });
        setEvents((current) => [...current, ...expireEvents(userExpired, targetMarketId)]);
      }
      return inventoryRejectCopy(order.side, targetMarketId);
    }

    const id = `user-${nextOrderId.current}`;
    nextOrderId.current += 1;
    const { expiryUnix, ...matcherOrder } = order;
    const result = submitOrder(nextBook, { id, ...matcherOrder, expiryUnix, nowUnix });
    if (wouldSelfTrade(result.fills)) {
      if (userExpired.length > 0) {
        setBooks({ ...books, [targetMarketId]: nextBook });
        setAccounts({ ...accounts, [targetMarketId]: nextAccount });
        setEvents((current) => [...current, ...expireEvents(userExpired, targetMarketId)]);
      }
      return selfTradeRejectCopy(targetMarketId);
    }

    const applied = applySubmit(nextAccount, order, result);
    if (applied.blockedReason) {
      if (userExpired.length > 0) {
        setBooks({ ...books, [targetMarketId]: nextBook });
        setAccounts({ ...accounts, [targetMarketId]: nextAccount });
        setEvents((current) => [...current, ...expireEvents(userExpired, targetMarketId)]);
      }
      return ticketRejectCopy(applied.blockedReason, targetMarketId);
    }

    setBooks({ ...books, [targetMarketId]: result.book });
    setAccounts({ ...accounts, [targetMarketId]: applied.account });
    setEvents((current) => [...current, ...expireEvents(userExpired, targetMarketId), { kind: "submit", marketId: targetMarketId, id, ...order }]);
    if (result.fills.length > 0) {
      const time = formatFillTime();
      setFills((current) => [
        ...result.fills.map((fill) => {
          const fillId = `fill-${nextFillId.current}`;
          nextFillId.current += 1;
          return { ...fill, id: fillId, marketId: targetMarketId, takerId: id, time };
        }),
        ...current,
      ].slice(0, 50));
    }
    return describeSubmit(result, targetMarketId);
  }

  function submitUserOrder(order: {
    side: "buy" | "sell";
    tif: TimeInForce;
    priceTicks: bigint;
    sizeAtoms: bigint;
    expiryUnix: bigint;
    twap?: { slices: TwapSliceCount; durationSeconds: TwapDurationSeconds };
  }): string {
    const { twap, ...single } = order;
    if (twap) {
      try {
        const plan = planTwap({
          totalSizeAtoms: single.sizeAtoms,
          priceTicks: single.priceTicks,
          slices: twap.slices,
          durationSeconds: twap.durationSeconds,
          startUnix: BigInt(Math.floor(Date.now() / 1000)),
        });
        const job: TwapJob = {
          id: `twap-${nextOrderId.current}`,
          marketId,
          side: single.side,
          priceTicks: single.priceTicks,
          plan,
          completed: 0,
          stoppedReason: null,
        };
        twapJobsRef.current = [...twapJobsRef.current, job];
        setTwapJobs(twapJobsRef.current);
        return `TWAP started. ${plan.slices} slices over ${Math.round(twap.durationSeconds / 60)} minutes at a worst price of ${formatAtomicUnits(single.priceTicks, PRICE_DECIMALS, 2)}. Slices execute while the terminal is open.`;
      } catch (error) {
        return error instanceof Error ? error.message : "TWAP plan is invalid.";
      }
    }
    return executeUserOrder(marketId, single);
  }

  useEffect(() => {
    executeOrderRef.current = executeUserOrder;
    twapJobsRef.current = twapJobs;
  });

  function cancelTwapJob(jobId: string) {
    const job = twapJobsRef.current.find((entry) => entry.id === jobId);
    if (!job || job.stoppedReason || job.completed >= job.plan.slices) return;
    job.stoppedReason = TWAP_USER_CANCELLED_REASON;
    setTwapJobs([...twapJobsRef.current]);
    setEvents((current) => [...current, { kind: "cancel", marketId: job.marketId, orderId: job.id }]);
  }

  useEffect(() => {
    // One slice per tick per job: a backgrounded tab throttles timers, and
    // executing several stale-book slices in one tick would corrupt state.
    // Slices resume one per second when ticks resume.
    const timer = window.setInterval(() => {
      const jobs = twapJobsRef.current;
      if (jobs.length === 0) return;
      const nowUnix = BigInt(Math.floor(Date.now() / 1000));
      let changed = false;
      for (const job of jobs) {
        if (job.completed >= job.plan.slices || job.stoppedReason) continue;
        const due = nextDueTwapSlice(job.plan, nowUnix, job.completed);
        if (due === null) continue;
        const size = job.plan.sliceSizes[due];
        const result = executeOrderRef.current(job.marketId, {
          side: job.side,
          tif: "IOC",
          priceTicks: job.priceTicks,
          sizeAtoms: size,
          expiryUnix: 0n,
        });
        changed = true;
        if (isTicketRejectCopy(result)) {
          job.stoppedReason = result;
          setEvents((current) => [...current, { kind: "cancel", marketId: job.marketId, orderId: job.id }]);
        } else {
          job.completed += 1;
        }
      }
      const next = jobs.filter((job) => job.completed < job.plan.slices && !job.stoppedReason);
      twapJobsRef.current = next;
      if (changed) setTwapJobs(next);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

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
  const publicTape = feed.showFixtures ? recentTrades[marketId] : [];

  const operatingView = initialAccess === "open" && (view === "trade" || view === "liquidity");
  const twapStatus = (() => {
    const jobs = twapJobs;
    if (jobs.length === 0) return null;
    return jobs.map((job) => (
      <p key={job.id} className={styles.inlineNotice} role="status">
        {job.stoppedReason
          ? job.stoppedReason === TWAP_USER_CANCELLED_REASON
            ? twapCancelCopy(job.plan, job.completed)
            : twapStopCopy(job.plan, job.completed, job.stoppedReason)
          : twapProgressCopy(job.plan, job.completed)}
        {!job.stoppedReason && job.completed < job.plan.slices ? (
          <button
            type="button"
            className={styles.twapStopButton}
            aria-label={`Stop TWAP job on ${job.marketId}`}
            onClick={() => cancelTwapJob(job.id)}
          >
            Stop
          </button>
        ) : null}
      </p>
    ));
  })();

  const tradeTicket = (
    <Fragment key={feedStatus}>
      <TradeTicket
        market={market}
        book={displayedBook}
        lastTicks={book.lastTicks}
        priceSelection={priceSelection}
        availableZecAtoms={availableZec(account)}
        availableQuoteAtoms={availableQuote(account)}
        reserveZecAtoms={(marketId === "ZEC/USDT" ? pools[1] : pools[0]).reserveZecAtoms}
        reserveQuoteAtoms={(marketId === "ZEC/USDT" ? pools[1] : pools[0]).reserveQuoteAtoms}
        accountEpoch={accountEpoch}
        feedStatus={feedStatus}
        variant={mode}
        onRetryFeed={() => selectFeed("illustrative")}
        onSubmit={submitUserOrder}
      />
      {twapStatus}
    </Fragment>
  );

  return (
    <div className={operatingView ? `${styles.shell} ${styles.operatingShell}` : styles.shell}>
      <nav className={styles.skipNav} aria-label="Skip links">
        <a className={styles.skipLink} href="#main-content" onClick={activateSkipLink}>Skip to main content</a>
        {initialAccess === "blocked" ? (
          <a className={styles.skipLink} href="#country-block" onClick={activateSkipLink}>Skip to country-block notice</a>
        ) : null}
        {initialAccess === "open" && view === "trade" ? (
          <>
            <a className={styles.skipLink} href="#order-ticket" onClick={activateSkipLink}>Skip to order ticket</a>
            {isSimple ? null : (
              <>
                <a className={styles.skipLink} href="#price-chart" onClick={activateSkipLink}>Skip to price chart</a>
                <a className={styles.skipLink} href="#order-book" onClick={activateSkipLink}>Skip to order book</a>
                <a className={styles.skipLink} href="#session-blotter" onClick={activateSkipLink}>Skip to blotter</a>
                <a className={styles.skipLink} href="#recent-trades" onClick={activateSkipLink}>Skip to recent trades</a>
              </>
            )}
          </>
        ) : null}
        {initialAccess === "open" && view === "settlement" ? (
          <a className={styles.skipLink} href="#native-swap-title" onClick={activateSkipLink}>Skip to fill ticket</a>
        ) : null}
        {initialAccess === "open" && view === "architecture" ? (
          <>
            <a className={styles.skipLink} href="#architecture-layers" onClick={activateSkipLink}>Skip to architecture layers</a>
            <a className={styles.skipLink} href="#honesty-bar" onClick={activateSkipLink}>Skip to honesty bar</a>
            <a className={styles.skipLink} href="#incident-demonstration" onClick={activateSkipLink}>Skip to incident demonstration</a>
          </>
        ) : null}
        {initialAccess === "open" && view === "liquidity" ? (
          <>
            <a className={styles.skipLink} href="#liquidity-pools" onClick={activateSkipLink}>Skip to quote pairs</a>
            <a className={styles.skipLink} href="#lp-risk-title" onClick={activateSkipLink}>Skip to quote risks</a>
          </>
        ) : null}
        {initialAccess === "open" && view === "bridge" ? (
          <>
            <a className={styles.skipLink} href="#destination-inspector" onClick={activateSkipLink}>Skip to destination inspector</a>
            <a className={styles.skipLink} href="#privacy-callouts" onClick={activateSkipLink}>Skip to privacy callouts</a>
          </>
        ) : null}
      </nav>
      <PreviewChip />

      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="Phlebas home">
          <span className={styles.brandMark}>P</span>
          <span>PHLEBAS</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          {PRODUCT_NAV.map((item) => {
            const current =
              (item.label === "Terminal" && (view === "trade" || view === "settlement"))
              || (item.label === "Docs" && view === "architecture")
              || (item.label === "Liquidity" && view === "liquidity");
            const href =
              item.label === "Terminal"
                ? viewUrl("trade", marketId, feedStatus, undefined, mode)
                : item.label === "Docs"
                  ? viewUrl("architecture", marketId, feedStatus, demoQuery, mode)
                  : item.label === "Liquidity"
                    ? viewUrl("liquidity", marketId, feedStatus, undefined, mode)
                    : item.href;
            return (
              <Link
                href={href}
                key={item.href}
                className={current ? styles.navActive : undefined}
                aria-current={current ? "page" : undefined}
                onClick={(event) => {
                  if (item.label === "Terminal") {
                    event.preventDefault();
                    selectView("trade");
                    return;
                  }
                  if (item.label === "Docs") {
                    event.preventDefault();
                    selectView("architecture");
                  }
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.headerActions}>
          <div className={styles.selectorTabs} role="radiogroup" aria-label="Terminal mode">
            {TERMINAL_MODES.map((id) => (
              <button
                type="button"
                key={id}
                role="radio"
                aria-checked={mode === id}
                tabIndex={mode === id ? 0 : -1}
                className={mode === id ? styles.selectorActive : undefined}
                ref={(node) => {
                  modeRefs.current[id] = node;
                }}
                onClick={() => selectMode(id)}
                onKeyDown={(event) => onModeKeyDown(event, id)}
              >
                {id === "simple" ? "Simple" : "Advanced"}
              </button>
            ))}
          </div>
          {view !== "settlement" ? (
            <>
              <span className={styles.network} aria-label={ZEC_DESTINATION_LABEL}>{NO_TEX_ISSUED}</span>
              <WalletBar wallet={wallet} onChange={setWallet} settlementPair={market.settlementPair} />
            </>
          ) : (
            <span className={styles.statusPill}>No wallet</span>
          )}
        </div>
      </header>

      {view !== "settlement" && <PreviewEducation force={forceEducation} />}

      <main id="main-content" className={styles.main} tabIndex={-1}>
        <h1 className={styles.srOnly}>Phlebas</h1>
        {initialAccess === "blocked" && <CountryBlock />}
        {initialAccess === "open" && view === "trade" && (
          <>
            <section
              className={isSimple ? `${styles.marketBar} ${styles.simpleMarketBar}` : styles.marketBar}
              aria-label="Selected market summary"
            >
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
                {isSimple ? (
                  <span className={styles.simpleFeedStatus}>Market data · {FEED_STATUS_LABELS[feedStatus]}</span>
                ) : (
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
                )}
              </div>
              <dl className={styles.marketStats} aria-label="Market statistics">
                <div className={styles.priceStat}>
                  <dt>{sessionLastStatLabel(market.settlementPair, statsSurface.showFixtures)}</dt>
                  <dd>{statsSurface.showFixtures ? formatAtomicUnits(book.lastTicks, PRICE_DECIMALS, 2) : "—"}</dd>
                </div>
                {isSimple ? null : (
                  <>
                    <div>
                      <dt>24h change</dt>
                      <dd className={feed.showFixtures ? (market.changeBps >= 0 ? styles.buyText : styles.sellText) : undefined}>
                        {feed.showFixtures ? formatSignedChange(market.changeBps) : "—"}
                      </dd>
                    </div>
                    <div><dt>24h high</dt><dd>{feed.showFixtures ? formatAtomicUnits(market.highTicks, PRICE_DECIMALS, 2) : "—"}</dd></div>
                    <div><dt>24h low</dt><dd>{feed.showFixtures ? formatAtomicUnits(market.lowTicks, PRICE_DECIMALS, 2) : "—"}</dd></div>
                  </>
                )}
              </dl>
              <p className={styles.inlineNotice}>{feed.statsNote}</p>
            </section>

            {isSimple ? (
              <div className={styles.simpleVenue}>
                <div className={styles.simpleVenueIntro}>
                  <span className={styles.eyebrow}>Simple market swap</span>
                  <h2>Trade ZEC without the terminal noise.</h2>
                  <p>
                    Your market swap crosses the same {marketId} order book used in Advanced mode.
                    It submits as an immediate-or-cancel order with your slippage limit.
                  </p>
                </div>
                {tradeTicket}
                <div className={styles.simpleSafetyNote} role="note">
                  <strong>No native value moves until the settlement deployment activates.</strong>
                  <p>
                    A matched fill still requires separate wallet-held funding, claim, and refund steps.
                  </p>
                  <button type="button" onClick={() => selectView("settlement")}>
                    Review the settlement path
                  </button>
                </div>
                <button type="button" className={styles.advancedModeLink} onClick={() => selectMode("advanced")}>
                  Open the full order book
                </button>
              </div>
            ) : (
              <div className={styles.tradeGrid}>
                {tradeTicket}
                <section id="price-chart" tabIndex={-1} className={`${styles.panel} ${styles.chartPanel}`} aria-labelledby="chart-title">
                  <div className={styles.panelHeader}>
                    <div>
                      <span className={styles.eyebrow}>{chartPanelEyebrowCopy(market.settlementPair)}</span>
                      <h2 id="chart-title" aria-label={chartPanelHeadingCopy(marketId)}>{marketId}</h2>
                    </div>
                    <div className={styles.rangeTabs} role="radiogroup" aria-label="Chart range">
                      {CHART_RANGES.map((item) => (
                        <button
                          type="button"
                          key={item}
                          role="radio"
                          aria-checked={range === item}
                          aria-label={chartRangeTabLabel(item, market.settlementPair)}
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

              <NativeMatcherOrderAction
                marketId={marketId}
                deployment={marketId === "ZEC/USDT"
                  ? NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT
                  : NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT}
              />

              <section id="recent-trades" tabIndex={-1} className={`${styles.panel} ${styles.tradesPanel}`} aria-labelledby="recent-trades-title">
                <div className={styles.panelHeader}>
                  <h2 id="recent-trades-title">Recent trades</h2>
                  <span className={styles.miniLabel}>
                    {tapeMiniLabel(sessionTape.length > 0, statsSurface.showFixtures, market.settlementPair)}
                  </span>
                </div>
                <table className={styles.dataTable}>
                  <caption className={styles.srOnly}>{tapeCaptionCopy(marketId, !statsSurface.showFixtures)}</caption>
                  <thead>
                    <tr><th scope="col">Price {market.quote}</th><th scope="col">Size ZEC</th><th scope="col">Time</th></tr>
                  </thead>
                  <tbody>
                    {sessionTape.map((trade) => (
                      <tr key={trade.id}>
                        <th scope="row" className={trade.takerSide === "buy" ? styles.buyText : styles.sellText}>
                          {tapeSideCopy(trade.takerSide)} {formatAtomicUnits(trade.priceTicks, PRICE_DECIMALS, 2)}
                        </th>
                        <td>{formatAtomicUnits(trade.sizeAtoms, ZEC_DECIMALS, 2)}</td>
                        <td>{trade.time}</td>
                      </tr>
                    ))}
                    {publicTape.map((trade) => (
                      <tr key={`tape-${trade.time}-${trade.priceTicks.toString()}`}>
                        <th scope="row" className={trade.side === "buy" ? styles.buyText : styles.sellText}>
                          {tapeSideCopy(trade.side)} {formatAtomicUnits(trade.priceTicks, PRICE_DECIMALS, 2)}
                        </th>
                        <td>{formatAtomicUnits(trade.sizeAtoms, ZEC_DECIMALS, 2)}</td>
                        <td>{trade.time}</td>
                      </tr>
                    ))}
                    {sessionTape.length === 0 && publicTape.length === 0 && (
                      <tr>
                        <td colSpan={3}>
                          <p className={styles.emptyState}>{feedWithheldCopy(feedStatus, market.settlementPair)}</p>
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
              <SettlementTicket
                key={marketId}
                marketId={marketId}
                variant="compact"
                activeFillId={sessionTape[0]?.id}
              />
              </div>
            )}
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
        {initialAccess === "open" && view === "settlement" && (
          <SettlementTicket key={marketId} marketId={marketId} onMarketChange={selectMarket} />
        )}
        {initialAccess === "open" && view === "bridge" && <BridgePanel initialJourney={initialBridgeJourney} />}
        {initialAccess === "open" && view === "architecture" && (
          <>
            <div className={styles.marketSelectorWrap}>
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
              <span className={styles.settlementBadge}>legacy market: {market.settlementPair}</span>
            </div>
            <ArchitecturePanel highlightIncidents={incidentDemo} />
            <LiquidityPanel
              variant="historical-amm"
              marketId={marketId}
              feedStatus={feedStatus}
              onMarketChange={selectMarket}
              onFeedChange={selectFeed}
              onRetryFeed={() => selectFeed("illustrative")}
            />
          </>
        )}
      </main>

      <div className={styles.footerSlot}>
        <SiteFooter />
      </div>
    </div>
  );
}
