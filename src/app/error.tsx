"use client";

import { SimulationFrame } from "@/components/simulation-frame";
import styles from "@/components/terminal.module.css";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SimulationFrame title="The simulation failed to render">
      <p>Nothing was submitted to a chain, matcher, or custody system.</p>
      <p>{error.message || "An unexpected rendering error occurred."}</p>
      <p>
        <button type="button" className={styles.primaryAction} onClick={reset}>Retry</button>
      </p>
    </SimulationFrame>
  );
}
