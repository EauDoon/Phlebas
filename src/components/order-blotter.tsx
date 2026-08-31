"use client";

import { useState } from "react";

import type { MarketId } from "@/lib/market-data";
import { markets } from "@/lib/market-data";
import type { RestingOrder } from "@/lib/matcher";
import { describeSessionLogEvent, type SessionLogEvent } from "@/lib/replay";
import type { PaperAccount, UserFill } from "@/lib/session";
import { availablePzec, availableQuote, markToMarketQuote, startingMarkQuote } from "@/lib/session";
import { PZEC_DECIMALS, PRICE_DECIMALS, QUOTE_DECIMALS, formatAtomicUnits } from "@/lib/units";

import styles from "./terminal.module.css";

type BlotterTab = "orders" | "fills" | "inventory" | "log";

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
  const market = markets[marketId];
  const marketFills = fills.filter((fill) => fill.marketId === marketId);
  const mark = markToMarketQuote(account, lastTicks);
  const start = startingMarkQuote(lastTicks);
  const pnl = mark - start;

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

      <div className={styles.orderTypes} role="tablist" aria-label="Blotter views">
        <button type="button" role="tab" aria-selected={tab === "orders"} className={tab === "orders" ? styles.textActive : undefined} onClick={() => setTab("orders")}>
          Open orders
        </button>
        <button type="button" role="tab" aria-selected={tab === "fills"} className={tab === "fills" ? styles.textActive : undefined} onClick={() => setTab("fills")}>
          Fills
        </button>
        <button type="button" role="tab" aria-selected={tab === "inventory"} className={tab === "inventory" ? styles.textActive : undefined} onClick={() => setTab("inventory")}>
          Inventory
        </button>
        <button type="button" role="tab" aria-selected={tab === "log"} className={tab === "log" ? styles.textActive : undefined} onClick={() => setTab("log")}>
          Event log
        </button>
      </div>

      {tab === "orders" && (
        openOrders.length === 0 ? (
          <p className={styles.emptyState}>No open session orders. Venue fixture levels remain on the book.</p>
        ) : (
          <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <caption className={styles.srOnly}>Resting session orders on the local {marketId} book, settled as {market.settlementPair}</caption>
            <thead>
              <tr>
                <th scope="col">Side</th>
                <th scope="col">Price {market.quote}</th>
                <th scope="col">Remaining pZEC</th>
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
        )
      )}
      {tab === "orders" && (
        <p className={styles.emptyState}>
          {openOrders.length > 0 && (
            <button type="button" className={styles.textButton} onClick={onCancelAll}>Cancel all session orders</button>
          )}
          {" "}
          <button type="button" className={styles.textButton} onClick={onCancelAll}>
            Invalidate older session orders
          </button>
        </p>
      )}

      {tab === "fills" && (
        marketFills.length === 0 ? (
          <p className={styles.emptyState}>No session fills yet. Submitting a simulated order can trade against the fixture book.</p>
        ) : (
          <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <caption className={styles.srOnly}>Session fills for {marketId}, settled as {market.settlementPair}</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Side</th>
                <th scope="col">Price {market.quote}</th>
                <th scope="col">Size pZEC</th>
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
        )
      )}

      {tab === "inventory" && (
        <dl className={styles.statGrid}>
          <div>
            <dt>Available pZEC</dt>
            <dd>{formatAtomicUnits(availablePzec(account), PZEC_DECIMALS)}</dd>
          </div>
          <div>
            <dt>Reserved pZEC</dt>
            <dd>{formatAtomicUnits(account.reservedPzecAtoms, PZEC_DECIMALS)}</dd>
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
      )}

      {tab === "log" && (
        events.length === 0 ? (
          <p className={styles.emptyState}>No session events yet. Replaying this log reconstructs the book and balances.</p>
        ) : (
          <table className={styles.dataTable}>
            <caption className={styles.srOnly}>Append-only session event log</caption>
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
                  <td>{describeSessionLogEvent(event)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </section>
  );
}
