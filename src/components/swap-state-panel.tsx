"use client";

import { useState } from "react";

import {
  generatePreimage,
  hashPreimage,
  isValidPreimage,
  type Hex32,
} from "@/lib/preimage.ts";

type PreimageState =
  | { kind: "empty" }
  | { kind: "generating" }
  | { kind: "ready"; preimage: Hex32; hash: Hex32 }
  | { kind: "error"; message: string };

export function SwapPreimagePanel() {
  const [state, setState] = useState<PreimageState>({ kind: "empty" });
  const [pasteValue, setPasteValue] = useState("");

  async function onGenerate(): Promise<void> {
    setState({ kind: "generating" });
    try {
      const preimage = generatePreimage();
      const hash = await hashPreimage(preimage);
      setState({ kind: "ready", preimage, hash });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preimage generation failed";
      setState({ kind: "error", message });
    }
  }

  async function onVerify(): Promise<void> {
    if (state.kind !== "ready") return;
    if (!isValidPreimage(pasteValue)) {
      setState({ kind: "error", message: "Pasted preimage must be 32 bytes of hex" });
      return;
    }
    if (pasteValue.toLowerCase() !== state.preimage) {
      setState({ kind: "error", message: "Pasted preimage does not match the active one" });
      return;
    }
  }

  if (state.kind === "ready") {
    return (
      <div className="swap-preimage" role="group" aria-label="Preimage and hash">
        <p>Preimage (32 bytes, keep secret until the ZEC claim is broadcast)</p>
        <code className="swap-preimage__bytes" data-testid="swap-preimage-bytes">
          {state.preimage}
        </code>
        <p>SHA-256 hash (the value bound on both legs)</p>
        <code className="swap-preimage__bytes" data-testid="swap-preimage-hash">
          {state.hash}
        </code>
        <label className="swap-preimage__verify">
          <span>Paste the preimage to verify a round-trip</span>
          <input
            type="text"
            inputMode="text"
            spellCheck={false}
            autoComplete="off"
            value={pasteValue}
            onChange={(event) => setPasteValue(event.target.value)}
            aria-label="Paste preimage to verify"
          />
        </label>
        <button type="button" onClick={onVerify} className="swap-preimage__button">
          Verify preimage
        </button>
        <button
          type="button"
          onClick={() => {
            setState({ kind: "empty" });
            setPasteValue("");
          }}
          className="swap-preimage__button"
        >
          Clear preimage
        </button>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="swap-preimage" role="alert">
        <p>Preimage error: {state.message}</p>
        <button type="button" onClick={onGenerate} className="swap-preimage__button">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="swap-preimage">
      <p>
        Generate the preimage in this browser. The same preimage and the same hash are
        used on the EVM leg and the ZEC leg. The preimage never leaves this browser until
        your wallet signs a ZEC claim.
      </p>
      <button
        type="button"
        onClick={onGenerate}
        className="swap-preimage__button"
        disabled={state.kind === "generating"}
      >
        {state.kind === "generating" ? "Generating..." : "Generate preimage"}
      </button>
    </div>
  );
}
