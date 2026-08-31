"use client";

import { useId, useMemo, useState } from "react";

import { quoteConstantProductSwapAtoms } from "@/lib/amm";
import { burnShares, lpOperationAllowed, mintShares, seedPool, type PoolShares } from "@/lib/lp";
import { pools, type MarketId } from "@/lib/market-data";
import { parseAtomicUnits, formatAtomicUnits, PZEC_DECIMALS, QUOTE_DECIMALS } from "@/lib/units";

import styles from "./terminal.module.css";

function initialPools(): Record<(typeof pools)[number]["id"], PoolShares> {
  return {
    "pZEC/USDC": seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms),
    "pZEC/USDT0": seedPool(pools[1].reserveZecAtoms, pools[1].reserveQuoteAtoms),
  };
}

export function LiquidityPanel({
  marketId,
  onMarketChange,
}: {
  marketId: MarketId;
  onMarketChange: (market: MarketId) => void;
}) {
  const amountHelpId = useId();
  const selectedPool = marketId === "ZEC/USDT" ? pools[1] : pools[0];
  const [amount, setAmount] = useState("10");
  const [poolState, setPoolState] = useState(initialPools);
  const [heldShares, setHeldShares] = useState<Record<(typeof pools)[number]["id"], bigint>>({
    "pZEC/USDC": 0n,
    "pZEC/USDT0": 0n,
  });
  const [notice, setNotice] = useState("Integer pool math. Wallet actions stay disabled.");
  const [tradingPaused, setTradingPaused] = useState(false);
  const poolReserves = poolState[selectedPool.id];

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

  function simulateAdd() {
    if (!lpOperationAllowed("mint", tradingPaused)) {
      setNotice("Trading is paused. LP withdrawal remains available.");
      return;
    }
    if (!amountPreview.valid || amountPreview.zecAtoms <= 0n || amountPreview.quoteAtoms <= 0n) {
      setNotice(amountPreview.message);
      return;
    }
    try {
      const minted = mintShares(poolReserves, amountPreview.zecAtoms);
      setPoolState((current) => ({ ...current, [selectedPool.id]: minted.pool }));
      setHeldShares((current) => ({ ...current, [selectedPool.id]: current[selectedPool.id] + minted.shares }));
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
      setNotice(`Burned session shares for ${formatAtomicUnits(burned.pzecAtoms, PZEC_DECIMALS)} pZEC. Local preview only.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Share amount is outside the preview range");
    }
  }

  function simulateSwap() {
    if (!lpOperationAllowed("swap", tradingPaused)) {
      setNotice("Trading is paused. LP withdrawal remains available.");
      return;
    }
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
            <span className={styles.eyebrow}>Constant product pools</span>
            <h2 id="liquidity-title">Provide liquidity</h2>
          </div>
          <span className={styles.statusDot}>Preview only</span>
        </div>

        <div className={styles.poolTabs} role="group" aria-label="Liquidity pool">
          {pools.map((pool) => (
            <button
              type="button"
              key={pool.id}
              aria-pressed={selectedPool.id === pool.id}
              className={selectedPool.id === pool.id ? styles.poolActive : undefined}
              onClick={() => onMarketChange(pool.id === "pZEC/USDT0" ? "ZEC/USDT" : "ZEC/USDC")}
            >
              <span>{pool.id}</span>
              {pool.id === "pZEC/USDT0" && <small>Later listing gate</small>}
            </button>
          ))}
        </div>

        {selectedPool.id === "pZEC/USDT0" && (
          <p className={styles.gateNotice}>Later listing gate. This is a preview. Listing stays blocked until issuer, legal, and security gates pass.</p>
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
              aria-describedby={amountHelpId}
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
        <p id={amountHelpId} className={styles.inlineNotice} aria-live="polite">
          {amountPreview.message}
        </p>

        <dl className={styles.statGrid}>
          <div><dt>Pool fee</dt><dd>{selectedPool.fee}</dd></div>
          <div><dt>pZEC reserve</dt><dd>{formatAtomicUnits(poolReserves.reservePzecAtoms, PZEC_DECIMALS, 2)}</dd></div>
          <div><dt>{selectedPool.quote} reserve</dt><dd>{formatAtomicUnits(poolReserves.reserveQuoteAtoms, QUOTE_DECIMALS, 2)}</dd></div>
          <div><dt>Integer swap out</dt><dd>{amountPreview.swapOut} {selectedPool.quote}</dd></div>
          <div><dt>Session LP shares</dt><dd>{heldShares[selectedPool.id].toString()}</dd></div>
        </dl>

        <p className={styles.inlineNotice}>
          The 0.30% pool fee applies to swaps, not the exactly balanced add. Swap fee paid in pZEC: {amountPreview.swapFee}.
          {amountPreview.swapNote ? ` ${amountPreview.swapNote}` : ""}
        </p>

        <div className={styles.tourNav}>
          <button type="button" onClick={simulateAdd} disabled={!lpOperationAllowed("mint", tradingPaused)}>Simulate mint</button>
          <button type="button" onClick={simulateBurn} disabled={!lpOperationAllowed("burn", tradingPaused)}>Burn session shares</button>
          <button type="button" onClick={simulateSwap} disabled={!lpOperationAllowed("swap", tradingPaused)}>Simulate swap</button>
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
          <button type="button" onClick={() => { setPoolState(initialPools()); setHeldShares({ "pZEC/USDC": 0n, "pZEC/USDT0": 0n }); setNotice("Local pool reserves restored."); }}>
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
          <li>Fixed 30 bps swap fee, paid entirely to LPs</li>
          <li>No farming, leverage, flash callbacks, or arbitrary pair creation</li>
          <li>LP withdrawal remains available during a trading pause</li>
          <li>Public funds stay blocked until independent audits and custody gates pass</li>
        </ul>
      </aside>
    </div>
  );
}
