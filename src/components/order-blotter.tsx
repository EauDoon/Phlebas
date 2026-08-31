"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import {
  blotterEmptyFillsCopy,
  blotterEmptyLogCopy,
  blotterEmptyOrdersCopy,
  blotterLogCaptionCopy,
  blotterLogEventCopy,
} from "@/lib/blotter-copy";
import type { MarketId } from "@/lib/market-data";
import { markets } from "@/lib/market-data";
import type { RestingOrder } from "@/lib/matcher";
import type { SessionLogEvent } from "@/lib/replay";
import type { PaperAccount, UserFill } from "@/lib/session";
import { availableZec, availableQuote, markToMarketQuote, startingMarkQuote } from "@/lib/session";
import { PZEC_DECIMALS, PRICE_DECIMALS, QUOTE_DECIMALS, formatAtomicUnits } from "@/lib/units";

import styles from "./terminal.module.css";

const BLOTTER_TABS = ["orders", "fills", "inventory", "log"] as const;
type BlotterTab = (typeof BLOTTER_TABS)[number];

const TAB_LABELS: Record<BlotterTab, string> = {
  orders: "Open orders",
  fills: "Fills",
  inventory: "Inventory",
  log: "Event log",
};

export function OrderBlotter({
  marketId,
  account,
  lastTicks,
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
  openOrders: RestingOrder[];
  fills: UserFill[];
  events: SessionLogEvent[];
  onCancel: (orderId: string) => void;
  onCancelAll: () => void;
  onReset: () => void;
  accountEpoch: number;
}) {
  const [tab, setTab] = useState<BlotterTab>("orders");
  const tabRefs = useRef<Partial<Record<BlotterTab, HTMLButtonElement | null>>>({});
  const market = markets[marketId];
  const marketFills = fills.filter((fill) => fill.marketId === marketId);
  const mark = markToMarketQuote(account, lastTicks);
  const start = startingMarkQuote(lastTicks);
  const pnl = mark - start;

  function onTabListKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = BLOTTER_TABS.indexOf(tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % BLOTTER_TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + BLOTTER_TABS.length) % BLOTTER_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = BLOTTER_TABS.length - 1;
    else return;
    event.preventDefault();
    const nextTab = BLOTTER_TABS[next];
    setTab(nextTab);
    queueMicrotask(() => tabRefs.current[nextTab]?.focus());
  }

  return (
    <section className={`${styles.panel} ${styles.blotter}`} aria-labelledby="blotter-title">
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Session blotter</span>
          <h2 id="blotter-title">Open orders, fills, inventory</h2>
        </div>
        <button type="button" className={styles.textButton} onClick={onReset}>
          Reset session
        </button>
      </div>

      <div className={styles.orderTypes} role="tablist" aria-label="Blotter views" onKeyDown={onTabListKey}>
        {BLOTTER_TABS.map((id) => (
          <button
            type="button"
            key={id}
            id={`blotter-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`blotter-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className={tab === id ? styles.textActive : undefined}
            ref={(node) => {
              tabRefs.current[id] = node;
            }}
            onClick={() => setTab(id)}
          >
            {TAB_LABELS[id]}
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
                  <td>{formatAtomicUnits(order.remainingAtoms, PZEC_DECIMALS)}</td>
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
                  <td>{formatAtomicUnits(fill.sizeAtoms, PZEC_DECIMALS)}</td>
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
            <dd>{formatAtomicUnits(availableZec(account), PZEC_DECIMALS)}</dd>
          </div>
          <div>
            <dt>Reserved ZEC</dt>
            <dd>{formatAtomicUnits(account.reservedZecAtoms, PZEC_DECIMALS)}</dd>
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
                  <td>
                    {blotterLogEventCopy(event)}
                  </td>
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
