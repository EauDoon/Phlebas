import type { Metadata } from "next";
import Link from "next/link";

import { SimulationFrame } from "@/components/simulation-frame";
import { COUNTRY_ACCESS } from "@/lib/country-access";

export const metadata: Metadata = {
  title: "Legal and compliance",
  description: "Phlebas simulation legal boundary. No licensed entity is operating and no financial service is offered.",
};

export default function LegalPage() {
  const access = COUNTRY_ACCESS.default === "deny" && COUNTRY_ACCESS.enabled.length === 0
    ? "deny by default, empty enable list"
    : "misconfigured";

  return (
    <SimulationFrame title="Legal and compliance">
      <p>
        Phlebas is a protocol preview, not a live exchange or an offer of financial services.
        No licensed entity is operating this interface. Nothing here can be bought, sold,
        deposited, withdrawn, or redeemed.
      </p>
      <dl>
        <div><dt>Offer</dt><dd>none</dd></div>
        <div><dt>Licensed operator</dt><dd>none</dd></div>
        <div><dt>Country access</dt><dd>{access}</dd></div>
        <div><dt>Custody</dt><dd>not operating</dd></div>
        <div><dt>Advice</dt><dd>product copy, not legal advice</dd></div>
      </dl>
      <p>
        Mainnet and real assets stay blocked until entity, licensing, custody, reserve,
        signer, audit, market-integrity, jurisdiction, insurance, monitoring, and incident
        gates have current written evidence.
      </p>
      <p>
        <Link href="/trade?view=architecture">Architecture</Link>
        {" · "}
        <Link href="/security">Security</Link>
        {" · "}
        <Link href="/status">Status</Link>
      </p>
    </SimulationFrame>
  );
}
