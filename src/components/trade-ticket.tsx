"use client";

import { useId, useMemo, useState } from "react";

import type { Market } from "@/lib/market-data";
import {
  calculatePreviewNotional,
  calculateWorstPrice,
  formatPzecPreviewAmount,
  formatQuotePreviewAmount,
  parseStrictDecimal,
  PZEC_ATOMIC_RULE,
  QUOTE_PRICE_ATOMIC_RULE,
} from "@/lib/order";

import styles from "./terminal.module.css";

type Side = "buy" | "sell";
type OrderType = "limit" | "market";

const ORDER_INPUT_NOTICE = "Price must use 0.01 quote ticks. Size must be at least 0.00000001 pZEC with no more than 8 decimals.";

export function TradeTicket({ market }: { market: Market }) {
  const noticeId = useId();
  const shortcutsReasonId = useId();
  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [price, setPrice] = useState(market.last.toFixed(2));
  const [size, setSize] = useState("10");
  const [slippagePercent, setSlippagePercent] = useState("0.50");
  const [notice, setNotice] = useState("No wallet connected. Preview only.");

  let parsedPrice = Number.NaN;
  let parsedSize = Number.NaN;
  if (orderType === "market") {
    parsedPrice = market.last;
  } else {
    try {
      parsedPrice = parseStrictDecimal(price, { atomicRule: QUOTE_PRICE_ATOMIC_RULE });
    } catch {
      // Validation state is rendered below; no preview value is accepted.
    }
  }
  try {
    parsedSize = parseStrictDecimal(size, { atomicRule: PZEC_ATOMIC_RULE });
  } catch {
    // Validation state is rendered below; no preview value is accepted.
  }
  const priceIsValid = Number.isFinite(parsedPrice) && parsedPrice > 0;
  const sizeIsValid = Number.isFinite(parsedSize) && parsedSize > 0;

  const notionalPreview = useMemo(() => {
    if (!priceIsValid || !sizeIsValid) {
      return { value: 0, error: null };
    }
    try {
      return { value: calculatePreviewNotional(parsedPrice, parsedSize), error: null };
    } catch (error) {
      return {
        value: 0,
        error: error instanceof Error ? error.message : "Price and size are outside the preview range.",
      };
    }
  }, [parsedPrice, parsedSize, priceIsValid, sizeIsValid]);
  const notional = notionalPreview.value;
  const notionalError = notionalPreview.error;
  const formattedNotional = notional > 0 ? formatQuotePreviewAmount(notional) : "0.00";

  const worstPrice = useMemo(() => {
    if (orderType === "limit") return parsedPrice;
    try {
      const slippage = parseStrictDecimal(slippagePercent, { allowZero: true, maximumExclusive: 100 });
      return calculateWorstPrice(market.last, side, slippage);
    } catch {
      return Number.NaN;
    }
  }, [market.last, orderType, parsedPrice, side, slippagePercent]);

  function previewOrder() {
    if (!priceIsValid || !sizeIsValid) {
      setNotice(ORDER_INPUT_NOTICE);
      return;
    }
    if (notionalError) {
      setNotice(notionalError);
      return;
    }
    if (!Number.isFinite(worstPrice)) {
      setNotice("Enter maximum slippage from 0 up to, but not including, 100 percent.");
      return;
    }
    setNotice(
      `${side === "buy" ? "Buy" : "Sell"} preview: ${formatPzecPreviewAmount(parsedSize)} pZEC for about ${formattedNotional} ${market.quote}, with a worst price of ${worstPrice.toFixed(2)}. Nothing was submitted.`,
    );
  }

  return (
    <section className={`${styles.panel} ${styles.ticket}`} aria-labelledby="trade-ticket-title">
      <div className={styles.panelHeader}>
        <h2 id="trade-ticket-title">Order entry</h2>
        <span className={styles.statusDot}>Simulation</span>
      </div>

      {market.id === "ZEC/USDT" && (
        <p className={styles.gateNotice}>Later listing gate. This is a preview. Listing stays blocked until issuer, legal, and security gates pass.</p>
      )}

      <div className={styles.segmented} role="group" aria-label="Order side">
        <button
          type="button"
          className={side === "buy" ? styles.buyActive : undefined}
          aria-pressed={side === "buy"}
          onClick={() => setSide("buy")}
        >
          Buy
        </button>
        <button
          type="button"
          className={side === "sell" ? styles.sellActive : undefined}
          aria-pressed={side === "sell"}
          onClick={() => setSide("sell")}
        >
          Sell
        </button>
      </div>

      <div className={styles.orderTypes} role="group" aria-label="Order type">
        <button
          type="button"
          className={orderType === "limit" ? styles.textActive : undefined}
          aria-pressed={orderType === "limit"}
          onClick={() => setOrderType("limit")}
        >
          Limit
        </button>
        <button
          type="button"
          className={orderType === "market" ? styles.textActive : undefined}
          aria-pressed={orderType === "market"}
          onClick={() => setOrderType("market")}
        >
          Market
        </button>
      </div>

      <label className={styles.inputLabel}>
        <span>Price</span>
        <div className={styles.inputShell}>
          <input
            inputMode="decimal"
            value={orderType === "market" ? "Best available" : price}
            disabled={orderType === "market"}
            onChange={(event) => setPrice(event.target.value)}
            aria-label={`Price in ${market.quote}`}
            aria-invalid={orderType === "limit" && (!priceIsValid || Boolean(notionalError))}
            aria-describedby={noticeId}
          />
          <span>{market.quote}</span>
        </div>
      </label>

      {orderType === "market" && (
        <label className={styles.inputLabel}>
          <span>Maximum slippage</span>
          <div className={styles.inputShell}>
            <input
              inputMode="decimal"
              value={slippagePercent}
              onChange={(event) => setSlippagePercent(event.target.value)}
              aria-label="Maximum slippage percent"
              aria-invalid={!Number.isFinite(worstPrice)}
              aria-describedby={noticeId}
            />
            <span>%</span>
          </div>
        </label>
      )}

      <label className={styles.inputLabel}>
        <span>Size</span>
        <div className={styles.inputShell}>
          <input
            inputMode="decimal"
            value={size}
            onChange={(event) => setSize(event.target.value)}
            aria-label="Order size in pZEC"
            aria-invalid={!sizeIsValid || Boolean(notionalError)}
            aria-describedby={noticeId}
          />
          <span>pZEC</span>
        </div>
      </label>

      <div
        className={styles.percentRow}
        role="group"
        aria-label="Size shortcuts"
        aria-describedby={shortcutsReasonId}
      >
        {[25, 50, 75, 100].map((percent) => (
          <button type="button" key={percent} disabled>
            {percent}%
          </button>
        ))}
      </div>
      <p id={shortcutsReasonId} className={styles.inlineNotice}>
        Size shortcuts are disabled because no wallet balance is connected.
      </p>

      <dl className={styles.ticketSummary}>
        <div>
          <dt>Estimated value</dt>
          <dd>{formattedNotional} {market.quote}</dd>
        </div>
        <div>
          <dt>Settlement</dt>
          <dd>{market.settlementPair}</dd>
        </div>
        <div>
          <dt>{orderType === "market" ? "Worst price" : "Limit price"}</dt>
          <dd>{Number.isFinite(worstPrice) ? worstPrice.toFixed(2) : "0.00"} {market.quote}</dd>
        </div>
        <div>
          <dt>Trading fee</dt>
          <dd>Proposed 5 / 15 bps; not deducted here</dd>
        </div>
      </dl>

      <button
        type="button"
        className={`${styles.primaryAction} ${side === "sell" ? styles.sellAction : ""}`}
        onClick={previewOrder}
      >
        Preview {side} order
      </button>
      <p id={noticeId} className={styles.inlineNotice} aria-live="polite">
        {!priceIsValid || !sizeIsValid ? ORDER_INPUT_NOTICE : notionalError ?? notice}
      </p>
    </section>
  );
}
