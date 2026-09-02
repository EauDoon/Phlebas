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
    const copy = `${step.title} ${step.body}`;
    assert.doesNotMatch(copy, /I agree/i);
    assert.doesNotMatch(copy, /\bsimulation\b/i);
    assert.doesNotMatch(copy, /\bsimulator\b/i);
    assert.doesNotMatch(copy, /\bfixture\b/i);
    assert.doesNotMatch(copy, /\bno-value\b/i);
    assert.doesNotMatch(copy, /\binspect\b/i);
    assert.doesNotMatch(copy, /\bwalkthrough\b/i);
    assert.doesNotMatch(step.body, /\blive funds\b/i);
    assert.doesNotMatch(step.body, /is trustless/);
  }
  assert.equal(PREVIEW_EDUCATION_STEPS[0].title, "Phlebas is pre-launch. Market data is illustrative until activation.");
  assert.match(PREVIEW_EDUCATION_STEPS[0].body, /Ethereum Mainnet wallet can connect for identity/);
  assert.match(PREVIEW_EDUCATION_STEPS[0].body, /does not sign or submit a transaction/);
  assert.equal(PREVIEW_EDUCATION_STEPS[1].title, "Pairs are native ZEC against USDC and USDT.");
  assert.equal(
    PREVIEW_EDUCATION_STEPS[1].body,
    "Not live settlement, not shielded, not a trustless bridge. USDT0 is abandoned.",
  );
  assert.doesNotMatch(PREVIEW_EDUCATION_STEPS[1].body, /pZEC is the planned settlement receipt/);
  assert.equal(PREVIEW_EDUCATION_STEPS[2].title, "Actions stay in this browser.");
  assert.match(PREVIEW_EDUCATION_STEPS[2].body, /Contracts are not deployed/);
  assert.match(PREVIEW_EDUCATION_STEPS[2].body, /no signing, submission, or asset movement is enabled/);
  assert.equal(PREVIEW_EDUCATION_VERSION, "2026-09-02-1");
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
  assert.match(PREVIEW_EDUCATION_STEPS[last].body, /no signing, submission, or asset movement is enabled/i);
});
