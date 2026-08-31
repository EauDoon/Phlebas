"use client";

import { SimulationFrame } from "@/components/simulation-frame";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SimulationFrame title="The simulation failed to render">
      <p>Nothing was submitted to a chain, matcher, or custody system.</p>
      <p>An unexpected rendering error occurred. No private diagnostic details are shown here.</p>
      <p>
        <button type="button" onClick={reset}>Retry</button>
      </p>
    </SimulationFrame>
  );
}
