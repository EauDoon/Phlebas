"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#090b0f", color: "#eef1eb", fontFamily: "Segoe UI, sans-serif" }}>
        <main style={{ maxWidth: 720, padding: 28 }}>
          <p style={{ color: "#f4c95d", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 11 }}>Simulation only</p>
          <h1>The simulation failed to start</h1>
          <p>Nothing was submitted to a chain, matcher, or custody system.</p>
          <p>An unexpected rendering error occurred. No private diagnostic details are shown here.</p>
          <button type="button" onClick={reset} style={{ color: "#f4c95d", background: "transparent", border: 0, font: "inherit" }}>
            Retry
          </button>
        </main>
      </body>
    </html>
  );
}
