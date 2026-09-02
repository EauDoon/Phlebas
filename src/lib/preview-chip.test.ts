import assert from "node:assert/strict";
import test from "node:test";

import {
  isPreviewChipAnnounced,
  PREVIEW_CHIP_HREF,
  PREVIEW_CHIP_STORAGE_KEY,
  PREVIEW_CHIP_TEXT,
  previewChipStatusRole,
} from "./preview-chip.ts";

test("preview chip text is the public-preview sentence", () => {
  assert.equal(PREVIEW_CHIP_TEXT, "Pre-launch build · data illustrative until activation · no mainnet funds");
  assert.equal(PREVIEW_CHIP_HREF, "/status");
  assert.equal(PREVIEW_CHIP_STORAGE_KEY, "phlebas.previewChipAnnounced");
  assert.doesNotMatch(
    PREVIEW_CHIP_TEXT,
    /simulation|simulator|fixture|no-value|inspect|walkthrough|preview-only|illustrative fixture/i,
  );
});

test("preview chip role=status is first-load only", () => {
  assert.equal(previewChipStatusRole(false), "status");
  assert.equal(previewChipStatusRole(true), undefined);
  assert.equal(isPreviewChipAnnounced(false, null), false);
  assert.equal(isPreviewChipAnnounced(false, undefined), false);
  assert.equal(isPreviewChipAnnounced(false, "0"), false);
  assert.equal(isPreviewChipAnnounced(true, null), true);
  assert.equal(isPreviewChipAnnounced(false, "1"), true);
  assert.equal(isPreviewChipAnnounced(true, "1"), true);
  assert.equal(previewChipStatusRole(isPreviewChipAnnounced(false, null)), "status");
  assert.equal(previewChipStatusRole(isPreviewChipAnnounced(true, null)), undefined);
  assert.equal(previewChipStatusRole(isPreviewChipAnnounced(false, "1")), undefined);
});
