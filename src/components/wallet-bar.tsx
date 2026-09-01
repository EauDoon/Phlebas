"use client";

import { useEffect, useRef, useState } from "react";

import {
  discoverEip6963Providers,
  type Eip6963ProviderDetail,
} from "@/lib/evm-provider-discovery";
import type { Market } from "@/lib/market-data";
import {
  assertConnectedWalletAuthority,
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
import {
  WALLET_SESSION_EVENTS_REQUIRED_COPY,
  subscribeReviewedWalletSession,
  supportsWalletSessionEvents,
  walletSessionInvalidationCopy,
  type WalletSessionSubscription,
} from "@/lib/evm-wallet-session";
import { shortenEvmDisplay } from "@/lib/wallet-bar-copy";

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
  const [providers, setProviders] = useState<readonly Eip6963ProviderDetail[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const session = useRef<WalletSessionSubscription | null>(null);
  const connectionGeneration = useRef(0);
  const errorCopy = wallet.error ? retargetSettlementCopy(wallet.error, settlementPair) : null;

  useEffect(() => {
    let active = true;
    void discoverEip6963Providers().then((discovered) => {
      if (!active) return;
      setProviders(discovered);
      setSelectedProviderId((selected) => (
        selected && discovered.some((entry) => entry.info.uuid === selected)
          ? selected
          : (discovered[0]?.info.uuid ?? null)
      ));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    connectionGeneration.current += 1;
    session.current?.dispose();
    session.current = null;
    onChange(disconnectedWallet);
  }, [onChange]);

  function invalidateConnection(): number {
    connectionGeneration.current += 1;
    session.current?.dispose();
    session.current = null;
    return connectionGeneration.current;
  }

  function selectProvider(entries: readonly Eip6963ProviderDetail[]): Eip6963ProviderDetail | null {
    return entries.find((entry) => entry.info.uuid === selectedProviderId) ?? entries[0] ?? null;
  }

  async function connect() {
    const generation = invalidateConnection();
    setBusy(true);
    try {
      let discovered = providers;
      if (discovered.length === 0) {
        discovered = await discoverEip6963Providers();
        if (connectionGeneration.current !== generation) return;
        setProviders(discovered);
        if (discovered.length > 0) setSelectedProviderId(discovered[0]!.info.uuid);
      }
      const provider = selectProvider(discovered)?.provider ?? getInjectedProvider();
      if (!provider) {
        onChange({ ...disconnectedWallet, error: missingProviderCopy(settlementPair) });
        return;
      }
      const connected = await connectMainnetWallet(provider);
      if (connectionGeneration.current !== generation) return;
      if (connected.error || !connected.address) {
        onChange(walletStateWithSettlement(connected, settlementPair));
        return;
      }
      if (!supportsWalletSessionEvents(provider)) {
        onChange({
          ...disconnectedWallet,
          error: walletConnectFailureCopy(WALLET_SESSION_EVENTS_REQUIRED_COPY, settlementPair),
        });
        return;
      }
      let watched: WalletSessionSubscription | null = null;
      watched = subscribeReviewedWalletSession(
        provider,
        { account: connected.address, chainId: "0x1" },
        (invalidation) => {
          if (connectionGeneration.current !== generation || session.current !== watched) return;
          connectionGeneration.current += 1;
          session.current = null;
          setBusy(false);
          onChange({
            ...disconnectedWallet,
            error: walletConnectFailureCopy(
              walletSessionInvalidationCopy(invalidation),
              settlementPair,
            ),
          });
        },
      );
      session.current = watched;
      await assertConnectedWalletAuthority(provider, connected.address, 1n);
      if (connectionGeneration.current !== generation || !watched.isValid()) {
        watched.dispose();
        if (session.current === watched) session.current = null;
        return;
      }
      onChange(connected);
    } catch (error) {
      if (connectionGeneration.current !== generation) return;
      session.current?.dispose();
      session.current = null;
      onChange({
        ...disconnectedWallet,
        error: walletConnectFailureCopy(
          publicWalletConnectionError(error),
          settlementPair,
        ),
      });
    } finally {
      if (connectionGeneration.current === generation) setBusy(false);
    }
  }

  const connectedAddress = wallet.address && !wallet.error ? wallet.address : null;

  return (
    <div className={styles.headerActions} role="group" aria-label="Wallet">
      <span className={styles.network}>Ethereum Mainnet</span>
      {connectedAddress ? (
        <button
          type="button"
          className={styles.connectButton}
          onClick={() => {
            invalidateConnection();
            onChange(disconnectedWallet);
          }}
          aria-label={walletDisconnectLabel(connectedAddress, settlementPair)}
        >
          {shortenEvmDisplay(connectedAddress)}
        </button>
      ) : (
        <>
          {providers.length > 1 ? (
            <div className={styles.inputShell}>
              <select
                aria-label="EVM wallet provider"
                value={selectedProviderId ?? providers[0]?.info.uuid}
                onChange={(event) => setSelectedProviderId(event.currentTarget.value)}
                disabled={busy}
              >
                {providers.map((entry) => (
                  <option key={entry.info.uuid} value={entry.info.uuid}>
                    {entry.info.name} ({entry.info.rdns})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            type="button"
            className={styles.connectButton}
            onClick={() => void connect()}
            disabled={busy}
            aria-busy={busy || undefined}
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
        </>
      )}
    </div>
  );
}
