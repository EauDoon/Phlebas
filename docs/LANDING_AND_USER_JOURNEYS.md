# Phlebas Landing and User Journeys

Status: the landing page, terminal shell, local matcher, LP preview, ZIP 321 deposit-shape preview, withdrawal state tour, destination inspector, and architecture explanation are implemented locally as no-value fixtures. Optional local loopback stubs exist for a textest gateway, matcher operator, and observer. They are never hosted on Vercel. The public app remains a no-value simulation.

Phlebas currently does not accept live funds or operate custody. Optional Arbitrum Sepolia wallet connection is sign-only by default. Contract sources are undeployed. Market data is illustrative. This specification does not authorize mainnet, custody, publication, or financial services.

The user-facing market aliases are `ZEC / USDC` and `ZEC / USDT`, matching the requested markets. Every market ticket, review, and history surface must also state the exact settlement pair, `ZEC-USDC` or `ZEC-USDT`. Those pairs are native ZEC against native USDC or native USDT. Pool labels use the same assets. USDT0 is abandoned. This remains a no-value simulation and must not claim live native-ZEC execution.

## Product outcome

The landing page should answer four questions before asking a visitor to enter the terminal:

- What is Phlebas?
- What exists today?
- What are the native pairs, and where would custody begin?
- What can a visitor safely do in the current preview?

The intended first impression is a serious market design with its limits shown in public. The page must not resemble a live exchange launch, token sale, rewards campaign, or liquidity solicitation.

## Design direction

Use the current terminal as the visual source, not as the landing layout.

- Preserve the near-black background, warm yellow accent, cool information blue, green buy state, red sell state, restrained borders, and mono numeric type.
- Let the landing page breathe more than the terminal. The terminal remains dense because it is an operating surface.
- Use an offset editorial grid and a visible status ledger. Do not use a centered crypto slogan over a gradient orb, a fake live ticker, a leaderboard, a referral block, a volume counter, or a row of equal promotional cards.
- Use square or lightly clipped surfaces. Keep the existing Phlebas mark and its irregular corner treatment.
- Motion intensity is low. A short opacity and vertical-position reveal may clarify initial hierarchy. Nothing loops, pulses, counts up, follows the pointer, or depends on scroll choreography.
- Reduced-motion mode renders every element in its final position with no delay.

Planning dials:

| Surface | Design variance | Motion | Information density |
| --- | ---: | ---: | ---: |
| Landing | 6 of 10 | 2 of 10 | 4 of 10 |
| Preview terminal | 3 of 10 | 1 of 10 | 8 of 10 |

## Routes and URL state

| Route | Purpose | Current or target behavior |
| --- | --- | --- |
| `/` | Landing page | Implemented locally, no wallet or asset action |
| `/trade` | Terminal shell, defaults to trade | Implemented locally, simulation only |
| `/trade?view=trade` | Trade preview | Implemented locally with illustrative order entry |
| `/trade?view=trade&feed=stale` | Ticket gate | Allowlisted feed states: `illustrative`, `loading`, `empty`, `stale`, `unavailable`. Invalid values return to illustrative. |
| `/trade?view=liquidity` | LP preview | Implemented locally with illustrative pool calculations |
| `/trade?view=bridge` | Gateway boundary | Implemented locally as a deposit ZIP 321 preview and withdrawal state tour |
| `/trade?view=architecture` | Product boundary | Implemented locally as a read-only explanation |

Only allowlisted query values may affect rendering. Invalid values return to the default trade preview without an error loop. Never place a wallet address, Zcash address, transaction hash, order identifier, amount, screening result, account state, or review reference in a URL.

The selected view and market fixture may be reflected in the URL for shareable simulation screens. Production account and transaction state must never be reconstructed from a URL.

## Global shell

### Persistent simulation banner

The banner is the first focusable content after the skip link and remains visible on the landing page and every preview view.

Exact copy:

> Simulation only. No-value simulation. Optional Sepolia wallet and local testnet services stay off until started. No mainnet funds.

The banner uses `role="status"` on initial load. It must not repeatedly announce on routine navigation. It cannot be dismissed.

### Header

Desktop order:

1. Phlebas mark and wordmark, linked to `/`.
2. Navigation: `Markets`, `Liquidity`, `Gateway`, `Architecture`.
3. Status control: `No-value preview`.
4. Primary action: `Enter simulation` on the landing page, or `Connect wallet` for optional Arbitrum Sepolia signing.

Landing navigation targets:

- `Markets` points to `#terminal-preview`.
- `Liquidity` points to `#journeys` with the LP path selected only after client hydration. Without JavaScript, it points to the section start.
- `Gateway` points to `#journey-deposit`. The native-pairs section is `#pairs`.
- `Architecture` points to `/trade?view=architecture`.

