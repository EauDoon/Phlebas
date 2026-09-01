"use client";

import { useEffect, useRef, useState } from "react";

import type { MarketId } from "@/lib/market-data";

import {
  advanceNativeSwapFixture,
  createNativeSwapFixture,
  nativeSwapAction,
  nativeSwapEvidence,
  nativeSwapFixtureTerms,
  nativeSwapPhaseCopy,
  nativeSwapScenarios,
  type NativeSwapFixture,
  type NativeSwapScenario,
} from "./native-swap-fixtures";
import styles from "./terminal.module.css";

const progressSteps = [
  ["01", "Terms", "Review the exact fixture terms"],
  ["02", "ZEC lock", "Prepare and record the longer lock"],
  ["03", "ZEC finality", "Confirm approved fixture evidence"],
  ["04", "USDC lock", "Prepare and record the shorter lock"],
  ["05", "Claim or refund", "Follow one mutually exclusive path"],
  ["06", "Complete", "Reach a terminal fixture state"],
] as const;

function formatFixtureTime(value: bigint) {
  return `${value.toString()} fixture unix seconds`;
}

export function NativeSwapPanel({
  marketId,
  onMarketChange,
}: {
  marketId: MarketId;
  onMarketChange: (marketId: MarketId) => void;
}) {
  const [scenario, setScenario] = useState<NativeSwapScenario>("happy");
  const [fixture, setFixture] = useState<NativeSwapFixture>(() => createNativeSwapFixture(marketId));
  const [announcement, setAnnouncement] = useState("Matched fixture ready for review.");
  const phaseHeading = useRef<HTMLHeadingElement>(null);
  const shouldFocusPhase = useRef(false);

  useEffect(() => {
    if (!shouldFocusPhase.current) return;
    shouldFocusPhase.current = false;
    phaseHeading.current?.focus();
  }, [fixture]);

  function replaceFixture(nextFixture: NativeSwapFixture, message: string) {
    shouldFocusPhase.current = true;
    setFixture(nextFixture);
    setAnnouncement(message);
  }

  function selectScenario(nextScenario: NativeSwapScenario) {
    setScenario(nextScenario);
    replaceFixture(
      createNativeSwapFixture(marketId, nextScenario),
      `${nativeSwapScenarios.find((item) => item.id === nextScenario)?.label ?? "Fixture"} scenario loaded.`,
    );
  }

  function resetFixture() {
    setScenario("happy");
    replaceFixture(createNativeSwapFixture(marketId), "Native swap fixture reset to the matched state.");
  }

  if (fixture.availability === "disabled") {
    const disabledReasonId = "native-swap-disabled-reason";
    return (
      <div className={styles.featureGrid}>
        <section className={`${styles.panel} ${styles.featurePrimary}`} aria-labelledby="native-swap-title">
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Fixture only</span>
              <h2 id="native-swap-title" ref={phaseHeading} tabIndex={-1}>USDT matcher undeployed</h2>
            </div>
            <span className={styles.warningPill}>Funding disabled</span>
          </div>
          <p className={styles.featureLead}>
            The exact Ethereum Mainnet USDT identity is bound separately from USDC.
            Its matcher, lock deployment, wallet actions, and observation policy remain disabled.
          </p>
          <div className={styles.settlementToolbar}>
            <label>
              <span>Native settlement market</span>
              <select
                aria-label="Selected native settlement market"
                value={marketId}
                onChange={(event) => onMarketChange(event.target.value as MarketId)}
              >
                <option value="ZEC/USDC">ZEC / USDC</option>
                <option value="ZEC/USDT">ZEC / USDT</option>
              </select>
            </label>
          </div>
          <div className={`${styles.settlementActionCard} ${styles.settlementUnavailable}`}>
            <p id={disabledReasonId}>{fixture.reason}</p>
            <button
              type="button"
              className={styles.primaryAction}
              disabled
              aria-describedby={disabledReasonId}
            >
              Fixture action disabled
            </button>
          </div>
        </section>
        <aside className={`${styles.panel} ${styles.riskCard}`} aria-labelledby="usdt-boundary-title">
          <span className={styles.eyebrow}>Listing boundary</span>
          <h2 id="usdt-boundary-title">USDT is not USDT0.</h2>
          <p>Network, token contract, decimals, and settlement policy must bind one exact asset identity.</p>
          <ul className={styles.cleanList}>
            <li>No USDT fixture terms were generated.</li>
            <li>No wallet or transaction control is available.</li>
            <li>Select ZEC / USDC to inspect the currently implemented walkthrough.</li>
          </ul>
        </aside>
      </div>
    );
  }

  const { session } = fixture;
  const phase = nativeSwapPhaseCopy(session);
  const action = nativeSwapAction(session);
  const evidence = nativeSwapEvidence(session);
  const disabledReasonId = action.disabledReason ? "native-swap-action-disabled" : undefined;
  const dispute = session.state.disputes.at(-1);

  function advanceFixture() {
    if (!action.enabled) return;
    const result = advanceNativeSwapFixture(session);
    replaceFixture({ availability: "ready", session: result.session }, result.announcement);
  }

  return (
    <div className={styles.featureGrid}>
      <section className={`${styles.panel} ${styles.featurePrimary}`} aria-labelledby="native-swap-title">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Fixture only</span>
            <h2 id="native-swap-title" ref={phaseHeading} tabIndex={-1}>Native ZEC atomic swap</h2>
          </div>
          <span className={styles.warningPill}>No value</span>
        </div>

        <p className={styles.featureLead}>
          Deterministic fixture terms show the intended lock, claim, and refund sequence.
          Wallets, contracts, deadlines, observers, and live services are not approved by this walkthrough.
        </p>

        <div className={styles.settlementToolbar}>
          <label>
            <span>Native settlement market</span>
            <select
              aria-label="Selected native settlement market"
              value={marketId}
              onChange={(event) => onMarketChange(event.target.value as MarketId)}
            >
              <option value="ZEC/USDC">ZEC / USDC</option>
              <option value="ZEC/USDT">ZEC / USDT</option>
            </select>
          </label>
          <label>
            <span>Fixture scenario</span>
            <select
              aria-label="Fixture scenario"
              value={scenario}
              onChange={(event) => selectScenario(event.target.value as NativeSwapScenario)}
            >
              {nativeSwapScenarios.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>

        <ol className={styles.settlementSteps} aria-label="Native swap fixture progress">
          {progressSteps.map(([number, label, detail], index) => (
            <li
              key={number}
              data-state={index < phase.stage ? "complete" : index === phase.stage ? "current" : "pending"}
              aria-current={index === phase.stage ? "step" : undefined}
            >
              <span aria-hidden="true">{number}</span>
              <div>
                <strong>{label}</strong>
                <small>{detail}</small>
              </div>
              {index === phase.stage && <span className={styles.srOnly}>Current step</span>}
            </li>
          ))}
        </ol>

        <div className={styles.settlementCore}>
          <section className={styles.settlementPhase} aria-labelledby="fixture-phase-title">
            <span className={styles.eyebrow}>Current fixture state</span>
            <h3 id="fixture-phase-title" ref={phaseHeading} tabIndex={-1}>{phase.title}</h3>
            <p>{phase.body}</p>
            {dispute && (
              <div className={styles.unsafeNotice} role="alert">
                <strong>Unsafe evidence</strong>
                <span>{dispute.detail} Reset the fixture before continuing.</span>
              </div>
            )}
          </section>

          <section className={styles.settlementActionCard} aria-labelledby="fixture-action-title">
            <span className={styles.eyebrow}>Next safe fixture action</span>
            <h3 id="fixture-action-title">No signing step</h3>
            <p>This control changes in-memory fixture state only. It prepares no transaction and requests no approval.</p>
            {action.disabledReason && <p id={disabledReasonId} className={styles.disabledReason}>{action.disabledReason}</p>}
            <div className={styles.settlementActions}>
              <button
                type="button"
                className={styles.primaryAction}
                disabled={!action.enabled}
                aria-describedby={disabledReasonId}
                onClick={advanceFixture}
              >
                {action.label}
              </button>
              <button type="button" className={styles.textButton} onClick={resetFixture}>Reset fixture</button>
            </div>
          </section>

          <section className={styles.refundCard} aria-labelledby="fixture-refund-title">
            <span className={styles.eyebrow}>Recovery path</span>
            <h3 id="fixture-refund-title">Later-deadline ZEC refund</h3>
            <p>
              A live implementation must preserve each wallet&apos;s signed refund path.
              The fixture will not enable a refund before the applicable deadline, and claim and refund remain mutually exclusive.
            </p>
            <dl>
              <div><dt>USDC refund</dt><dd>{formatFixtureTime(session.state.terms.evmRefundTime)}</dd></div>
              <div><dt>ZEC refund</dt><dd>{formatFixtureTime(session.state.terms.zecRefundTime)}</dd></div>
              <div><dt>Safety margin</dt><dd>600 fixture seconds</dd></div>
            </dl>
          </section>

          <section className={styles.termsCard} aria-labelledby="fixture-terms-title">
            <span className={styles.eyebrow}>Immutable fixture terms</span>
            <h3 id="fixture-terms-title">Exact assets and locks</h3>
            <dl>
              <div><dt>Exchange</dt><dd>1.00000000 transparent ZEC for 52.910000 USDC</dd></div>
              <div><dt>Zcash network</dt><dd><code>{nativeSwapFixtureTerms.zecChain}</code></dd></div>
              <div><dt>EVM network</dt><dd><code>{nativeSwapFixtureTerms.quoteChain}</code></dd></div>
              <div><dt>USDC identity</dt><dd><code>{nativeSwapFixtureTerms.quoteAsset}</code></dd></div>
              <div><dt>EVM escrow</dt><dd><code>{nativeSwapFixtureTerms.evmEscrowContract}</code></dd></div>
              <div><dt>Shared hash</dt><dd><code>{nativeSwapFixtureTerms.secretHash}</code></dd></div>
            </dl>
          </section>

          <section className={styles.evidenceCard} aria-labelledby="fixture-evidence-title">
            <span className={styles.eyebrow}>Progress evidence</span>
            <h3 id="fixture-evidence-title">Domain projection</h3>
            <div className={styles.tableScroll}>
              <table className={styles.evidenceTable}>
                <caption className={styles.srOnly}>Current deterministic native swap fixture evidence</caption>
                <tbody>
                  <tr><th scope="row">Domain phase</th><td>{evidence.domainPhase}</td></tr>
                  <tr><th scope="row">ZEC leg</th><td>{evidence.zecLeg}</td></tr>
                  <tr><th scope="row">EVM leg</th><td>{evidence.evmLeg}</td></tr>
                  <tr><th scope="row">Observer</th><td>{evidence.observerEvidence}</td></tr>
                  <tr><th scope="row">Swap ID</th><td><code>{evidence.swapId}</code></td></tr>
                  <tr><th scope="row">Terms hash</th><td><code>{evidence.termsHash}</code></td></tr>
                  <tr><th scope="row">State root</th><td><code>{evidence.stateRoot}</code></td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <p
          className={styles.srOnly}
          aria-live="polite"
          aria-atomic="true"
          data-testid="native-swap-live"
        >
          {announcement}
        </p>
      </section>

      <aside className={`${styles.panel} ${styles.riskCard}`} aria-labelledby="settlement-boundary-title">
        <span className={styles.eyebrow}>User boundary</span>
        <h2 id="settlement-boundary-title">Public chains remain linkable.</h2>
        <p>
          Transparent Zcash and EVM activity can be publicly linked through amounts, timing, recipients, and the shared preimage.
          This screen is a state walkthrough, not privacy protection.
        </p>
        <ul className={styles.cleanList}>
          <li>No wallet connection or address entry.</li>
          <li>No transaction build, signature, approval, broadcast, or API request.</li>
          <li>No pZEC. The trade, liquidity, and gateway screens remain legacy simulations.</li>
          <li>No fixture result authorizes testnet or mainnet use.</li>
        </ul>
      </aside>
    </div>
  );
}
