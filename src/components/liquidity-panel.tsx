"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { quoteConstantProductSwapAtoms } from "@/lib/amm";
import { feeEnvelopeCopy } from "@/lib/fees";
import { custodyRedemptionCopy, publicLinkabilityCopy } from "@/lib/review-copy";
import {
  burnShares,
  emptyShareCopy,
  lpEmptyBookCopy,
  lpFeedBlockCopy,
  lpRiskCopy,
  isLpPauseNotice,
  lpPauseNoticeCopy,
  lpBurnNoticeCopy,
  lpMintNoticeCopy,
  lpResetNoticeCopy,
  lpSwapNoticeCopy,
  hypotheticalImpermanentLoss,
  IL_PRICE_SCENARIOS,
  lpOperationAllowed,
  mintShares,
  realizedImpermanentLoss,
  seedPool,
  type PoolShares,
} from "@/lib/lp";
import { markets, pools, type MarketId } from "@/lib/market-data";
import { MARKET_IDS, nextMarketId } from "@/lib/market-ids";
import {
  FEED_STATUS_LABELS,
  FEED_STATUSES,
  nextFeedStatus,
  ticketGate,
  type FeedStatus,
} from "@/lib/market-state";
import { interpretRovingKey } from "@/lib/roving-keys";
import {
  SOLVER_QUOTE_SIGNED_FIELDS,
  solverQuoteFieldCopy,
  solverQuoteInventoryCopy,
  solverQuoteRiskEntries,
} from "@/lib/solver-quotes";
import { parseAtomicUnits, formatAtomicUnits, ZEC_DECIMALS, QUOTE_DECIMALS } from "@/lib/units";

import styles from "./terminal.module.css";

type PoolId = (typeof pools)[number]["id"];
type EntryDeposit = { zecAtoms: bigint; quoteAtoms: bigint };
type LpReview = {
  kind: "mint" | "swap";
  zecAtoms: bigint;
  quoteAtoms: bigint;
  shares: bigint;
  swapOut: string;
  swapFee: string;
};

function initialPools(): Record<PoolId, PoolShares> {
  return {
    "ZEC/USDC": seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms),
    "ZEC/USDT": seedPool(pools[1].reserveZecAtoms, pools[1].reserveQuoteAtoms),
  };
}

function emptyShares(): Record<PoolId, bigint> {
  return { "ZEC/USDC": 0n, "ZEC/USDT": 0n };
}

function emptyDeposits(): Record<PoolId, EntryDeposit> {
  return {
    "ZEC/USDC": { zecAtoms: 0n, quoteAtoms: 0n },
    "ZEC/USDT": { zecAtoms: 0n, quoteAtoms: 0n },
  };
}

const QUOTE_FIELD_LABELS = {
  pair: "Pair",
  limits: "Limits",
  capacity: "Capacity",
  fee: "Fee",
  expiry: "Expiry",
  recipients: "Recipients",
} as const;

