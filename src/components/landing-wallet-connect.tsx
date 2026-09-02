"use client";

import { useEffect, useRef, useState } from "react";

import { disconnectedWallet, type WalletState } from "@/lib/evm-wallet";
import type { Market } from "@/lib/market-data";

import { WalletBar } from "./wallet-bar";
import styles from "./landing.module.css";

export function LandingWalletConnect() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [wallet, setWallet] = useState<WalletState>(disconnectedWallet);
  const [settlementPair, setSettlementPair] = useState<Market["settlementPair"]>("ZEC-USDC");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [open]);

  function close() {
    dialogRef.current?.close();
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.walletTrigger}
        aria-haspopup="dialog"
        aria-controls="landing-wallet-dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className={styles.walletTriggerDot} aria-hidden="true" />
        {wallet.address ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}` : "Connect"}
      </button>

      <dialog
        ref={dialogRef}
        id="landing-wallet-dialog"
        className={styles.walletDialogBackdrop}
        aria-labelledby="landing-wallet-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
          <div
            className={styles.walletDialog}
          >
            <div className={styles.walletDialogHeader}>
              <div>
                <span className={styles.eyebrow}>Wallet access</span>
                <h2 id="landing-wallet-title">Connect wallets</h2>
              </div>
              <button ref={closeRef} type="button" onClick={close} aria-label="Close wallet dialog">Close</button>
            </div>

            <div className={styles.walletOptions}>
              <section aria-labelledby="zec-wallet-heading">
                <div className={styles.walletOptionTitle}>
                  <span className={styles.walletAssetMark} aria-hidden="true">Z</span>
                  <div>
                    <h3 id="zec-wallet-heading">Transparent ZEC wallet</h3>
                    <p>Zcash Mainnet</p>
                  </div>
                </div>
                <p id="zec-wallet-status">
                  No ZEC wallet adapter is qualified for this public preview. Wallet-held funding,
                  claim, and refund actions stay disabled until an adapter passes qualification.
                </p>
                <button type="button" disabled aria-describedby="zec-wallet-status">
                  ZEC connector unavailable
                </button>
              </section>

              <section aria-labelledby="evm-wallet-heading">
                <div className={styles.walletOptionTitle}>
                  <span className={`${styles.walletAssetMark} ${styles.ethereumMark}`} aria-hidden="true">E</span>
                  <div>
                    <h3 id="evm-wallet-heading">Ethereum wallet</h3>
                    <p>MetaMask or Rabby on Ethereum Mainnet</p>
                  </div>
                </div>
                <p>
                  Connect an injected EIP-6963 wallet for USDC or USDT review. Signing, token
                  approval, submission, and value movement remain disabled. The terminal asks you
                  to reconnect after navigation so it can revalidate the Ethereum account and network.
                </p>
                <label className={styles.walletMarketSelect}>
                  <span>Settlement market</span>
                  <select
                    value={settlementPair}
                    onChange={(event) => setSettlementPair(event.currentTarget.value as Market["settlementPair"])}
                  >
                    <option value="ZEC-USDC">ZEC / USDC</option>
                    <option value="ZEC-USDT">ZEC / USDT</option>
                  </select>
                </label>
                <WalletBar wallet={wallet} onChange={setWallet} settlementPair={settlementPair} />
              </section>
            </div>

            <p className={styles.walletDisclosure}>
              Phlebas does not ask for seed phrases, spending keys, viewing keys, or private keys.
            </p>
          </div>
      </dialog>
    </>
  );
}
