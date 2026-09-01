import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Compose publishes only the matcher on loopback and never sets a Vercel operator URL", async () => {
  const compose = await readFile(join(root, "services/compose.yaml"), "utf8");
  const dockerfile = await readFile(join(root, "services/Dockerfile"), "utf8");
  assert.match(compose, /127\.0\.0\.1:8788:8788/);
  assert.doesNotMatch(compose, /^\s*PHLEBAS_MATCHER_URL:/m);
  assert.match(compose, /Do not set PHLEBAS_MATCHER_URL on Vercel/);
  assert.match(compose, /PHLEBAS_ALLOW_NON_LOOPBACK: "1"/);
  assert.match(dockerfile, /node:24/);
  assert.match(dockerfile, /COPY services/);
});

test("LICENSE is Apache-2.0 and the Sepolia manifest stays undeployed", async () => {
  const license = await readFile(join(root, "LICENSE"), "utf8");
  const choice = await readFile(join(root, "docs/LICENSE_CHOICE.md"), "utf8");
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { license: string };
  const manifest = JSON.parse(await readFile(join(root, "infra/testnet/arbitrum-sepolia.json"), "utf8")) as {
    deployed: boolean;
    chainId: number;
    broadcastTx: string | null;
  };
  assert.match(license, /Apache License/);
  assert.match(license, /Version 2\.0/);
  assert.doesNotMatch(license, /^MIT License/m);
  assert.equal(pkg.license, "Apache-2.0");
  assert.match(choice, /Apache License 2\.0/);
  assert.match(choice, /not MIT/i);
  assert.equal(manifest.deployed, false);
  assert.equal(manifest.chainId, 421614);
  assert.equal(manifest.broadcastTx, null);
});

test("operator runbook exists and CI does not set a matcher URL", async () => {
  const runbook = await readFile(join(root, "docs/OPERATOR_RUNBOOK.md"), "utf8");
  const ci = await readFile(join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(runbook, /127\.0\.0\.1:8788/);
  assert.match(runbook, /Do not set `PHLEBAS_MATCHER_URL` on Vercel/);
  assert.doesNotMatch(ci, /PHLEBAS_MATCHER_URL/);
});

test("secret scan checks tracked bytes and fails matcher URLs in committed Vercel env files", async () => {
  const scan = await readFile(join(root, "scripts/scan-secrets.mjs"), "utf8");
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.match(scan, /name: "vercel-operator-matcher"/);
  assert.match(scan, /PHLEBAS_MATCHER_URL\\s\*\[:=\]/);
  assert.match(scan, /git", \["ls-files", "-z"\]/);
  assert.match(scan, /\(\^|\\\/\)\(\\\.env|vercel\\\.json|\\\.vercel\\\/\)/);
  assert.match(pkg.scripts.check, /scan:secrets/);
});
