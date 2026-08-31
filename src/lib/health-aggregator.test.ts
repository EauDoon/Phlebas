import { strict as assert } from "node:assert";
import { test } from "node:test";

import { aggregateHealth, buildRecord } from "./health-aggregator.ts";

test("aggregateHealth reports ok when all services are healthy", () => {
  const records = [
    buildRecord("matcher", true, null, 100n),
    buildRecord("observer", true, null, 100n),
  ];
  const h = aggregateHealth(records, 100n);
  assert.equal(h.ok, true);
  assert.equal(h.failingServices.length, 0);
  assert.equal(h.services.length, 2);
});

test("aggregateHealth reports not-ok when any service is unhealthy", () => {
  const records = [
    buildRecord("matcher", true, null, 100n),
    buildRecord("observer", false, "snapshot-missing", 100n),
  ];
  const h = aggregateHealth(records, 100n);
  assert.equal(h.ok, false);
  assert.deepEqual(h.failingServices, ["observer"]);
});

test("aggregateHealth rejects a negative now", () => {
  assert.throws(() => aggregateHealth([], -1n));
});

test("aggregateHealth reports the reported timestamp", () => {
  const h = aggregateHealth([], 5_000n);
  assert.equal(h.reportedAt, 5_000n);
});
