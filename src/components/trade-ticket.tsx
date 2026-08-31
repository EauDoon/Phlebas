"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { digestCanonicalOrder, type CanonicalOrder } from "@/lib/encoding";
import { MAKER_FEE_BPS, TAKER_FEE_BPS, feeEnvelopeCopy } from "@/lib/fees";
import { sepoliaDomain, typedData, type TypedOrder } from "@/lib/eip712";
import { getInjectedProvider, signTypedData } from "@/lib/evm-wallet";
import { planTestnetSubmit, sendSettlement, sepoliaSubmitEnabled } from "@/lib/sepolia-submit";
import { TESTNET } from "@/lib/testnet";
import { parseExpiryUnix, settlementDigest, typedOrderFromTicket } from "@/lib/ticket-order";
import type { Market } from "@/lib/market-data";
import { ticketGate, type FeedStatus } from "@/lib/market-state";
import { interpretTicketKey } from "@/lib/ticket-shortcuts";
import { submitOrder, type Book, type TimeInForce } from "@/lib/matcher";
import { compareVenues, type RouteComparison } from "@/lib/router";
import {
  calculatePreviewNotional,
  calculateWorstPrice,
  formatQuotePreviewAmount,
  parseStrictDecimal,
  PZEC_ATOMIC_RULE,
  QUOTE_PRICE_ATOMIC_RULE,
} from "@/lib/order";
import {
  PZEC_DECIMALS,
  PRICE_DECIMALS,
  QUOTE_DECIMALS,
  formatAtomicUnits,
  parseAtomicUnits,
  quoteAtomsForFill,
  quoteAtomsForFills,
  sizeAtomsForQuote,
  worstPriceTicks,
} from "@/lib/units";

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

function parseTicks(value: string): { ticks: bigint; error: string | null } {
  try {
    return { ticks: parseAtomicUnits(value, PRICE_DECIMALS), error: null };
  } catch (error) {
    return {
      ticks: 0n,
      error: error instanceof Error ? error.message : "Price is outside the preview range.",
    };
  }
}

function parseSizeAtoms(value: string): { atoms: bigint; error: string | null } {
  try {
    return { atoms: parseAtomicUnits(value, PZEC_DECIMALS), error: null };
  } catch (error) {
    return {
      atoms: 0n,
      error: error instanceof Error ? error.message : "Size is outside the preview range.",
    };
  }
}

function describeRoute(comparison: RouteComparison, quote: string): string {
  if (comparison.better === "split") {
    return `Split: CLOB ${formatAtomicUnits(comparison.split.clobFilledAtoms, PZEC_DECIMALS)} pZEC and AMM ${formatAtomicUnits(comparison.split.ammFilledAtoms, PZEC_DECIMALS)} pZEC for ${formatAtomicUnits(comparison.split.quoteAtoms, QUOTE_DECIMALS, 2)} ${quote}`;
  }
  if (comparison.better === "none") {
    return "neither venue fills in full inside the signed bound";
  }
  if (comparison.better === "tie") {
    return "CLOB and AMM match on this size";
  }
  return `${comparison.better.toUpperCase()} cheaper for a full fill`;
}

