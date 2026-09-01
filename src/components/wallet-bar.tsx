"use client";

import { useState } from "react";

import type { Market } from "@/lib/market-data";
import {
  connectTestnetWallet,
  disconnectedWallet,
  getInjectedProvider,
  missingProviderCopy,
  publicWalletConnectionError,
  retargetSettlementCopy,
  walletConnectBarTitle,
  walletConnectFailureCopy,
  walletDisconnectLabel,
  walletOffTitle,
  walletStateWithSettlement,
  type WalletState,
} from "@/lib/evm-wallet";
import { walletConnectEnabled } from "@/lib/sepolia-submit";

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
  // No injected EVM wallet. Arbitrum Sepolia only. is intentionally produced by missingProviderCopy.
  const [busy, setBusy] = useState(false);
  const provider = getInjectedProvider();
  const connectEnabled = walletConnectEnabled();
  const errorCopy = wallet.error ? retargetSettlementCopy(wallet.error, settlementPair) : null;

  async function connect() {
    if (!connectEnabled) {
      return;
    }
    if (!provider) {
      onChange({ ...disconnectedWallet, error: missingProviderCopy(settlementPair) });
      return;
    }
    setBusy(true);
    try {
      onChange(walletStateWithSettlement(await connectTestnetWallet(provider), settlementPair));
    } catch (error) {
      onChange({
        ...disconnectedWallet,
        error: walletConnectFailureCopy(
          publicWalletConnectionError(error),
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
        <button
          type="button"
          className={styles.connectButton}
          onClick={() => onChange(disconnectedWallet)}
          aria-label={walletDisconnectLabel(wallet.address, settlementPair)}
        >
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
        disabled={!connectEnabled || busy}
        aria-label="Connect Arbitrum Sepolia wallet"
        title={connectEnabled ? walletConnectBarTitle(settlementPair, { busy, error: errorCopy }) : walletOffTitle(settlementPair)}
      >
        {busy ? "Connecting" : "Connect wallet"}
      </button>
      {wallet.error && (
        <span className={styles.inlineNotice} role="status" aria-label="Wallet connection rejection">
          {errorCopy}
        </span>
      )}
    </div>
  );
}
