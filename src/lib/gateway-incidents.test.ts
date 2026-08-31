import assert from "node:assert/strict";
import test from "node:test";

import { GATEWAY_INCIDENTS, gatewayIncidentById } from "./gateway-incidents.ts";

test("incident demonstrations stay labeled copy, not live incidents", () => {
  assert.equal(GATEWAY_INCIDENTS.length, 10);
  assert.equal(gatewayIncidentById("missing"), null);
  const afterBurn = gatewayIncidentById("withdrawal-review-after-burn");
  assert.ok(afterBurn);
  assert.match(afterBurn.body, /not silently discarded/);
  const planned = gatewayIncidentById("planned-maintenance");
  assert.ok(planned);
  assert.match(planned.body, /UTC/);
  assert.doesNotMatch(planned.body, /\btomorrow\b/i);
});

test("incident copy does not promise credit, loss, or a live outage", () => {
  const joined = GATEWAY_INCIDENTS.map((incident) => `${incident.title} ${incident.body}`).join(" ");
  assert.doesNotMatch(joined, /funds are lost/i);
  assert.doesNotMatch(joined, /will be credited/i);
  assert.doesNotMatch(joined, /\blive outage\b/i);
  assert.doesNotMatch(joined, /VPN/i);
});

test("observer disagreement demo pauses minting and is not a live outage", () => {
  const disagreement = gatewayIncidentById("observer-disagreement");
  assert.ok(disagreement);
  assert.match(disagreement.title, /Observers disagree/);
  assert.match(disagreement.body, /Minting is paused/);
  assert.doesNotMatch(`${disagreement.title} ${disagreement.body}`, /live outage/);
  assert.doesNotMatch(`${disagreement.title} ${disagreement.body}`, /pZEC/);
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
