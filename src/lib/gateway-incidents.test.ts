import assert from "node:assert/strict";
import test from "node:test";

import { GATEWAY_INCIDENTS, gatewayIncidentById } from "./gateway-incidents.ts";

test("historical incident demonstrations stay labeled copy, not live incidents", () => {
  assert.equal(GATEWAY_INCIDENTS.length, 10);
  assert.equal(gatewayIncidentById("missing"), null);
  const afterBurn = gatewayIncidentById("withdrawal-review-after-burn");
  assert.ok(afterBurn);
  assert.match(afterBurn.body, /no payout authority/i);
  const planned = gatewayIncidentById("planned-maintenance");
  assert.ok(planned);
  assert.match(planned.body, /illustrative/i);
  assert.doesNotMatch(planned.body, /\bactive\b/i);
});

test("incident copy does not promise credit, loss, or a live outage", () => {
  const joined = GATEWAY_INCIDENTS.map((incident) => `${incident.title} ${incident.body}`).join(" ");
  assert.doesNotMatch(joined, /funds are lost/i);
  assert.doesNotMatch(joined, /will be credited/i);
  assert.doesNotMatch(joined, /\blive outage\b/i);
  assert.doesNotMatch(joined, /VPN/i);
});

test("observer disagreement demo is historical and read-only", () => {
  const disagreement = gatewayIncidentById("observer-disagreement");
  assert.ok(disagreement);
  assert.match(disagreement.title, /observer-disagreement/i);
  assert.match(disagreement.body, /read-only/i);
  assert.doesNotMatch(`${disagreement.title} ${disagreement.body}`, /live outage/);
  assert.doesNotMatch(`${disagreement.title} ${disagreement.body}`, /pZEC/);
});

test("historical custody copy has no payable authority", () => {
  const deposit = gatewayIncidentById("deposit-review");
  const beforeMint = gatewayIncidentById("reorg-before-mint");
  const beforeBurn = gatewayIncidentById("withdrawal-review-before-burn");
  assert.ok(deposit);
  assert.ok(beforeMint);
  assert.ok(beforeBurn);
  assert.match(deposit.body, /No receiver, deposit intent, or minting path exists/);
  assert.match(beforeMint.body, /cannot generate a receiver/i);
  assert.match(beforeBurn.body, /No burn, payout request, or production gateway exists/);
  const joined = GATEWAY_INCIDENTS.map((incident) => `${incident.title} ${incident.body}`).join(" ");
  assert.doesNotMatch(joined, /pZEC/);
  assert.doesNotMatch(joined, /will be credited/i);
  assert.doesNotMatch(joined, /live outage/i);
});
