"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import {
  BLOTTER_TAB_LABELS,
  BLOTTER_TABS,
  nextBlotterTab,
  type BlotterTab,
} from "@/lib/blotter-tabs";
import {
  blotterEmptyFillsCopy,
  blotterEmptyLogCopy,
  blotterEmptyOrdersCopy,
  blotterLogCaptionCopy,
  blotterLogEventCopy,
} from "@/lib/blotter-copy";
import type { MarketId } from "@/lib/market-data";
import { markets } from "@/lib/market-data";
import type { Book, RestingOrder } from "@/lib/matcher";
import type { SessionLogEvent } from "@/lib/replay";
import type { PaperAccount, UserFill } from "@/lib/session";
import { availableZec, availableQuote, markToMarketQuote, startingMarkQuote } from "@/lib/session";
import { buildSessionSnapshot, describeSessionSnapshot, serializeSessionSnapshot } from "@/lib/session-export";
import { ZEC_DECIMALS, PRICE_DECIMALS, QUOTE_DECIMALS, formatAtomicUnits } from "@/lib/units";

import styles from "./terminal.module.css";

export function OrderBlotter({
  marketId,
  account,
  lastTicks,
  book,
  openOrders,
  fills,
  events,
  onCancel,
  onCancelAll,
  onReset,
  accountEpoch,
}: {
  marketId: MarketId;
  account: PaperAccount;
  lastTicks: bigint;
  book: Book;
  openOrders: RestingOrder[];
  fills: UserFill[];
  events: SessionLogEvent[];
  onCancel: (orderId: string) => void;
  onCancelAll: () => void;
  onReset: () => void;
  accountEpoch: number;
}) {
  const [tab, setTab] = useState<BlotterTab>("orders");
  const [focusId, setFocusId] = useState<BlotterTab>("orders");
  const tabRefs = useRef<Partial<Record<BlotterTab, HTMLButtonElement | null>>>({});
  const market = markets[marketId];
  const marketFills = fills.filter((fill) => fill.marketId === marketId);
  const mark = markToMarketQuote(account, lastTicks);
  const start = startingMarkQuote(lastTicks);
  const pnl = mark - start;

  function moveFocus(next: BlotterTab) {
    setFocusId(next);
    tabRefs.current[next]?.focus();
  }

  function selectTab(id: BlotterTab) {
    setTab(id);
    setFocusId(id);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: BlotterTab) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(nextBlotterTab(id, 1));
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(nextBlotterTab(id, -1));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      moveFocus("orders");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      moveFocus("log");
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectTab(id);
    }
  }

  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  function copySessionSnapshot() {
    const market = markets[marketId];
    const snapshot = buildSessionSnapshot({
      market,
      account,
      book,
      fills,
      sessionLog: events,
    });
    const json = serializeSessionSnapshot(snapshot);
    const description = describeSessionSnapshot(snapshot);
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCopyStatus("failed");
      return;
    }
    void navigator.clipboard.writeText(json).then(
      () => setCopyStatus("copied"),
      () => setCopyStatus("failed"),
    );
    void description;
  }

  return (
    <section id="session-blotter" tabIndex={-1} className={`${styles.panel} ${styles.blotter}`} aria-labelledby="blotter-title">
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Session blotter</span>
          <h2 id="blotter-title">Open orders, fills, inventory</h2>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.textButton} onClick={copySessionSnapshot} aria-label="Copy session snapshot JSON to clipboard">
            {copyStatus === "copied" ? "Copied session JSON" : copyStatus === "failed" ? "Copy failed" : "Copy session JSON"}
          </button>
          <button type="button" className={styles.textButton} onClick={onReset}>
            Reset session
          </button>
        </div>
      </div>

      <div className={styles.orderTypes} role="tablist" aria-label="Blotter views" aria-orientation="horizontal">
        {BLOTTER_TABS.map((id) => (
          <button
            type="button"
            key={id}
            id={`blotter-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`blotter-panel-${id}`}
            tabIndex={focusId === id ? 0 : -1}
            className={tab === id ? styles.textActive : undefined}
            ref={(node) => {
              tabRefs.current[id] = node;
            }}
            onClick={() => selectTab(id)}
            onKeyDown={(event) => onTabKeyDown(event, id)}
          >
            {BLOTTER_TAB_LABELS[id]}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <div role="tabpanel" id="blotter-panel-orders" aria-labelledby="blotter-tab-orders">
        {openOrders.length === 0 ? (
          <p className={styles.emptyState}>{blotterEmptyOrdersCopy(market.settlementPair)}</p>
        ) : (
          <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <caption className={styles.srOnly}>Resting session orders on the local {marketId} book, settled as {market.settlementPair}</caption>
            <thead>
              <tr>
                <th scope="col">Side</th>
                <th scope="col">Price {market.quote}</th>
                <th scope="col">Remaining ZEC</th>
                <th scope="col">Settlement</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {openOrders.map((order) => (
                <tr key={order.id}>
                  <th scope="row" className={order.side === "buy" ? styles.buyText : styles.sellText}>
                    {order.side === "buy" ? "Buy" : "Sell"}
                  </th>
                  <td>{formatAtomicUnits(order.priceTicks, PRICE_DECIMALS, 2)}</td>
                  <td>{formatAtomicUnits(order.remainingAtoms, ZEC_DECIMALS)}</td>
                  <td>{market.settlementPair}</td>
                  <td>
                    <button type="button" className={styles.textButton} onClick={() => onCancel(order.id)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        <p className={styles.emptyState}>
          {openOrders.length > 0 && (
            <button type="button" className={styles.textButton} onClick={onCancelAll}>Cancel all session orders</button>
          )}
          {" "}
          <button type="button" className={styles.textButton} onClick={onCancelAll}>
            Invalidate older session orders
          </button>
        </p>
        </div>
      )}

      {tab === "fills" && (
        <div role="tabpanel" id="blotter-panel-fills" aria-labelledby="blotter-tab-fills">
        {marketFills.length === 0 ? (
          <p className={styles.emptyState}>{blotterEmptyFillsCopy(market.settlementPair)}</p>
        ) : (
          <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <caption className={styles.srOnly}>Session fills for {marketId}, settled as {market.settlementPair}</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Side</th>
                <th scope="col">Price {market.quote}</th>
                <th scope="col">Size ZEC</th>
                <th scope="col">Settlement</th>
              </tr>
            </thead>
            <tbody>
              {marketFills.map((fill) => (
                <tr key={fill.id}>
                  <th scope="row">{fill.time}</th>
                  <td className={fill.takerSide === "buy" ? styles.buyText : styles.sellText}>
                    {fill.takerSide === "buy" ? "Buy" : "Sell"}
                  </td>
                  <td>{formatAtomicUnits(fill.priceTicks, PRICE_DECIMALS, 2)}</td>
                  <td>{formatAtomicUnits(fill.sizeAtoms, ZEC_DECIMALS)}</td>
                  <td>{market.settlementPair}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        </div>
      )}

      {tab === "inventory" && (
        <div role="tabpanel" id="blotter-panel-inventory" aria-labelledby="blotter-tab-inventory">
        <dl className={styles.statGrid}>
          <div>
            <dt>Available ZEC</dt>
            <dd>{formatAtomicUnits(availableZec(account), ZEC_DECIMALS)}</dd>
          </div>
          <div>
            <dt>Reserved ZEC</dt>
            <dd>{formatAtomicUnits(account.reservedZecAtoms, ZEC_DECIMALS)}</dd>
          </div>
          <div>
            <dt>Available {market.quote}</dt>
            <dd>{formatAtomicUnits(availableQuote(account), QUOTE_DECIMALS, 2)}</dd>
          </div>
          <div>
            <dt>Reserved {market.quote}</dt>
            <dd>{formatAtomicUnits(account.reservedQuoteAtoms, QUOTE_DECIMALS, 2)}</dd>
          </div>
          <div>
            <dt>Mark to market</dt>
            <dd>{formatAtomicUnits(mark, QUOTE_DECIMALS, 2)} {market.quote}</dd>
          </div>
          <div>
            <dt>Session PnL</dt>
            <dd className={pnl >= 0n ? styles.buyText : styles.sellText}>
              {pnl >= 0n ? "+" : "−"}{formatAtomicUnits(pnl < 0n ? -pnl : pnl, QUOTE_DECIMALS, 2)} {market.quote}
            </dd>
          </div>
          <div>
            <dt>Account epoch</dt>
            <dd>{accountEpoch}</dd>
          </div>
        </dl>
        <p className={styles.inlineNotice}>
          Session nonce cancel is local. Onchain cancelNonce is not this simulation.
        </p>
        </div>
      )}

      {tab === "log" && (
        <div role="tabpanel" id="blotter-panel-log" aria-labelledby="blotter-tab-log">
        {events.length === 0 ? (
          <p className={styles.emptyState}>{blotterEmptyLogCopy(market.settlementPair)}</p>
        ) : (
          <table className={styles.dataTable}>
            <caption className={styles.srOnly}>{blotterLogCaptionCopy(market.settlementPair)}</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Kind</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(-20).map((event, index) => (
                <tr key={`${event.kind}-${index}`}>
                  <th scope="row">{events.length - Math.min(events.length, 20) + index + 1}</th>
                  <td>{event.kind}</td>
                  {/* The pure blotter copy module keeps describeSessionLogEvent formatting and adds settlement context. */}
                  <td>{blotterLogEventCopy(event)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      )}
    </section>
  );
}
