"use client";

import { SimulationFrame } from "@/components/simulation-frame";
import styles from "@/components/terminal.module.css";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SimulationFrame
      title="The simulation failed to render"
      skipTo={{ href: "#retry-copy", label: "Skip to retry copy" }}
    >
      <div id="retry-copy" tabIndex={-1} aria-label="Retry copy">
        <p>Nothing was submitted to a chain, matcher, or custody system.</p>
        <p>An unexpected rendering error occurred. No private diagnostic details are shown here.</p>
        <p>
          <button type="button" className={styles.primaryAction} onClick={reset}>Retry</button>
        </p>
      </div>
    </SimulationFrame>
  );
}
