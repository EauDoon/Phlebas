"use client";

import { useId, useMemo, useState } from "react";

import { pools, type MarketId } from "@/lib/market-data";
import {
  calculatePreviewNotional,
  formatQuotePreviewAmount,
  parseStrictDecimal,
  PZEC_ATOMIC_RULE,
} from "@/lib/order";

import styles from "./terminal.module.css";

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

  const amountPreview = useMemo(() => {
    try {
      const zecAmount = parseStrictDecimal(amount, { atomicRule: PZEC_ATOMIC_RULE });
      const poolPrice = selectedPool.reserveQuote / selectedPool.reserveZec;
      return {
        valid: true,
        balancedQuote: calculatePreviewNotional(poolPrice, zecAmount),
        message: "Use a positive plain decimal with no more than 8 places. Preview only.",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      const outsidePreviewRange = errorMessage.includes("outside the preview range");
      return {
        valid: false,
        balancedQuote: 0,
        message: outsidePreviewRange
          ? "Amount is outside the preview range."
          : errorMessage.includes("Notional must be at least")
            ? "Amount is too small to produce one quote-token atom."
            : "Enter a positive plain decimal with no more than 8 places.",
      };
    }
  }, [amount, selectedPool]);

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
              {amountPreview.valid ? formatQuotePreviewAmount(amountPreview.balancedQuote) : "0.00"}
            </output>
            <strong>{selectedPool.quote}</strong>
          </div>
        </div>
        <p id={amountHelpId} className={styles.inlineNotice} aria-live="polite">
          {amountPreview.message}
        </p>

        <dl className={styles.statGrid}>
          <div><dt>Pool fee</dt><dd>{selectedPool.fee}</dd></div>
          <div><dt>Illustrative TVL</dt><dd>{selectedPool.tvl}</dd></div>
          <div><dt>24h volume</dt><dd>{selectedPool.volume}</dd></div>
          <div><dt>Balanced add price move</dt><dd>0.00%</dd></div>
        </dl>

        <p className={styles.inlineNotice}>The 0.30% pool fee applies to swaps, not this exactly balanced liquidity preview.</p>

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
