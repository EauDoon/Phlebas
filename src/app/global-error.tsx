"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0a0908", color: "#f3efe6", fontFamily: "Segoe UI, sans-serif" }}>
        <style>{`
          nav[aria-label="Skip links"] {
            display: flex;
            flex-wrap: wrap;
            column-gap: 8px;
            row-gap: 8px;
            box-sizing: border-box;
            width: 100%;
            max-width: 100%;
            padding: 8px;
          }
          nav[aria-label="Skip links"] a {
            box-sizing: border-box;
            flex: 1 1 calc(50% - 4px);
            max-width: min(100%, calc(50% - 4px));
            min-width: 44px;
            min-height: 44px;
          }
          nav[aria-label="Skip links"] a:last-child {
            min-width: 44px;
            min-height: 44px;
            flex-shrink: 0;
          }
          nav[aria-label="Skip links"] a:focus-visible {
            outline: 2px solid #161204;
            outline-offset: 2px;
          }
        `}</style>
        <nav aria-label="Skip links">
          <a
            href="#main-content"
            style={{
              display: "inline-flex",
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              padding: "9px 12px",
              color: "#161204",
              background: "#f0c14b",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Skip to main content
          </a>
          <a
            href="#retry-copy"
            style={{
              display: "inline-flex",
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              padding: "9px 12px",
              color: "#161204",
              background: "#f0c14b",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Skip to retry copy
          </a>
        </nav>
        <main id="main-content" tabIndex={-1} style={{ maxWidth: 720, padding: 28 }}>
          <p style={{ color: "#f0c14b", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 11 }}>Public preview</p>
          <h1>The page failed to start</h1>
          <p>Nothing was submitted to a chain, matcher, or custody system.</p>
          <p>An unexpected rendering error occurred. No private diagnostic details are shown here.</p>
          <div id="retry-copy" tabIndex={-1} aria-label="Retry copy">
            <button
              type="button"
              onClick={reset}
              style={{
                display: "inline-flex",
                minWidth: 44,
                minHeight: 44,
                alignItems: "center",
                color: "#f0c14b",
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
