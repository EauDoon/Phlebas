import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteChrome } from "@/components/site-chrome";
import {
  buildAtomicSwapScript,
} from "@/lib/zcash-atomic-swap.ts";
import {
  previewLegacyClaimShape,
  previewLegacyFundShape,
  previewLegacyRefundShape,
} from "@/lib/zcash-wallet-adapter.ts";
import { parseCompressedPubkey } from "@/lib/zcash-pubkey.ts";

export const metadata: Metadata = {
  title: "Legacy Zcash HASH160 display",
  description:
    "Historical, testnet-only HASH160 display. Not a transaction, wallet, or funding surface. Not payable.",
  robots: { index: false, follow: false },
};

function isHex20(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isHex66(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{66}$/.test(value);
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
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

function parseNetwork(value: string | undefined): "testnet" {
  if (value !== undefined && value !== "testnet") notFound();
  return "testnet";
}

function parseLegacyLock(value: string | undefined): bigint {
  if (value === undefined) return 1_900_000_000n;
  if (!/^[0-9]+$/.test(value)) notFound();
  const lock = BigInt(value);
  if (lock < 500_000_000n || lock > 0xffff_ffffn) notFound();
  return lock;
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
  const lock = parseLegacyLock(lockStr);
  const script = buildAtomicSwapScript({ hash20, buyerPubkey: buyer, sellerPubkey: seller, lockTime: lock });
  const scriptHex = bytesToHex(script);
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

  return (
    <SiteChrome
      title="Legacy Zcash HASH160 display"
      skipTo={{ href: "#zcash-ledger", label: "Skip to legacy display" }}
    >
      <p data-testid="zcash-preview-notice">
        This is a historical, testnet-only HASH160 display. The script and every
        fund, claim, and refund value are legacy synthetic incomplete shapes. They are not the
        canonical SHA-256 transaction lab, Zcash transactions, addresses to fund, wallet inputs,
        or signing evidence. Not payable. No signing or broadcast happens on this page.
      </p>

      <dl id="zcash-ledger" tabIndex={-1} role="list" aria-label="Zcash ledger">
        <div role="listitem">
          <dt>Network</dt>
          <dd>{network} display only</dd>
        </div>
        <div role="listitem">
          <dt>Legacy HASH160 input</dt>
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
          <dt>Legacy redeem-script bytes</dt>
          <dd>
            <code data-testid="zcash-script">{scriptHex}</code>
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
    </SiteChrome>
  );
}
