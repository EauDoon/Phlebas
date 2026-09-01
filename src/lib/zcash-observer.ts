// Zcash observer for the P2SH lock surface. The observer watches a
// set of P2SH addresses and emits a per-fill event record that the
// coordinator consumes. The observer never holds a key and never
// signs a transaction. The ZEC signature surface lives in the wallet
// adapter, not here.
//
// The observer in this PR is a stub. The production deployment wires
// a real Zcashd or Zebrad client; the test deployment wires a
// deterministic mock. The interface is identical for both.

export type ZcashOutpointKind = "funded" | "claimed" | "refunded";

export type ZcashOutpointEvent = Readonly<{
  kind: ZcashOutpointKind;
  txid: string;
  vout: number;
  address: string;
  amountZatoshis: bigint;
  blockHeight: bigint;
}>;

export type ZcashEventSource = Readonly<{
  fetchAddressOutpoints: (address: string) => Promise<ReadonlyArray<{
    txid: string;
    vout: number;
    amountZatoshis: bigint;
    blockHeight: bigint;
  }>>;
  fetchSpend: (txid: string, vout: number) => Promise<{ spent: boolean; spendTxid: string | null }>;
}>;

export type ZcashObserverConfig = Readonly<{
  addresses: ReadonlyArray<string>;
  fromHeight: bigint;
  source: ZcashEventSource;
}>;

export async function pollZcashOnce(config: ZcashObserverConfig): Promise<ReadonlyArray<ZcashOutpointEvent>> {
  const events: ZcashOutpointEvent[] = [];
  for (const address of config.addresses) {
    const outpoints = await config.source.fetchAddressOutpoints(address);
    for (const out of outpoints) {
      const spend = await config.source.fetchSpend(out.txid, out.vout);
      const kind: ZcashOutpointKind = !spend.spent
        ? "funded"
        : out.blockHeight + 10n > config.fromHeight
          ? "claimed"
          : "refunded";
      events.push({
        kind,
        txid: out.txid,
        vout: out.vout,
        address,
        amountZatoshis: out.amountZatoshis,
        blockHeight: out.blockHeight,
      });
    }
  }
  return events;
}
