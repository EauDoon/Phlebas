# Phlebas Wallet Compatibility

Status: legacy gateway evidence only, not native-settlement compatibility

The current matrix covers transparent payments, TEX, and ZIP 321 for the superseded ADR 0001 gateway. It does not prove compatibility with the fund, claim, or refund transactions required by [ADR 0002](adr/0002-native-zec-atomic-settlement.md). No wallet is approved for native atomic settlement. All deposit, mint, burn, custody-signer, and withdrawal procedures below are historical simulation requirements, not target-product instructions.

Status: Simulation only
As of: 02-09-2026

Phlebas has no live Zcash wallet integration, deposit address service, chain observer, custody wallet, or withdrawal signer. No wallet has completed the Phlebas acceptance suite. The application does not accept ZEC or mint redeemable `tZEC` today.

The target flow is wallet-neutral. It uses a standard Zcash address, a ZIP 321 payment-request URI, QR or copy and paste, and public-chain observation. It does not assume a browser extension, WalletConnect session, injected provider, or direct wallet callback. Phlebas must never ask for a seed phrase, spending key, viewing key, wallet database, or signed arbitrary message.

This document refines the transparent ZEC gateway in [Architecture](ARCHITECTURE.md) and preserves the lifecycle and confirmation rules in [Asset and Accounting](ASSET_AND_ACCOUNTING.md). It does not rewrite [ADR 0001](adr/0001-arbitrum-and-pzec.md), which remains historical. Product labels and the undeployed `tZEC` receipt follow [ADR 0002](adr/0002-native-zec-atomic-settlement.md). Current wallet qualification for native atomic settlement must follow ADR 0002 and the [Architecture release gate](ARCHITECTURE.md#release-gate). The gateway material below remains only to explain the current simulation and the evidence that cannot be reused as atomic-swap compatibility proof.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Maintainer documented | A current first-party source states that the wallet has the named protocol capability. This is not Phlebas interoperability evidence. |
| Phlebas verified | The exact wallet release and platform passed every applicable acceptance test below, with retained test evidence. No wallet has this status today. |
| Test required | Maintainer documentation is sufficient to schedule a test, but no successful Phlebas run exists. |
| Unknown | No current first-party evidence was found for the named behavior. Unknown is not support. |
| Unsupported | A current first-party source rules out the behavior or the product no longer supports current Zcash. |

A wallet release must not appear in a user-facing recommended list unless it is Phlebas verified. A later wallet release returns to test required until the regression subset passes again.

## Current network boundary

[Ironwood NU6.3 activated on Zcash mainnet on 28-07-2026](https://z.cash/upgrade/nu6-3/). Wallet evidence from before Ironwood is useful only as feature history. Current-network support must be shown by a current release and then tested. This matters because YWallet and the historical Nighthawk Zcash apps are no longer current Zcash choices.

The current repository is a simulation. Zcash Testnet and a controlled regression network are planned verification environments; neither has been executed by this repository. Nothing here authorizes mainnet wallet creation, custody, deposits, refunds, or withdrawals.

## Native HTLC adapter status

No current documented wallet interface supports the full Phlebas lifecycle for an arbitrary transparent HTLC: fund the exact P2SH output, then sign and finalize both the custom claim and timeout-refund inputs.

* [Noir Wallet](https://docs.zknoir.com/developers/provider-api/) documents browser connection, accounts, balances, messages, and ordinary payments. Its published provider API does not expose raw transaction or PCZT control for arbitrary P2SH inputs, sequence, or locktime.
* [Zallet](https://zcash.github.io/zallet/rpc/index.html) documents beta PCZT create, inspect, sign, combine, prove, and extract RPCs. It is a useful loopback qualification harness, but current official transparent signer support does not establish Phlebas HTLC claim and refund compatibility.
* [ZIP 374](https://zips.z.cash/zip-0374) defines the PCZT artifact fields needed to represent redeem scripts, preimages, sequence, and locktime. A standard artifact format is not wallet compatibility evidence.
* The [Zcash WalletConnect grant application](https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/391) remains a proposal to define and implement the namespace. Phlebas must not invent provider methods ahead of a shipped standard.

Phlebas therefore uses a transport-neutral, content-addressed PCZT review boundary. Browser-to-Zallet RPC, speculative `window.zcash` APIs, and fund-only enablement remain prohibited. Mainnet funding, claim, refund, extraction, and broadcast must qualify together for one exact wallet release.

## Protocol contract

### ZIP 320 TEX deposits

[ZIP 320](https://zips.z.cash/zip-0320), Active and created on 12-01-2024, defines a TEX address as a Bech32m re-encoding of a transparent P2PKH receiver. The human-readable part is `tex` on Mainnet and `textest` on Testnet. A wallet paying a TEX address must fund the transaction only with transparent P2PKH or P2SH UTXOs and should use only transparent outputs.

The restriction is a wallet rule, not a Zcash consensus rule. Phlebas therefore validates the final transaction and never treats a TEX string as proof of source compliance. On-chain, the output is indistinguishable from an output to the underlying P2PKH receiver.

When a supporting wallet starts from shielded funds, ZIP 320 requires two transactions:

1. The wallet moves the required value to a fresh ephemeral transparent receiver.
2. The wallet spends that transparent output to the TEX destination.

The wallet must recognize returned funds sent to the ephemeral receiver and must be able to spend them. Phlebas watches only the final TEX payment. The first transaction is not a deposit and cannot create `tZEC` credit.

### ZIP 321 payment requests

[ZIP 321](https://zips.z.cash/zip-0321), Active and created on 28-08-2020, defines the `zcash:` URI used by clickable links and QR codes. Phlebas emits one payment only and puts the address in the URI path.

For an amount-fixed deposit intent, the exact payload shape is:

```text
zcash:{TEX_ADDRESS}?amount={DECIMAL_ZEC}&label=Phlebas
```

For an open-amount intent, it is:

```text
zcash:{TEX_ADDRESS}?label=Phlebas
```

The brace-delimited values are runtime values, not literal address characters. The QR code contains the exact ASCII URI with no surrounding JSON, quotation marks, whitespace, or trailing newline. The page also shows the raw TEX address and amount as text.

Phlebas applies these encoding rules:

* `DECIMAL_ZEC` uses a period, has a nonempty whole-number part, and has no more than 8 fractional digits. It never contains commas or exponent notation.
* A Phlebas fixed-amount request is strictly positive and no greater than 21,000,000 ZEC, the ZIP 321 upper bound. The emitter validates integer zatoshis from `1` through `2,100,000,000,000,000` before decimal encoding. An open-amount request omits `amount`; it never emits `amount=0`.
* The emitter orders `amount` before `label` for deterministic output, although ZIP 321 does not assign meaning to parameter order.
* `label` and any future display-only `message` are percent-encoded where ZIP 321 requires it. The default emitter uses `label=Phlebas` and omits `message`.
* A memo is never included. ZIP 321 requires rejection of a memo associated with a transparent address.
* `req-asset`, multiple recipients, indexed parameters, fragments, and an authority form such as `zcash://` are not supported by the Phlebas ZEC gateway.
* An unknown `req-` parameter causes rejection. An unknown optional parameter is ignored only after the standard fields parse successfully and the review screen remains unambiguous.
* A payment request is network-bound. The address must match the active Phlebas environment.

The QR is a convenience channel, not an authorization. The wallet must show the decoded address and amount before the user approves a send.

## Compatibility matrix

No row is Phlebas verified as of 30-08-2026.

| Wallet and platform | Transparent and TEX evidence | ZIP 321 and handoff evidence | Current classification | Phlebas decision |
| --- | --- | --- | --- | --- |
| Zodl iOS, formerly Zashi | The [official iOS changelog](https://github.com/zodl-inc/zodl-ios/blob/main/CHANGELOG.md) records ZIP 320 TEX support from version 1.1.4. The current app is the same wallet after the [Zashi to Zodl rebrand on 16-02-2026](https://zodl.com/zashi-is-becoming-zodl/). | The current changelog documents ZIP 321 handling and, in version 3.7.2, rejection of multi-recipient requests instead of silently using one recipient. | Maintainer documented, test required | Candidate for Testnet. Raw TEX, QR, same-device URI, two-transaction send, returned ephemeral funds, restore, and transparent withdrawal receipt must pass. |
| Zodl Android, formerly Zashi | The [official Android changelog](https://github.com/zodl-inc/zodl-android/blob/main/CHANGELOG.md) states that version 1.1.6 added TEX sending, the two-transaction shielded-to-TEX path, and transparent-history recovery. The [3.9.3 release](https://github.com/zodl-inc/zodl-android/releases/tag/3.9.3-2393) is dated 17-08-2026. | The changelog states that version 1.2.1 scans and creates ZIP 321 URIs, and version 2.0.0 opens the wallet from a scanned ZIP 321 QR. | Maintainer documented, test required | Candidate for Testnet. The current 3.9.3 release still needs the complete Phlebas suite. |
| Zingo PC | The [official Zingo PC README](https://github.com/zingolabs/zingo-pc) documents Transparent and TEX address support on Windows, macOS, and Linux. | The same source documents a ZIP 321 `zcash:` URI handler and notes a Linux AppImage registration requirement. | Maintainer documented, test required | Strong desktop candidate. Exact release, package format, raw TEX, QR, URI registration, two-transaction behavior, refund recovery, and withdrawal receipt remain untested by Phlebas. |
| Zingo Mobile | The [official mobile repository](https://github.com/zingolabs/zingo-mobile) identifies maintained Android and iOS Zcash apps, but its public feature description does not explicitly document TEX or ZIP 321 behavior. | Unknown from the current first-party feature description. | Unknown, test required before any claim | Do not recommend. Obtain maintainer evidence or execute the complete suite against a current release. |
| Zkool | The [official README](https://github.com/hhanh00/zkool2) documents transparent accounts, rotating transparent receivers, transparent-fund recovery, and payment URIs. The current [6.28.0 release](https://github.com/hhanh00/zkool2/releases/tag/zkool-v6.28.0) is dated 23-08-2026. It does not explicitly state TEX support. | Single-recipient and multi-recipient payment URI support is documented, but exact ZIP 321 conformance is not stated in the cited feature table. | Partial documentation, TEX and exact ZIP 321 support unknown | Successor candidate to YWallet, but not recommendable until raw TEX, ZIP 321, two-transaction recovery, and withdrawal tests pass. |
| YWallet | The current [official YWallet repository](https://github.com/hhanh00/zwallet) says YWallet no longer supports Zcash after the Ironwood update and directs Zcash users to Zkool. This supersedes historical TEX parsing evidence. | Historical payment URI behavior does not restore current Zcash support. | Unsupported for current Zcash | Exclude from Phlebas wallet choices. |
| Nighthawk | The [current Nighthawk repositories](https://github.com/orgs/nighthawk-apps/repositories) identify the active Android and iOS wallets as DarkFi Testnet products. The prior Zcash Android and iOS repositories are archived and marked no longer maintained. | No current Zcash wallet remains to test for Phlebas. | Unsupported for current Zcash | Exclude from Phlebas wallet choices. Do not present historical Nighthawk Zcash compatibility. |
| Zallet | The [Zallet RPC reference](https://zcash.github.io/zallet/rpc/index.html) documents `z_converttex` and says TEX recipients use `z_sendmany`, including the two-step path. It is an RPC wallet, not a browser or consumer mobile wallet. | No consumer QR or `zcash:` handoff is documented. | Maintainer documented for RPC TEX operations, URI support unknown | Test harness only. [Zallet remains beta](https://github.com/zcash/zallet), is not fully reviewed, may break compatibility, and is not a production custody dependency. |

Maintainer documentation establishes what is worth testing. It does not establish that a current store binary, desktop package, operating-system URI handler, or restored wallet behaves as the documentation describes.

## Wallet-neutral deposit flow

This is a gated target flow. No step is active today.

1. Phlebas creates a deposit intent with a unique identifier, environment, optional exact amount, and expiry for the user interface.
2. A custody address service outside the browser and outside Vercel derives a fresh transparent P2PKH receiver. No spending authority is exposed to the web application.
3. The service converts that receiver to its network-correct TEX encoding and stores the lossless TEX-to-P2PKH mapping with the intent.
4. The page displays the raw TEX string, the canonical ZIP 321 URI, a QR containing that URI, the amount if fixed, the active network, and the transparent-privacy warning.
5. The user scans, opens, or copies the request into a Zcash wallet. The wallet, not Phlebas, selects inputs and asks the user to approve the transaction.
6. If shielded funds are selected, a conforming wallet may first broadcast the ephemeral unshielding transaction. Phlebas continues to show `Waiting for final payment` and does not ask the user to paste or trust the first transaction ID.
7. Independent Zebra-backed observers locate the final output to the stored underlying P2PKH script. A transaction ID submitted by the user is only a search hint.
8. The deposit validator verifies the best-chain block, output index, exact script, integer zatoshi amount, unique outpoint, and final-transaction transparency. It rejects any final transaction containing a shielded bundle or a nontransparent output.
9. A mempool sighting is informational. The lifecycle and minimum confirmation policy remain those in [Asset and Accounting](ASSET_AND_ACCOUNTING.md#deposit-lifecycle). Development and Testnet require at least 10 confirmations. No zero-confirmation output becomes spendable.
10. Only the confirmed reserve-ledger entitlement can enter the separately authorized `tZEC` mint flow.

A payment-intent expiry does not erase an address or make a late on-chain output disappear. A late payment is quarantined and requires reconciliation. It is not auto-credited to a reused intent. Deposit receivers are never reassigned to another user.

### Deposit amount policy

Each deposit intent records one immutable amount mode:

* A fixed-amount intent accepts exactly the encoded integer-zatoshi amount. Any other observed amount is quarantined and receives no partial or automatic credit.
* An open-amount intent omits the URI amount and accepts one positive output only when its integer-zatoshi value is within the minimum and maximum caps published in that intent. Open-amount intents remain disabled until those caps have an approved value and owner.
* Zero, under-minimum, over-cap, split, duplicate, late, and mismatched outputs are quarantined. Phlebas does not merge deposits, allocate one output across intents, auto-refund, or fabricate the requested value.

The mode, exact fixed amount or open-amount caps, expiry, receiver, environment, and policy version are bound before the address is shown. They cannot be relaxed after observation.

## Transparent destination validation

Address validation uses a current Zcash address parser, such as the official [`zcash_address` parser](https://zcash.github.io/librustzcash/rustdoc/latest/zcash_address/), and then converts the result under the active network. Prefix inspection or a regular expression is insufficient.

### Deposit destination

The generated destination must satisfy all of these conditions:

* It parses as a ZIP 320 TEX address for the active network.
* Bech32m decoding returns exactly the 20-byte P2PKH payload required by ZIP 320.
* Re-encoding the payload produces the same canonical TEX string.
* Conversion to the underlying P2PKH receiver round-trips to the receiver stored for the deposit intent.
* The receiver has not been assigned to another intent.

P2SH is not a deposit-address option because ZIP 320 defines TEX only for P2PKH.

### Withdrawal destination

The first gated withdrawal parser accepts only a raw transparent P2PKH address, a raw transparent P2SH address, a TEX address, or a single-payment ZIP 321 URI containing one of those address types. It then enforces:

* Valid checksum and canonical encoding.
* Exact active-network match.
* Address type is P2PKH, P2SH, or TEX.
* A TEX destination decodes to a P2PKH payload and requires a fully transparent withdrawal transaction.
* A URI has one payment, no memo, no custom asset, no indexed recipient, and no unknown required parameter.
* If both the form and URI contain an amount, the integer zatoshi amounts are identical. Phlebas never silently replaces one amount with the other.

Unified, Sapling, Orchard, Ironwood, and Sprout destinations are rejected by this transparent-only lane. Phlebas does not silently extract a transparent receiver from a Unified Address because that would change the address the user supplied and could defeat the wallet's intended receiver selection.

## Withdrawal user experience

1. The user opens the wallet's receive screen and explicitly selects a transparent receive address. A default shielded or Unified Address is not acceptable.
2. The user pastes the raw address or scans a single-payment request from the wallet. Phlebas identifies the decoded type and network.
3. Before any `tZEC` burn, Phlebas shows the full destination, native ZEC amount, Zcash network fee, service fee if approved, total `tZEC` debit, and a notice that the transfer is public.
4. The user confirms the exact summary. The destination and amount are then immutable for that withdrawal identifier.
5. After the Arbitrum burn reaches the configured finality condition, the approved custody signer creates a transparent Zcash payment. Phlebas never asks the user's Zcash wallet to sign the withdrawal.
6. The interface reports `Burn finalizing`, `Approved`, `Signed`, `Broadcast`, `Mined`, `Confirmed`, or a specific failure state. The payable closes only under the policy in [Asset and Accounting](ASSET_AND_ACCOUNTING.md#withdrawal-lifecycle).

If a wallet does not expose a transparent receive address, it is not withdrawal-compatible with this lane even if it can send to TEX.

## Refund and returned-fund handling

ZIP 320 permits a recipient to return funds to any source address when the final transaction has multiple sources. That protocol allowance does not prove which source belongs to the Phlebas user. An exchange, shared wallet, or payment service may have funded the transaction.

Phlebas therefore does not auto-refund to the first input, a change output, a transaction-ID submitter, or an address copied from wallet history. A nonconforming, duplicate, late, under-minimum, or otherwise disputed deposit remains quarantined. Any return requires authenticated user contact, policy approval, a validated transparent destination, an exact fee disclosure, and reserve-ledger reconciliation.

The acceptance suite also tests the ZIP 320 return path. When a shielded-to-TEX test creates an ephemeral transparent source, a controlled Testnet return is sent to that source. The wallet must discover and spend the returned output before it can be described as refund-safe. Seed restore must recover the relevant ephemeral receiver without relying on device-only history.

## Browser, desktop, and mobile handoff

| Situation | Phlebas behavior | Required fallback |
| --- | --- | --- |
| Desktop browser, mobile wallet | Show the canonical ZIP 321 QR beside the full TEX address and amount. | Copy the raw TEX address and amount separately. |
| Desktop browser, desktop wallet | Offer `Open wallet` only after an explicit click, using the canonical `zcash:` URI. | Copy the URI or raw address. A missing OS handler is not a transaction failure. |
| Mobile browser, wallet on the same device | Invoke the `zcash:` URI only from a user gesture. Return focus to Phlebas without assuming the wallet sent anything. | Copy the raw address and amount for manual entry. |
| Withdrawal address import | Accept paste or a camera scan of the wallet's receive QR, then show the parsed address, type, network, and amount. | Manual paste. No direct wallet connection is required. |

Phlebas cannot reliably detect whether another app completed a send. Chain observation is the only deposit authority. Returning from a wallet, seeing a transaction ID, or receiving a browser deep-link callback does not create credit.

## Failure states

| Condition | User-visible state | System response |
| --- | --- | --- |
| Wallet rejects a valid TEX address | `This wallet could not read the transparent-only address` | Do not substitute an unrestricted transparent deposit address. Offer copy and the tested-wallet list when one exists. |
| No `zcash:` handler is registered | `No wallet opened` | Keep the intent active and show QR and copy options. |
| Wallet ignores or changes the URI amount | `Amount does not match the request` | User cancels before send. If a different amount arrives at a fixed intent, quarantine it with no partial or automatic credit. |
| Wallet is on the wrong network | `Network mismatch` | Block the handoff or withdrawal before any transaction or burn. |
| Shielded-to-TEX first transaction mines but the second is absent | `Waiting for final payment` | Create no deposit. Let the wallet recover or spend the ephemeral output. Escalate only after the wallet's expiry window. |
| Final transaction has a shielded component or nontransparent output | `Deposit requires review` | Quarantine the outpoint. Do not mint `tZEC`. |
| Output script or amount does not match the intent | `Deposit does not match request` | Quarantine it. An open-amount intent accepts only one positive output within the immutable caps published for that intent. |
| Transaction is only in the mempool | `Detected, awaiting confirmation` | Create no spendable entitlement. |
| Transaction expires, conflicts, or leaves the best chain | `Payment not confirmed` or `Reorganization detected` | Remove provisional credit, re-scan, and follow the reorganization controls in Architecture. |
| Payment arrives after intent expiry | `Late payment under review` | Preserve the outpoint, block automatic credit, and reconcile ownership. |
| Outpoint was already processed | `Duplicate deposit detected` | Reject the second transition and alert reconciliation. |
| Returned ephemeral funds are not visible after sync or restore | `Wallet refund recovery failed` | Stop the wallet's qualification. Do not repeat a return to that wallet. |
| Withdrawal destination is shielded, Unified, malformed, or for another network | `Transparent Zcash address required` | Reject before quote acceptance or `tZEC` burn. |
| Signer, observer, or reserve ledger is unavailable or disagrees | `Withdrawals temporarily paused` | Create no new signature and preserve the payable state. |

## Testnet vectors

The test runner creates fresh public test values for every run:

* `T_P2PKH`: a Testnet transparent P2PKH receiver.
* `T_TEX`: the ZIP 320 `textest` encoding of `T_P2PKH`.
* `T_P2SH`: a Testnet transparent P2SH receiver.
* `T_UA`: a Testnet Unified Address used only as a rejection input.

No seed, spending key, viewing key, or mainnet address belongs in the test record. ZIP 320 publishes the encoding algorithm but no fixed Testnet address vector, so Phlebas uses generated round-trip vectors and records the public runtime addresses only in the controlled test artifact.

| Vector | Input and action | Expected result |
| --- | --- | --- |
| TV-01 | Convert `T_P2PKH` to `T_TEX`, decode it, and convert it back. | The decoded payload is 20 bytes and the final P2PKH receiver equals `T_P2PKH`. |
| TV-02 | Change one data character in `T_TEX` without recomputing its checksum. | Address parser rejects it. |
| TV-03 | Supply a valid address for a network other than the active test network. | Network conversion rejects it before QR display, send, or burn. |
| TV-04 | Parse `zcash:{T_TEX}?amount=1.23456789&label=Phlebas`. | One TEX payment, label `Phlebas`, and exactly 123,456,789 zatoshis. |
| TV-05 | Parse `zcash:{T_TEX}?label=Phlebas`. | One TEX payment with no preset amount. |
| TV-06 | Add a `memo` parameter to the TV-04 transparent request. | Reject the entire URI. |
| TV-07 | Use `amount=0`, `amount=0.123456789`, a comma, exponent notation, an empty whole part, or an empty fractional part. | Reject each amount. Zero is rejected by the stricter Phlebas fixed-request policy. |
| TV-08 | Use `zcash://{T_TEX}` or percent-encode an address, amount, or parameter name. | Reject the URI. |
| TV-09 | Add a second indexed recipient. | ZIP 321 may represent it, but the Phlebas single-payment gateway rejects it before user confirmation. |
| TV-10 | Add an unknown `req-` parameter. | Reject the entire URI. |
| TV-11 | Submit `T_UA` as a withdrawal destination. | Reject it even when it contains a transparent receiver. |
| TV-12 | Submit `T_P2SH` to the deposit-address generator and then to the withdrawal parser. | Deposit generation rejects it; withdrawal validation accepts it for the active network. |
| TV-13 | Decode `T_TEX` for chain observation. | The expected output script is the P2PKH script for `T_P2PKH`; the original TEX form is retained in intent metadata because it is not visible on-chain. |
| TV-14 | Emit and parse `amount=21000000`. | Accept exactly 2,100,000,000,000,000 zatoshis as the maximum fixed amount. |
| TV-15 | Emit or parse `amount=21000000.00000001`. | Reject one zatoshi above the ZIP 321 maximum. |

## Executable wallet acceptance plan

### Preconditions

Each run uses a fresh Testnet-only wallet or test profile, the exact current release under evaluation, a synchronized current network backend, expendable Testnet ZEC in both transparent and shielded pools where supported, and a Phlebas test observer that can inspect complete transactions and best-chain inclusion. A controlled regression network is used for deterministic expiry and reorganization cases.

The evidence record contains wallet name, platform, app version and build, package source, operating-system version, test date, network, QR payload, public transaction IDs and outpoints, block hashes and heights, screenshots of review screens, expected result, actual result, and reviewer. It contains no secrets.

### Tests

| ID | Procedure | Pass condition |
| --- | --- | --- |
| WA-01 | Paste `T_TEX` into the wallet while funding from a transparent-only balance. Review and send a small Testnet amount. | Wallet accepts TEX. The final transaction pays the expected P2PKH script and contains only transparent inputs and outputs. Phlebas recognizes the exact outpoint once and confirms it only after the test threshold. |
| WA-02 | Scan the TV-04 QR. Do not send until the review screen is inspected. | Wallet shows the exact TEX destination and 1.23456789 ZEC. Any truncation, unit conversion error, address substitution, or silent parameter loss fails the test. The transaction need not be broadcast for this parser test. |
| WA-03 | On every supported operating system, click the same `zcash:` URI from a browser. | The intended wallet opens to a reviewable send screen with the exact destination and amount. Failure may downgrade the wallet to QR and copy-only, but must not be represented as deep-link support. |
| WA-04 | From a shielded balance, pay a fresh `T_TEX`. | A documented ZIP 320 wallet creates the unshielding transaction and then a fully transparent final payment. Phlebas ignores the first and accepts only the final transaction. |
| WA-05 | Interrupt the wallet after the first WA-04 transaction mines and before the final payment is broadcast. Restart and sync. | The ephemeral output remains visible and spendable, or the wallet safely resumes the final step. No funds are lost or hidden. |
| WA-06 | Return a controlled Testnet amount to the ephemeral source from WA-04, then sync the wallet. | The wallet discovers the return and can spend it. This test is mandatory for a refund-safe claim. |
| WA-07 | Restore the WA-04 wallet from its Testnet recovery material into a clean profile and rescan from the correct birthday. | The wallet recovers the relevant transparent history and any unspent ephemeral return without device-only metadata. |
| WA-08 | Ask the wallet for a fresh transparent receive address. Import it into the Phlebas withdrawal form and send a controlled Testnet withdrawal after the simulated burn gate. | Phlebas accepts only a network-correct transparent address, the signer creates a transparent payment, and the wallet detects the exact amount. |
| WA-09 | Repeat WA-08 with a wallet-generated single-payment ZIP 321 request, first without an amount and then with one. | Phlebas extracts one transparent destination. A supplied amount is preserved exactly and any conflicting form amount is rejected. |
| WA-10 | Exercise malformed checksum, wrong-network, transparent memo, multi-recipient, duplicate outpoint, and late-intent cases. | Every failure produces the specified state and no `tZEC` mint or native withdrawal occurs. |
| WA-11 | On a controlled regression network, mine a deposit, then reorganize it out before the threshold and after provisional observation. | Provisional state is removed or reattached only to the new best-chain inclusion. No confirmed entitlement survives an orphaned outpoint. |
| WA-12 | Update or reinstall the wallet, then repeat TV-04, WA-01, WA-04, WA-06, and WA-08. | The release retains parser, TEX, refund-recovery, and transparent-receive behavior. |

### Qualification rules

A wallet can be labeled deposit-compatible only after WA-01, WA-02, WA-04, WA-05, WA-06, WA-07, WA-10, and WA-11 pass on each supported platform. It can be labeled withdrawal-compatible only after WA-08 through WA-11 pass. WA-03 earns a separate same-device or desktop deep-link label. A wallet can remain compatible through QR and copy even if WA-03 is unavailable.

Zallet follows the RPC equivalents of WA-01 and WA-04 and can help validate TEX conversion and transaction construction. It cannot satisfy the consumer QR or browser-handoff tests, and a successful beta test does not qualify it as the production custody boundary.

## Evidence register and unresolved dependencies

| Claim | Official source and date | Confidence | Contradiction or remaining gap |
| --- | --- | --- | --- |
| TEX encodes P2PKH and requires transparent sources | [ZIP 320](https://zips.z.cash/zip-0320), Active, created 12-01-2024 | High for the standard | Enforcement is not consensus-based. Every final payment still needs transaction inspection. |
| ZIP 321 defines `zcash:` links and QR payloads | [ZIP 321](https://zips.z.cash/zip-0321), Active, created 28-08-2020 | High for the standard | Wallet parsing, OS URI registration, and current release behavior vary. |
| Zodl documents TEX and ZIP 321 | [iOS changelog](https://github.com/zodl-inc/zodl-ios/blob/main/CHANGELOG.md) and [Android changelog](https://github.com/zodl-inc/zodl-android/blob/main/CHANGELOG.md) | High for maintainer documentation | The TEX entries originated before Ironwood. Current-store release regression tests and ephemeral restore tests have not been executed by Phlebas. |
| Zingo PC documents TEX and ZIP 321 | [Zingo PC README](https://github.com/zingolabs/zingo-pc) | High for maintainer documentation | Exact current release packages and shielded-to-TEX refund recovery have not been tested by Phlebas. |
| Zkool is the current YWallet successor | [Zkool README](https://github.com/hhanh00/zkool2) and [release 6.28.0](https://github.com/hhanh00/zkool2/releases/tag/zkool-v6.28.0), 23-08-2026 | High | The cited feature documentation does not explicitly name TEX or ZIP 321 conformance. |
| YWallet no longer supports current Zcash | [YWallet repository notice](https://github.com/hhanh00/zwallet), checked 30-08-2026 | High | Earlier TEX fixes are historical and do not override the current unsupported notice. |
| Current Nighthawk apps are not Zcash wallets | [Nighthawk repositories](https://github.com/orgs/nighthawk-apps/repositories), checked 30-08-2026 | High | The older Zcash apps are archived and no longer maintained. |
| Zallet can exercise TEX RPC paths but remains beta | [Zallet RPC reference](https://zcash.github.io/zallet/rpc/index.html), [beta notice](https://github.com/zcash/zallet), and [beta.2 release](https://github.com/zcash/zallet/releases/tag/v0.1.0-beta.2), 28-07-2026 | High | Breaking changes, incomplete review, missing consumer handoff, and custody design gaps block production dependence. |

The remaining project dependencies are concrete:

* No Phlebas wallet acceptance run has been executed.
* Publicly obtainable Testnet builds must be confirmed for each mobile candidate. An internal build is not enough for a public compatibility claim.
* The custody address allocator, two independent chain observers, transaction decoder, reserve ledger, withdrawal builder, and threshold signer do not exist.
* The approved production signer technology and its support for transparent P2PKH, P2SH, TEX, fees, change, and Ironwood-era transactions remain undecided.
* The refund ownership, compliance, minimum amount, fee, late-payment, and abandoned-intent policies remain unapproved.
* Zkool needs explicit maintainer evidence or an executed TEX and ZIP 321 test. Zingo Mobile needs the same.
* Wallet qualification must be repeated after material wallet releases, Zcash network upgrades, address-library changes, or changes to Phlebas confirmation and refund policy.

Until the native-settlement dependencies close and the [Architecture release gate](ARCHITECTURE.md#release-gate) passes, wallet compatibility remains unproven. `tZEC` remains a simulation label, not live native-ZEC execution.
