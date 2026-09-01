import { strict as assert } from "node:assert";
import { test } from "node:test";

import { aggregateHealth, buildRecord } from "./health-aggregator.ts";

test("aggregateHealth handles an empty record list", () => {
  const h = aggregateHealth([], 100n);
  assert.equal(h.ok, true);
  assert.equal(h.failingServices.length, 0);
  assert.equal(h.services.length, 0);
});

test("aggregateHealth lists multiple failing services", () => {
  const records = [
    buildRecord("matcher", false, "x", 100n),
    buildRecord("observer", true, null, 100n),
    buildRecord("gateway", false, "y", 100n),
  ];
  const h = aggregateHealth(records, 100n);
  assert.equal(h.ok, false);
  assert.deepEqual(h.failingServices, ["matcher", "gateway"]);
});

test("aggregateHealth preserves the reported timestamp on each record", () => {
  const records = [
    buildRecord("matcher", true, null, 100n),
    buildRecord("observer", true, null, 200n),
  ];
  const h = aggregateHealth(records, 300n);
  assert.equal(h.services[0].reportedAt, 100n);
  assert.equal(h.services[1].reportedAt, 200n);
  assert.equal(h.reportedAt, 300n);
});
