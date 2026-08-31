import { encodeSettleCalldata } from "./settlement-abi.ts";
import { assertAddress, type TypedOrder } from "./eip712.ts";
import { isOnchainAddress } from "./sepolia-manifest.ts";
import { ARBITRUM_SEPOLIA_HEX, type Eip1193Provider } from "./evm-wallet.ts";
import { TESTNET } from "./testnet.ts";

export const SEPOLIA_SUBMIT_FLAG = "NEXT_PUBLIC_PHLEBAS_SEPOLIA_SUBMIT";

export function sepoliaSubmitEnabled(env?: Record<string, string | undefined>): boolean {
  return env
    ? env[SEPOLIA_SUBMIT_FLAG] === "1"
    : process.env.NEXT_PUBLIC_PHLEBAS_SEPOLIA_SUBMIT === "1";
}

export function configuredSettlementAddress(): string | null {
  return isOnchainAddress(TESTNET.settlement) ? TESTNET.settlement : null;
}

export type SubmitPlan =
  | { action: "sign-only"; reason: string }
  | { action: "sequence"; reason: string }
  | { action: "settle"; reason: string; to: string; calldata: string };

export function planTestnetSubmit(input: {
  flag?: boolean;
  settlement?: string | null;
  counterpart: { order: TypedOrder; signature: string } | null;
  taker: TypedOrder;
  takerSignature: string;
  fillAtoms: bigint;
}): SubmitPlan {
  const flag = input.flag ?? sepoliaSubmitEnabled();
  if (!flag) {
    return { action: "sign-only", reason: "Sepolia submit flag is off. Typed data is signed only." };
  }
  const settlement = input.settlement === undefined ? configuredSettlementAddress() : input.settlement;
  if (!input.counterpart) {
    return { action: "sequence", reason: "No crossing signed order. Sequence locally; nothing is sent to settlement." };
  }
  if (!isOnchainAddress(settlement)) {
    return { action: "sequence", reason: "Settlement address is undeployed. Sequence only." };
  }
  return {
    action: "settle",
    reason: "Sign-and-submit is enabled for Arbitrum Sepolia.",
    to: settlement,
    calldata: encodeSettleCalldata(
      input.counterpart.order,
      input.counterpart.signature,
      input.taker,
      input.takerSignature,
      input.fillAtoms,
    ),
  };
}

export async function sendSettlement(
  provider: Eip1193Provider,
  from: string,
  plan: Extract<SubmitPlan, { action: "settle" }>,
): Promise<string> {
  const chainId = await provider.request({ method: "eth_chainId" }) as string;
  if (chainId.toLowerCase() !== ARBITRUM_SEPOLIA_HEX) {
    throw new Error("Submit is Arbitrum Sepolia only.");
  }
  const sender = assertAddress(from, "from");
  const settlement = assertAddress(plan.to, "settlement");
  if (!/^0x[0-9a-f]+$/i.test(plan.calldata)) throw new TypeError("Settlement calldata must be 0x-prefixed hex");
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from: sender, to: settlement, data: plan.calldata }],
  });
  if (typeof hash !== "string" || !hash.startsWith("0x")) {
    throw new Error("Provider did not return a transaction hash");
  }
  return hash;
}
