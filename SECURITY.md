# Security Policy

> Status as of 31-08-2026: Phlebas is a no-value simulation with optional local testnet stubs. It is not a live exchange, bridge, or custody service. It must not be used with real funds or mainnet TEX.

## Supported versions

Phlebas has no production release and no production security support commitment.

| Version | Status |
| --- | --- |
| `0.1.x` | Local simulation only |
| Any public preview | Demonstration only, no real assets |

The public Vercel app is a no-value interface. Local optional stubs exist and are not production:

- In-browser session matcher, plus a loopback matcher operator that is never hosted on Vercel.
- Undeployed Arbitrum Sepolia contract sources. The manifest stays `deployed: false` until a real Sepolia transaction is recorded.
- Optional EIP-1193 wallet connection on Arbitrum Sepolia only. Default is sign-only.
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

- Transparent ZEC custody and pZEC issuance are a federated gateway, not a trustless bridge.
- The central limit order book is matched offchain and settled onchain from signed limits.
- The constrained automated market maker supports only pZEC/USDC and pZEC/USDT0.
- Settlement, token, router, and pool logic are intended to be versioned and non-upgradeable.
- Emergency roles may stop new risk but must not gain seizure, arbitrary mint, or unrestricted upgrade authority.
- Reserve assets and liabilities must reconcile in zatoshis before minting can proceed.
- Vercel may host a public interface, but it must never hold custody, attester, governance, or deployer keys.

These are design requirements, not implemented or audited properties.

## Release security gates

A release must remain simulation-only until all applicable gates pass:

1. The exact contracts, services, custody design, signer policy, and operating entity are defined.
2. Every critical accounting and authorization invariant has deterministic tests.
3. Zcash reorganization, Arbitrum finality, signer loss, stablecoin controls, and reserve-deficit responses are exercised.
4. Independent reviews cover the Zcash gateway and custody path, and separately cover settlement, routing, and automated market maker contracts.
5. Every Critical and High finding is fixed and the fix is re-reviewed.
6. The deployed bytecode, constructor arguments, roles, addresses, and source commit match the reviewed release.
7. A public reserve and liability monitor is reproducible from independent nodes.
8. A capped testnet and mainnet rollout policy, redemption policy, incident process, and legal operating basis are approved.

No audit, deployment, reserve, signer quorum, or production readiness is claimed by this repository.