At 820 pixels and below, use a menu button with the visible label `Menu`. The menu opens a modal navigation panel with focus containment, an explicit close button, Escape support, and the same DOM reading order. The simulation banner remains above it.

### Footer

Exact primary copy:

> Phlebas is a protocol preview, not a live exchange or an offer of financial services.

Footer links:

- `Architecture`
- `Legal and compliance`
- `Launch gates`
- `Security`
- `Source repository`, shown only after the repository URL is configured

Do not render a placeholder GitHub URL. Omit `Source repository` until a real public URL exists.

## Landing information architecture

### Desktop wireframe

```text
+-----------------------------------------------------------------------+
| Skip link                                                             |
+-----------------------------------------------------------------------+
| SIMULATION ONLY | persistent disclosure                               |
+-----------------------------------------------------------------------+
| PHLEBAS           Markets  Liquidity  Gateway  Architecture   Enter    |
+-----------------------------------------------------------------------+
|                                                                       |
|  7 columns                              5 columns                      |
|  Transparent ZEC markets                 CURRENT SYSTEM               |
|  The custody line, drawn in public.      No-value preview              |
|  with the custody line drawn             Market data: illustrative    |
|  in public.                              Wallets: unavailable          |
|                                          Custody: not operating        |
|  Supporting copy                         Contracts: not deployed       |
|  [Enter simulation] [Understand native pairs] [Open status details]   |
|                                                                       |
+-----------------------------------------------------------------------+
| WHAT EXISTS TODAY | four evidence rows, not promotional cards         |
+-----------------------------------------------------------------------+
| Native pairs | native ZEC > planned custody > undeployed tZEC    |
+-----------------------------------------------------------------------+
| TERMINAL PREVIEW | labeled static or interactive simulation slice     |
+-----------------------------------------------------------------------+
| CHOOSE A PATH | Trader | LP | Deposit | Withdrawal                    |
+-----------------------------------------------------------------------+
| MAINNET GATE | required evidence with all states marked Not cleared    |
+-----------------------------------------------------------------------+
| Footer                                                                |
+-----------------------------------------------------------------------+
```

Use a 12-column content grid with a maximum content width of 1,440 pixels. The hero should fit in the first viewport at 900-pixel height without forcing the next section completely out of view. The status ledger sits beside the main statement, not below a product screenshot.

### Mobile wireframe

```text
+----------------------------------+
| Skip link                        |
+----------------------------------+
| SIMULATION ONLY                  |
+----------------------------------+
| PHLEBAS                    Menu  |
+----------------------------------+
| Transparent ZEC markets         |
| The custody line, drawn in public.|
| Supporting copy                 |
+----------------------------------+
| CURRENT SYSTEM                  |
| No-value preview                |
| Illustrative data               |
| No wallets or custody           |
+----------------------------------+
| [Enter simulation]              |
| [Understand native pairs]       |
+----------------------------------+
| What exists today               |
+----------------------------------+
| Native pairs                    |
+----------------------------------+
| Terminal preview                |
+----------------------------------+
| Trader | LP | Deposit | Withdraw|
+----------------------------------+
| Mainnet gate                    |
+----------------------------------+
| Footer                           |
+----------------------------------+
```

On mobile, the status ledger must appear before the primary call to action. No essential disclosure may be hidden in an accordion. Touch targets are at least 44 by 44 CSS pixels. The page must work at 320 CSS pixels without page-level horizontal scrolling.

## Landing copy deck

### Hero

Eyebrow:

> Transparent ZEC markets

Heading:

> The custody line, drawn in public.

Supporting copy:

> Phlebas models ZEC / USDC and ZEC / USDT spot markets that settle as ZEC-USDC and ZEC-USDT, plus small constant-product pools. Settlement assets are native ZEC, native USDC, and native USDT. USDT0 is abandoned. The current product is a no-value simulation. No live funds enter this application.

Primary action:

> Enter simulation

Secondary action:

> Understand native pairs

Small disclosure below both actions:

> Illustrative data only. Nothing here can be bought, sold, deposited, withdrawn, or redeemed.

### Current system ledger

Heading:

> Current system

Rows:

| Label | Value | Semantic state |
| --- | --- | --- |
| Product | No-value preview | Information |
| Market data | Illustrative fixtures | Information |
| Wallet connection | Unavailable | Neutral |
| Contracts | Not deployed | Neutral |
| Custody | Not operating | Warning |
| Mainnet approval | Not cleared | Warning |

Action:

> Open status details

The status details panel repeats the full simulation disclosure and links to Architecture, Legal and compliance, and Launch gates. It does not claim an audit, license, partnership, reserve, or uptime record.

