"use client";

import { useState } from "react";

import type { MarketId } from "@/lib/market-data";
import { markets } from "@/lib/market-data";
import type { RestingOrder } from "@/lib/matcher";
import type { PaperAccount, UserFill } from "@/lib/session";
import { availablePzec, availableQuote } from "@/lib/session";
import { PZEC_DECIMALS, PRICE_DECIMALS, QUOTE_DECIMALS, formatAtomicUnits } from "@/lib/units";

import styles from "./terminal.module.css";

type BlotterTab = "orders" | "fills" | "inventory";

export function OrderBlotter({
  marketId,
  account,
  openOrders,
  fills,
  onCancel,
  onReset,
}: {
  marketId: MarketId;
  account: PaperAccount;
  openOrders: RestingOrder[];
  fills: UserFill[];
  onCancel: (orderId: string) => void;
  onReset: () => void;
}) {
  const [tab, setTab] = useState<BlotterTab>("orders");
  const market = markets[marketId];
  const marketFills = fills.filter((fill) => fill.marketId === marketId);

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
      </div>

      {tab === "orders" && (
        openOrders.length === 0 ? (
          <p className={styles.emptyState}>No open session orders. Venue fixture levels remain on the book.</p>
        ) : (
          <table className={styles.dataTable}>
            <caption className={styles.srOnly}>Resting session orders on the local {marketId} book</caption>
            <thead>
              <tr>
                <th scope="col">Side</th>
                <th scope="col">Price {market.quote}</th>
                <th scope="col">Remaining pZEC</th>
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
                  <td>
                    <button type="button" className={styles.textButton} onClick={() => onCancel(order.id)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {tab === "fills" && (
        marketFills.length === 0 ? (
          <p className={styles.emptyState}>No session fills yet. Submitting a simulated order can trade against the fixture book.</p>
        ) : (
          <table className={styles.dataTable}>
            <caption className={styles.srOnly}>Session fills for {marketId}</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Side</th>
                <th scope="col">Price {market.quote}</th>
                <th scope="col">Size pZEC</th>
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
                </tr>
              ))}
            </tbody>
          </table>
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
        </dl>
      )}
    </section>
  );
}
