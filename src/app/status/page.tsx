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
    <SimulationFrame title="Simulation status">
      <p>This deployment is a no-value interface. It does not accept funds.</p>
      <dl>
        <div><dt>Mode</dt><dd>{status.mode}</dd></div>
        <div><dt>Live funds</dt><dd>{status.liveFunds ? "yes" : "no"}</dd></div>
        <div><dt>Matcher</dt><dd>{status.matcher}</dd></div>
        <div><dt>Matcher service</dt><dd>{status.matcherService}</dd></div>
        <div><dt>Custody</dt><dd>{status.custody}</dd></div>
        <div><dt>Deposits</dt><dd>{status.deposits}</dd></div>
        <div><dt>Withdrawals</dt><dd>{status.withdrawals}</dd></div>
        <div><dt>Wallets</dt><dd>{status.wallets}</dd></div>
        <div><dt>Sepolia submit</dt><dd>{status.sepoliaSubmit}</dd></div>
        <div><dt>Contracts</dt><dd>{status.contracts}</dd></div>
        <div><dt>Network</dt><dd>{status.network}</dd></div>
        <div><dt>Market data</dt><dd>{status.marketData}</dd></div>
        <div><dt>Country access</dt><dd>{status.countryAccess}</dd></div>
        <div><dt>Intent cap</dt><dd>{status.intentCap === null ? "unset" : status.intentCap}</dd></div>
        <div><dt>Sequence root</dt><dd>{status.sequenceRoot === null ? "none" : status.sequenceRoot}</dd></div>
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