### What exists today

Heading:

> A working preview, bounded on purpose.

Use four horizontal evidence rows:

1. `Order book preview`: Price-time ordering, illustrative depth, and preview-only order validation.
2. `LP math preview`: Constant-product calculations for two fixed pool fixtures, with no deposits and no return projection.
3. `Gateway design`: A transparent native ZEC to tZEC state model, with no address generation, custody, mint, or redemption.
4. `Published boundary`: Architecture, custody assumptions, launch gates, and failure handling are readable before any product action.

### Native pairs boundary

Section ID: `pairs`

Eyebrow:

> Native assets

Heading:

> Native ZEC against native USDC and USDT.

Body:

> The simulation now labels settlement as ZEC-USDC and ZEC-USDT. Native labels are simulation names, not live settlement. It does not list USDT0. Shielded ZEC stays out of scope. No live funds move in this preview. The undeployed 8-decimal receipt symbol is `tZEC`. ADR 0001 historically named that custody-backed claim `pZEC`; that name is not the current listed form.

Flow labels:

```text
Transparent native ZEC
        >
Planned custody and screening
        >
Planned tZEC mint on Arbitrum
        >
Order book or fixed LP pool
```

Boundary disclosure:

> No shielded deposit or withdrawal is planned for v1. Transparent Zcash and tZEC activity may be publicly linkable.

Source link:

