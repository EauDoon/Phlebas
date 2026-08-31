"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { quoteConstantProductSwapAtoms } from "@/lib/amm";
import { AMM_FEE_BPS, feeEnvelopeCopy } from "@/lib/fees";
import {
  burnShares,
  hypotheticalImpermanentLoss,
  IL_PRICE_SCENARIOS,
  lpOperationAllowed,
  mintShares,
  realizedImpermanentLoss,
  seedPool,
  type PoolShares,
} from "@/lib/lp";
import { pools, type MarketId } from "@/lib/market-data";
import {
  FEED_STATUS_LABELS,
  FEED_STATUSES,
  nextFeedStatus,
  ticketGate,
  type FeedStatus,
} from "@/lib/market-state";
import { nextPoolId, POOL_IDS, type PoolId } from "@/lib/pool-ids";
import { interpretRovingKey } from "@/lib/roving-keys";
import { parseAtomicUnits, formatAtomicUnits, PZEC_DECIMALS, QUOTE_DECIMALS } from "@/lib/units";

import styles from "./terminal.module.css";

type EntryDeposit = { pzecAtoms: bigint; quoteAtoms: bigint };
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
    "pZEC/USDC": seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms),
    "pZEC/USDT0": seedPool(pools[1].reserveZecAtoms, pools[1].reserveQuoteAtoms),
  };
}

function emptyShares(): Record<PoolId, bigint> {
  return { "pZEC/USDC": 0n, "pZEC/USDT0": 0n };
}

