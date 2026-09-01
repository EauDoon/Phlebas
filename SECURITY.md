# Security Policy

> Status as of 01-09-2026: Phlebas is a no-value simulation with undeployed contract sources and optional local Testnet services. It is not a deployed exchange, bridge, automated market maker, or custody service. It must not be used with real funds or mainnet TEX.

## Supported versions

Phlebas has no production release and no production security support commitment.

| Version | Status |
| --- | --- |
| `0.1.x` | Local simulation and no-value testnet development only |
| Any public preview | Demonstration only, no real assets |

The public Vercel app is a no-value interface. Local optional stubs exist and are not production:

- In-browser session matcher, plus a loopback matcher operator that is never hosted on Vercel.
- Undeployed Arbitrum Sepolia contract sources. The manifest stays `deployed: false` until a real Sepolia transaction is recorded.
- Optional EIP-1193 wallet connection on Arbitrum Sepolia only. Signing stays disabled until the manifest is backed by a successful Sepolia receipt and verified deployed bytecode.
- Local `textest` gateway and observer stubs on `127.0.0.1`. No Zebra RPC, no mainnet TEX.
- No custody, attester, governance, deployer, or treasury keys in Vercel or git.

Do not set `PHLEBAS_GATEWAY_URL` or `PHLEBAS_MATCHER_URL` on Vercel. Public API routes refuse any operator URL that is not loopback HTTP.

Do not send ZEC, pZEC, USDC, USDT0, or any other asset to an address presented by an unverified Phlebas build.

## Reporting a vulnerability

Use GitHub private vulnerability reporting for the Phlebas repository when it is available. Do not open a public issue for an unpatched vulnerability that could expose users, credentials, assets, or infrastructure.

Include:

- The affected commit and file or component.
- A concise description of the security property that fails.
- Reproduction steps using local simulation, testnet, or a private fork only.
- Expected and actual behavior.
- Potential impact and prerequisites.
- Logs, traces, or a minimal proof of concept with secrets removed.
- Any suggested mitigation, if known.

Do not include seed phrases, private keys, access tokens, personal data, or credentials in a report.

There is currently no bug bounty, reward commitment, response-time guarantee, or safe-harbor program. Do not test against third-party systems, public infrastructure, or real assets without the relevant owner's explicit authorization.

## Coordinated disclosure

Keep material details private until a fix is available and affected users can take protective action. A future production release must define maintainers, an acknowledgment target, a remediation target, and a disclosure process before it accepts public funds.

## Planned security boundary

The proposed architecture is documented in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md). Its strongest intended boundaries are:

- Every fill uses one native transparent ZEC conditional lock and one exact-token EVM conditional lock bound to the same signed terms and SHA-256 hashlock.
- The offchain matcher and coordinator may sequence state, but they cannot spend, redirect, custody, or internally credit either asset.
- ZEC funds first. EVM funding follows policy-qualified ZEC finality, and its refund deadline precedes the ZEC refund deadline by the signed safety margin.
- Claim and refund are mutually exclusive. Reorganizations, stale evidence, observer disagreement, and replay suspend progression.
- Wallets retain signing and unilateral refund authority. Phlebas never holds a standing ZEC reserve or depends on an operator redemption promise.
- pZEC/tZEC receipt, gateway, reserve, custody, and automated market maker components are legacy simulations, not the native settlement target.
- Vercel may host a public interface, but it must never host keys, authoritative journals, node credentials, signing, claim, refund, or custody services.

The custody-backed pZEC design remains documented only as the superseded ADR 0001 simulation. The repository exercises parts of the native design in local code and tests. They are not deployed or audited properties.

## Release security gates

A release must remain simulation-only until all applicable gates pass:

1. The exact contracts, Zcash transaction format, services, wallet signing policy, and operating entity are defined.
2. Every critical accounting and authorization invariant has deterministic tests.
3. Zcash reorganization, Arbitrum finality, signer loss, stablecoin controls, and reserve-deficit responses are exercised.
4. Independent reviews cover the Zcash conditional-lock and wallet path, and separately cover EVM escrow, settlement coordination, matching, and recovery.
5. Every Critical and High finding is fixed and the fix is re-reviewed.
6. The deployed bytecode, constructor arguments, roles, addresses, and source commit match the reviewed release.
7. Independent observers can reproduce both chain histories, finality decisions, replacement evidence, and timeout eligibility.
8. A capped Testnet and Mainnet rollout policy, refund process, incident process, and legal operating basis are approved.

No audit, deployment, reserve, signer quorum, or production readiness is claimed by this repository.
