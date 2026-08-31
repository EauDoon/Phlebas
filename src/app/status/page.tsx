import type { Metadata } from "next";
import Link from "next/link";

import { SimulationFrame } from "@/components/simulation-frame";
import { simulationStatus } from "@/lib/status";

export const metadata: Metadata = {
  title: "Status",
  description: "Phlebas simulation status. No live funds or custody. Matcher defaults to in-browser.",
};

export default function StatusPage() {
  const status = simulationStatus();

  return (
    <SimulationFrame
      title="Simulation status"
      skipTo={{ href: "#status-ledger", label: "Skip to status ledger" }}
    >
      <p>This deployment is a no-value interface. It does not accept funds.</p>
      <dl id="status-ledger" tabIndex={-1} role="list" aria-label="Simulation status ledger">
        <div role="listitem"><dt>Mode</dt><dd>{status.mode}</dd></div>
        <div role="listitem"><dt>Live funds</dt><dd>{status.liveFunds ? "yes" : "no"}</dd></div>
        <div role="listitem"><dt>Matcher</dt><dd>{status.matcher}</dd></div>
        <div role="listitem"><dt>Matcher service</dt><dd>{status.matcherService}</dd></div>
        <div role="listitem"><dt>Custody</dt><dd>{status.custody}</dd></div>
        <div role="listitem"><dt>Deposits</dt><dd>{status.deposits}</dd></div>
        <div role="listitem"><dt>Withdrawals</dt><dd>{status.withdrawals}</dd></div>
        <div role="listitem"><dt>Wallets</dt><dd>{status.wallets}</dd></div>
        <div role="listitem"><dt>Sepolia submit</dt><dd>{status.sepoliaSubmit}</dd></div>
        <div role="listitem"><dt>Contracts</dt><dd>{status.contracts}</dd></div>
        <div role="listitem"><dt>Network</dt><dd>{status.network}</dd></div>
        <div role="listitem"><dt>Market data</dt><dd>{status.marketData}</dd></div>
        <div role="listitem"><dt>Country access</dt><dd>{status.countryAccess}</dd></div>
        <div role="listitem"><dt>Intent cap</dt><dd>{status.intentCap === null ? "unset" : status.intentCap}</dd></div>
        <div role="listitem"><dt>Sequence root</dt><dd>{status.sequenceRoot === null ? "none" : status.sequenceRoot}</dd></div>
      </dl>
      <p>
        Machine-readable copy: <a href="/api/status">/api/status</a>
        {" · "}
        <a href="/legal">Legal</a>
        {" · "}
        <a href="/security">Security</a>
      </p>
      <p>
        Boundary pages: <Link href="/legal">Legal and compliance</Link>
        {" · "}
        <Link href="/security">Security</Link>
        {" · "}
        <Link href="/trade?view=architecture">Architecture</Link>
        {" · "}
        <Link href="/#launch-gates">Launch gates</Link>
      </p>
      <p>
        Architecture includes labeled incident demonstrations for blocked access, review, reorg, planned maintenance, and unplanned maintenance. They are copy-only. This status page is not an incident feed.
      </p>
    </SimulationFrame>
  );
}
