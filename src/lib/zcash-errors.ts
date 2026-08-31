// Named error types for the Zcash layer. The matcher, the wallet adapter,
// and the UI surface raise these so the failure mode is a stable string
// rather than an opaque RangeError message.

export class ZcashLengthError extends RangeError {
  constructor(field: string, expected: number, actual: number) {
    super(`Zcash ${field} must be exactly ${expected} bytes, got ${actual}`);
  }
}

export class ZcashVersionError extends RangeError {
  constructor(version: number) {
    super(`Unknown Zcash address version: 0x${version.toString(16)}`);
  }
}

export class ZcashScriptError extends RangeError {
  constructor(reason: string) {
    super(`Zcash script error: ${reason}`);
  }
}
