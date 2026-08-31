export type DestinationInspection = {
  class: "empty" | "placeholder" | "shielded" | "tex" | "transparent-shape" | "unrecognized";
  eligibleLater: boolean;
  message: string;
};

const TRANSPARENT_SHAPE = /^t[13][1-9A-HJ-NP-Za-km-z]{25,50}$/;

export function inspectTransparentDestination(value: string): DestinationInspection {
  const destination = value.trim();
  if (destination.length === 0) {
    return {
      class: "empty",
      eligibleLater: false,
      message: "Enter a destination to inspect. This simulation never sends ZEC.",
    };
  }
  if (destination.includes("{TEX_ADDRESS}") || destination.startsWith("zcash:")) {
    return {
      class: "placeholder",
      eligibleLater: false,
      message: "Payment-request templates are not payout destinations.",
    };
  }
  if (/^tex1[0-9a-z]+$/i.test(destination)) {
    return {
      class: "tex",
      eligibleLater: false,
      message: "TEX is for deposits. This simulation does not accept TEX payouts and never displays a receivable tex1 string.",
    };
  }
  if (/^[zu][a-z0-9]/i.test(destination)) {
    return {
      class: "shielded",
      eligibleLater: false,
      message: "Shielded and unified addresses are out of scope. Withdrawals accept only a network-correct transparent destination under the proposed policy.",
    };
  }
  if (TRANSPARENT_SHAPE.test(destination)) {
    return {
      class: "transparent-shape",
      eligibleLater: false,
      message: "Transparent-shape input noted. No wallet is Phlebas-verified, and this simulation does not send ZEC.",
    };
  }
  return {
    class: "unrecognized",
    eligibleLater: false,
    message: "Unrecognized destination. A later testnet would accept only a network-correct transparent address.",
  };
}
