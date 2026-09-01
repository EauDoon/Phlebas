"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { digestCanonicalOrder, type CanonicalOrder } from "@/lib/encoding";
import { MAKER_FEE_BPS, TAKER_FEE_BPS, feeEnvelopeCopy } from "@/lib/fees";
import { custodyRedemptionCopy, publicLinkabilityCopy } from "@/lib/review-copy";
import { sepoliaDomain, typedData, type TypedOrder } from "@/lib/eip712";
import {
  getInjectedProvider,
  isMissingProviderCopy,
  missingProviderCopy,
  publicTestnetSigningError,
  retargetSettlementCopy,
  signTypedData,
  walletSigningDisabledCopy,
} from "@/lib/evm-wallet";
import { planTestnetSubmit, sendSettlement, sepoliaSubmitEnabled } from "@/lib/sepolia-submit";
import { TESTNET } from "@/lib/testnet";
import { parseExpiryUnix, settlementDigest, typedOrderFromTicket } from "@/lib/ticket-order";
import type { Market } from "@/lib/market-data";
import { ticketGate, type FeedStatus } from "@/lib/market-state";
import { interpretRovingKey } from "@/lib/roving-keys";
import { interpretTicketKey } from "@/lib/ticket-shortcuts";
import type { TerminalMode } from "@/lib/terminal-mode";
import {
  nextTicketOrderType,
  nextTicketSide,
  nextTicketTif,
  TICKET_ORDER_TYPES,
  TICKET_SIDES,
  TICKET_TIFS,
  type TicketOrderType,
  type TicketSide,
  type TicketTif,
} from "@/lib/ticket-groups";
import { maxTicketSizeAtoms } from "@/lib/ticket-size";
import { submitOrder, type Book, type TimeInForce } from "@/lib/matcher";
import { describeSubmit, isTicketRejectCopy } from "@/lib/session";
import { compareVenues, type RouteComparison } from "@/lib/router";
import {
  calculatePreviewNotional,
  calculateWorstPrice,
  formatQuotePreviewAmount,
  marketOrderConstraintCopy,
  parseStrictDecimal,
  sideControlCopy,
  ZEC_ATOMIC_RULE,
  QUOTE_PRICE_ATOMIC_RULE,
} from "@/lib/order";
import {
  ZEC_DECIMALS,
  PRICE_DECIMALS,
  QUOTE_DECIMALS,
  formatAtomicUnits,
  parseAtomicUnits,
  quoteAtomsForFill,
  quoteAtomsForFills,
  worstPriceTicks,
} from "@/lib/units";

import styles from "./terminal.module.css";

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
    return { atoms: parseAtomicUnits(value, ZEC_DECIMALS), error: null };
  } catch (error) {
    return {
      atoms: 0n,
      error: error instanceof Error ? error.message : "Size is outside the preview range.",
    };
  }
}

