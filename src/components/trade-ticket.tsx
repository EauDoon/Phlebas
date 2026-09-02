"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { custodyRedemptionCopy, publicLinkabilityCopy } from "@/lib/review-copy";
import { retargetSettlementCopy } from "@/lib/evm-wallet";
import { parseExpiryUnix } from "@/lib/ticket-expiry";
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
import {
  TWAP_DURATION_LABELS,
  TWAP_DURATION_SECONDS,
  TWAP_SLICES,
  planTwap,
  type TwapDurationSeconds,
  type TwapSliceCount,
} from "@/lib/twap";
import { collateralRequired, describeSubmit, isTicketRejectCopy, USER_ORDER_PREFIX } from "@/lib/session";
import { quoteClob } from "@/lib/router";
import {
  parseStrictDecimal,
  marketOrderConstraintCopy,
  sideControlCopy,
  ZEC_ATOMIC_RULE,
  QUOTE_PRICE_ATOMIC_RULE,
  calculateWorstPrice,
  formatQuoteAtoms,
  previewQuoteAtoms,
} from "@/lib/order";
import {
  ticketCompleteActionCopy,
  ticketIdleNoticeCopy,
  ticketRetryFeedCopy,
  ticketReviewActionCopy,
  ticketReviewFeeCopy,
  ticketReviewNoticeCopy,
  ticketReviewRows,
} from "@/lib/ticket-review-copy";
import {
  ZEC_DECIMALS,
  PRICE_DECIMALS,
  QUOTE_DECIMALS,
  formatAtomicUnits,
  parseAtomicUnits,
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

function bookReviewFingerprint(book: Book): string {
  const serializeOrder = (order: Book["bids"][number]) => [
    order.id,
    order.side,
    order.priceTicks.toString(),
    order.remainingAtoms.toString(),
    order.seq,
    order.expiryUnix?.toString() ?? null,
  ];
  return JSON.stringify({
    seq: book.seq,
    lastTicks: book.lastTicks.toString(),
    bids: book.bids.map(serializeOrder),
    asks: book.asks.map(serializeOrder),
  });
}

export function TradeTicket({
  market,
  book,
  lastTicks,
  priceSelection,
  availableZecAtoms,
  availableQuoteAtoms,
  accountEpoch,
  feedStatus,
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
  variant?: TerminalMode;
  onRetryFeed: () => void;
  onSubmit: (order: {
    side: TicketSide;
    tif: TimeInForce;
    priceTicks: bigint;
    sizeAtoms: bigint;
    expiryUnix: bigint;
    twap?: { slices: TwapSliceCount; durationSeconds: TwapDurationSeconds };
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
  const [priceContext, setPriceContext] = useState(`${market.id}:${variant}`);
  const [size, setSize] = useState("10");
  const [slippagePercent, setSlippagePercent] = useState("0.50");
  const [twapSlices, setTwapSlices] = useState<TwapSliceCount>(4);
  const [twapDuration, setTwapDuration] = useState<TwapDurationSeconds>(900);
  const [expiry, setExpiry] = useState("0");
  const [notice, setNotice] = useState(ticketIdleNoticeCopy());
  const [rejected, setRejected] = useState<string | null>(null);
  const [appliedPriceNonce, setAppliedPriceNonce] = useState(0);
  const [sessionNonce, setSessionNonce] = useState(1);
  const reviewOpenRef = useRef(false);
  // Closing the review panel (Back, Complete, Escape, or the book/account
  // going stale under an open review) unmounts whichever button inside
  // reviewBlock currently has focus, since that block stops rendering.
  // With nothing to move focus to, it fell to <body>. Refocusing the
  // Review/Buy/Sell trigger button, which remounts in the same place,
  // keeps focus on the ticket instead of dropping it.
  const reviewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [review, setReview] = useState<{
    side: TicketSide;
    priceTicks: bigint;
    sizeAtoms: bigint;
    tif: TimeInForce;
    expiryUnix: bigint;
    twap?: { slices: TwapSliceCount; durationSeconds: TwapDurationSeconds };
    bookFingerprint: string;
    marketId: Market["id"];
    variant: TerminalMode;
    accountEpoch: number;
  } | null>(null);
  const isSimple = variant === "simple";
  const effectiveOrderType: TicketOrderType = isSimple ? "market" : orderType;
  const isTwap = !isSimple && effectiveOrderType === "twap";
  const marketLikeOrder = effectiveOrderType === "market" || isTwap;
  const effectiveTif: TimeInForce = isSimple || marketLikeOrder ? "IOC" : tif;
  const currentBookFingerprint = bookReviewFingerprint(book);
  const reviewIsCurrent = Boolean(
    review
    && review.marketId === market.id
    && review.variant === variant
    && review.accountEpoch === accountEpoch
    && review.bookFingerprint === currentBookFingerprint,
  );
  const activeReview = reviewIsCurrent ? review : null;

  if (priceContext !== `${market.id}:${variant}`) {
    setPriceContext(`${market.id}:${variant}`);
    setPrice(formatAtomicUnits(lastTicks, PRICE_DECIMALS, 2));
  }

  if (review && !reviewIsCurrent) {
    setReview(null);
    setNotice("Market context changed after review. Review the current order again.");
  }

  if (priceSelection && priceSelection.nonce !== appliedPriceNonce) {
    setAppliedPriceNonce(priceSelection.nonce);
    if (!isSimple) {
      setOrderType("limit");
      setTypeFocus("limit");
      setPrice(formatAtomicUnits(priceSelection.ticks, PRICE_DECIMALS, 2));
    }
  }

  useEffect(() => {
    const isOpen = activeReview !== null;
    if (reviewOpenRef.current && !isOpen) {
      reviewTriggerRef.current?.focus();
    }
    reviewOpenRef.current = isOpen;
  }, [activeReview]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const action = interpretTicketKey(event.key, {
        target: event.target,
        dialogOpen: Boolean(document.querySelector("dialog[open]")),
        reviewOpen: activeReview !== null,
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
  }, [activeReview, isSimple]);

  const lastPrice = Number(formatAtomicUnits(lastTicks, PRICE_DECIMALS, 2));
  const priceParse = marketLikeOrder
    ? { parsed: lastPrice, error: null }
    : parsePreviewDecimal(price, { atomicRule: QUOTE_PRICE_ATOMIC_RULE });
  const sizeParse = parsePreviewDecimal(size, { atomicRule: ZEC_ATOMIC_RULE });
  const parsedPrice = priceParse.parsed;
  const parsedSize = sizeParse.parsed;
  const priceIsValid = Number.isFinite(parsedPrice) && parsedPrice > 0;
  const sizeIsValid = Number.isFinite(parsedSize) && parsedSize > 0;
  const limitTicks = effectiveOrderType === "limit" ? parseTicks(price) : { ticks: 0n, error: null };
  const sizeAtoms = parseSizeAtoms(size);

  // The exact ticks behind the displayed price: the limit input for a
  // limit order, the last trade for a market one. The estimate is
  // computed from these rather than from the parsed floats, so it is the
  // amount the engine would settle rather than an approximation of it.
  const notionalPreview = useMemo(() => {
    // The exact ticks behind the displayed price: the limit input for a
    // limit order, the last trade for a market one.
    const ticks = effectiveOrderType === "limit" ? limitTicks.ticks : lastTicks;
    if (!priceIsValid || !sizeIsValid || ticks <= 0n || sizeAtoms.atoms <= 0n) {
      return { value: 0n, error: null };
    }
    try {
      return { value: previewQuoteAtoms(ticks, sizeAtoms.atoms, side), error: null };
    } catch (error) {
      return {
        value: 0n,
        error: error instanceof Error ? error.message : "Price and size are outside the preview range.",
      };
    }
  }, [effectiveOrderType, limitTicks.ticks, lastTicks, sizeAtoms.atoms, side, priceIsValid, sizeIsValid]);
  const notional = notionalPreview.value;
  const notionalError = notionalPreview.error;
  const formattedNotional = notional > 0n ? formatQuoteAtoms(notional) : "0.00";

  const worstPricePreview = useMemo(() => {
    if (effectiveOrderType === "limit") {
      return { value: parsedPrice, error: null };
    }
    const slippageParse = parsePreviewDecimal(slippagePercent, {
      allowZero: true,
      maximumExclusive: 100,
      atomicRule: QUOTE_PRICE_ATOMIC_RULE,
    });
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
  const slippageError = marketLikeOrder ? worstPricePreview.error : null;
  // A TWAP order always submits with expiryUnix 0n (each slice is IOC and
  // fires on its own schedule tick; there is no order-level deadline for
  // the field to describe). The Expiry input is hidden while isTwap, so a
  // stale value typed in Limit or Market mode before switching must not
  // block Review here: it did, because inputError folded expiryError in
  // unconditionally and the Review button disables on inputError.
  const expiryError = isTwap ? null : expiryParse.error;
  const inputError = priceError ?? sizeError ?? slippageError ?? expiryError;
  const simpleBookQuote = useMemo(() => {
    if (!isSimple || !sizeIsValid || sizeAtoms.error || sizeAtoms.atoms <= 0n) {
      return null;
    }
    try {
      const slippageHundredths = parseAtomicUnits(slippagePercent, PRICE_DECIMALS, { allowZero: true });
      const limitPriceTicks = worstPriceTicks(lastTicks, side, slippageHundredths);
      return quoteClob(book, side, sizeAtoms.atoms, limitPriceTicks, USER_ORDER_PREFIX);
    } catch {
      return null;
    }
  }, [book, isSimple, lastTicks, side, sizeAtoms.atoms, sizeAtoms.error, sizeIsValid, slippagePercent]);
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

  function preparedOrder(): {
    priceTicks: bigint;
    sizeAtoms: bigint;
    tif: TimeInForce;
    expiryUnix: bigint;
    twap?: { slices: TwapSliceCount; durationSeconds: TwapDurationSeconds };
  } | string {
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
    if (marketLikeOrder) {
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
    if (!isSimple && !isTwap && (expiryError || expiryParse.error)) {
      return expiryError ?? expiryParse.error ?? "Expiry must be a whole unix time, or 0 for none.";
    }
    if (isTwap) {
      try {
        planTwap({
          totalSizeAtoms: sizeAtoms.atoms,
          priceTicks,
          slices: twapSlices,
          durationSeconds: twapDuration,
          startUnix: 0n,
        });
      } catch (error) {
        return error instanceof Error ? error.message : "TWAP plan is invalid.";
      }
      return {
        priceTicks,
        sizeAtoms: sizeAtoms.atoms,
        tif: effectiveTif,
        expiryUnix: 0n,
        twap: { slices: twapSlices, durationSeconds: twapDuration },
      };
    }
    return {
      priceTicks,
      sizeAtoms: sizeAtoms.atoms,
      tif: effectiveTif,
      expiryUnix: isSimple ? 0n : expiryParse.value,
    };
  }

  function openReview(nowUnix: bigint) {
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

    const clobPreview = submitOrder(book, {
      id: "ticket-review",
      side,
      tif: prepared.tif,
      priceTicks: prepared.priceTicks,
      sizeAtoms: prepared.sizeAtoms,
      expiryUnix: prepared.expiryUnix,
      nowUnix,
    });
    if (!prepared.twap && clobPreview.status === "rejected" && clobPreview.reason === "Order expiry has passed") {
      const rejectedCopy = describeSubmit(clobPreview, market.id);
      setRejected(rejectedCopy);
      setNotice(rejectedCopy);
      setReview(null);
      return;
    }
    setRejected(null);
    setSessionNonce((current) => current + 1);
    setReview({
      ...prepared,
      side,
      bookFingerprint: currentBookFingerprint,
      marketId: market.id,
      variant,
      accountEpoch,
    });
  }

  function completeReview() {
    if (!activeReview || !gate.canReview) {
      if (!gate.canReview) {
        setNotice(gate.message);
        setReview(null);
      }
      return;
    }
    const result = onSubmit({
      side: activeReview.side,
      tif: activeReview.tif,
      priceTicks: activeReview.priceTicks,
      sizeAtoms: activeReview.sizeAtoms,
      expiryUnix: activeReview.expiryUnix,
      ...(activeReview.twap ? { twap: activeReview.twap } : {}),
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
  const quotedZec = simpleBookQuote
    ? formatAtomicUnits(simpleBookQuote.filledAtoms, ZEC_DECIMALS)
    : (sizeIsValid ? size : "0");
  const quotedStable = simpleBookQuote
    ? formatAtomicUnits(simpleBookQuote.quoteAtoms, QUOTE_DECIMALS, 2)
    : formattedNotional;
  const tokenInAmount = side === "buy" ? quotedStable : quotedZec;
  const tokenOutAmount = side === "buy" ? quotedZec : quotedStable;
  const averageBookPrice = simpleBookQuote && simpleBookQuote.filledAtoms > 0n
    ? Number(formatAtomicUnits(simpleBookQuote.quoteAtoms, QUOTE_DECIMALS, 6))
      / Number(formatAtomicUnits(simpleBookQuote.filledAtoms, ZEC_DECIMALS))
    : Number.NaN;
  const priceImpact = Number.isFinite(averageBookPrice) && lastPrice > 0
    ? Math.abs(((averageBookPrice - lastPrice) / lastPrice) * 100)
    : Number.NaN;
  const simpleRouteComplete = Boolean(
    simpleBookQuote?.complete && simpleBookQuote.filledAtoms === sizeAtoms.atoms,
  );
  const simpleInventoryCovered = useMemo(() => {
    if (!isSimple || !sizeIsValid || sizeAtoms.error || sizeAtoms.atoms <= 0n) return false;
    try {
      const slippageHundredths = parseAtomicUnits(slippagePercent, PRICE_DECIMALS, { allowZero: true });
      const limitPriceTicks = worstPriceTicks(lastTicks, side, slippageHundredths);
      const required = collateralRequired(side, sizeAtoms.atoms, limitPriceTicks);
      return side === "buy" ? availableQuoteAtoms >= required : availableZecAtoms >= required;
    } catch {
      return false;
    }
  }, [availableQuoteAtoms, availableZecAtoms, isSimple, lastTicks, side, sizeAtoms.atoms, sizeAtoms.error, sizeIsValid, slippagePercent]);
  const simpleQuoteComplete = simpleRouteComplete && simpleInventoryCovered;
  const reviewRows = activeReview
    ? ticketReviewRows({
      side: activeReview.side,
      sizeLabel: `${formatAtomicUnits(activeReview.sizeAtoms, ZEC_DECIMALS)} ZEC`,
      priceLabel: `${formatAtomicUnits(activeReview.priceTicks, PRICE_DECIMALS, 2)} ${market.quote}`,
      twapLabel: activeReview.twap
        ? `${activeReview.twap.slices} slices over ${TWAP_DURATION_LABELS[activeReview.twap.durationSeconds]}`
        : undefined,
      settlementPair: market.settlementPair,
    })
    : [];

  function renderSimpleTokenAmount(token: string, amount: string) {
    if (token === "ZEC") {
      return (
        <div className={`${styles.tokenAmount} ${styles.editableTokenAmount}`}>
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
          <button type="button" className={styles.maxButton} onClick={applyMax}>Max</button>
        </div>
      );
    }
    return (
      <div className={styles.tokenAmount}>
        <strong>{amount}</strong>
        <span>{token}</span>
      </div>
    );
  }

  return (
    <section
      id="order-ticket"
      tabIndex={-1}
      className={`${styles.panel} ${styles.ticket}${isSimple ? ` ${styles.simpleTicket}` : ""}`}
      aria-labelledby="trade-ticket-title"
    >
      <div className={styles.panelHeader}>
        <h2 id="trade-ticket-title">{isSimple ? "Swap" : "Order entry"}</h2>
        <span className={styles.statusDot}>{isSimple ? "Shared book" : "CLOB"}</span>
      </div>

      {!gate.canReview && (
        <div className={styles.ticketBlocked} role="status" aria-label="Ticket blocked">
          <strong>{gate.heading}</strong>
          <p>{gate.message}{gate.asOf ? ` As of ${gate.asOf}.` : ""}</p>
          <button type="button" className={styles.textButton} onClick={onRetryFeed}>
            {ticketRetryFeedCopy()}
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
            {renderSimpleTokenAmount(tokenIn, tokenInAmount)}
            <span>Available {availableIn}</span>
          </div>
          <div className={styles.switchRow}>
            <button type="button" onClick={switchSide} aria-label="Switch">
              <span aria-hidden="true">↓</span>
            </button>
          </div>
          <div className={styles.tokenRow} aria-label="Token out">
            <span>Token out</span>
            {renderSimpleTokenAmount(tokenOut, tokenOutAmount)}
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
                {id === "limit" ? "Limit" : id === "market" ? "Market" : "TWAP"}
              </button>
            ))}
          </div>

          {isTwap && (
            <div className={styles.twapControls} role="group" aria-label="TWAP schedule">
              <label className={styles.inputLabel}>
                <span>Slices</span>
                <select
                  value={twapSlices}
                  onChange={(event) => setTwapSlices(Number(event.currentTarget.value) as TwapSliceCount)}
                  aria-label="TWAP slice count"
                >
                  {TWAP_SLICES.map((count) => (
                    <option key={count} value={count}>{count} slices</option>
                  ))}
                </select>
              </label>
              <label className={styles.inputLabel}>
                <span>Duration</span>
                <select
                  value={twapDuration}
                  onChange={(event) => setTwapDuration(Number(event.currentTarget.value) as TwapDurationSeconds)}
                  aria-label="TWAP duration"
                >
                  {TWAP_DURATION_SECONDS.map((seconds) => (
                    <option key={seconds} value={seconds}>{TWAP_DURATION_LABELS[seconds]}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

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
                value={marketLikeOrder ? "Best available" : price}
                disabled={marketLikeOrder}
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

      {marketLikeOrder && (
        <p className={styles.inlineNotice}>
          {isTwap
            ? "TWAP splits the reviewed size into equal IOC slices at the signed worst price, executed on schedule from session inventory."
            : marketOrderConstraintCopy()}
        </p>
      )}

      {marketLikeOrder && (
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

      {isSimple ? null : (
        <div>
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
        </div>
      )}
      {sizeError ? (
        <p id={sizeErrorId} className={styles.inlineNotice} role="alert">{sizeError}</p>
      ) : null}

      {!isSimple && !isTwap && (
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
          <p className={styles.inlineNotice}>0 means no expiry.</p>
        </>
      )}
      {/* TWAP slices are IOC and fire on the schedule above; there is no
          order-level expiry for this field to set, so it is not shown
          rather than left editable and silently ignored. */}
      {!isSimple && isTwap && (
        <p className={styles.inlineNotice}>No expiry: each TWAP slice is immediate-or-cancel.</p>
      )}

      {!isSimple && (
        <>
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
        {isSimple ? (
          <>
            <div>
              <dt>Route</dt>
              <dd>Advanced order book</dd>
            </div>
            <div>
              <dt>Book fill</dt>
              <dd>{simpleRouteComplete ? "Complete" : "Partial or unavailable"}</dd>
            </div>
            <div>
              <dt>Session inventory</dt>
              <dd>{simpleInventoryCovered ? "Available" : "Insufficient"}</dd>
            </div>
            <div>
              <dt>Average price</dt>
              <dd>{Number.isFinite(averageBookPrice) ? averageBookPrice.toFixed(2) : "—"} {market.quote}</dd>
            </div>
            <div>
              <dt>Price impact</dt>
              <dd>{Number.isFinite(priceImpact) ? `${priceImpact.toFixed(2)}%` : "—"}</dd>
            </div>
            <div>
              <dt>Maximum slippage</dt>
              <dd>{slippagePercent || "0"}%</dd>
            </div>
            <div>
              <dt>Settlement</dt>
              <dd>{market.settlementPair}</dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>Estimated value</dt>
              <dd>{formattedNotional} {market.quote}</dd>
            </div>
            <div>
              <dt>Settlement</dt>
              <dd>{market.settlementPair}</dd>
            </div>
            <div>
              <dt>{marketLikeOrder ? "Worst price" : "Limit price"}</dt>
              <dd>{Number.isFinite(worstPrice) ? worstPrice.toFixed(2) : "0.00"} {market.quote}</dd>
            </div>
            <div>
              <dt>Time in force</dt>
              <dd>{effectiveTif}</dd>
            </div>
            <div>
              <dt>Fee</dt>
              {/* feeEnvelopeCopy is the proposed CLOB envelope; it is not charged. */}
              <dd>{ticketReviewFeeCopy()}</dd>
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
            {/* preparedOrder() always submits expiryUnix 0n for a TWAP order
                (see the TWAP branch below), so this row must not echo the
                Expiry field's leftover text as if it still applied. */}
            <dd>{isTwap || expiry.trim() === "" || expiry.trim() === "0" ? "none" : expiry.trim()}</dd>
          </div>
          </>
        )}
      </dl>

      {isSimple && simpleBookQuote?.blockedByMaker && !inputError ? (
        <p className={styles.inlineNotice} role="status">
          This route would cross your own resting order. Cancel it in Advanced mode or change the order size.
        </p>
      ) : isSimple && !simpleInventoryCovered && !inputError ? (
        <p className={styles.inlineNotice} role="status">
          Session inventory cannot fund this order size. Reduce the ZEC amount before review.
        </p>
      ) : isSimple && !simpleRouteComplete && !inputError ? (
        <p className={styles.inlineNotice} role="status">
          The requested size is only partially fillable at this slippage limit. Reduce the ZEC amount
          or raise the limit before review.
        </p>
      ) : null}

      {activeReview ? (
        <div className={styles.reviewBlock}>
          <p className={styles.gateNotice} aria-label="Review custody notice">
            {ticketReviewNoticeCopy()} {custodyRedemptionCopy()}
          </p>
          <dl className={styles.ticketSummary}>
            {reviewRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.label === "Public linkability" ? publicLinkabilityCopy("fill") : row.value}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            className={`${styles.primaryAction} ${activeReview.side === "sell" ? styles.sellAction : ""}`}
            onClick={completeReview}
          >
            {ticketCompleteActionCopy(activeReview.side)}
          </button>
          <button type="button" className={styles.textButton} onClick={() => setReview(null)}>
            Back
          </button>
        </div>
      ) : (
        <button
          type="button"
          ref={reviewTriggerRef}
          className={`${styles.primaryAction} ${side === "sell" ? styles.sellAction : ""}`}
          onClick={() => openReview(BigInt(Math.floor(Date.now() / 1000)))}
          disabled={
            !gate.canReview
            || Boolean(inputError)
            || Boolean(notionalError)
            || (isSimple && !simpleQuoteComplete)
          }
        >
          {ticketReviewActionCopy(side)}
        </button>
      )}
      <p id={noticeId} className={styles.inlineNotice} aria-live="polite">
        {inputError ?? notionalError ?? (isTicketRejectCopy(notice)
          ? retargetSettlementCopy(notice, market.settlementPair)
          : notice)}
      </p>
      {isSimple ? null : (
        <>
          <div className={styles.shortcutRegion} role="region" aria-labelledby="ticket-keyboard-heading">
            <h3 id="ticket-keyboard-heading">Ticket keyboard</h3>
            <p>B/S side, L/M type, G/I/F time in force, Escape back from review. G/I/F stay idle while review is open.</p>
          </div>
          <p className={styles.inlineNotice}>Click a book price to copy it here.</p>
        </>
      )}
    </section>
  );
}
