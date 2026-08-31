import assert from "node:assert/strict";
import test from "node:test";

import { GATEWAY_INCIDENTS, INCIDENT_DEMO_QUERY, gatewayIncidentById, isIncidentDemoQuery } from "./gateway-incidents.ts";

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

test("incident copy does not promise credit, loss, or a live outage", () => {
  const joined = GATEWAY_INCIDENTS.map((incident) => `${incident.title} ${incident.body}`).join(" ");
  assert.doesNotMatch(joined, /funds are lost/i);
  assert.doesNotMatch(joined, /will be credited/i);
  assert.doesNotMatch(joined, /\blive outage\b/i);
  assert.doesNotMatch(joined, /VPN/i);
});
