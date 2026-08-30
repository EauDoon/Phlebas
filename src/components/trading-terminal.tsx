"use client";

import { useState } from "react";
import Link from "next/link";

import type { ChartRange, MarketId } from "@/lib/market-data";
import { markets, recentTrades } from "@/lib/market-data";

import { ArchitecturePanel } from "./architecture-panel";
import { BridgePanel } from "./bridge-panel";
import { LiquidityPanel } from "./liquidity-panel";
import { OrderBook } from "./order-book";
import { PriceChart } from "./price-chart";
import { TradeTicket } from "./trade-ticket";
import styles from "./terminal.module.css";

type View = "trade" | "liquidity" | "bridge" | "architecture";

const views: { id: View; label: string }[] = [
  { id: "trade", label: "Trade" },
  { id: "liquidity", label: "Liquidity" },
  { id: "bridge", label: "ZEC gateway" },
  { id: "architecture", label: "Architecture" },
];

function viewUrl(view: View, market: MarketId) {
  if (view === "liquidity") {
    return `/liquidity?${new URLSearchParams({ market }).toString()}`;
  }

  return `/trade?${new URLSearchParams({ view, market }).toString()}`;
}

export function TradingTerminal({
  initialView = "trade",
  initialMarket = "ZEC/USDC",
}: {
  initialView?: View;
  initialMarket?: MarketId;
}) {
  const [view, setView] = useState<View>(initialView);
  const [marketId, setMarketId] = useState<MarketId>(initialMarket);
  const [range, setRange] = useState<ChartRange>("4H");
  const market = markets[marketId];

  function selectView(nextView: View) {
    setView(nextView);
    window.history.replaceState(null, "", viewUrl(nextView, marketId));
  }

  function selectMarket(nextMarket: MarketId) {
    setMarketId(nextMarket);
    window.history.replaceState(null, "", viewUrl(view, nextMarket));
  }

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">Skip to main content</a>
      <div className={styles.simulationBanner} role="status">
        <strong>Protocol preview</strong>
        <span>No wallets, real assets, live prices, contracts, deposits, or orders are connected. The proposed matcher is offchain and is not trustless.</span>
      </div>

      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="Phlebas home">
          <span className={styles.brandMark}>P</span>
          <span>PHLEBAS</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          {views.map((item) => (
            <button
              type="button"
              key={item.id}
              className={view === item.id ? styles.navActive : undefined}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => selectView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <span className={styles.network}><i />Arbitrum design</span>
          <button type="button" className={styles.connectButton} disabled>Wallets unavailable</button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <h1 className={styles.srOnly}>Phlebas ZEC trading terminal</h1>
        {view === "trade" && (
          <>
            <section className={styles.marketBar} aria-label="Selected market summary">
              <div className={styles.marketSelectorWrap}>
                <span className={styles.coinMark}>Z</span>
                <label>
                  <span>Market</span>
                  <select value={marketId} onChange={(event) => selectMarket(event.target.value as MarketId)}>
                    <option value="ZEC/USDC">ZEC / USDC</option>
                    <option value="ZEC/USDT">ZEC / USDT</option>
                  </select>
                </label>
                <span className={styles.settlementBadge}>settles {market.settlementPair}</span>
                {marketId === "ZEC/USDT" && <span className={styles.gateBadge}>Later listing gate</span>}
              </div>
              <dl className={styles.marketStats}>
                <div className={styles.priceStat}><dt>Illustrative last</dt><dd>{market.last.toFixed(2)}</dd></div>
                <div><dt>24h change</dt><dd className={styles.buyText}>+{market.change.toFixed(2)}%</dd></div>
                <div><dt>24h high</dt><dd>{market.high.toFixed(2)}</dd></div>
                <div><dt>24h low</dt><dd>{market.low.toFixed(2)}</dd></div>
                <div><dt>24h volume</dt><dd>{market.volume}</dd></div>
              </dl>
            </section>

            <div className={styles.tradeGrid}>
              <section className={`${styles.panel} ${styles.chartPanel}`} aria-labelledby="chart-title">
                <div className={styles.panelHeader}>
                  <div><span className={styles.eyebrow}>Illustrative market data</span><h2 id="chart-title">{marketId}</h2></div>
                  <div className={styles.rangeTabs} role="group" aria-label="Chart range">
                    {(["1H", "4H", "1D"] as ChartRange[]).map((item) => (
                      <button type="button" key={item} aria-pressed={range === item} className={range === item ? styles.textActive : undefined} onClick={() => setRange(item)}>{item}</button>
                    ))}
                  </div>
                </div>
                <PriceChart marketId={marketId} range={range} />
              </section>

              <OrderBook marketId={marketId} />
              <TradeTicket key={marketId} market={market} />

              <section className={`${styles.panel} ${styles.tradesPanel}`} aria-labelledby="recent-trades-title">
                <div className={styles.panelHeader}>
                  <h2 id="recent-trades-title">Recent trades</h2>
                  <span className={styles.miniLabel}>Mock feed</span>
                </div>
                <table className={styles.dataTable}>
                  <caption className={styles.srOnly}>Illustrative recent {marketId} trades</caption>
                  <thead>
                    <tr><th scope="col">Price {market.quote}</th><th scope="col">Size pZEC</th><th scope="col">Time</th></tr>
                  </thead>
                  <tbody>
                    {recentTrades[marketId].map((trade) => (
                      <tr key={`${trade.time}-${trade.price}`}>
                        <th scope="row" className={trade.side === "buy" ? styles.buyText : styles.sellText}>
                          <span className={styles.srOnly}>{trade.side === "buy" ? "Buy" : "Sell"} </span>
                          {trade.price.toFixed(2)}
                        </th>
                        <td>{trade.size.toFixed(2)}</td>
                        <td>{trade.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          </>
        )}

        {view === "liquidity" && <LiquidityPanel marketId={marketId} onMarketChange={selectMarket} />}
        {view === "bridge" && <BridgePanel />}
        {view === "architecture" && <ArchitecturePanel />}
      </main>

      <footer className={styles.footer}>
        <span>Phlebas protocol preview, 30-08-2026</span>
        <span>Research repository candidate, not a live exchange or an offer of financial services</span>
      </footer>
    </div>
  );
}
