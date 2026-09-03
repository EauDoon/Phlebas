# Security Policy

> Status as of 03-09-2026: Phlebas is a no-value preview with undeployed contract sources and isolated local services. It is not a live exchange or an offer of financial services. Testnet and Mainnet value movement remain blocked on their documented release gates.

## Supported versions

Phlebas has no production release and no production security support commitment.

| Version | Status |
| --- | --- |
| `0.1.x` | Local simulation and no-value testnet development only |
| Any public preview | Demonstration only, no real assets |

The public Vercel app is a no-value interface. Local optional stubs exist and are not production:

- In-browser session matcher, plus a loopback matcher operator that is never hosted on Vercel.
- Exact-token ConditionalLock sources are undeployed. Historical Arbitrum Sepolia artifacts are not an active settlement target.
- EIP-6963 Ethereum Mainnet wallet identity connection and unsigned action review. Both matcher manifests remain disabled; a wallet connection or deployment receipt cannot enable signing, submission, or value movement.
- Native transparent ZEC against issuer-native Ethereum Mainnet USDC and USDT only. Exact identities are recorded in `docs/ARCHITECTURE.md`; USDT0 is excluded.
- Keyless TEX parsing and historical state tours only. No address generator, mint-attestation runtime, Zebra RPC, or mainnet TEX.
- No custody, attester, governance, deployer, or treasury keys in Vercel or git.

Do not set `PHLEBAS_MATCHER_URL`, `PHLEBAS_MATCHER_USDC_URL`, or `PHLEBAS_MATCHER_USDT_URL` on Vercel. Matcher, observer, and coordinator services and journals stay outside Vercel. A loopback URL does not authorize hosting a service there.

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
3. Zcash reorganization, Ethereum finality, wallet unavailability, stablecoin controls, timeout, and refund recovery responses are exercised.
4. Independent reviews cover the Zcash conditional-lock and wallet path, and separately cover EVM escrow, settlement coordination, matching, and recovery.
5. Every Critical and High finding is fixed and the fix is re-reviewed.
6. The deployed bytecode, constructor arguments, roles, addresses, and source commit match the reviewed release.
7. Independent observers can reproduce both chain histories, finality decisions, replacement evidence, and timeout eligibility.
8. A capped Testnet and Mainnet rollout policy, refund process, incident process, and legal operating basis are approved.

No audit, deployment, reserve, signer quorum, or production readiness is claimed by this repository.
