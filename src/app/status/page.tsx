import type { Metadata } from "next";

import { SimulationFrame } from "@/components/simulation-frame";
import { simulationStatus } from "@/lib/status";

export const metadata: Metadata = {
  title: "Status",
  description: "Phlebas simulation status. No live funds, custody, or production matcher.",
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
        <div><dt>Custody</dt><dd>{status.custody}</dd></div>
        <div><dt>Deposits</dt><dd>{status.deposits}</dd></div>
        <div><dt>Withdrawals</dt><dd>{status.withdrawals}</dd></div>
        <div><dt>Wallets</dt><dd>{status.wallets}</dd></div>
        <div><dt>Contracts</dt><dd>{status.contracts}</dd></div>
      </dl>
      <p>
        Machine-readable copy: <a href="/api/status">/api/status</a>
      </p>
    </SimulationFrame>
  );
}
