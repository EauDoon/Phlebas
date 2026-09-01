"use client";

import { useState } from "react";

import type { Market } from "@/lib/market-data";
import {
  connectMainnetWallet,
  disconnectedWallet,
  getInjectedProvider,
  missingProviderCopy,
  publicWalletConnectionError,
  retargetSettlementCopy,
  walletConnectBarTitle,
  walletConnectFailureCopy,
  walletDisconnectLabel,
  walletStateWithSettlement,
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
  const errorCopy = wallet.error ? retargetSettlementCopy(wallet.error, settlementPair) : null;

  async function connect() {
    if (!provider) {
      onChange({ ...disconnectedWallet, error: missingProviderCopy(settlementPair) });
      return;
    }
    setBusy(true);
    try {
      onChange(walletStateWithSettlement(await connectMainnetWallet(provider), settlementPair));
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
        <span className={styles.network}><i />Ethereum Mainnet</span>
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
      <span className={styles.network}><i />Ethereum Mainnet</span>
      <button
        type="button"
        className={styles.connectButton}
        onClick={() => void connect()}
        disabled={busy}
        aria-label="Connect Ethereum Mainnet wallet"
        title={walletConnectBarTitle(settlementPair, { busy, error: errorCopy })}
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
