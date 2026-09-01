// Service-level types for the atomic-swap observer. The service
// wires the EVM observer, the ZEC observer, the coordinator, and the
// watchtower into one process. The service is read-only on the
// chains and never signs a transaction. The signing surface lives
// in the wallet adapter, not here.

import type { EVMEventSource, EVMObserverConfig } from "../../src/lib/evm-observer.ts";
import type { ZcashEventSource, ZcashObserverConfig } from "../../src/lib/zcash-observer.ts";
import type { WatchtowerConfig } from "../../src/lib/watchtower.ts";
import type { Hex32 } from "../../src/lib/order-domain.ts";

export type AtomicSwapObserverServiceConfig = Readonly<{
  evm: EVMObserverConfig;
  zcash: ZcashObserverConfig;
  watchtower: WatchtowerConfig;
  fillIdByOutpoint: Readonly<Record<string, Hex32>>;
  snapshotPath: string;
  pollIntervalSeconds: bigint;
  reorgDepth: bigint;
  fromBlock: bigint;
  fromHeight: bigint;
  clock?: () => bigint;
  sources: Readonly<{
    evm: EVMEventSource;
    zcash: ZcashEventSource;
  }>;
}>;
