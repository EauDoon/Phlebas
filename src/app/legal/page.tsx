import type { Metadata } from "next";
import Link from "next/link";

import { SiteChrome } from "@/components/site-chrome";
import { SITE_FOOTER_SENTENCE } from "@/components/site-footer";
import { COUNTRY_ACCESS } from "@/lib/country-access";

export const metadata: Metadata = {
  title: "Legal and compliance",
  description: "Phlebas legal boundary. No licensed entity is operating and no financial service is offered.",
};

export default function LegalPage() {
  const access = COUNTRY_ACCESS.default === "deny" && COUNTRY_ACCESS.enabled.length === 0
    ? "deny by default, empty enable list"
    : "misconfigured";

  return (
    <SiteChrome
      title="Legal and compliance"
      skipTo={{ href: "#legal-article", label: "Skip to legal article" }}
    >
      <article id="legal-article" tabIndex={-1} aria-label="Legal and compliance">
        <p>
          {SITE_FOOTER_SENTENCE}{" "}
          No licensed entity is operating this interface. Nothing here can be bought, sold,
          deposited, withdrawn, or redeemed.
        </p>
        <dl role="list" aria-label="Legal and compliance ledger">
          <div role="listitem"><dt>Offer</dt><dd>none</dd></div>
          <div role="listitem"><dt>Licensed operator</dt><dd>none</dd></div>
          <div role="listitem"><dt>Country access</dt><dd>{access}</dd></div>
          <div role="listitem"><dt>Custody</dt><dd>not operating</dd></div>
          <div role="listitem"><dt>Advice</dt><dd>product copy, not legal advice</dd></div>
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
      </article>
    </SiteChrome>
  );
}
