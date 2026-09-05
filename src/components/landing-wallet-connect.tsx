"use client";

import { useEffect, useRef, useState } from "react";

import { disconnectedWallet, type WalletState } from "@/lib/evm-wallet";
import type { Market } from "@/lib/market-data";
import {
  connectZecWalletSession,
  disconnectedZecSession,
  type ZecWalletSession,
} from "@/lib/zec-wallet-session";
import {
  invalidatedZecSession,
  isReviewedZecSession,
  revalidateZecIdentity,
  zecSessionPollSeconds,
  type ReviewedZecSession,
} from "@/lib/zec-wallet-session-guard";
import {
  detectZecWalletProvider,
  publicZecConnectionError,
  type ZecJsonRpcProvider,
} from "@/lib/zec-wallet-provider";

import { WalletBar } from "./wallet-bar";
import styles from "./landing.module.css";

function createZecConnectChallenge(): string {
  const nonce = new Uint8Array(16);
  window.crypto.getRandomValues(nonce);
  let encoded = "";
  for (const byte of nonce) encoded += byte.toString(16).padStart(2, "0");
  return `phlebas-connect-challenge:${encoded}`;
}

export function LandingWalletConnect() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [wallet, setWallet] = useState<WalletState>(disconnectedWallet);
  const [settlementPair, setSettlementPair] = useState<Market["settlementPair"]>("ZEC-USDC");
  const [zecProvider, setZecProvider] = useState<ZecJsonRpcProvider | null>(null);
  const [zecSession, setZecSession] = useState<ZecWalletSession>(disconnectedZecSession);
  const [zecBusy, setZecBusy] = useState(false);
  const [zecReviewed, setZecReviewed] = useState<ReviewedZecSession | null>(null);
  const zecConnectionGeneration = useRef(0);
  const zecAbortController = useRef<AbortController | null>(null);

  function invalidateZecConnection(): number {
    zecAbortController.current?.abort();
    zecAbortController.current = null;
    zecConnectionGeneration.current += 1;
    setZecReviewed(null);
    return zecConnectionGeneration.current;
  }

  useEffect(() => {
    // Deferred a frame so server-rendered markup ("no wallet detected")
    // matches the first client paint before discovery runs.
    const frame = window.requestAnimationFrame(() => {
      setZecProvider(detectZecWalletProvider(window));
    });
    return () => {
      window.cancelAnimationFrame(frame);
      zecAbortController.current?.abort();
      zecAbortController.current = null;
      zecConnectionGeneration.current += 1;
    };
  }, []);

  async function connectZec() {
    if (!zecProvider || zecBusy) return;
    const generation = invalidateZecConnection();
    const controller = new AbortController();
    zecAbortController.current = controller;
    setZecBusy(true);
    try {
      const session = await connectZecWalletSession(zecProvider, {
        challenge: createZecConnectChallenge(),
        signal: controller.signal,
      });
      if (zecConnectionGeneration.current !== generation) return;
      setZecSession(session);
      const challenge = createZecConnectChallenge();
      const proven: ReviewedZecSession = {
        session,
        challenge,
        provenAtMs: Date.now(),
      };
      setZecReviewed(isReviewedZecSession(proven) ? proven : null);
    } catch (error: unknown) {
      if (zecConnectionGeneration.current !== generation) return;
      setZecSession({
        ...disconnectedZecSession,
        state: Object.freeze({ address: null, error: publicZecConnectionError(error) }),
      });
    } finally {
      if (zecConnectionGeneration.current === generation) {
        if (zecAbortController.current === controller) zecAbortController.current = null;
        setZecBusy(false);
      }
    }
  }

  // review-7 supplementary detection: while a reviewed ZEC session exists,
  // poll wallet identity with non-interactive reads in the foreground only.
  // Hidden pages and torn-down connections stop the loop; returning to the
  // page revalidates immediately. Any drift or unreliable answer invalidates
  // the session; polling never triggers a wallet approval prompt.
  useEffect(() => {
    if (zecProvider === null || !isReviewedZecSession(zecReviewed)) return;
    const reviewed = zecReviewed;
    const pollSeconds = zecSessionPollSeconds();
    let timer: number | null = null;
    let disposed = false;
    const revalidate = async () => {
      if (!isReviewedZecSession(reviewed)) return;
      const verdict = await revalidateZecIdentity(zecProvider, reviewed);
      if (disposed) return;
      if (!verdict.ok) {
        setZecReviewed(null);
        setZecSession(invalidatedZecSession(verdict));
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void revalidate();
        if (timer === null) timer = window.setInterval(() => void revalidate(), pollSeconds * 1000);
      } else {
        if (timer !== null) {
          window.clearInterval(timer);
          timer = null;
        }
      }
    };
    if (document.visibilityState === "visible") {
      void revalidate();
      timer = window.setInterval(() => void revalidate(), pollSeconds * 1000);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [zecProvider, zecReviewed, zecConnectionGeneration]);

  // A wallet that returned an address but then failed or refused the
  // source-address-control signature (state.error set) is not connected:
  // connectZecWalletSession leaves state.address populated in that case
  // so the caller can see which account was attempted, but the capability
  // statement records sourceAddressControl as unproven. Treating address
  // presence alone as "connected" showed a "Connected ... Capability
  // statement declared" line, with a Disconnect button, for a signature
  // the wallet had just rejected, and silently swallowed the actual error
  // text (state.error) that role="alert" was pointing at below.
  const zecConnected = zecSession.state.address !== null && zecSession.state.error === null;
  const zecStatusCopy = zecConnected
    ? `Connected ${zecSession.state.address}. Capability statement declared; network actions stay disabled until an adapter passes qualification.`
    : zecSession.state.error
      ? zecSession.state.error
      : zecProvider
        ? "An injected ZEC wallet was detected. Connecting requests your transparent ZEC mainnet address and a signature proving address control. Claim, refund, and broadcast stay disabled until qualification."
        : "No injected ZEC wallet was detected. Install a ZEC wallet extension, or connect later. Wallet-held funding, claim, and refund actions stay disabled until an adapter passes qualification.";

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
    invalidateZecConnection();
    setZecBusy(false);
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
                <p id="zec-wallet-status" role={zecSession.state.error ? "alert" : undefined}>
                  {zecStatusCopy}
                </p>
                {zecConnected ? (
                  <button
                    type="button"
                    onClick={() => {
                      invalidateZecConnection();
                      setZecBusy(false);
                      setZecSession(disconnectedZecSession);
                    }}
                    aria-describedby="zec-wallet-status"
                  >
                    Disconnect ZEC wallet
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!zecProvider || zecBusy}
                    onClick={connectZec}
                    aria-describedby="zec-wallet-status"
                  >
                    {zecBusy ? "Connecting…" : zecProvider ? "Connect ZEC wallet" : "ZEC connector unavailable"}
                  </button>
                )}
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
