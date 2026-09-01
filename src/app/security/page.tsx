import type { Metadata } from "next";
import Link from "next/link";

import { SimulationFrame } from "@/components/simulation-frame";

export const metadata: Metadata = {
  title: "Security",
  description: "Phlebas security boundary. No production support commitment and no real assets.",
};

export default function SecurityPage() {
  return (
    <SimulationFrame
      title="Security"
      skipTo={{ href: "#security-article", label: "Skip to security article" }}
    >
      <article id="security-article" tabIndex={-1} aria-label="Security">
        <p>
          Phlebas has no production release and no production security support commitment.
          Do not send ZEC, USDC, USDT, or any other asset to an address from this preview.
        </p>
        <dl role="list" aria-label="Security ledger">
          <div role="listitem"><dt>Public app</dt><dd>public preview, noindex</dd></div>
          <div role="listitem"><dt>Matcher</dt><dd>in-browser; loopback operator never hosted on Vercel</dd></div>
          <div role="listitem"><dt>Keys</dt><dd>no custody, attester, governance, or deployer keys in Vercel or git</dd></div>
          <div role="listitem"><dt>Bug bounty</dt><dd>none</dd></div>
          <div role="listitem"><dt>Support</dt><dd>no production support commitment</dd></div>
        </dl>
        <p>
          Use GitHub private vulnerability reporting for the Phlebas repository when it is
          available. Do not open a public issue for an unpatched vulnerability. Do not include
          seed phrases, private keys, or credentials in a report.
        </p>
        <p>
          <Link href="/legal">Legal and compliance</Link>
          {" · "}
          <Link href="/status">Status</Link>
          {" · "}
          <Link href="/">Return home</Link>
        </p>
      </article>
    </SimulationFrame>
  );
}
