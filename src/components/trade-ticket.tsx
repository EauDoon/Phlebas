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

function parsePreviewDecimal(
  value: string,
  options: Parameters<typeof parseStrictDecimal>[1],
): { parsed: number; error: string | null } {
  try {
    return { parsed: parseStrictDecimal(value, options), error: null };
  } catch (error) {
    return {
      parsed: Number.NaN,
      error: error instanceof Error ? error.message : "Value is outside the preview range.",
    };
  }
}

export function TradeTicket({ market }: { market: Market }) {
  const noticeId = useId();
  const shortcutsReasonId = useId();
  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [price, setPrice] = useState(market.last.toFixed(2));
  const [size, setSize] = useState("10");
  const [slippagePercent, setSlippagePercent] = useState("0.50");
  const [notice, setNotice] = useState("No wallet connected. Preview only.");

  const priceParse = orderType === "market"
    ? { parsed: market.last, error: null }
    : parsePreviewDecimal(price, { atomicRule: QUOTE_PRICE_ATOMIC_RULE });
  const sizeParse = parsePreviewDecimal(size, { atomicRule: PZEC_ATOMIC_RULE });
  const parsedPrice = priceParse.parsed;
  const parsedSize = sizeParse.parsed;
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

  const worstPricePreview = useMemo(() => {
    if (orderType === "limit") {
      return { value: parsedPrice, error: null };
    }
    const slippageParse = parsePreviewDecimal(slippagePercent, { allowZero: true, maximumExclusive: 100 });
    if (slippageParse.error) {
      return { value: Number.NaN, error: slippageParse.error };
    }
    try {
      return { value: calculateWorstPrice(market.last, side, slippageParse.parsed), error: null };
    } catch (error) {
      return {
        value: Number.NaN,
        error: error instanceof Error ? error.message : "Worst price is outside the preview range.",
      };
    }
  }, [market.last, orderType, parsedPrice, side, slippagePercent]);
  const worstPrice = worstPricePreview.value;
  const inputError = priceParse.error ?? sizeParse.error ?? worstPricePreview.error;

  function previewOrder() {
    if (inputError) {
      setNotice(inputError);
      return;
    }
    if (!priceIsValid || !sizeIsValid) {
      setNotice("Price and size must be positive.");
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
              aria-invalid={Boolean(worstPricePreview.error)}
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
        {inputError ?? notionalError ?? notice}
      </p>
    </section>
  );
}