function emptyDeposits(): Record<PoolId, EntryDeposit> {
  return {
    "pZEC/USDC": { pzecAtoms: 0n, quoteAtoms: 0n },
    "pZEC/USDT0": { pzecAtoms: 0n, quoteAtoms: 0n },
  };
}

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
  const [amount, setAmount] = useState("10");
  const [poolState, setPoolState] = useState(initialPools);
  const [heldShares, setHeldShares] = useState<Record<PoolId, bigint>>(emptyShares);
  const [entryDeposits, setEntryDeposits] = useState<Record<PoolId, EntryDeposit>>(emptyDeposits);
  const [notice, setNotice] = useState("Integer pool math. Wallet actions stay disabled.");
  const [tradingPaused, setTradingPaused] = useState(false);
  const [review, setReview] = useState<LpReview | null>(null);
  const poolReserves = poolState[selectedPool.id];
  const sessionEntry = entryDeposits[selectedPool.id];
  const gate = ticketGate(feedStatus, false);
  const mintEnabled = lpOperationAllowed("mint", tradingPaused) && gate.canReview;
  const swapEnabled = lpOperationAllowed("swap", tradingPaused) && gate.canReview;

  const amountPreview = useMemo(() => {
    try {
      const zecAtoms = parseAtomicUnits(amount, PZEC_DECIMALS);
      const minted = mintShares(poolReserves, zecAtoms);
      const quoteAtoms = minted.quoteAtoms;
      let swapOut = "0.00";
      let swapFee = "0";
      let swapNote = "Swap size is too small to produce one quote atom.";
      try {
        const swap = quoteConstantProductSwapAtoms(
          zecAtoms,
          poolReserves.reservePzecAtoms,
          poolReserves.reserveQuoteAtoms,
        );
        swapOut = formatAtomicUnits(swap.amountOut, QUOTE_DECIMALS, 2);
        swapFee = formatAtomicUnits(swap.feePaid, PZEC_DECIMALS);
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
    sessionEntry.pzecAtoms,
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
    onMarketChange(id === "pZEC/USDT0" ? "ZEC/USDT" : "ZEC/USDC");
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
      const next = nextPoolId(id, 1);
      selectPool(next);
      poolRefs.current[next]?.focus();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = nextPoolId(id, -1);
      selectPool(next);
      poolRefs.current[next]?.focus();
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      selectPool(POOL_IDS[0]);
      poolRefs.current[POOL_IDS[0]]?.focus();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      selectPool(POOL_IDS[POOL_IDS.length - 1]);
      poolRefs.current[POOL_IDS[POOL_IDS.length - 1]]?.focus();
    }
  }

  function requestMintReview() {
    if (!gate.canReview) {
      setNotice(gate.message);
      return;
    }
    if (!lpOperationAllowed("mint", tradingPaused)) {
      setNotice("Trading is paused. LP withdrawal remains available.");
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
          pzecAtoms: current[selectedPool.id].pzecAtoms + amountPreview.zecAtoms,
          quoteAtoms: current[selectedPool.id].quoteAtoms + minted.quoteAtoms,
        },
      }));
      setReview(null);
      setNotice(`Minted ${minted.shares.toString()} local LP shares. Wallet actions stay disabled.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : amountPreview.message);
    }
  }

  function simulateBurn() {
    const shares = heldShares[selectedPool.id];
    if (shares <= 0n) {
      setNotice("No session LP shares to burn.");
      return;
    }
    try {
      const burned = burnShares(poolReserves, shares);
      setPoolState((current) => ({ ...current, [selectedPool.id]: burned.pool }));
      setHeldShares((current) => ({ ...current, [selectedPool.id]: 0n }));
      setEntryDeposits((current) => ({ ...current, [selectedPool.id]: { pzecAtoms: 0n, quoteAtoms: 0n } }));
      setNotice(`Burned session shares for ${formatAtomicUnits(burned.pzecAtoms, PZEC_DECIMALS)} pZEC. Local preview only.`);
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
      setNotice("Trading is paused. LP withdrawal remains available.");
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
        poolReserves.reservePzecAtoms,
        poolReserves.reserveQuoteAtoms,
      );
      setPoolState((current) => ({
        ...current,
        [selectedPool.id]: {
          ...current[selectedPool.id],
          reservePzecAtoms: current[selectedPool.id].reservePzecAtoms + amountPreview.zecAtoms,
          reserveQuoteAtoms: current[selectedPool.id].reserveQuoteAtoms - swap.amountOut,
        },
      }));
      setReview(null);
      setNotice(`Simulated pZEC→${selectedPool.quote} swap. Output ${formatAtomicUnits(swap.amountOut, QUOTE_DECIMALS, 2)} ${selectedPool.quote}. Local preview only.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Swap quote is outside the preview range.");
    }
  }

  return (
    <div className={styles.featureGrid}>
      <section className={`${styles.panel} ${styles.featurePrimary}`} aria-labelledby="liquidity-title">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Legacy constant-product simulation</span>
            <h2 id="liquidity-title">Provide liquidity</h2>
          </div>
          <span className={styles.statusDot}>Superseded preview</span>
        </div>

        <div
          id="liquidity-pools"
          className={styles.poolTabs}
          role="radiogroup"
          aria-label="Liquidity pool"
          tabIndex={-1}
        >
          {pools.map((pool) => (
            <button
              type="button"
              key={pool.id}
              role="radio"
              aria-checked={selectedPool.id === pool.id}
              className={selectedPool.id === pool.id ? styles.poolActive : undefined}
              ref={(node) => {
                poolRefs.current[pool.id] = node;
              }}
              onClick={() => selectPool(pool.id)}
              onKeyDown={(event) => onPoolKeyDown(event, pool.id)}
            >
              <span>{pool.id}</span>
              {pool.id === "pZEC/USDT0" && <small>Later listing gate</small>}
            </button>
          ))}
        </div>

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

        {selectedPool.id === "pZEC/USDT0" && (
          <p className={styles.gateNotice}>Later listing gate. This is a preview. Listing stays blocked until issuer, legal, and security gates pass.</p>
        )}

        {!gate.canReview && (
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
            <span>pZEC amount</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-label="pZEC liquidity amount"
              aria-invalid={!amountPreview.valid}
              aria-errormessage={!amountPreview.valid ? amountErrorId : undefined}
              aria-describedby={!amountPreview.valid ? `${amountErrorId} ${amountHelpId}` : amountHelpId}
            />
            <strong>pZEC</strong>
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

        <dl
          id="pool-stats"
          className={styles.statGrid}
          role="group"
          aria-label="Pool stats and impermanent loss versus hold"
          tabIndex={-1}
        >
          <div><dt>Pool fee</dt><dd>{selectedPool.fee}</dd></div>
          <div><dt>TVL</dt><dd>Fixture {selectedPool.tvl}</dd></div>
          <div><dt>24h volume</dt><dd>Fixture {selectedPool.volume}</dd></div>
          <div><dt>pZEC reserve</dt><dd>{formatAtomicUnits(poolReserves.reservePzecAtoms, PZEC_DECIMALS, 2)}</dd></div>
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
        {heldShares[selectedPool.id] === 0n && (
          <p className={styles.inlineNotice}>
            No session LP shares. Burn stays available when shares exist. Mint is a local preview.
          </p>
        )}
        <p className={styles.inlineNotice}>
          Not a return or profit projection. Local integer preview of constant-product divergence versus holding the same deposited assets.
        </p>

        <p className={styles.inlineNotice}>
          The 0.30% pool fee applies to swaps, not the exactly balanced add. Swap fee paid in pZEC: {amountPreview.swapFee}.
          {amountPreview.swapNote ? ` ${amountPreview.swapNote}` : ""}
        </p>

        {review ? (
          <div className={styles.reviewBlock}>
            {selectedPool.id === "pZEC/USDT0" && (
              <p className={styles.gateNotice}>Later listing gate. This is a preview. Listing stays blocked until issuer, legal, and security gates pass.</p>
            )}
            <p className={styles.gateNotice} aria-label="Review custody notice">
              pZEC is a custody receipt, not native ZEC. This LP preview is public in the simulation. The matcher is not trustless.
            </p>
            <dl className={styles.ticketSummary}>
              <div>
                <dt>Leaves the session</dt>
                <dd>
                  {review.kind === "mint"
                    ? `${formatAtomicUnits(review.zecAtoms, PZEC_DECIMALS)} pZEC and ${formatAtomicUnits(review.quoteAtoms, QUOTE_DECIMALS, 2)} ${selectedPool.quote} on Arbitrum Sepolia`
                    : `${formatAtomicUnits(review.zecAtoms, PZEC_DECIMALS)} pZEC on Arbitrum Sepolia`}
                </dd>
              </div>
              <div>
                <dt>Arrives in the session</dt>
                <dd>
                  {review.kind === "mint"
                    ? `${review.shares.toString()} local LP shares for ${selectedPool.id}`
                    : `${review.swapOut} ${selectedPool.quote} on Arbitrum Sepolia`}
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
                <dd>{feeEnvelopeCopy()} AMM swap fee paid in pZEC: {review.swapFee}.</dd>
              </div>
            </dl>
            <p className={styles.inlineNotice}>
              Transparent Zcash and this Arbitrum LP action are publicly linkable. pZEC redemption depends on the gateway.
              LPs also face stablecoin risk, smart-contract risk, impermanent loss, and toxic flow from the order book.
            </p>
            <p className={styles.inlineNotice}>
              Confirm runs the local integer pool preview. Wallet actions stay disabled.
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

        <div className={styles.tourNav}>
          <button type="button" onClick={requestMintReview} disabled={!mintEnabled}>Review simulated mint</button>
          <button type="button" onClick={simulateBurn} disabled={!lpOperationAllowed("burn", tradingPaused)}>Burn session shares</button>
          <button type="button" onClick={requestSwapReview} disabled={!swapEnabled}>Review simulated swap</button>
          <button
            type="button"
            aria-pressed={tradingPaused}
            onClick={() => {
              setTradingPaused((current) => !current);
              setNotice(tradingPaused
                ? "Trading pause lifted. Mint and swap are available again."
                : "Trading paused. LP withdrawal remains available.");
            }}
          >
            {tradingPaused ? "Resume trading preview" : "Pause trading preview"}
          </button>
          <button type="button" onClick={() => { setPoolState(initialPools()); setHeldShares(emptyShares()); setEntryDeposits(emptyDeposits()); setReview(null); setNotice("Local pool reserves restored."); }}>
            Reset pool
          </button>
        </div>
        <p className={styles.inlineNotice} aria-live="polite">{notice}</p>
        <button type="button" className={styles.primaryAction} disabled>
          Wallet actions disabled in simulation
        </button>
      </section>

      <aside className={`${styles.panel} ${styles.riskCard}`} aria-labelledby="lp-risk-title">
        <span className={styles.eyebrow}>LP risk</span>
        <h2 id="lp-risk-title">Simple does not mean low risk</h2>
        <p>
          LPs would face pZEC reserve and redemption risk, stablecoin risk, smart-contract risk,
          impermanent loss, and adverse selection from the order book.
        </p>
        <ul className={styles.cleanList}>
          <li>Fixed {AMM_FEE_BPS} bps swap fee, paid entirely to LPs</li>
          <li>No farming, leverage, flash callbacks, or arbitrary pair creation</li>
          <li>LP withdrawal remains available during a trading pause</li>
          <li>Public funds stay blocked until independent audits and custody gates pass</li>
        </ul>
      </aside>
    </div>
  );
}
