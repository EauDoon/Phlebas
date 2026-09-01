import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  addRoute,
  defaultRoutingTable,
  emptyRoutingTable,
  routeAlert,
  type AlertRecord,
} from "./alert-router.ts";

test("addRoute registers a per-service per-severity route", () => {
  let t = emptyRoutingTable();
  t = addRoute(t, "matcher", "critical", "pagerduty", "pd-key");
  assert.equal(t["matcher:critical"]?.destination, "pd-key");
});

test("routeAlert returns the matching route or null", () => {
  const t = defaultRoutingTable();
  const alert: AlertRecord = {
    service: "observer",
    alert: "deadline-breach",
    severity: "critical",
    recommendedAction: "halt fill",
    raisedAt: 100n,
  };
  const r = routeAlert(t, alert);
  assert.ok(r);
  assert.equal(r?.channel, "pagerduty");
});

test("routeAlert returns null when no route is registered", () => {
  const alert: AlertRecord = {
    service: "unknown",
    alert: "x",
    severity: "info",
    recommendedAction: "x",
    raisedAt: 0n,
  };
  assert.equal(routeAlert(emptyRoutingTable(), alert), null);
});

test("defaultRoutingTable registers critical and warning routes per service", () => {
  const t = defaultRoutingTable();
  assert.ok(t["matcher:critical"]);
  assert.ok(t["matcher:warning"]);
  assert.ok(t["observer:critical"]);
  assert.ok(t["observer:warning"]);
  assert.equal(t["gateway:critical"], undefined);
});
