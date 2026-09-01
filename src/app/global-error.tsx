"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#070b0c", color: "#e7eef0", fontFamily: "Segoe UI, sans-serif" }}>
        <a
          href="#retry-copy"
          style={{
            display: "inline-flex",
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            padding: "9px 12px",
            color: "#042f2e",
            background: "#2dd4bf",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Skip to retry copy
        </a>
        <main style={{ maxWidth: 720, padding: 28 }}>
          <p style={{ color: "#2dd4bf", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 11 }}>Simulation only</p>
          <h1>The simulation failed to start</h1>
          <p>Nothing was submitted to a chain, matcher, or custody system.</p>
          <p>{error.message || "An unexpected rendering error occurred."}</p>
          <div id="retry-copy" tabIndex={-1} aria-label="Retry copy">
            <button
              type="button"
              onClick={reset}
              style={{
                display: "inline-flex",
                minWidth: 44,
                minHeight: 44,
                alignItems: "center",
                color: "#2dd4bf",
                background: "transparent",
                border: 0,
                font: "inherit",
              }}
            >
              Retry
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
