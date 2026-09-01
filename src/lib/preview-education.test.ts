import assert from "node:assert/strict";
import test from "node:test";

import {
  isEducationForceQuery,
  isEducationLastStep,
  PREVIEW_EDUCATION_STEPS,
  PREVIEW_EDUCATION_STORAGE_KEY,
  PREVIEW_EDUCATION_VERSION,
  shouldShowPreviewEducation,
} from "./preview-education.ts";

test("education returns when local storage is empty or stale", () => {
  assert.equal(shouldShowPreviewEducation(null), true);
  assert.equal(shouldShowPreviewEducation(""), true);
  assert.equal(shouldShowPreviewEducation("2026-08-01-0"), true);
  assert.equal(shouldShowPreviewEducation(PREVIEW_EDUCATION_VERSION), false);
});

test("education copy stays a public-preview briefing, not consent", () => {
  assert.equal(PREVIEW_EDUCATION_STEPS.length, 3);
  for (const step of PREVIEW_EDUCATION_STEPS) {
    assert.doesNotMatch(step.title, /I agree/i);
    assert.doesNotMatch(step.body, /I agree/i);
    assert.doesNotMatch(step.title, /\bsimulation\b/i);
    assert.doesNotMatch(step.body, /\bsimulation\b/i);
    assert.doesNotMatch(step.body, /\blive funds\b/i);
    assert.doesNotMatch(step.body, /is trustless/);
  }
  assert.equal(PREVIEW_EDUCATION_STEPS[0].title, "This public preview uses illustrative data.");
  assert.match(PREVIEW_EDUCATION_STEPS[0].body, /Ethereum Mainnet wallet can connect for identity/);
  assert.match(PREVIEW_EDUCATION_STEPS[0].body, /does not sign or submit a transaction/);
  assert.equal(PREVIEW_EDUCATION_STEPS[1].title, "Pairs are native ZEC against USDC and USDT.");
  assert.match(PREVIEW_EDUCATION_STEPS[1].body, /not live settlement/i);
  assert.match(PREVIEW_EDUCATION_STEPS[1].body, /not shielded/i);
  assert.match(PREVIEW_EDUCATION_STEPS[1].body, /not a trustless bridge/i);
  assert.match(PREVIEW_EDUCATION_STEPS[1].body, /USDT0 is abandoned/);
  assert.doesNotMatch(PREVIEW_EDUCATION_STEPS[1].body, /pZEC is the planned settlement receipt/);
  assert.equal(PREVIEW_EDUCATION_STEPS[2].title, "Value-moving actions stay disabled.");
  assert.match(PREVIEW_EDUCATION_STEPS[2].body, /Contracts are not deployed/);
  assert.match(PREVIEW_EDUCATION_STEPS[2].body, /no signing, submission, or asset movement is enabled/);
  assert.equal(PREVIEW_EDUCATION_VERSION, "2026-09-01-3");
  assert.equal(PREVIEW_EDUCATION_STORAGE_KEY, "phlebas.previewEducationVersion");
});

test("education query force is allowlisted to 1", () => {
  assert.equal(isEducationForceQuery("1"), true);
  assert.equal(isEducationForceQuery("true"), false);
  assert.equal(isEducationForceQuery(undefined), false);
});

test("education last step is the final briefing, not an extra consent screen", () => {
  const last = PREVIEW_EDUCATION_STEPS.length - 1;
  assert.equal(isEducationLastStep(-1), false);
  assert.equal(isEducationLastStep(0), false);
  assert.equal(isEducationLastStep(last - 1), false);
  assert.equal(isEducationLastStep(last), true);
  assert.equal(isEducationLastStep(last + 1), false);
  assert.match(PREVIEW_EDUCATION_STEPS[last].title, /disabled/i);
});
