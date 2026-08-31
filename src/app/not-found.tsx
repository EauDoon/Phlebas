import Link from "next/link";

import { SimulationFrame } from "@/components/simulation-frame";

export default function NotFound() {
  return (
    <SimulationFrame
      title="Page not found"
      skipTo={{ href: "#missing-route", label: "Skip to missing-route copy" }}
    >
      <article id="missing-route" tabIndex={-1} aria-label="Missing-route copy">
        <p>That route is not part of the Phlebas simulation.</p>
        <p>
          <Link href="/">Return home</Link>
          {" · "}
          <Link href="/trade?view=trade">Open the trading terminal</Link>
        </p>
      </article>
    </SimulationFrame>
  );
}
