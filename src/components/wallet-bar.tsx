"use client";

import { useState } from "react";

import {
  connectTestnetWallet,
  disconnectedWallet,
  getInjectedProvider,
  type WalletState,
} from "@/lib/evm-wallet";

import styles from "./terminal.module.css";

export function WalletBar({
  wallet,
  onChange,
}: {
  wallet: WalletState;
  onChange: (state: WalletState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const provider = getInjectedProvider();

  async function connect() {
    if (!provider) {
      onChange({ ...disconnectedWallet, error: "No injected EVM wallet. Arbitrum Sepolia only." });
      return;
    }
    setBusy(true);
    try {
      onChange(await connectTestnetWallet(provider));
    } catch (error) {
      onChange({
        ...disconnectedWallet,
        error: error instanceof Error ? error.message : "Wallet connection failed.",
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
      {wallet.error && <span className={styles.srOnly}>{wallet.error}</span>}
    </div>
  );
}
