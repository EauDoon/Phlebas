import assert from "node:assert/strict";
import test from "node:test";

import {
  GATEWAY_INCIDENTS,
  INCIDENT_DEMO_QUERY,
  INCIDENT_DEMO_STORAGE_KEY,
  gatewayIncidentById,
  getIncidentDemoServerSnapshot,
  isIncidentDemoQuery,
  rememberIncidentDemo,
} from "./gateway-incidents.ts";

test("incident demonstrations stay labeled copy, not live incidents", () => {
  assert.equal(GATEWAY_INCIDENTS.length, 9);
  assert.equal(gatewayIncidentById("missing"), null);
  const afterBurn = gatewayIncidentById("withdrawal-review-after-burn");
  assert.ok(afterBurn);
  assert.match(afterBurn.body, /not silently discarded/);
  const planned = gatewayIncidentById("planned-maintenance");
  assert.ok(planned);
  assert.match(planned.body, /UTC/);
  assert.doesNotMatch(planned.body, /\btomorrow\b/i);
});

test("incident demo query is allowlisted to incidents", () => {
  assert.equal(INCIDENT_DEMO_QUERY, "incidents");
  assert.equal(isIncidentDemoQuery("incidents"), true);
  assert.equal(isIncidentDemoQuery("live"), false);
  assert.equal(isIncidentDemoQuery(undefined), false);
});

test("rememberIncidentDemo stays sticky after the URL drops demo", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  assert.equal(rememberIncidentDemo(true, storage), true);
  assert.equal(store.get(INCIDENT_DEMO_STORAGE_KEY), INCIDENT_DEMO_QUERY);
  assert.equal(rememberIncidentDemo(false, storage), true);
  assert.equal(rememberIncidentDemo(false, null), false);
  assert.equal(rememberIncidentDemo(true, null), true);
});

test("incident demo store snapshot is false on the server", () => {
  assert.equal(getIncidentDemoServerSnapshot(), false);
});

test("incident copy does not promise credit, loss, or a live outage", () => {
  const joined = GATEWAY_INCIDENTS.map((incident) => `${incident.title} ${incident.body}`).join(" ");
  assert.doesNotMatch(joined, /funds are lost/i);
  assert.doesNotMatch(joined, /will be credited/i);
  assert.doesNotMatch(joined, /\blive outage\b/i);
  assert.doesNotMatch(joined, /VPN/i);
});

test("incident mint copy does not name pZEC", () => {
  const deposit = gatewayIncidentById("deposit-review");
  const beforeMint = gatewayIncidentById("reorg-before-mint");
  const beforeBurn = gatewayIncidentById("withdrawal-review-before-burn");
  assert.ok(deposit);
  assert.ok(beforeMint);
  assert.ok(beforeBurn);
  assert.match(deposit.body, /not been approved for minting/);
  assert.match(beforeMint.body, /Nothing will be minted/);
  assert.match(beforeBurn.body, /Nothing has been burned/);
  const joined = GATEWAY_INCIDENTS.map((incident) => `${incident.title} ${incident.body}`).join(" ");
  assert.doesNotMatch(joined, /pZEC/);
});