function describeRoute(comparison: RouteComparison, quote: string): string {
  if (comparison.better === "split") {
    return `Split: CLOB ${formatAtomicUnits(comparison.split.clobFilledAtoms, ZEC_DECIMALS)} ZEC and AMM ${formatAtomicUnits(comparison.split.ammFilledAtoms, ZEC_DECIMALS)} ZEC for ${formatAtomicUnits(comparison.split.quoteAtoms, QUOTE_DECIMALS, 2)} ${quote}`;
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
  availableZecAtoms,
  availableQuoteAtoms,
  reserveZecAtoms,
  reserveQuoteAtoms,
  accountEpoch,
  feedStatus,
  walletAddress = null,
  variant = "advanced",
  onRetryFeed,
  onSubmit,
}: {
  market: Market;
  book: Book;
  lastTicks: bigint;
  priceSelection: { ticks: bigint; nonce: number } | null;
  availableZecAtoms: bigint;
  availableQuoteAtoms: bigint;
  reserveZecAtoms: bigint;
  reserveQuoteAtoms: bigint;
  accountEpoch: number;
  feedStatus: FeedStatus;
  walletAddress?: string | null;
  variant?: TerminalMode;
  onRetryFeed: () => void;
  onSubmit: (order: {
    side: TicketSide;
    tif: TimeInForce;
    priceTicks: bigint;
    sizeAtoms: bigint;
    expiryUnix: bigint;
  }) => string;
}) {
  const noticeId = useId();
  const shortcutsReasonId = useId();
  const priceErrorId = useId();
  const sizeErrorId = useId();
  const slippageErrorId = useId();
  const expiryErrorId = useId();
  const [side, setSide] = useState<TicketSide>("buy");
  const [sideFocus, setSideFocus] = useState<TicketSide>("buy");
  const [orderType, setOrderType] = useState<TicketOrderType>("limit");
  const [typeFocus, setTypeFocus] = useState<TicketOrderType>("limit");
  const [tif, setTif] = useState<TicketTif>("GTC");
  const [tifFocus, setTifFocus] = useState<TicketTif>("GTC");
  const sideRefs = useRef<Partial<Record<TicketSide, HTMLButtonElement | null>>>({});
  const typeRefs = useRef<Partial<Record<TicketOrderType, HTMLButtonElement | null>>>({});
  const tifRefs = useRef<Partial<Record<TicketTif, HTMLButtonElement | null>>>({});
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
    side: TicketSide;
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
  const isSimple = variant === "simple";
  const effectiveOrderType: TicketOrderType = isSimple ? "market" : orderType;
  const effectiveTif: TimeInForce = isSimple || effectiveOrderType === "market" ? "IOC" : tif;

  if (priceSelection && priceSelection.nonce !== appliedPriceNonce) {
    setAppliedPriceNonce(priceSelection.nonce);
    if (!isSimple) {
      setOrderType("limit");
      setTypeFocus("limit");
      setPrice(formatAtomicUnits(priceSelection.ticks, PRICE_DECIMALS, 2));
    }
  }

  useEffect(() => {
    reviewOpenRef.current = review !== null;
  }, [review]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const action = interpretTicketKey(event.key, {
        target: event.target,
        dialogOpen: Boolean(document.querySelector("dialog[open]")),
        reviewOpen: review !== null,
      });
      if (action === "escape") {
        setReview(null);
        return;
      }
      if (action === "buy") {
        setSide("buy");
        setSideFocus("buy");
      }
      if (action === "sell") {
        setSide("sell");
        setSideFocus("sell");
      }
      if (isSimple) {
        return;
      }
      if (action === "limit") {
        setOrderType("limit");
        setTypeFocus("limit");
      }
      if (action === "market") {
        setOrderType("market");
        setTypeFocus("market");
      }
      if (action === "gtc") {
        setTif("GTC");
        setTifFocus("GTC");
      }
      if (action === "ioc") {
        setTif("IOC");
        setTifFocus("IOC");
      }
      if (action === "fok") {
        setTif("FOK");
        setTifFocus("FOK");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSimple, review]);

  const lastPrice = Number(formatAtomicUnits(lastTicks, PRICE_DECIMALS, 2));
  const priceParse = effectiveOrderType === "market"
    ? { parsed: lastPrice, error: null }
    : parsePreviewDecimal(price, { atomicRule: QUOTE_PRICE_ATOMIC_RULE });
  const sizeParse = parsePreviewDecimal(size, { atomicRule: ZEC_ATOMIC_RULE });
  const parsedPrice = priceParse.parsed;
  const parsedSize = sizeParse.parsed;
  const priceIsValid = Number.isFinite(parsedPrice) && parsedPrice > 0;
  const sizeIsValid = Number.isFinite(parsedSize) && parsedSize > 0;
  const limitTicks = effectiveOrderType === "limit" ? parseTicks(price) : { ticks: 0n, error: null };
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
    if (effectiveOrderType === "limit") {
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
  }, [effectiveOrderType, lastPrice, parsedPrice, side, slippagePercent]);
  const worstPrice = worstPricePreview.value;
  const expiryParse = (() => {
    try {
      return { value: parseExpiryUnix(expiry), error: null as string | null };
    } catch (error) {
      return {
        value: 0n,
        error: error instanceof Error ? error.message : "Expiry must be a whole unix time, or 0 for none.",
      };
    }
  })();
  const priceError = priceParse.error ?? limitTicks.error;
  const sizeError = sizeParse.error ?? sizeAtoms.error;
  const slippageError = effectiveOrderType === "market" ? worstPricePreview.error : null;
  const expiryError = expiryParse.error;
  const inputError = priceError ?? sizeError ?? slippageError ?? expiryError;
  const bookEmpty = book.bids.length === 0 && book.asks.length === 0;
  const gate = ticketGate(feedStatus, bookEmpty, market.settlementPair);

  function applyInventorySize(share: bigint) {
    let priceTicks = 1n;
    if (side === "buy") {
      if (effectiveOrderType === "limit") {
        if (limitTicks.error || limitTicks.ticks <= 0n) {
          setNotice("Set a positive limit price before using size shortcuts.");
          return;
        }
        priceTicks = limitTicks.ticks;
      } else {
        try {
          const slippageHundredths = parseAtomicUnits(slippagePercent, PRICE_DECIMALS, { allowZero: true });
          priceTicks = worstPriceTicks(lastTicks, side, slippageHundredths);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Set a positive maximum slippage before using Max.");
          return;
        }
      }
    }
    const nextSize = maxTicketSizeAtoms({
      side,
      availableZecAtoms: (availableZecAtoms * share) / 100n,
      availableQuoteAtoms: (availableQuoteAtoms * share) / 100n,
      priceTicks,
    });
    if (nextSize <= 0n) {
      setNotice(side === "sell" ? "Session ZEC inventory is empty." : "Session quote inventory cannot fund this size.");
      return;
    }
    setSize(formatAtomicUnits(nextSize, ZEC_DECIMALS));
  }

  function applyPercent(percent: 25 | 50 | 75 | 100) {
    applyInventorySize(BigInt(percent));
  }

  function applyMax() {
    applyInventorySize(100n);
  }

  function switchSide() {
    const next = side === "buy" ? "sell" : "buy";
    setSide(next);
    setSideFocus(next);
  }

  function applyRoving<T extends string>(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    id: T,
    next: (current: T, delta: number) => T,
    first: T,
    last: T,
    moveFocus: (current: T) => void,
    select: (current: T) => void,
  ) {
    const action = interpretRovingKey(event.key);
    if (!action) {
      return;
    }
    event.preventDefault();
    if (action === "next") {
      moveFocus(next(id, 1));
      return;
    }
    if (action === "prev") {
      moveFocus(next(id, -1));
      return;
    }
    if (action === "home") {
      moveFocus(first);
      return;
    }
    if (action === "end") {
      moveFocus(last);
      return;
    }
    select(id);
  }

  function moveSideFocus(next: TicketSide) {
    setSideFocus(next);
    sideRefs.current[next]?.focus();
  }

  function moveTypeFocus(next: TicketOrderType) {
    setTypeFocus(next);
    typeRefs.current[next]?.focus();
  }

  function moveTifFocus(next: TicketTif) {
    setTifFocus(next);
    tifRefs.current[next]?.focus();
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
    if (effectiveOrderType === "market") {
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
    if (!isSimple && (expiryError || expiryParse.error)) {
      return expiryError ?? expiryParse.error ?? "Expiry must be a whole unix time, or 0 for none.";
    }
    return {
      priceTicks,
      sizeAtoms: sizeAtoms.atoms,
      tif: effectiveTif,
      expiryUnix: isSimple ? 0n : expiryParse.value,
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
      reserveZecAtoms,
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
      const rejectedCopy = describeSubmit(clobPreview, market.id);
      setRejected(rejectedCopy);
      setNotice(rejectedCopy);
      setReview(null);
      return;
    }
    setRejected(null);
    const filledZecAtoms = clobPreview.fills.reduce((total, fill) => total + fill.sizeAtoms, 0n);
    const clobDebitAtoms = side === "buy"
      ? quoteAtomsForFills(clobPreview.fills, "up")
      : filledZecAtoms;
    const clobReservationAtoms = clobPreview.status === "open"
      ? side === "buy"
        ? quoteAtomsForFill(clobPreview.remainingAtoms, prepared.priceTicks, "up")
        : clobPreview.remainingAtoms
      : 0n;
    const canonical: CanonicalOrder = {
      maker: "session",
      side,
      baseAsset: "ZEC",
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
    setSessionNonce((current) => current + 1);
    let eip712 = undefined as string | undefined;
    let typed = undefined as TypedOrder | undefined;
    if (walletAddress && TESTNET.deployed) {
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
      setNotice(missingProviderCopy(market.settlementPair));
      return;
    }
    if (!TESTNET.deployed) {
      setNotice(walletSigningDisabledCopy());
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
        const response = await fetch("/api/matcher", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...typedData(domain, review.typed).message,
            signature,
            tif: review.tif,
          }),
        });
        if (!response.ok) throw new Error(`Matcher rejected the signed order (${response.status}).`);
      }
      setNotice(`${plan.reason} Signature ${signature.slice(0, 10)}…`);
    } catch (error) {
      setNotice(publicTestnetSigningError(error));
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
    setRejected(isTicketRejectCopy(result) ? result : null);
    setNotice(result);
    setReview(null);
  }

  const tokenIn = side === "buy" ? market.quote : "ZEC";
  const tokenOut = side === "buy" ? "ZEC" : market.quote;
  const availableIn = side === "buy"
    ? `${formatAtomicUnits(availableQuoteAtoms, QUOTE_DECIMALS, 2)} ${market.quote}`
    : `${formatAtomicUnits(availableZecAtoms, ZEC_DECIMALS)} ZEC`;
  const availableOut = side === "buy"
    ? `${formatAtomicUnits(availableZecAtoms, ZEC_DECIMALS)} ZEC`
    : `${formatAtomicUnits(availableQuoteAtoms, QUOTE_DECIMALS, 2)} ${market.quote}`;

  return (
    <section
      id="order-ticket"
      tabIndex={-1}
      className={`${styles.panel} ${styles.ticket}${isSimple ? ` ${styles.simpleTicket}` : ""}`}
      aria-labelledby="trade-ticket-title"
    >
      <div className={styles.panelHeader}>
        <h2 id="trade-ticket-title">Order entry</h2>
        <span className={styles.statusDot}>Local matcher</span>
      </div>

      {!gate.canReview && (
        <div className={styles.ticketBlocked} role="status" aria-label="Ticket blocked">
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
          <p>{retargetSettlementCopy(rejected, market.settlementPair)} Retry is safe; nothing was submitted.</p>
        </div>
      )}

      {isSimple ? (
        <>
          <div className={styles.tokenRow} aria-label="Token in">
            <span>Token in</span>
            <strong>{tokenIn}</strong>
            <span>Available {availableIn}</span>
          </div>
          <div className={styles.switchRow}>
            <button type="button" onClick={switchSide}>
              Switch
            </button>
          </div>
          <div className={styles.tokenRow} aria-label="Token out">
            <span>Token out</span>
            <strong>{tokenOut}</strong>
            <span>Available {availableOut}</span>
          </div>
        </>
      ) : (
        <>
          <div className={styles.segmented} role="group" aria-label="Order side">
            {TICKET_SIDES.map((id) => (
              <button
                type="button"
                key={id}
                className={side === id ? (id === "buy" ? styles.buyActive : styles.sellActive) : undefined}
                aria-pressed={side === id}
                tabIndex={sideFocus === id ? 0 : -1}
                ref={(node) => {
                  sideRefs.current[id] = node;
                }}
                onClick={() => {
                  setSide(id);
                  setSideFocus(id);
                }}
                onKeyDown={(event) => applyRoving(
                  event,
                  id,
                  nextTicketSide,
                  TICKET_SIDES[0],
                  TICKET_SIDES[TICKET_SIDES.length - 1],
                  moveSideFocus,
                  (next) => {
                    setSide(next);
                    setSideFocus(next);
                  },
                )}
              >
                {sideControlCopy(id, side === id)}
              </button>
            ))}
          </div>

          <div className={styles.orderTypes} role="group" aria-label="Order type">
            {TICKET_ORDER_TYPES.map((id) => (
              <button
                type="button"
                key={id}
                className={orderType === id ? styles.textActive : undefined}
                aria-pressed={orderType === id}
                tabIndex={typeFocus === id ? 0 : -1}
                ref={(node) => {
                  typeRefs.current[id] = node;
                }}
                onClick={() => {
                  setOrderType(id);
                  setTypeFocus(id);
                }}
                onKeyDown={(event) => applyRoving(
                  event,
                  id,
                  nextTicketOrderType,
                  TICKET_ORDER_TYPES[0],
                  TICKET_ORDER_TYPES[TICKET_ORDER_TYPES.length - 1],
                  moveTypeFocus,
                  (next) => {
                    setOrderType(next);
                    setTypeFocus(next);
                  },
                )}
              >
                {id === "limit" ? "Limit" : "Market"}
              </button>
            ))}
          </div>

          {effectiveOrderType === "limit" && (
            <div className={styles.orderTypes} role="group" aria-label="Time in force">
              {TICKET_TIFS.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={tif === value ? styles.textActive : undefined}
                  aria-pressed={tif === value}
                  tabIndex={tifFocus === value ? 0 : -1}
                  ref={(node) => {
                    tifRefs.current[value] = node;
                  }}
                  onClick={() => {
                    setTif(value);
                    setTifFocus(value);
                  }}
                  onKeyDown={(event) => applyRoving(
                    event,
                    value,
                    nextTicketTif,
                    TICKET_TIFS[0],
                    TICKET_TIFS[TICKET_TIFS.length - 1],
                    moveTifFocus,
                    (next) => {
                      setTif(next);
                      setTifFocus(next);
                    },
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {!isSimple && (
        <>
          <label className={styles.inputLabel}>
            <span>Price</span>
            <div className={styles.inputShell}>
              <input
                inputMode="decimal"
                value={effectiveOrderType === "market" ? "Best available" : price}
                disabled={effectiveOrderType === "market"}
                onChange={(event) => setPrice(event.target.value)}
                aria-label={`Price in ${market.quote}`}
                aria-invalid={effectiveOrderType === "limit" && Boolean(priceError || notionalError || !priceIsValid)}
                aria-errormessage={effectiveOrderType === "limit" && priceError ? priceErrorId : undefined}
                aria-describedby={effectiveOrderType === "limit" && priceError ? `${priceErrorId} ${noticeId}` : noticeId}
              />
              <span>{market.quote}</span>
            </div>
          </label>
          {effectiveOrderType === "limit" && priceError ? (
            <p id={priceErrorId} className={styles.inlineNotice} role="alert">{priceError}</p>
          ) : null}
        </>
      )}

      {effectiveOrderType === "market" && (
        <p className={styles.inlineNotice}>{marketOrderConstraintCopy()}</p>
      )}

      {effectiveOrderType === "market" && (
        <label className={styles.inputLabel}>
          <span>Maximum slippage</span>
          <div className={styles.inputShell}>
            <input
              inputMode="decimal"
              value={slippagePercent}
              onChange={(event) => setSlippagePercent(event.target.value)}
              aria-label="Maximum slippage percent"
              aria-invalid={Boolean(slippageError)}
              aria-errormessage={slippageError ? slippageErrorId : undefined}
              aria-describedby={slippageError ? `${slippageErrorId} ${noticeId}` : noticeId}
            />
            <span>%</span>
          </div>
        </label>
      )}
      {slippageError ? (
        <p id={slippageErrorId} className={styles.inlineNotice} role="alert">{slippageError}</p>
      ) : null}

      <div className={isSimple ? styles.sizeRow : undefined}>
        <label className={styles.inputLabel}>
          <span>Size</span>
          <div className={styles.inputShell}>
            <input
              inputMode="decimal"
              value={size}
              onChange={(event) => setSize(event.target.value)}
              aria-label="Order size in ZEC"
              aria-invalid={!sizeIsValid || Boolean(sizeError || notionalError)}
              aria-errormessage={sizeError ? sizeErrorId : undefined}
              aria-describedby={sizeError ? `${sizeErrorId} ${noticeId}` : noticeId}
            />
            <span>ZEC</span>
          </div>
        </label>
        {isSimple ? (
          <button type="button" className={styles.maxButton} onClick={applyMax}>
            Max
          </button>
        ) : null}
      </div>
      {sizeError ? (
        <p id={sizeErrorId} className={styles.inlineNotice} role="alert">{sizeError}</p>
      ) : null}

      {!isSimple && (
        <>
          <label className={styles.inputLabel}>
            <span>Expiry</span>
            <div className={styles.inputShell}>
              <input
                inputMode="numeric"
                value={expiry}
                onChange={(event) => setExpiry(event.target.value)}
                aria-label="Order expiry unix time"
                aria-invalid={Boolean(expiryError)}
                aria-errormessage={expiryError ? expiryErrorId : undefined}
                aria-describedby={expiryError ? `${expiryErrorId} ${noticeId}` : noticeId}
              />
              <span>unix</span>
            </div>
          </label>
          {expiryError ? (
            <p id={expiryErrorId} className={styles.inlineNotice} role="alert">{expiryError}</p>
          ) : null}
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
            Shortcuts use session inventory ({formatAtomicUnits(availableZecAtoms, ZEC_DECIMALS)} ZEC, {formatAtomicUnits(availableQuoteAtoms, QUOTE_DECIMALS, 2)} {market.quote}). Not a wallet.
          </p>
        </>
      )}
      {isSimple ? (
        <p id={shortcutsReasonId} className={styles.inlineNotice}>
          Max uses session inventory ({formatAtomicUnits(availableZecAtoms, ZEC_DECIMALS)} ZEC, {formatAtomicUnits(availableQuoteAtoms, QUOTE_DECIMALS, 2)} {market.quote}). Not a wallet.
        </p>
      ) : null}

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
          <dt>{effectiveOrderType === "market" ? "Worst price" : "Limit price"}</dt>
          <dd>{Number.isFinite(worstPrice) ? worstPrice.toFixed(2) : "0.00"} {market.quote}</dd>
        </div>
        <div>
          <dt>Time in force</dt>
          <dd>{effectiveTif}</dd>
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
        {isSimple ? null : (
          <div>
            <dt>Expiry</dt>
            <dd>{expiry.trim() === "" || expiry.trim() === "0" ? "none" : expiry.trim()}</dd>
          </div>
        )}
      </dl>

      {review ? (
        <div className={styles.reviewBlock}>
          <p className={styles.gateNotice} aria-label="Review custody notice">
            This preview labels native ZEC. It is not live settlement. This fill is public in the simulation. The matcher is not trustless.
          </p>
          <dl className={styles.ticketSummary}>
            <div>
              <dt>Leaves the session</dt>
              <dd>
                {review.side === "buy"
                  ? `${formatAtomicUnits(review.clobDebitAtoms, QUOTE_DECIMALS, 2)} ${market.quote} on Arbitrum Sepolia`
                  : `${formatAtomicUnits(review.clobDebitAtoms, ZEC_DECIMALS)} ZEC on Arbitrum Sepolia`}
              </dd>
            </div>
            <div>
              <dt>Arrives in the session</dt>
              <dd>
                {review.side === "buy"
                  ? `ZEC on Arbitrum Sepolia, settled as ${market.settlementPair}`
                  : `${market.quote} on Arbitrum Sepolia, settled as ${market.settlementPair}`}
              </dd>
            </div>
            <div>
              <dt>Immediate CLOB debit</dt>
              <dd>
                {review.side === "buy"
                  ? `${formatAtomicUnits(review.clobDebitAtoms, QUOTE_DECIMALS, 2)} ${market.quote}`
                  : `${formatAtomicUnits(review.clobDebitAtoms, ZEC_DECIMALS)} ZEC`}
              </dd>
            </div>
            <div>
              <dt>Resting reservation</dt>
              <dd>
                {review.clobReservationAtoms === 0n
                  ? "none"
                  : review.side === "buy"
                    ? `${formatAtomicUnits(review.clobReservationAtoms, QUOTE_DECIMALS, 2)} ${market.quote}`
                    : `${formatAtomicUnits(review.clobReservationAtoms, ZEC_DECIMALS)} ZEC`}
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
              <dt>Custody and redemption</dt>
              <dd>{custodyRedemptionCopy()}</dd>
            </div>
            <div>
              <dt>Public linkability</dt>
              <dd>{publicLinkabilityCopy("fill")}</dd>
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
      {!TESTNET.deployed ? (
        <p className={styles.inlineNotice} role="status" aria-label="Wallet signing disabled">
          {walletSigningDisabledCopy()}
        </p>
      ) : null}
      <p id={noticeId} className={styles.inlineNotice} aria-live="polite">
        {inputError ?? notionalError ?? (isTicketRejectCopy(notice)
          ? retargetSettlementCopy(notice, market.settlementPair)
          : isMissingProviderCopy(notice)
            ? missingProviderCopy(market.settlementPair)
            : notice)}
      </p>
      {isSimple ? null : (
        <>
          <div className={styles.shortcutRegion} role="region" aria-labelledby="ticket-keyboard-heading">
            <h3 id="ticket-keyboard-heading">Ticket keyboard</h3>
            <p>B/S side, L/M type, G/I/F time in force, Escape back from review. G/I/F stay idle while review is open.</p>
          </div>
          <p className={styles.inlineNotice}>Click a book price to copy it here. SHA-256 is the session-only simulation encoding. Settlement uses keccak EIP-712.</p>
        </>
      )}
    </section>
  );
}