> Read the [ZIP 320 TEX address specification](https://zips.z.cash/zip-0320).

### Terminal preview section

Section ID: `terminal-preview`

Eyebrow:

> Interface preview

Heading:

> Inspect the market model without connecting a wallet.

Body:

> Change a fixture, preview an order, inspect pool math, and walk through gateway states. Values are illustrative and actions remain inside the browser.

The embedded preview may reuse current terminal components, but it is clipped to one market summary, one order-book slice, and one order-ticket slice. It must show `Simulation` inside the frame. The landing page must not show a fake wallet balance, account identifier, deposit address, reserve figure, transaction hash, filled order, return, or profit figure.

Action:

> Open full simulation

### Journey chooser

Section ID: `journeys`

Heading:

> Choose what to inspect.

Tabs and descriptions:

| Tab | Description | Action |
| --- | --- | --- |
| Trader | Preview ZEC spot order entry and settlement disclosures. | `Preview trading` |
| LP | Inspect fixed-pair pool math and LP risks without depositing assets. | `Preview liquidity` |
| Deposit | See how eligible transparent native ZEC could enter a deposit tour. | `Preview deposit states` |
| Withdrawal | See how a burn could create a transparent native ZEC payout claim. | `Preview withdrawal states` |

Tabs use manual activation for keyboard users. Arrow keys move focus, and Enter or Space selects. Without JavaScript, render all four descriptions in order with direct links.

### Mainnet gate section

Eyebrow:

> Not cleared for real assets

Heading:

> Mainnet starts after evidence, not before it.

Show six rows, all marked `Not cleared`:

- Licensed entity and approved countries.
- Custody operator and customer-asset treatment.
- Independent contract and infrastructure reviews.
- Anti-money laundering, sanctions, Travel Rule, and market surveillance controls.
- Reserve and liability reconciliation with tested incident handling.
- Final approval for native USDC and native USDT. USDT0 is abandoned.

Action:

> Read the launch gates

Do not show a launch date, completion percentage, waitlist count, or countdown.

## Trust and status behavior

The interface has one status vocabulary:

| Status | Color use | Meaning |
| --- | --- | --- |
| `Simulation` | Information blue plus text | No real system is connected |
| `Available` | Green plus text | The preview control can be used |
| `Limited` | Yellow plus text | Part of the preview is restricted |
| `Paused` | Yellow plus text | A system action is stopped |
| `Blocked` | Red plus text | The visitor or action cannot proceed |
| `Unavailable` | Gray plus text | Data or a dependency cannot be used |
| `Under review` | Yellow plus text | A future production case needs manual review |

Color never carries the meaning alone. Each state includes a label, short explanation, scope, and allowed next action.

The landing page status is always `Simulation`. Production-like states shown in a journey are visibly labeled `State demonstration`.

## First-session education

Show a three-step dialog when a browser first enters `/trade` for the current disclosure version. It is education, not consent. Do not use a prechecked box or the words `I agree`.

Step 1:

Title:

> This is a no-value simulation.

Body:

> Prices, orders, pools, balances, and gateway events are illustrative. No wallet or blockchain is connected.

Step 2:

Title:

> Pairs are native ZEC against USDC and USDT.

Body:

> This preview labels ZEC-USDC and ZEC-USDT. It is not live settlement, not shielded ZEC, and not a trustless bridge. USDT0 is abandoned. No mainnet funds move here.

Step 3:

Title:

> Preview actions stay in this browser.

Body:

> You can inspect order entry, pool math, and gateway states. Nothing is submitted, signed, deposited, withdrawn, or stored as a financial record.

Actions:

- Steps 1 and 2: `Continue`
- Step 3: `Enter simulation`
- Every step: `Back` when a previous step exists

The dialog has a visible step count, initial focus on the heading, focus containment, and Escape support. Closing it has the same result as `Enter simulation` because the persistent banner remains. Store only a local disclosure version such as `phlebas.previewEducationVersion = 2026-08-31-1`. Do not create an account, cookie identifier, fingerprint, or analytics identity.

Show the dialog again when the disclosure version changes or local storage is cleared.

## Desktop and mobile terminal flow

### Desktop

Preserve the current operating pattern:

- Simulation banner.
- Header and view navigation.
- Market summary.
- Chart on the left, order book in the middle, order ticket on the right.
- Recent trades below the chart.

The terminal defaults to the `ZEC / USDC` display market and states `Settles ZEC / USDC`. `ZEC / USDT` remains selectable, states `Settles ZEC / USDT`, and does not carry a later-listing-gate label.

### Mobile

Use this reading and action order:

1. Simulation banner.
2. Header and horizontally scrollable view tabs.
3. Market selector and compact status.
4. Chart.
5. Order ticket.
6. Order book.
7. Recent trades.

The order ticket comes before market depth because it is the primary action surface on a narrow screen. The order book keeps its column labels and a bounded horizontal scroll only if 320-pixel rendering cannot preserve them. Do not hide price, size, total, status, risk, or fee information.

For LP and gateway views, show the action model before the risk explanation, then repeat the relevant risk text immediately before the final preview action.

## Trader journey

### PR 2 target behavior

1. A no-data availability demonstration defaults to `Unavailable in simulation` and never requests location, identity, or account information. Production country decisions remain outside Vercel and outside PR 2.
2. First-session education appears when required.
3. Trade opens on the `ZEC / USDC` display market, states `Settles ZEC / USDC`, and keeps `Illustrative market data` and `Simulation` visible.
4. The visitor may select the `ZEC / USDT` display market. It states `Settles ZEC / USDT` and does not show `Later listing gate`.
5. The visitor chooses Buy or Sell and Limit or Market.
6. The visitor enters preview values. These values remain local to the component and are never sent to analytics, logs, URLs, or storage.
7. Inline validation rejects empty, nonnumeric, zero, negative, or unsafe numeric values.
8. `Preview buy order` or `Preview sell order` opens a review sheet.
9. The review sheet repeats side, order type, ZEC amount, quote asset, illustrative price or worst price, illustrative notional, fee model, settlement pair, and ZEC custody dependency.
10. `Complete preview` closes with the result: `Order preview complete. Nothing was signed or submitted.`
11. Actions are `Edit preview` and `Return to market`.

Market orders are explained as a future immediate-or-cancel order with a user-set worst price, not an unbounded instruction. The simulation must not suggest execution or create a fake order identifier.

### Production-intent handoff

The future production path may replace `Complete preview` with local wallet signing only after all launch gates pass. The Vercel UI may construct the order and transmit a signed intent, but it may not hold assets, sign for the user, operate the matcher, or create an internal exchange balance.

## LP journey

### PR 2 target behavior

1. The visitor opens Liquidity.
2. The view defaults to the `ZEC / USDC` pool. The `ZEC / USDT` pool is a listed native pair, not a later listing gate.
3. The visitor enters a preview ZEC amount. The paired fixture amount is calculated locally.
4. The panel shows pool ratio, fixed simulation fee, estimated share, and price impact. It does not show APY, APR, projected earnings, historical returns, rewards, or a dollar-profit estimate.
5. Before the action, the interface repeats ZEC custody risk, stablecoin risk, smart-contract risk, impermanent loss, toxic flow, and withdrawal limits.
6. `Preview LP position` opens a review sheet with both fixture amounts and the same risks.
7. `Complete preview` closes with: `LP preview complete. No assets were approved or deposited.`

Do not use `Earn`, `Passive income`, `Safe yield`, or similar language. Use `Provide liquidity`, `Pool fee`, and `LP position`.

### Production-intent handoff

A future release may let a wallet approve and add assets directly to an approved pool contract. Phlebas may present and construct that transaction. Vercel may not custody the assets, maintain an omnibus LP balance, or promise a return.

## Deposit journey

### PR 2 target behavior

The entry action is `Preview deposit states`, not `Deposit ZEC`.

1. The visitor opens Gateway and selects Deposit.
2. The page states: `A production gateway would accept eligible transparent native ZEC and issue tZEC. No address is generated in this simulation.`
3. The page repeats that tZEC would be custody-backed, transparent activity may be publicly linkable, and shielded deposits are not supported.
4. The visitor selects `Walk through states`.
5. A deterministic state tour displays Eligibility, Address request, Observed, Unavailable, Screening, Rejected, Confirming, Stale, Mint queued, and Complete.
6. The Address request state shows a neutral placeholder panel with `No address generated in simulation`. It must not display an address-like fixture, QR code, copy control, URI, or scannable data.
7. Unavailable, Rejected, and Stale are fail-closed demonstration steps. Unavailable: `Observers unavailable or disagree. Fail closed. Nothing is minted.` Rejected: `Deposit failed screening or is ineligible. Nothing was minted. Nothing is sent.` Stale: `Observation or proof is stale. Fail closed. Nothing is minted.` Nothing is minted. No receivable address.
8. The Complete state says: `State demonstration complete. No native ZEC was received and nothing was minted.`

The simulation does not accept a Zcash address, EVM address, transaction hash, amount tied to a wallet, identity document, country, name, email, or screening input.

### Production-intent state machine

```text
Eligibility
  > Address request
  > Address ready
  > Deposit observed
  > Screening
  > Confirming
  > Mint queued
  > tZEC delivered
```

Future state requirements:

| State | Required UI | Allowed action |
| --- | --- | --- |
| Eligibility | Country and service result from the separate compliance service | Continue or exit |
| Address request | tZEC destination, custody disclosure, and transparent-only warning | Request deposit intent |
| Address ready | One-time TEX address, QR code, expiry, minimum, limits, and exact network | Copy or show QR |
| Deposit observed | Native amount, transaction reference, block, and provisional label | View explorer if approved |
| Screening | `Checks in progress` with no promise or countdown | Wait or contact support after threshold |
| Confirming | Current count, required threshold, and reorganization warning | Wait |
| Mint queued | Confirmed amount, tZEC destination, and processing status | Wait |
| tZEC delivered | tZEC amount, mint transaction, reserve record link, and custody reminder | Trade, provide liquidity, or leave |

The production address service, screening, deposit observer, reserve ledger, and mint controller are separate regulated services. They do not run in Vercel. The Vercel UI may display a short-lived response after the user is approved, but it must not derive addresses, import spend keys, decide eligibility, screen funds, authorize minting, or persist the custody record.

## Withdrawal journey

### PR 2 target behavior

The entry action is `Preview withdrawal states`, not `Withdraw ZEC`.

1. The visitor opens Gateway and selects Withdrawal.
2. The page states: `A production withdrawal would burn tZEC and create a claim for transparent native ZEC. No tZEC can be burned here.`
3. The interface shows a fixed, clearly labeled example summary. It does not accept or display a real Zcash address.
4. The visitor selects `Walk through states`.
5. A deterministic state tour displays title-case labels for the PRODUCT_SPEC 9.3 happy path: Requested, Screened, Burn submitted, Burn finalized, Payable, Transaction prepared, Signed, Broadcast, Mined, Confirmed.
6. The Confirmed state says: `State demonstration complete. Nothing was burned and no native ZEC was sent.`

Do not render an address input, paste target, QR scanner, wallet connector, or transaction submit control in the current simulation.

### Production-intent state machine

Canonical names are [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) section 9.3. The tour uses title-case labels of those names. Signing the tZEC burn is the last action of `screened`, not a separate machine state. Expired evidence is a branch from `burn submitted`: closed without a finalized burn. Refunded / tZEC restored is a branch from `burn finalized` or `payable` on unrecoverable pre-signature failure. Unresolved recovery is a branch from `signed`, `broadcast`, or `mined`: exact committed transaction observation returns `broadcast` or `mined`; verified input restoration returns `payable`. The restored asset is tZEC, not pZEC; that name is not the current listed form. The tour is a simulation. Nothing is sent.

```text
requested -> screened -> burn submitted -> burn finalized -> payable
payable -> transaction_prepared -> signed -> broadcast -> mined -> confirmed
burn submitted -> expired or reorganized evidence -> closed without finalized burn
burn finalized | payable -> tZEC restored only on unrecoverable pre-signature failure -> refunded
signed | broadcast | mined -> unresolved
unresolved -> exact committed transaction observed -> broadcast | mined
unresolved -> verified input restoration -> payable
```

Future state requirements:

| State | Required UI | Allowed action |
| --- | --- | --- |
| requested | tZEC amount, transparent native ZEC destination, network fee, service fee, net output, limits, and custody terms | Review request |
| screened | Eligibility result, exact tZEC burn, destination, fees, and irreversible consequences | Wait, edit before burn, sign locally, or exit |
| burn submitted | Unfinalized burn on Arbitrum | Wait |
| expired | Expired evidence. Burn evidence expired or was reorganized. Closed without a finalized burn. Nothing is sent. This is not live settlement. | Close |
| closed | Closed without a finalized burn. Nothing is sent. Simulation only. | Close |
| burn finalized | Finality status and payout claim reference | Wait |
| payable | Native payout claim exists; no signed Zcash transaction yet | Wait |
| tZEC restored | Unrecoverable pre-signature failure restores tZEC after the unpaid claim is cancelled. Nothing is sent. Simulation only. Restores tZEC; pZEC is not the current listed form. | Close |
| refunded | Single-use refund authorization cancelled the unpaid claim before tZEC restoration. Nothing is sent. Simulation only. | Close |
| transaction_prepared | Single-claim transaction status with no exact completion promise | Wait |
| signed | Custody signer status without signer details | Wait |
| broadcast | Native transaction reference and transparent network warning | View explorer if approved |
| mined | Included in a Zcash block; close threshold not yet met | Wait |
| confirmed | Gross tZEC, fees, net native ZEC, confirmations, and completion time | Close |
| unresolved | Committed transaction is invalid, stale, conflicted, or reorganized | Wait for observation or restoration |
| exact committed transaction observed | Independent observation of that exact committed transaction ID returns the claim to broadcast or mined. Nothing is sent. Simulation only. | Wait |
| verified input restoration | Independent observers prove selected inputs are spendable again and the signed transaction cannot confirm. The claim returns to payable. Nothing is sent. Simulation only. Does not restore tZEC; pZEC is not the current listed form. | Wait |

Every finalized tZEC burn must end in one transparent native ZEC payout or an approved refund outcome under the custody ledger. An unrecoverable pre-signature failure restores tZEC after a single-use refund authorization cancels the unpaid claim. Once signed, the claim cannot be refunded. An unresolved claim returns to broadcast or mined only through independent observation of that exact committed transaction, or to payable through verified input restoration. Expired or reorganized burn evidence is closed without a finalized burn. Nothing is sent. The current tour is a simulation. The restored asset is tZEC, not pZEC; that name is not the current listed form. The Vercel UI may collect and transmit a future destination to the regulated backend after launch approval. It must not store the destination, hold tZEC, create the payout, sign the Zcash transaction, or control the withdrawal queue.

## Blocked, review, reorganization, and maintenance states

These states are available in the simulation through a `State demonstration` control. They never imply a real account or incident.

### Country blocked

Scope: all interactive views.

Title:

> Phlebas is not available in this location.

Body:

> This preview is limited to approved locations. Trading, liquidity, deposit, and withdrawal controls are unavailable.

Actions:

- `Read the architecture`
- `Return home`

Do not name a sanctions list, reveal screening logic, invite VPN use, or offer an override. Do not send the country result to product analytics.

### Eligibility under review

Scope: future production gateway only.

Title:

> This request needs review.

Body:

> No asset action will continue while the review is open. Completion is not guaranteed.

Actions:

- `View request status`
- `Contact support`, only when a real support route exists

Do not show a countdown, approval probability, internal rule, vendor score, or reviewer identity.

### Deposit review

Title:

> Deposit credit is paused for review.

Body:

> The observed transaction has not been approved for minting. Do not send another deposit to the same intent.

Allowed information is the public transaction reference, amount, observed time, and status after production approval. Do not state that funds are lost or promise credit.

### Withdrawal review

Before burn:

> Withdrawal review is open. No tZEC has been burned.

After a finalized burn:

> Payout review is open. Your payout claim remains recorded while processing is paused.

The UI must distinguish these states. It must never imply that a finalized burn can be silently discarded.

### Reorganization before mint

Title:

> Zcash confirmations changed.

Body:

> The deposit is provisional again because its prior block is no longer in the accepted chain. No tZEC will be minted until the deposit is included and reaches the required confirmation threshold.

Show the last accepted block height and confirmation status only in a production-approved interface. Do not estimate a completion time.

### Reorganization after mint

Title:

> Gateway incident controls are active.

Body:

> A previously credited Zcash deposit changed after a chain reorganization. New mints and native ZEC withdrawals are paused while reserves and liabilities are reconciled.

Trading and LP controls follow their own system status. Do not automatically label them available or paused. Show the actual signed status supplied by the operating service.

### Planned maintenance

Title:

> Gateway maintenance is scheduled.

Body pattern:

> New deposit intents and withdrawal requests will be unavailable during the stated window. Existing requests keep their last confirmed status.

Show an absolute start and end in the visitor's selected display zone and UTC. Do not use only relative wording such as `tomorrow`.

### Unplanned maintenance

Title:

> This service is temporarily unavailable.

Body:

> No new action can start. Existing orders, balances, deposits, and withdrawal claims have not been inferred from this outage message.

Actions:

- `Retry status`
- `Read system status`, only when a real status route exists

Retry must be safe and rate limited. An outage message must not claim that assets are safe unless the operating service has supplied verified evidence for that statement.

### Market data unavailable

Title:

> Market data is unavailable.

Body:

> Price and depth integrity checks did not pass. Order preview is disabled.

Keep cancellation and withdrawal escape routes visible in a future production interface when those independent paths remain available.

## Loading, empty, error, and completion behavior

Every preview panel implements:

- Loading with a text label and stable layout dimensions.
- Empty with the reason and one relevant next action.
- Stale with the last accepted as-of time and disabled transition to signing.
- Unavailable with scope and retry behavior.
- Validation error beside the field and in an error summary.
- Completion in an `aria-live="polite"` region.

Do not use skeleton numbers that look like live prices or balances. A retry cannot duplicate a simulated order, deposit intent, mint, burn, or future production action.

## Analytics without personal or financial data

Analytics is optional for the no-value preview and must be disabled until this allowlist is implemented. No third-party auto-capture, session replay, heatmap, fingerprint, cross-site identifier, advertising pixel, or free-text event property is allowed.

Allowed events:

| Event | Allowed properties |
| --- | --- |
| `surface_view` | `surface`: `landing` or `preview`; `viewport_band`: `small`, `medium`, or `large`; `release_id` |
| `landing_action` | `action_id`: `enter_simulation`, `understand_pairs`, `open_status`, `open_terminal`, or `read_launch_gates`; `release_id` |
| `education_step` | `step`: `1`, `2`, or `3`; `action`: `view`, `continue`, `back`, or `close`; `release_id` |
| `preview_view` | `view`: `trade`, `liquidity`, `gateway`, or `architecture`; `release_id` |
| `simulation_action` | `action_id`: `order_preview`, `lp_preview`, `deposit_state_tour`, or `withdrawal_state_tour`; `result`: `opened`, `validation_error`, or `completed`; `release_id` |
| `disclosure_open` | `disclosure_id`: `simulation`, `pairs`, `lp_risk`, `gateway_risk`, or `mainnet_gate`; `release_id` |
| `state_demo_view` | `state_class`: `blocked`, `review`, `reorg`, `maintenance`, `stale`, or `unavailable`; `release_id` |

Forbidden event fields and capture sources:

- Name, email, phone, identity result, country, language, exact location, or support text.
- IP address, full user agent, fingerprint, persistent user ID, wallet address, Zcash address, account, cookie ID, or session ID.
- Referrer URL, query string, full route URL, clipboard contents, keystrokes, form contents, or DOM text.
- Pair, side, order type, price, amount, balance, notional, fee, LP share, pool position, transaction hash, order ID, deposit ID, withdrawal ID, screening result, or review reference.
- Error messages or stack values that can contain any forbidden value.

The client sends only enumerated values. The receiver drops unknown events and unknown properties before logging. Keep only daily aggregate counts by event and allowed property, with no raw event store. The release must document any hosting metadata that the platform collects independently.

These events are approved only for the no-value simulation. Reassess analytics before any wallet, identity, order, deposit, withdrawal, or real-asset feature is enabled. If any service cannot meet this boundary, ship analytics disabled.

## Vercel boundary

Vercel hosts presentation and stateless public routes only.

Allowed in the Vercel application:

- Landing content and status disclosures.
- Local simulation state and deterministic fixture calculations.
- Client-side wallet integration only after a separately approved release.
- Read-only public market and system status data after a separately approved release.
- Short-lived display of a response from a regulated backend, with no storage in application state beyond the active task.

Forbidden in Vercel:

- Identity decisions, identity documents, sanctions cases, or Travel Rule records.
- Native ZEC address derivation, Zcash spend keys, reserve keys, mint keys, withdrawal signers, administrator keys, or recovery material.
- Zcash nodes, deposit observation, screening, reserve accounting, mint authorization, burn accounting, or withdrawal queues.
- The authoritative order matcher, custody ledger, proof-of-liabilities database, or market-surveillance record.
- Logs, analytics, traces, errors, or URLs containing personal or financial data.

The interface must not interpret a frontend response as proof that custody, screening, matching, or settlement occurred. Authoritative state comes from the approved operating service and is displayed with its timestamp and source class.

## PR 1 acceptance assertions

PR 1 creates the landing page and preserves the current simulation behind `/trade`.

1. Given a visitor opens `/`, when the page renders, then the persistent simulation banner appears before the header and the hero states that no real assets or systems are connected.
2. Given the hero renders, when the visitor reads it in DOM order, then the current-system ledger appears before the primary action on mobile and beside the statement on desktop.
3. Given the visitor selects `Enter simulation`, when navigation completes, then `/trade?view=trade` opens with first-session education and `ZEC / USDC` as the default display market, with `Settles ZEC / USDC` visible.
4. Given the visitor selects `Understand native pairs`, when the page moves to `#pairs`, then native ZEC against native USDC and USDT, and no-shielding boundaries, are visible without another interaction.
5. Given the landing terminal slice renders, then it is labeled `Simulation` and contains no wallet balance, real address, reserve figure, transaction hash, fill, return, profit, countdown, or live-data claim.
6. Given the repository URL is absent, then no GitHub placeholder or dead source link renders.
7. Given a keyboard-only visitor, then skip link, header, menu, calls to action, tabs, disclosures, and footer links are reachable in logical order with visible focus.
8. Given a 320-pixel viewport, then there is no page-level horizontal scrolling and every disclosure and primary action remains available.
9. Given reduced motion is enabled, then all landing content is visible without animation and no information is lost.
10. Given JavaScript is unavailable, then core copy, tZEC disclosure, status ledger, journey descriptions, and direct navigation remain readable.
11. Given source inspection, then no wallet library, chain client, live API, analytics service, remote font, new package, custody secret, or identity integration was added for the landing page.

## PR 2 acceptance assertions

PR 2 completes the simulation journeys and state demonstrations.

1. Given any terminal surface, then market aliases use `ZEC / USDC` or `ZEC / USDT`, while every order and history surface also states the exact `ZEC-USDC` or `ZEC-USDT` settlement pair.
2. Given the `ZEC / USDT` market or `ZEC / USDT` pool is selected, then `Later listing gate` is absent and USDT0 is not named as a listed quote.
3. Given order preview values are invalid, then the review sheet cannot open, errors are linked to their fields, and no value enters analytics, logs, storage, or the URL.
4. Given an order preview completes, then the interface states that nothing was signed or submitted and creates no order identifier or fake fill.
5. Given an LP preview opens, then custody, stablecoin, smart-contract, impermanent-loss, and toxic-flow risks appear before completion, with no return or profit projection.
6. Given a deposit state tour, then no address-like string, QR code, copy control, wallet address, transaction hash, or real amount is accepted or displayed.
7. Given a withdrawal state tour, then no destination field, paste control, QR scanner, wallet connector, burn, or transaction submission is available.
8. Given blocked, review, pre-mint reorganization, post-mint reorganization, planned maintenance, unplanned maintenance, stale data, or unavailable data is selected, then the exact scoped copy and allowed actions in this specification render.
9. Given a post-mint reorganization demonstration, then new mints and native ZEC withdrawals show paused, while trading and LP surfaces wait for their separate status rather than inventing availability.
10. Given first-session education is completed, then only the disclosure version is stored locally and no account, cookie identifier, fingerprint, or analytics identity is created.
11. Given analytics is enabled, then only allowlisted events and properties leave the client, unknown fields are dropped, no raw event store exists, and automated tests reject every forbidden property class.
12. Given Vercel deployment inspection, then no custody, identity, matcher, reserve, mint, withdrawal, screening, or surveillance authority is present in the frontend or its environment variables.
13. Given keyboard, touch, 320-pixel, 390-pixel, 820-pixel, and 1,440-pixel checks, then navigation, dialogs, review sheets, tabs, order entry, LP preview, state tours, and error summaries remain operable.
14. Given reduced motion, loading, empty, stale, unavailable, validation, and completion states, then each surface remains understandable without color, hover, animation, or a pointer device.

## Open choices

These choices do not block PR 1 unless marked otherwise:

- Public repository URL. Until supplied, omit the source link.
- Final route for rendered repository documents. PR 1 may link to the current Markdown source or omit links that have no public destination.
- Whether the landing terminal slice is a static composition or a constrained reuse of live preview components. It must use the same fixture source either way.
- Exact font stack. Use the installed Geist or existing system fallbacks. Do not add a remote font for either PR.
- Whether the public preview needs country gating before mainnet. The implementation must support the blocked state, but the legal owner must provide the approved testnet country policy.
- Production support and system-status URLs. Omit their actions until real destinations exist.
- Production confirmation thresholds, fees, caps, review timelines, and maintenance windows. Do not invent them in the simulation.
- Analytics owner and aggregate receiver. Keep analytics disabled until the no-data allowlist has a tested implementation.
