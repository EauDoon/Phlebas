# Phlebas engineering goal

> Objective for the current work stream. `PROGRESS.md` records where the
> repository is. `docs/DELIVERY_PLAN.md` records the milestone sequence.
> This file records what the work is *for*, and the standard a change has
> to meet before it is proposed.

## Goal

Make every Phlebas boundary fail closed on evidence it cannot prove, so
that when the release gates in `docs/audit/open-items.md` do close, no
gate is closing over a latent fail-open.

Phlebas already refuses to move value. That is a product boundary, not a
correctness boundary. The correctness boundary is narrower and it is the
one this work targets: **a Phlebas function that is handed input it
cannot validate must raise, not guess.** A decoder that silently repairs
malformed bytes, an encoder that silently truncates an out-of-range
number, or a validator that accepts a shape the specification rejects,
is a defect regardless of whether a wallet is connected today. Those
defects are cheapest to remove now, while nothing depends on them, and
most expensive to remove after a settlement path is wired through them.

## Why this and not features

Every remaining row in `docs/audit/open-items.md` is blocked on an
authority this repository does not hold: counsel, an approved
deployment, a production key, a qualified wallet. None of them are
blocked on code. The key-independent work that remains is therefore the
work named in the delivery plan's own key-skip rule: build and test the
unsigned input and the expected output, verify every key-independent
invariant, and leave the signing action blocked.

Correctness of the primitives underneath those inputs is the part of
that rule with the least coverage and the highest blast radius. Two
chains, one hashlock, and staggered refund deadlines mean a single
byte-level disagreement between two encoders is not a rendering bug --
it is a swap whose lock address one party can fund and neither party can
claim.

## Standard for a change

A change in this stream is ready when all of the following hold.

1. **It closes a demonstrated defect, not a suspected one.** The commit
   that fixes a behaviour is preceded or accompanied by a test that
   fails without the fix.
2. **It fails closed.** Ambiguous, malformed, out-of-range, or
   wrong-network input raises. It never rounds, truncates, wraps,
   substitutes a default, or returns a plausible value.
3. **It cites the specification it enforces.** Where a rule comes from
   BIP 173, BIP 350, ZIP 32x, or an ADR in `docs/adr/`, the code or the
   test names the source.
4. **It does not widen authority.** No change adds a key, an endpoint, a
   broadcast path, a payable address, or a claim the release gates have
   not cleared. `docs/THREAT_MODEL.md` is updated when a change adds
   authority, assets, external calls, or a new failure mode.
5. **It leaves one implementation of each primitive.** A second copy of
   a hash, an encoder, or a parser is a divergence hazard: the copy that
   does not get the fix is the one that ends up in the settlement path.
6. **The full local gate passes.** `npm run check`, plus
   `npm run test:browser` for any change a browser can observe.

## Out of scope

Unchanged from `CONTRIBUTING.md` and the delivery plan: leverage,
lending, liquidations, shielded deposits, arbitrary pools, token
incentives, farms, dynamic fees, callbacks, and proxy upgrades. Also out
of scope here: any change whose only effect is to make a blocked gate
*look* closed.

## Non-goal

Closing the rows in `docs/audit/open-items.md`. They stay open. This
work exists so that the evidence behind them, when it arrives, is
measured against primitives that do not lie.
