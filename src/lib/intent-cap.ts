export const GATEWAY_DEFAULT_MAX_INTENTS = 64;

export function gatewayMaxIntents(env: Record<string, string | undefined> = process.env): number {
  const parsed = Number(env.PHLEBAS_GATEWAY_MAX_INTENTS ?? GATEWAY_DEFAULT_MAX_INTENTS);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : GATEWAY_DEFAULT_MAX_INTENTS;
}
