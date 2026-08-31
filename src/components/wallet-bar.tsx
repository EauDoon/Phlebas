"use client";

import { useState } from "react";

import type { Market } from "@/lib/market-data";
import {
  connectTestnetWallet,
  disconnectedWallet,
  getInjectedProvider,
  missingProviderCopy,
  walletConnectFailureCopy,
  type WalletState,
} from "@/lib/evm-wallet";

import styles from "./terminal.module.css";

export function WalletBar({
  wallet,
  onChange,
  settlementPair,
}: {
  wallet: WalletState;
  onChange: (state: WalletState) => void;
  settlementPair: Market["settlementPair"];
}) {
  const [busy, setBusy] = useState(false);
  const provider = getInjectedProvider();

  async function connect() {
    if (!provider) {
      onChange({ ...disconnectedWallet, error: missingProviderCopy(settlementPair) });
      return;
    }
    setBusy(true);
    try {
      const next = await connectTestnetWallet(provider);
      onChange(next.error
        ? { ...next, error: walletConnectFailureCopy(next.error, settlementPair) }
        : next);
    } catch (error) {
      onChange({
        ...disconnectedWallet,
        error: walletConnectFailureCopy(
          error instanceof Error ? error.message : "Wallet connection failed.",
          settlementPair,
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  if (wallet.address && !wallet.error) {
    return (
      <div className={styles.headerActions}>
        <span className={styles.network}><i />Arbitrum Sepolia</span>
        <button type="button" className={styles.connectButton} onClick={() => onChange(disconnectedWallet)}>
          {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.headerActions}>
      <span className={styles.network}><i />Arbitrum Sepolia</span>
      <button
        type="button"
        className={styles.connectButton}
        onClick={() => void connect()}
        disabled={busy}
        aria-label="Connect Arbitrum Sepolia wallet"
        title={wallet.error ?? "Connect an injected EVM wallet on Arbitrum Sepolia"}
      >
        {busy ? "Connecting" : "Connect wallet"}
      </button>
      {wallet.error && (
        <span className={styles.inlineNotice} role="status">
          {wallet.error}
        </span>
      )}
    </div>
  );
}
