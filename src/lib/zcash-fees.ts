export const MAX_ZATOSHIS = 2_100_000_000_000_000n;
export const ZIP317_MARGINAL_FEE_ZATOSHIS = 5_000n;
export const ZIP317_GRACE_ACTIONS = 2;
export const ZIP317_P2PKH_INPUT_BYTES = 150;
export const ZIP317_P2PKH_OUTPUT_BYTES = 34;

export type FinalizedTransparentSize = Readonly<{
  inputBytes: number;
  outputBytes: number;
}>;

export type TransparentFeePolicy = Readonly<{
  id: string;
  maximumFeeZatoshis: bigint;
  minimumOutputZatoshis: bigint;
  maximumTransactionBytes: number;
  conventionalFee(size: FinalizedTransparentSize): bigint;
}>;

export type ChangeDisposition = "none" | "change" | "add-to-fee";

export type TransparentChangePlan = Readonly<{
  disposition: ChangeDisposition;
  feeZatoshis: bigint;
  changeZatoshis: bigint;
}>;

function positiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer`);
  return value;
}

function zatoshis(value: bigint, label: string, allowZero = false): bigint {
  if (typeof value !== "bigint" || value < 0n || (!allowZero && value === 0n) || value > MAX_ZATOSHIS) {
    throw new RangeError(`${label} must be ${allowZero ? "non-negative" : "positive"} and no greater than 21,000,000 ZEC`);
  }
  return value;
}

function divideUp(value: number, divisor: number): number {
  return Math.floor((value + divisor - 1) / divisor);
}

export function zip317TransparentConventionalFee(size: FinalizedTransparentSize): bigint {
  const inputBytes = positiveSafeInteger(size.inputBytes, "Finalized transparent input bytes");
  const outputBytes = positiveSafeInteger(size.outputBytes, "Finalized transparent output bytes");
  const transparentActions = Math.max(
    divideUp(inputBytes, ZIP317_P2PKH_INPUT_BYTES),
    divideUp(outputBytes, ZIP317_P2PKH_OUTPUT_BYTES),
  );
  const fee = ZIP317_MARGINAL_FEE_ZATOSHIS * BigInt(Math.max(ZIP317_GRACE_ACTIONS, transparentActions));
  if (fee > MAX_ZATOSHIS) throw new RangeError("Conventional fee exceeds the ZEC supply bound");
  return fee;
}

export function createZip317TransparentPolicy(options: {
  maximumFeeZatoshis: bigint;
  minimumOutputZatoshis: bigint;
  maximumTransactionBytes: number;
}): TransparentFeePolicy {
  const maximumFeeZatoshis = zatoshis(options.maximumFeeZatoshis, "Maximum fee");
  const minimumOutputZatoshis = zatoshis(options.minimumOutputZatoshis, "Minimum output");
  const maximumTransactionBytes = positiveSafeInteger(options.maximumTransactionBytes, "Maximum transaction bytes");
  if (minimumOutputZatoshis + maximumFeeZatoshis > MAX_ZATOSHIS) {
    throw new RangeError("Minimum output and maximum fee exceed the ZEC supply bound");
  }
  return {
    id: "zip317-transparent-r0-r1",
    maximumFeeZatoshis,
    minimumOutputZatoshis,
    maximumTransactionBytes,
    conventionalFee: zip317TransparentConventionalFee,
  };
}

export function validateTransparentFee(
  policy: TransparentFeePolicy,
  size: FinalizedTransparentSize,
  feeZatoshis: bigint,
): void {
  const fee = zatoshis(feeZatoshis, "Transaction fee");
  const inputBytes = positiveSafeInteger(size.inputBytes, "Finalized transparent input bytes");
  const outputBytes = positiveSafeInteger(size.outputBytes, "Finalized transparent output bytes");
  const transactionBytes = inputBytes + outputBytes;
  if (!Number.isSafeInteger(transactionBytes)) throw new RangeError("Finalized transparent size exceeds a safe integer");
  if (transactionBytes > positiveSafeInteger(policy.maximumTransactionBytes, "Maximum transaction bytes")) {
    throw new RangeError("Finalized transparent transaction exceeds the configured size limit");
  }
  const conventionalFee = zatoshis(policy.conventionalFee({ inputBytes, outputBytes }), "Conventional fee");
  if (fee < conventionalFee) throw new RangeError("Transaction fee is below the configured conventional fee");
  if (fee > policy.maximumFeeZatoshis) throw new RangeError("Transaction fee exceeds the approved maximum");
}

export function planTransparentChange(options: {
  policy: TransparentFeePolicy;
  inputTotalZatoshis: bigint;
  fixedOutputTotalZatoshis: bigint;
  feeZatoshis: bigint;
  finalizedSizeWithoutChange: FinalizedTransparentSize;
  finalizedSizeWithChange: FinalizedTransparentSize;
  belowMinimum: "reject" | "add-to-fee";
}): TransparentChangePlan {
  const inputTotal = zatoshis(options.inputTotalZatoshis, "Input total");
  const fixedOutputTotal = zatoshis(options.fixedOutputTotalZatoshis, "Fixed output total");
  const fee = zatoshis(options.feeZatoshis, "Transaction fee");
  if (fixedOutputTotal < options.policy.minimumOutputZatoshis) {
    throw new RangeError("Fixed output total is below the configured minimum output");
  }
  if (fixedOutputTotal + fee > inputTotal) throw new RangeError("Inputs do not cover fixed outputs and fee");

  const remainder = inputTotal - fixedOutputTotal - fee;
  if (remainder === 0n) {
    validateTransparentFee(options.policy, options.finalizedSizeWithoutChange, fee);
    return { disposition: "none", feeZatoshis: fee, changeZatoshis: 0n };
  }

  if (remainder >= options.policy.minimumOutputZatoshis) {
    validateTransparentFee(options.policy, options.finalizedSizeWithChange, fee);
    return { disposition: "change", feeZatoshis: fee, changeZatoshis: remainder };
  }

  if (options.belowMinimum !== "add-to-fee") {
    throw new RangeError("Change is below the configured minimum and cannot be omitted silently");
  }
  const increasedFee = fee + remainder;
  validateTransparentFee(options.policy, options.finalizedSizeWithoutChange, increasedFee);
  return { disposition: "add-to-fee", feeZatoshis: increasedFee, changeZatoshis: 0n };
}
