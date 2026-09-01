import assert from "node:assert/strict";
import test from "node:test";

import {
  COPY_TEX_LABEL,
  COPY_TEX_UNAVAILABLE_LABEL,
  NO_TEX_ISSUED,
  canCopyTex,
  copyTexAriaLabel,
  issuedTexAddress,
  shortenEvmDisplay,
  shortenTexDisplay,
  texDestinationStatus,
  texStatusDisplay,
} from "./wallet-bar-copy.ts";

test("missing gateway TEX is No TEX issued, never a fake tex1", () => {
  assert.equal(texDestinationStatus(null), NO_TEX_ISSUED);
  assert.equal(texDestinationStatus(undefined), NO_TEX_ISSUED);
  assert.equal(texDestinationStatus({ tex: "  ", request: "zcash:x" }), NO_TEX_ISSUED);
  assert.equal(canCopyTex(null), false);
  assert.equal(canCopyTex({ tex: "", request: "zcash:x" }), false);
  assert.equal(copyTexAriaLabel(null), COPY_TEX_UNAVAILABLE_LABEL);
  assert.doesNotMatch(NO_TEX_ISSUED, /tex1/i);
  assert.doesNotMatch(texStatusDisplay(null), /tex1/i);
  assert.equal(issuedTexAddress(null), null);
});

test("Copy TEX is enabled only when a real textest URI exists", () => {
  const issued = {
    tex: "textest1qexampleaddresspayloadxx",
    request: "zcash:textest1qexampleaddresspayloadxx?amount=1&label=Phlebas",
  };
  assert.equal(canCopyTex(issued), true);
  assert.equal(copyTexAriaLabel(issued), COPY_TEX_LABEL);
  assert.equal(texDestinationStatus(issued), issued.tex);
  assert.equal(texStatusDisplay(issued), shortenTexDisplay(issued.tex));
  assert.doesNotMatch(issued.tex, /^tex1/i);
  assert.equal(canCopyTex({ tex: issued.tex, request: "  " }), false);
});

test("EVM and TEX displays truncate without inventing an address", () => {
  assert.equal(
    shortenEvmDisplay("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"),
    "0xf39f…2266",
  );
  assert.equal(shortenTexDisplay("textest1short"), "textest1short");
  assert.match(shortenTexDisplay("textest1qexampleaddresspayloadxx"), /…/);
});

test("wallet bar copy has no Sepolia submit path", () => {
  const copies = [
    NO_TEX_ISSUED,
    COPY_TEX_LABEL,
    COPY_TEX_UNAVAILABLE_LABEL,
    texDestinationStatus(null),
    copyTexAriaLabel(null),
    texStatusDisplay(null),
  ];
  for (const copy of copies) {
    assert.doesNotMatch(copy, /sepolia|arbitrum|submit/i);
  }
});
