import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SimulationFrame } from "@/components/simulation-frame";
import {
  buildAtomicSwapScript,
} from "@/lib/zcash-atomic-swap.ts";
import {
  p2pkhAddress,
  p2shAddress,
  pubkeyHash160,
  VERSION_BYTES,
  type ZcashNetwork,
} from "@/lib/zcash-address.ts";
import { parseCompressedPubkey } from "@/lib/zcash-pubkey.ts";
import {
  legacyAtomicSwapScriptHex,
  previewLegacyClaimShape,
  previewLegacyFundShape,
  previewLegacyRefundShape,
} from "@/lib/zcash-wallet-adapter.ts";

export const metadata: Metadata = {
  title: "Zcash P2SH lab",
  description:
    "No-value address and atomic-swap script builder. Read-only. Signing and broadcast remain gated.",
  robots: { index: false, follow: false },
};

function isHex20(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isHex66(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{66}$/.test(value);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "0x";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function stringifyLegacyShape(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => typeof entry === "bigint" ? entry.toString() : entry);
}

function parseNetwork(value: string | undefined): ZcashNetwork {
  return value === "mainnet" ? "mainnet" : "testnet";
}

export default async function ZcashPage({
  searchParams,
}: {
  searchParams: Promise<{
    network?: string | string[];
    hash20?: string | string[];
    buyer?: string | string[];
    seller?: string | string[];
    lock?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const network = parseNetwork(Array.isArray(params.network) ? params.network[0] : params.network);
  const hash20Hex = Array.isArray(params.hash20) ? params.hash20[0] : params.hash20;
  const buyerHex = Array.isArray(params.buyer) ? params.buyer[0] : params.buyer;
  const sellerHex = Array.isArray(params.seller) ? params.seller[0] : params.seller;
  const lockStr = Array.isArray(params.lock) ? params.lock[0] : params.lock;
  if (!isHex20(hash20Hex ?? "") || !isHex66(buyerHex ?? "") || !isHex66(sellerHex ?? "")) {
    notFound();
  }
  const hash20 = hexToBytes(hash20Hex as `0x${string}`);
  const buyer = parseCompressedPubkey(hexToBytes(buyerHex as `0x${string}`));
  const seller = parseCompressedPubkey(hexToBytes(sellerHex as `0x${string}`));
  const lock = lockStr ? BigInt(lockStr) : 1_900_000_000n;
  const script = buildAtomicSwapScript({ hash20, buyerPubkey: buyer, sellerPubkey: seller, lockTime: lock });
  const scriptHex = bytesToHex(script);
  const scriptHash160 = pubkeyHash160(script);
  const p2sh = p2shAddress(scriptHash160, network);
  const fakeBuyerPubkeyHash = pubkeyHash160(hexToBytes(buyerHex as `0x${string}`));
  const p2pkh = p2pkhAddress(fakeBuyerPubkeyHash, network);
  const fund = previewLegacyFundShape({
    fundOutput: { valueZat: 1_000_000n, scriptPubKey: script },
    changeOutput: { valueZat: 0n, scriptPubKey: new Uint8Array(0) },
    lockTime: Number(lock),
  });
  const claim = previewLegacyClaimShape({
    utxo: { txid: "ab".repeat(32), vout: 0, valueZat: 1_000_000n, scriptPubKey: script },
    preimage: new Uint8Array(32),
    recipientOutput: { valueZat: 900_000n, scriptPubKey: new Uint8Array(0) },
    changeOutput: { valueZat: 100_000n, scriptPubKey: new Uint8Array(0) },
    sequence: 0xfffffffe,
  });
  const refund = previewLegacyRefundShape({
    utxo: { txid: "ab".repeat(32), vout: 0, valueZat: 1_000_000n, scriptPubKey: script },
    recipientOutput: { valueZat: 990_000n, scriptPubKey: new Uint8Array(0) },
    changeOutput: { valueZat: 10_000n, scriptPubKey: new Uint8Array(0) },
    sequence: 0xfffffffe,
  });
  const versionHex = `0x${VERSION_BYTES[`${network}_p2sh`].toString(16).padStart(4, "0")}`;
  const hashAtomic = legacyAtomicSwapScriptHex({ hash20, buyerPubkey: buyer, sellerPubkey: seller, lockTime: lock });

  return (
    <SimulationFrame
      title="Zcash P2SH lab"
      skipTo={{ href: "#zcash-ledger", label: "Skip to Zcash ledger" }}
    >
      <p data-testid="zcash-simulation-notice">
        This is a no-value simulation of the Zcash side of the atomic swap. The address
        encoder and script builder are key-independent. The displayed fund, claim, and refund
        values are legacy synthetic incomplete shapes, not Zcash transactions or wallet inputs.
        No signing or broadcast happens on this page.
      </p>

      <dl id="zcash-ledger" tabIndex={-1} role="list" aria-label="Zcash ledger">
        <div role="listitem">
          <dt>Network</dt>
          <dd>{network}</dd>
        </div>
        <div role="listitem">
          <dt>Hash 20</dt>
          <dd>
            <code data-testid="zcash-hash20">{hash20Hex}</code>
          </dd>
        </div>
        <div role="listitem">
          <dt>Buyer pubkey</dt>
          <dd>
            <code data-testid="zcash-buyer">{buyerHex}</code>
          </dd>
        </div>
        <div role="listitem">
          <dt>Seller pubkey</dt>
          <dd>
            <code data-testid="zcash-seller">{sellerHex}</code>
          </dd>
        </div>
        <div role="listitem">
          <dt>Lock time</dt>
          <dd data-testid="zcash-lock">{lock.toString()}</dd>
        </div>
        <div role="listitem">
          <dt>Version bytes</dt>
          <dd>
            <code data-testid="zcash-version">{versionHex}</code>
          </dd>
        </div>
        <div role="listitem">
          <dt>Script</dt>
          <dd>
            <code data-testid="zcash-script">{scriptHex}</code>
          </dd>
        </div>
        <div role="listitem">
          <dt>Script hash 20</dt>
          <dd>
            <code data-testid="zcash-script-hash20">{bytesToHex(scriptHash160)}</code>
          </dd>
        </div>
        <div role="listitem">
          <dt>P2SH address</dt>
          <dd>
            <code data-testid="zcash-p2sh">{p2sh}</code>
          </dd>
        </div>
        <div role="listitem">
          <dt>Demo P2PKH (buyer)</dt>
          <dd>
            <code data-testid="zcash-p2pkh">{p2pkh}</code>
          </dd>
        </div>
      </dl>

      <h2>Legacy synthetic shapes</h2>
      <ul role="list" aria-label="Legacy synthetic incomplete shapes">
        <li role="listitem">
          <strong>Fund:</strong> <code data-testid="zcash-tx-fund">{stringifyLegacyShape(fund)}</code>
        </li>
        <li role="listitem">
          <strong>Claim:</strong> <code data-testid="zcash-tx-claim">{stringifyLegacyShape(claim)}</code>
        </li>
        <li role="listitem">
          <strong>Refund:</strong> <code data-testid="zcash-tx-refund">{stringifyLegacyShape(refund)}</code>
        </li>
      </ul>

      <h2>Replay this surface</h2>
      <p>
        Append the URL parameters to reproduce this view:
        <code data-testid="zcash-replay-query">
          {`?network=${network}&hash20=${hash20Hex}&buyer=${buyerHex}&seller=${sellerHex}&lock=${lock}`}
        </code>
      </p>
      <p>
        The atomic-swap script hash is{" "}
        <code data-testid="zcash-atomic-hash">{hashAtomic}</code> (deterministic across repeated
        calls to this legacy script helper). It is not transaction or wallet evidence.
      </p>
    </SimulationFrame>
  );
}
