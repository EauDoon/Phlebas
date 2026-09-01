"use client";

import { SimulationFrame } from "@/components/simulation-frame";
import styles from "@/components/terminal.module.css";
import { stripRenderFailureSearch } from "@/lib/render-demo";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  function retry() {
    if (typeof window !== "undefined") {
      const nextSearch = stripRenderFailureSearch(window.location.search);
      if (nextSearch !== window.location.search) {
        window.location.replace(`${window.location.pathname}${nextSearch}${window.location.hash}`);
        return;
      }
    }
    reset();
  }

  return (
    <SimulationFrame
      title="The simulation failed to render"
      skipTo={{ href: "#retry-copy", label: "Skip to retry copy" }}
    >
      <div id="retry-copy" tabIndex={-1} aria-label="Retry copy">
        <p>Nothing was submitted to a chain, matcher, or custody system.</p>
        <p>{error.message || "An unexpected rendering error occurred."}</p>
        <p>
          <button type="button" className={styles.primaryAction} onClick={retry}>Retry</button>
        </p>
      </div>
    </SimulationFrame>
  );
}
