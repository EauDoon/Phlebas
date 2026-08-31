// Health aggregator. The aggregator composes the health of
// every service into a single response. The aggregator is a pure
// function over a list of per-service health records; the
// aggregator never reaches out to the network and never signs a
// transaction. The aggregator is the building block for the
// operations hardening surface.

export type ServiceHealthRecord = Readonly<{
  service: string;
  ok: boolean;
  detail: string | null;
  reportedAt: bigint;
}>;

export type AggregatedHealth = Readonly<{
  ok: boolean;
  services: ReadonlyArray<ServiceHealthRecord>;
  failingServices: ReadonlyArray<string>;
  reportedAt: bigint;
}>;

export function aggregateHealth(records: ReadonlyArray<ServiceHealthRecord>, nowSeconds: bigint): AggregatedHealth {
  if (nowSeconds < 0n) throw new RangeError("Now must be non-negative");
  const failing = records.filter((r) => !r.ok).map((r) => r.service);
  return {
    ok: failing.length === 0,
    services: records,
    failingServices: failing,
    reportedAt: nowSeconds,
  };
}

export function buildRecord(service: string, ok: boolean, detail: string | null, nowSeconds: bigint): ServiceHealthRecord {
  return { service, ok, detail, reportedAt: nowSeconds };
}