export function LiquidityPanel({
  marketId,
  feedStatus,
  onMarketChange,
  onFeedChange,
  onRetryFeed,
}: {
  marketId: MarketId;
  feedStatus: FeedStatus;
  onMarketChange: (market: MarketId) => void;
  onFeedChange: (status: FeedStatus) => void;
  onRetryFeed: () => void;
}) {
  const amountHelpId = useId();
  const amountErrorId = useId();
  const poolRefs = useRef<Partial<Record<PoolId, HTMLButtonElement | null>>>({});
  const feedRefs = useRef<Partial<Record<FeedStatus, HTMLButtonElement | null>>>({});
  const [feedFocusId, setFeedFocusId] = useState<FeedStatus>(feedStatus);
  const selectedPool = marketId === "ZEC/USDT" ? pools[1] : pools[0];
  const quoteFields = solverQuoteFieldCopy(selectedPool.id);
  const quoteRisks = solverQuoteRiskEntries();
  const [amount, setAmount] = useState("10");
  const [poolState, setPoolState] = useState(initialPools);
  const [heldShares, setHeldShares] = useState<Record<PoolId, bigint>>(emptyShares);
  const [entryDeposits, setEntryDeposits] = useState<Record<PoolId, EntryDeposit>>(emptyDeposits);
  const [notice, setNotice] = useState("Integer pool math. Wallet actions stay disabled.");
  const [tradingPaused, setTradingPaused] = useState(false);
  const [review, setReview] = useState<LpReview | null>(null);
  const gate = ticketGate(feedStatus, false, markets[marketId].settlementPair);
  const feedBlocksLp = feedStatus === "loading" || feedStatus === "stale" || feedStatus === "unavailable";
  const poolReserves = poolState[selectedPool.id];
  const sessionEntry = entryDeposits[selectedPool.id];
  const mintEnabled = lpOperationAllowed("mint", tradingPaused) && gate.canReview;
  const swapEnabled = lpOperationAllowed("swap", tradingPaused) && gate.canReview;

  const amountPreview = useMemo(() => {
    try {
      const zecAtoms = parseAtomicUnits(amount, ZEC_DECIMALS);
      const minted = mintShares(poolReserves, zecAtoms);
      const quoteAtoms = minted.quoteAtoms;
      let swapOut = "0.00";
      let swapFee = "0";
      let swapNote = "Swap size is too small to produce one quote atom.";
      try {
        const swap = quoteConstantProductSwapAtoms(
          zecAtoms,
          poolReserves.reserveZecAtoms,
          poolReserves.reserveQuoteAtoms,
        );
        swapOut = formatAtomicUnits(swap.amountOut, QUOTE_DECIMALS, 2);
        swapFee = formatAtomicUnits(swap.feePaid, ZEC_DECIMALS);
        swapNote = "";
      } catch (error) {
        swapNote = error instanceof Error ? error.message : swapNote;
      }
      return {
        valid: true,
        zecAtoms,
        quoteAtoms,
        shares: minted.shares,
        balancedQuote: formatAtomicUnits(quoteAtoms, QUOTE_DECIMALS, 2),
        swapOut,
        swapFee,
        swapNote,
        message: "Use a positive plain decimal with no more than 8 places. Integer quote.",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      const outsidePreviewRange = errorMessage.includes("outside the preview range");
      return {
        valid: false,
        zecAtoms: 0n,
        quoteAtoms: 0n,
        shares: 0n,
        balancedQuote: "0.00",
        swapOut: "0.00",
        swapFee: "0",
        swapNote: "",
        message: outsidePreviewRange
          ? "Amount is outside the preview range."
          : errorMessage.includes("at least")
            ? "Amount is too small to produce one quote-token atom."
            : "Enter a positive plain decimal with no more than 8 places.",
      };
    }
  }, [amount, poolReserves]);

  const sessionIl = realizedImpermanentLoss(
    sessionEntry.zecAtoms,
    sessionEntry.quoteAtoms,
    heldShares[selectedPool.id],
    poolReserves,
  );
  const hypotheticalIl = IL_PRICE_SCENARIOS.map((scenario) => ({
    ...scenario,
    preview: amountPreview.valid
      ? hypotheticalImpermanentLoss(
        amountPreview.zecAtoms,
        amountPreview.quoteAtoms,
        scenario.priceMultipleNumerator,
        scenario.priceMultipleDenominator,
      )
      : { hodlQuoteAtoms: 0n, positionQuoteAtoms: 0n, lossQuoteAtoms: 0n },
  }));

  function selectPool(id: PoolId) {
    onMarketChange(id);
  }

  function selectFeed(id: FeedStatus) {
    setReview(null);
    setFeedFocusId(id);
    onFeedChange(id);
  }

  function moveFeedFocus(next: FeedStatus) {
    setFeedFocusId(next);
    feedRefs.current[next]?.focus();
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

  function onPoolKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: PoolId) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = nextMarketId(id, 1);
      selectPool(next);
      poolRefs.current[next]?.focus();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = nextMarketId(id, -1);
      selectPool(next);
      poolRefs.current[next]?.focus();
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      selectPool(MARKET_IDS[0]);
      poolRefs.current[MARKET_IDS[0]]?.focus();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      selectPool(MARKET_IDS[MARKET_IDS.length - 1]);
      poolRefs.current[MARKET_IDS[MARKET_IDS.length - 1]]?.focus();
    }
  }

  function requestMintReview() {
    if (!gate.canReview) {
      setNotice(gate.message);
      return;
    }
    if (!lpOperationAllowed("mint", tradingPaused)) {
      setNotice(lpPauseNoticeCopy(markets[marketId].settlementPair, true));
      return;
    }
    if (!amountPreview.valid || amountPreview.zecAtoms <= 0n || amountPreview.quoteAtoms <= 0n) {
      setNotice(amountPreview.message);
      return;
    }
    setReview({
      kind: "mint",
      zecAtoms: amountPreview.zecAtoms,
      quoteAtoms: amountPreview.quoteAtoms,
      shares: amountPreview.shares,
      swapOut: amountPreview.swapOut,
      swapFee: amountPreview.swapFee,
    });
  }

  function executeMint() {
    if (!amountPreview.valid || amountPreview.zecAtoms <= 0n || amountPreview.quoteAtoms <= 0n) {
      setNotice(amountPreview.message);
      return;
    }
    try {
      const minted = mintShares(poolReserves, amountPreview.zecAtoms);
      setPoolState((current) => ({ ...current, [selectedPool.id]: minted.pool }));
      setHeldShares((current) => ({ ...current, [selectedPool.id]: current[selectedPool.id] + minted.shares }));
      setEntryDeposits((current) => ({
        ...current,
        [selectedPool.id]: {
          zecAtoms: current[selectedPool.id].zecAtoms + amountPreview.zecAtoms,
          quoteAtoms: current[selectedPool.id].quoteAtoms + minted.quoteAtoms,
        },
      }));
      setReview(null);
      setNotice(lpMintNoticeCopy(minted.shares, markets[marketId].settlementPair));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : amountPreview.message);
    }
  }

  function simulateBurn() {
    const shares = heldShares[selectedPool.id];
    if (shares <= 0n) {
      setNotice(emptyShareCopy(selectedPool.id));
      return;
    }
    try {
      const burned = burnShares(poolReserves, shares);
      setPoolState((current) => ({ ...current, [selectedPool.id]: burned.pool }));
      setHeldShares((current) => ({ ...current, [selectedPool.id]: 0n }));
      setEntryDeposits((current) => ({ ...current, [selectedPool.id]: { zecAtoms: 0n, quoteAtoms: 0n } }));
      setNotice(lpBurnNoticeCopy(formatAtomicUnits(burned.zecAtoms, ZEC_DECIMALS), markets[marketId].settlementPair));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Share amount is outside the preview range");
    }
  }

  function requestSwapReview() {
    if (!gate.canReview) {
      setNotice(gate.message);
      return;
    }
    if (!lpOperationAllowed("swap", tradingPaused)) {
      setNotice(lpPauseNoticeCopy(markets[marketId].settlementPair, true));
      return;
    }
    if (!amountPreview.valid || amountPreview.zecAtoms <= 0n) {
      setNotice(amountPreview.message);
      return;
    }
    setReview({
      kind: "swap",
      zecAtoms: amountPreview.zecAtoms,
      quoteAtoms: amountPreview.quoteAtoms,
      shares: 0n,
      swapOut: amountPreview.swapOut,
      swapFee: amountPreview.swapFee,
    });
  }

  function executeSwap() {
    if (!amountPreview.valid || amountPreview.zecAtoms <= 0n) {
      setNotice(amountPreview.message);
      return;
    }
    try {
      const swap = quoteConstantProductSwapAtoms(
        amountPreview.zecAtoms,
        poolReserves.reserveZecAtoms,
        poolReserves.reserveQuoteAtoms,
      );
      setPoolState((current) => ({
        ...current,
        [selectedPool.id]: {
          ...current[selectedPool.id],
          reserveZecAtoms: current[selectedPool.id].reserveZecAtoms + amountPreview.zecAtoms,
          reserveQuoteAtoms: current[selectedPool.id].reserveQuoteAtoms - swap.amountOut,
        },
      }));
      setReview(null);
      setNotice(lpSwapNoticeCopy(
        formatAtomicUnits(swap.amountOut, QUOTE_DECIMALS, 2),
        selectedPool.quote,
        markets[marketId].settlementPair,
      ));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Swap quote is outside the preview range.");
    }
  }

  const liveNotice = isLpPauseNotice(notice) ? lpPauseNoticeCopy(markets[marketId].settlementPair, tradingPaused) : notice;

  return (
    <div className={styles.liquidityGrid}>
      <section className={`${styles.panel} ${styles.lpQuote}`} aria-labelledby="liquidity-title">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Maker and solver quotes</span>
            <h2 id="liquidity-title">Solver quotes</h2>
          </div>
          <span className={styles.statusDot}>Wallet-held inventory</span>
        </div>

        <div
          id="liquidity-pools"
          className={styles.poolTabs}
          role="radiogroup"
          aria-label="Quote pair"
          tabIndex={-1}
        >
          {pools.map((pool) => (
            <button
              type="button"
              key={pool.id}
              role="radio"
              aria-checked={selectedPool.id === pool.id}
              className={selectedPool.id === pool.id ? styles.poolActive : undefined}
              tabIndex={selectedPool.id === pool.id ? 0 : -1}
              ref={(node) => {
                poolRefs.current[pool.id] = node;
              }}
              onClick={() => selectPool(pool.id)}
              onKeyDown={(event) => onPoolKeyDown(event, pool.id)}
            >
              <span>{pool.id}</span>
            </button>
          ))}
        </div>

        <p className={styles.featureLead}>{solverQuoteInventoryCopy()}</p>
        <p className={styles.gateNotice} aria-label="Review custody notice">
          This panel labels native ZEC. It is not live settlement. The matcher is not trustless.
        </p>

        <dl className={styles.ticketSummary}>
          {SOLVER_QUOTE_SIGNED_FIELDS.map((field) => (
            <div key={field}>
              <dt>{QUOTE_FIELD_LABELS[field]}</dt>
              <dd>{quoteFields[field]}</dd>
            </div>
          ))}
        </dl>

        <div className={styles.lpActions}>
          <p className={styles.inlineNotice}>
            No shared AMM shares. Unused capacity stays in the provider wallet.
          </p>
          <button type="button" className={styles.primaryAction} disabled>
            Wallet actions stay disabled
          </button>
        </div>
      </section>

      <section
        id="historical-amm"
        className={`${styles.panel} ${styles.lpStats}`}
        aria-labelledby="pool-stats-heading"
        tabIndex={-1}
      >
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Historical models</span>
            <h2 id="pool-stats-heading">Historical AMM model</h2>
          </div>
          <span className={styles.warningPill}>Retired</span>
        </div>
        <p className={styles.inlineNotice}>
          Retired constant-product math. It is not the current liquidity product.
        </p>
        {heldShares[selectedPool.id] === 0n && (
          <p className={styles.inlineNotice}>
            {emptyShareCopy(selectedPool.id)}
          </p>
        )}

        <div className={styles.inputLabel}>
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

        {feedStatus !== "illustrative" && (
          <div className={styles.ticketBlocked} role="status">
            <strong>{gate.heading}</strong>
            <p>
              {gate.message}
              {gate.asOf ? ` As of ${gate.asOf}.` : ""}
              {" "}
              {feedBlocksLp ? lpFeedBlockCopy() : lpEmptyBookCopy()}
            </p>
            {onRetryFeed && (
              <button type="button" className={styles.textButton} onClick={onRetryFeed}>
                Retry illustrative feed
              </button>
            )}
          </div>
        )}

        {!gate.canReview && feedStatus === "illustrative" && (
          <p className={styles.gateNotice}>
            <strong>{gate.heading}</strong>
            {" "}
            {gate.message}
            {" "}
            <button type="button" className={styles.textButton} onClick={() => { setReview(null); setFeedFocusId("illustrative"); onRetryFeed(); }}>
              Retry illustrative feed
            </button>
          </p>
        )}

        <div className={styles.depositStack}>
          <label className={styles.assetInput}>
            <span>ZEC amount</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-label="ZEC liquidity amount"
              aria-invalid={!amountPreview.valid}
              aria-errormessage={!amountPreview.valid ? amountErrorId : undefined}
              aria-describedby={!amountPreview.valid ? `${amountErrorId} ${amountHelpId}` : amountHelpId}
            />
            <strong>ZEC</strong>
          </label>
          <span className={styles.plusMark}>+</span>
          <div className={styles.assetInput}>
            <span>Balanced quote amount</span>
            <output>
              {amountPreview.valid ? amountPreview.balancedQuote : "0.00"}
            </output>
            <strong>{selectedPool.quote}</strong>
          </div>
        </div>
        {!amountPreview.valid ? (
          <p id={amountErrorId} className={styles.inlineNotice} role="alert">{amountPreview.message}</p>
        ) : null}
        <p id={amountHelpId} className={styles.inlineNotice} aria-live="polite">
          {amountPreview.valid ? amountPreview.message : "Use a positive plain decimal with no more than 8 places. Integer quote."}
        </p>

        {review ? (
          <div className={styles.reviewBlock}>
            <p className={styles.gateNotice} aria-label="Historical AMM review notice">
              This historical AMM model labels native ZEC. It is not live settlement. The matcher is not trustless.
            </p>
            <dl className={styles.ticketSummary}>
              <div>
                <dt>Leaves the session</dt>
                <dd>
                  {review.kind === "mint"
                    ? `${formatAtomicUnits(review.zecAtoms, ZEC_DECIMALS)} ZEC and ${formatAtomicUnits(review.quoteAtoms, QUOTE_DECIMALS, 2)} ${selectedPool.quote} from local preview balances`
                    : `${formatAtomicUnits(review.zecAtoms, ZEC_DECIMALS)} ZEC from the local preview balance`}
                </dd>
              </div>
              <div>
                <dt>Arrives in the session</dt>
                <dd>
                  {review.kind === "mint"
                    ? `${review.shares.toString()} local LP shares for ${selectedPool.id}`
                    : `${review.swapOut} ${selectedPool.quote} in the local preview balance`}
                </dd>
              </div>
              <div>
                <dt>Worst acceptable price</dt>
                <dd>
                  {review.kind === "mint"
                    ? "Balanced add. No swap price bound."
                    : `${review.swapOut} ${selectedPool.quote} out, integer quote`}
                </dd>
              </div>
              <div>
                <dt>Fees</dt>
                <dd>{feeEnvelopeCopy()} AMM swap fee paid in ZEC: {review.swapFee}.</dd>
              </div>
              <div>
                <dt>Custody and redemption</dt>
                <dd>{custodyRedemptionCopy()}</dd>
              </div>
              <div>
                <dt>Public linkability</dt>
                <dd>{publicLinkabilityCopy("LP action")}</dd>
              </div>
            </dl>
            <p className={styles.inlineNotice}>
              Any future transparent Zcash and Ethereum Mainnet LP-related activity would be publicly linkable. This local preview makes no chain transaction.
              LPs also face stablecoin risk, smart-contract risk, impermanent loss, and toxic flow from the order book.
            </p>
            <p className={styles.inlineNotice}>
              Confirm runs the local integer pool. Wallet actions stay disabled.
            </p>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={review.kind === "mint" ? executeMint : executeSwap}
            >
              Confirm simulated {review.kind}
            </button>
            <button type="button" className={styles.textButton} onClick={() => setReview(null)}>
              Back
            </button>
          </div>
        ) : null}

        <div className={styles.lpActions}>
          <div className={styles.tourNav}>
            <button type="button" onClick={requestMintReview} disabled={!mintEnabled}>Review simulated mint</button>
            <button type="button" onClick={simulateBurn} disabled={!lpOperationAllowed("burn", tradingPaused)}>Burn session shares</button>
            <button type="button" onClick={requestSwapReview} disabled={!swapEnabled}>Review simulated swap</button>
            <button
              type="button"
              aria-pressed={tradingPaused}
              onClick={() => {
                setTradingPaused((current) => !current);
                setNotice(lpPauseNoticeCopy(markets[marketId].settlementPair, !tradingPaused));
              }}
            >
              {tradingPaused ? "Resume trading preview" : "Pause trading preview"}
            </button>
            <button type="button" onClick={() => { setPoolState(initialPools()); setHeldShares(emptyShares()); setEntryDeposits(emptyDeposits()); setReview(null); setNotice(lpResetNoticeCopy(markets[marketId].settlementPair)); }}>
              Reset pool
            </button>
          </div>
          <p className={styles.inlineNotice} aria-live="polite">{liveNotice}</p>
        </div>

        <dl
          id="pool-stats"
          className={styles.statGrid}
          role="group"
          aria-label="Historical AMM pool stats"
          tabIndex={-1}
        >
          <div><dt>Pool fee</dt><dd>{selectedPool.fee}</dd></div>
          <div><dt>Historical pool size</dt><dd>{selectedPool.tvl}</dd></div>
          <div><dt>Historical pool volume</dt><dd>{selectedPool.volume}</dd></div>
          <div><dt>ZEC reserve</dt><dd>{formatAtomicUnits(poolReserves.reserveZecAtoms, ZEC_DECIMALS, 2)}</dd></div>
          <div><dt>{selectedPool.quote} reserve</dt><dd>{formatAtomicUnits(poolReserves.reserveQuoteAtoms, QUOTE_DECIMALS, 2)}</dd></div>
          <div><dt>Integer swap out</dt><dd>{amountPreview.swapOut} {selectedPool.quote}</dd></div>
          <div>
            <dt>Session LP shares</dt>
            <dd>{heldShares[selectedPool.id].toString()}</dd>
          </div>
          <div>
            <dt>Session IL vs hold</dt>
            <dd>{formatAtomicUnits(sessionIl.lossQuoteAtoms, QUOTE_DECIMALS, 2)} {selectedPool.quote}</dd>
          </div>
          {hypotheticalIl.map((scenario) => (
            <div key={scenario.label}>
              <dt>IL vs hold at {scenario.label}</dt>
              <dd>{formatAtomicUnits(scenario.preview.lossQuoteAtoms, QUOTE_DECIMALS, 2)} {selectedPool.quote}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.inlineNotice}>
          Not a return or profit projection. Local integer constant-product divergence versus holding the same deposited assets.
        </p>
        <p className={styles.inlineNotice}>
          The 0.30% pool fee applies to swaps, not the exactly balanced add. Swap fee paid in ZEC: {amountPreview.swapFee}.
          {amountPreview.swapNote ? ` ${amountPreview.swapNote}` : ""}
        </p>
        <p className={styles.inlineNotice}>{lpRiskCopy()}</p>
      </section>

      <aside className={`${styles.panel} ${styles.lpRisk}`} aria-labelledby="lp-risk-title">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Quote risk</span>
            <h2 id="lp-risk-title">Named quote risks</h2>
          </div>
        </div>
        <ul className={styles.cleanList}>
          {quoteRisks.map((entry) => (
            <li key={entry.risk}>
              <strong>{entry.risk}</strong>
              {" — "}
              {entry.copy}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