export function TradeTicket({
  market,
  book,
  lastTicks,
  priceSelection,
  availablePzecAtoms,
  availableQuoteAtoms,
  reservePzecAtoms,
  reserveQuoteAtoms,
  accountEpoch,
  feedStatus,
  walletAddress = null,
  onRetryFeed,
  onSubmit,
}: {
  market: Market;
  book: Book;
  lastTicks: bigint;
  priceSelection: { ticks: bigint; nonce: number } | null;
  availablePzecAtoms: bigint;
  availableQuoteAtoms: bigint;
  reservePzecAtoms: bigint;
  reserveQuoteAtoms: bigint;
  accountEpoch: number;
  feedStatus: FeedStatus;
  walletAddress?: string | null;
  onRetryFeed: () => void;
  onSubmit: (order: {
    side: Side;
    tif: TimeInForce;
    priceTicks: bigint;
    sizeAtoms: bigint;
    expiryUnix: bigint;
  }) => string;
}) {
  const noticeId = useId();
  const shortcutsReasonId = useId();
  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [tif, setTif] = useState<TimeInForce>("GTC");
  const [price, setPrice] = useState(() => formatAtomicUnits(lastTicks, PRICE_DECIMALS, 2));
  const [size, setSize] = useState("10");
  const [slippagePercent, setSlippagePercent] = useState("0.50");
  const [expiry, setExpiry] = useState("0");
  const [notice, setNotice] = useState("Local matcher only. Session inventory is not a wallet.");
  const [rejected, setRejected] = useState<string | null>(null);
  const [appliedPriceNonce, setAppliedPriceNonce] = useState(0);
  const [sessionNonce, setSessionNonce] = useState(1);
  const reviewOpenRef = useRef(false);
  const [review, setReview] = useState<{
    side: Side;
    priceTicks: bigint;
    sizeAtoms: bigint;
    tif: TimeInForce;
    digest: string;
    eip712Digest?: string;
    typed?: TypedOrder;
    comparison: RouteComparison;
    clobDebitAtoms: bigint;
    clobReservationAtoms: bigint;
    expiryUnix: bigint;
  } | null>(null);

  if (priceSelection && priceSelection.nonce !== appliedPriceNonce) {
    setAppliedPriceNonce(priceSelection.nonce);
    setOrderType("limit");
    setPrice(formatAtomicUnits(priceSelection.ticks, PRICE_DECIMALS, 2));
  }

  useEffect(() => {
    reviewOpenRef.current = review !== null;
  }, [review]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const action = interpretTicketKey(event.key, {
        target: event.target,
        dialogOpen: Boolean(document.querySelector("dialog[open]")),
        reviewOpen: reviewOpenRef.current,
      });
      if (action === "escape") {
        setReview(null);
        return;
      }
      if (action === "buy") setSide("buy");
      if (action === "sell") setSide("sell");
      if (action === "limit") setOrderType("limit");
      if (action === "market") setOrderType("market");
      if (action === "gtc") setTif("GTC");
      if (action === "ioc") setTif("IOC");
      if (action === "fok") setTif("FOK");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lastPrice = Number(formatAtomicUnits(lastTicks, PRICE_DECIMALS, 2));
  const priceParse = orderType === "market"
    ? { parsed: lastPrice, error: null }
    : parsePreviewDecimal(price, { atomicRule: QUOTE_PRICE_ATOMIC_RULE });
  const sizeParse = parsePreviewDecimal(size, { atomicRule: PZEC_ATOMIC_RULE });
  const parsedPrice = priceParse.parsed;
  const parsedSize = sizeParse.parsed;
  const priceIsValid = Number.isFinite(parsedPrice) && parsedPrice > 0;
  const sizeIsValid = Number.isFinite(parsedSize) && parsedSize > 0;
  const limitTicks = orderType === "limit" ? parseTicks(price) : { ticks: 0n, error: null };
  const sizeAtoms = parseSizeAtoms(size);

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
      return { value: calculateWorstPrice(lastPrice, side, slippageParse.parsed), error: null };
    } catch (error) {
      return {
        value: Number.NaN,
        error: error instanceof Error ? error.message : "Worst price is outside the preview range.",
      };
    }
  }, [lastPrice, orderType, parsedPrice, side, slippagePercent]);
  const worstPrice = worstPricePreview.value;
  const inputError = priceParse.error ?? sizeParse.error ?? worstPricePreview.error ?? limitTicks.error ?? sizeAtoms.error;
  const bookEmpty = book.bids.length === 0 && book.asks.length === 0;
  const gate = ticketGate(feedStatus, bookEmpty);

  function applyPercent(percent: 25 | 50 | 75 | 100) {
    const share = BigInt(percent);
    if (side === "sell") {
      const nextSize = (availablePzecAtoms * share) / 100n;
      if (nextSize <= 0n) {
        setNotice("Session pZEC inventory is empty.");
        return;
      }
      setSize(formatAtomicUnits(nextSize, PZEC_DECIMALS));
      return;
    }

    const priceTicks = orderType === "limit"
      ? limitTicks.ticks
      : Number.isFinite(worstPrice)
        ? parseAtomicUnits(worstPrice.toFixed(PRICE_DECIMALS), PRICE_DECIMALS)
        : 0n;
    if (priceTicks <= 0n) {
      setNotice("Set a positive limit price before using size shortcuts.");
      return;
    }
    const budget = (availableQuoteAtoms * share) / 100n;
    const nextSize = sizeAtomsForQuote(budget, priceTicks);
    if (nextSize <= 0n) {
      setNotice("Session quote inventory cannot fund this size.");
      return;
    }
    setSize(formatAtomicUnits(nextSize, PZEC_DECIMALS));
  }

  function preparedOrder(): { priceTicks: bigint; sizeAtoms: bigint; tif: TimeInForce; expiryUnix: bigint } | string {
    if (inputError) {
      return inputError;
    }
    if (!priceIsValid || !sizeIsValid || sizeAtoms.atoms <= 0n) {
      return "Price and size must be positive.";
    }
    if (notionalError) {
      return notionalError;
    }

    let priceTicks = limitTicks.ticks;
    if (orderType === "market") {
      try {
        const slippageHundredths = parseAtomicUnits(slippagePercent, PRICE_DECIMALS, { allowZero: true });
        priceTicks = worstPriceTicks(lastTicks, side, slippageHundredths);
      } catch (error) {
        return error instanceof Error ? error.message : "Enter maximum slippage from 0 up to, but not including, 100 percent.";
      }
    }
    if (priceTicks <= 0n) {
      return "Price and size must be positive.";
    }
    let expiryUnix = 0n;
    try {
      expiryUnix = parseExpiryUnix(expiry);
    } catch (error) {
      return error instanceof Error ? error.message : "Expiry must be a whole unix time, or 0 for none.";
    }
    return {
      priceTicks,
      sizeAtoms: sizeAtoms.atoms,
      tif: orderType === "market" ? "IOC" : tif,
      expiryUnix,
    };
  }

  async function reviewSimulatedOrder(nowUnix: bigint) {
    if (!gate.canReview) {
      setNotice(gate.message);
      setReview(null);
      return;
    }
    const prepared = preparedOrder();
    if (typeof prepared === "string") {
      setNotice(prepared);
      return;
    }

    const comparison = compareVenues({
      book,
      side,
      sizeAtoms: prepared.sizeAtoms,
      limitTicks: prepared.priceTicks,
      reservePzecAtoms,
      reserveQuoteAtoms,
    });
    const clobPreview = submitOrder(book, {
      id: "ticket-review",
      side,
      tif: prepared.tif,
      priceTicks: prepared.priceTicks,
      sizeAtoms: prepared.sizeAtoms,
      expiryUnix: prepared.expiryUnix,
      nowUnix,
    });
    if (clobPreview.status === "rejected" && clobPreview.reason === "Order expiry has passed") {
      setRejected(`Rejected. ${clobPreview.reason}`);
      setNotice(clobPreview.reason);
      setReview(null);
      return;
    }
    setRejected(null);
    const filledPzecAtoms = clobPreview.fills.reduce((total, fill) => total + fill.sizeAtoms, 0n);
    const clobDebitAtoms = side === "buy"
      ? quoteAtomsForFills(clobPreview.fills, "up")
      : filledPzecAtoms;
    const clobReservationAtoms = clobPreview.status === "open"
      ? side === "buy"
        ? quoteAtomsForFill(clobPreview.remainingAtoms, prepared.priceTicks, "up")
        : clobPreview.remainingAtoms
      : 0n;
    const canonical: CanonicalOrder = {
      maker: "session",
      side,
      baseAsset: "pZEC",
      quoteAsset: market.quote,
      baseAmountAtoms: prepared.sizeAtoms.toString(),
      limitPriceTicks: prepared.priceTicks.toString(),
      nonce: String(sessionNonce),
      accountEpoch: String(accountEpoch),
      expiry: prepared.expiryUnix.toString(),
      salt: prepared.tif,
      recipient: "session",
      maximumFeeBps: "30",
      allowedVenues: "clob",
      chainId: "42161",
      verifyingContract: "not-deployed",
    };
    setSessionNonce(sessionNonce + 1);
    let eip712 = undefined as string | undefined;
    let typed = undefined as TypedOrder | undefined;
    if (walletAddress) {
      typed = typedOrderFromTicket({
        maker: walletAddress,
        side,
        quote: market.quote,
        sizeAtoms: prepared.sizeAtoms,
        priceTicks: prepared.priceTicks,
        nonce: BigInt(canonical.nonce),
        accountEpoch: BigInt(accountEpoch),
        tif: prepared.tif,
        expiry: prepared.expiryUnix,
      });
      eip712 = settlementDigest(typed);
    }
    setReview({
      ...prepared,
      side,
      digest: eip712 ?? await digestCanonicalOrder(canonical),
      eip712Digest: eip712,
      typed,
      comparison,
      clobDebitAtoms,
      clobReservationAtoms,
    });
  }

  async function signTestnetOrder() {
    if (!review?.typed || !walletAddress) {
      return;
    }
    const provider = getInjectedProvider();
    if (!provider) {
      setNotice("No injected EVM wallet.");
      return;
    }
    try {
      const domain = sepoliaDomain(TESTNET.settlement);
      const signature = await signTypedData(
        provider,
        walletAddress,
        typedData(domain, review.typed),
      );
      const plan = planTestnetSubmit({
        counterpart: null,
        taker: review.typed,
        takerSignature: signature,
        fillAtoms: review.sizeAtoms,
      });
      if (plan.action === "settle") {
        const hash = await sendSettlement(provider, walletAddress, plan);
        setNotice(`Submitted Sepolia settlement ${hash.slice(0, 10)}… Testnet only.`);
        return;
      }
      if (plan.action === "sequence" && sepoliaSubmitEnabled()) {
        await fetch("/api/matcher", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...typedData(domain, review.typed).message,
            signature,
            tif: review.tif,
          }),
        }).catch(() => undefined);
      }
      setNotice(`${plan.reason} Signature ${signature.slice(0, 10)}…`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Testnet signing failed.");
    }
  }

  function confirmSimulatedOrder() {
    if (!review || !gate.canReview) {
      if (!gate.canReview) {
        setNotice(gate.message);
        setReview(null);
      }
      return;
    }
    const result = onSubmit({
      side: review.side,
      tif: review.tif,
      priceTicks: review.priceTicks,
      sizeAtoms: review.sizeAtoms,
      expiryUnix: review.expiryUnix,
    });
    const isRejected = result.startsWith("Rejected.")
      || result.includes("insufficient")
      || result.startsWith("Self-trade");
    setRejected(isRejected ? result : null);
    setNotice(result);
    setReview(null);
  }

  return (
    <section className={`${styles.panel} ${styles.ticket}`} aria-labelledby="trade-ticket-title">
      <div className={styles.panelHeader}>
        <h2 id="trade-ticket-title">Order entry</h2>
        <span className={styles.statusDot}>Local matcher</span>
      </div>

      {market.id === "ZEC/USDT" && (
        <p className={styles.gateNotice}>Later listing gate. This is a preview. Listing stays blocked until issuer, legal, and security gates pass.</p>
      )}

      {!gate.canReview && (
        <div className={styles.ticketBlocked} role="status">
          <strong>{gate.heading}</strong>
          <p>{gate.message}{gate.asOf ? ` As of ${gate.asOf}.` : ""}</p>
          <button type="button" className={styles.textButton} onClick={onRetryFeed}>
            Retry illustrative feed
          </button>
        </div>
      )}
      {rejected && gate.canReview && (
        <div className={styles.ticketBlocked} role="alert">
          <strong>Order rejected</strong>
          <p>{rejected} Retry is safe; nothing was submitted.</p>
        </div>
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

      {orderType === "limit" && (
        <div className={styles.orderTypes} role="group" aria-label="Time in force">
          {(["GTC", "IOC", "FOK"] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={tif === value ? styles.textActive : undefined}
              aria-pressed={tif === value}
              onClick={() => setTif(value)}
            >
              {value}
            </button>
          ))}
        </div>
      )}

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

      <label className={styles.inputLabel}>
        <span>Expiry</span>
        <div className={styles.inputShell}>
          <input
            inputMode="numeric"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
            aria-label="Order expiry unix time"
            aria-describedby={noticeId}
          />
          <span>unix</span>
        </div>
      </label>
      <p className={styles.inlineNotice}>0 means no expiry. This session never sends a live order.</p>

      <div
        className={styles.percentRow}
        role="group"
        aria-label="Size shortcuts"
        aria-describedby={shortcutsReasonId}
      >
        {([25, 50, 75, 100] as const).map((percent) => (
          <button type="button" key={percent} onClick={() => applyPercent(percent)}>
            {percent}%
          </button>
        ))}
      </div>
      <p id={shortcutsReasonId} className={styles.inlineNotice}>
        Shortcuts use session inventory ({formatAtomicUnits(availablePzecAtoms, PZEC_DECIMALS)} pZEC, {formatAtomicUnits(availableQuoteAtoms, QUOTE_DECIMALS, 2)} {market.quote}). Not a wallet.
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
          <dt>Time in force</dt>
          <dd>{orderType === "market" ? "IOC" : tif}</dd>
        </div>
        <div>
          <dt>Trading fee</dt>
          <dd>Proposed {MAKER_FEE_BPS} / {TAKER_FEE_BPS} bps; not deducted here</dd>
        </div>
        <div>
          <dt>Account epoch</dt>
          <dd>{accountEpoch}</dd>
        </div>
        <div>
          <dt>Session nonce</dt>
          <dd>{sessionNonce}</dd>
        </div>
        <div>
          <dt>Expiry</dt>
          <dd>{expiry.trim() === "" || expiry.trim() === "0" ? "none" : expiry.trim()}</dd>
        </div>
      </dl>

      {review ? (
        <div className={styles.reviewBlock}>
          <p className={styles.gateNotice}>
            pZEC is a custody receipt, not native ZEC. This fill is public in the simulation. The matcher is not trustless.
          </p>
          <dl className={styles.ticketSummary}>
            <div>
              <dt>Leaves the session</dt>
              <dd>
                {review.side === "buy"
                  ? `${formatAtomicUnits(review.clobDebitAtoms, QUOTE_DECIMALS, 2)} ${market.quote} on Arbitrum Sepolia`
                  : `${formatAtomicUnits(review.clobDebitAtoms, PZEC_DECIMALS)} pZEC on Arbitrum Sepolia`}
              </dd>
            </div>
            <div>
              <dt>Arrives in the session</dt>
              <dd>
                {review.side === "buy"
                  ? `pZEC on Arbitrum Sepolia, settled as ${market.settlementPair}`
                  : `${market.quote} on Arbitrum Sepolia, settled as ${market.settlementPair}`}
              </dd>
            </div>
            <div>
              <dt>Immediate CLOB debit</dt>
              <dd>
                {review.side === "buy"
                  ? `${formatAtomicUnits(review.clobDebitAtoms, QUOTE_DECIMALS, 2)} ${market.quote}`
                  : `${formatAtomicUnits(review.clobDebitAtoms, PZEC_DECIMALS)} pZEC`}
              </dd>
            </div>
            <div>
              <dt>Resting reservation</dt>
              <dd>
                {review.clobReservationAtoms === 0n
                  ? "none"
                  : review.side === "buy"
                    ? `${formatAtomicUnits(review.clobReservationAtoms, QUOTE_DECIMALS, 2)} ${market.quote}`
                    : `${formatAtomicUnits(review.clobReservationAtoms, PZEC_DECIMALS)} pZEC`}
              </dd>
            </div>
            <div>
              <dt>Worst acceptable price</dt>
              <dd>{formatAtomicUnits(review.priceTicks, PRICE_DECIMALS, 2)} {market.quote}</dd>
            </div>
            <div>
              <dt>Expiry</dt>
              <dd>{review.expiryUnix === 0n ? "none" : review.expiryUnix.toString()}</dd>
            </div>
            <div>
              <dt>Fees</dt>
              <dd>{feeEnvelopeCopy()}</dd>
            </div>
            <div>
              <dt>CLOB vs AMM</dt>
              <dd>{describeRoute(review.comparison, market.quote)}</dd>
            </div>
            <div>
              <dt>{review.eip712Digest ? "Keccak EIP-712" : "Session digest"}</dt>
              <dd>{review.digest.slice(0, 16)}…</dd>
            </div>
          </dl>
          <p className={styles.inlineNotice}>
            Transparent Zcash and this Arbitrum fill are publicly linkable. pZEC redemption depends on the gateway.
          </p>
          <p className={styles.inlineNotice}>
            Confirm submits only the local CLOB. Split and AMM figures are comparison quotes, not an executed router fill.
          </p>
          <button
            type="button"
            className={`${styles.primaryAction} ${review.side === "sell" ? styles.sellAction : ""}`}
            onClick={confirmSimulatedOrder}
          >
            Confirm simulated {review.side}
          </button>
          {review.typed && (
            <button type="button" className={styles.textButton} onClick={() => void signTestnetOrder()}>
              {sepoliaSubmitEnabled() ? "Sign and submit testnet settlement" : "Sign testnet typed data"}
            </button>
          )}
          <button type="button" className={styles.textButton} onClick={() => setReview(null)}>
            Back
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`${styles.primaryAction} ${side === "sell" ? styles.sellAction : ""}`}
          onClick={() => void reviewSimulatedOrder(BigInt(Math.floor(Date.now() / 1000)))}
          disabled={!gate.canReview}
        >
          Review simulated {side}
        </button>
      )}
      <p id={noticeId} className={styles.inlineNotice} aria-live="polite">
        {inputError ?? notionalError ?? notice}
      </p>
      <p className={styles.inlineNotice}>Keyboard: B/S side, L/M type, G/I/F time in force. Escape leaves review. Shortcuts ignore an open dialog and review-and-confirm. Click a book price to copy it here. SHA-256 is the session-only simulation encoding. Settlement uses keccak EIP-712.</p>
    </section>
  );
}
