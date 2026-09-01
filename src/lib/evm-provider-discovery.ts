import type { Eip1193Provider } from "./evm-wallet.ts";

export const EIP6963_REQUEST_EVENT = "eip6963:requestProvider" as const;
export const EIP6963_ANNOUNCE_EVENT = "eip6963:announceProvider" as const;

export type Eip6963ProviderInfo = Readonly<{
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}>;

export type Eip6963ProviderDetail = Readonly<{
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}>;

export type Eip6963EventTarget = Pick<EventTarget, "addEventListener" | "removeEventListener" | "dispatchEvent">;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RDNS = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function canonicalProviderDetail(value: unknown): Eip6963ProviderDetail | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const detail = value as Record<string, unknown>;
    if (detail.info === null || typeof detail.info !== "object" || Array.isArray(detail.info)
      || detail.provider === null || typeof detail.provider !== "object" || Array.isArray(detail.provider)) {
      return null;
    }
    const info = detail.info as Record<string, unknown>;
    const provider = detail.provider as Eip1193Provider;
    if (typeof info.uuid !== "string" || !UUID_V4.test(info.uuid)
      || typeof info.name !== "string" || info.name.length === 0 || info.name.length > 64 || info.name.trim() !== info.name
      || typeof info.icon !== "string" || !info.icon.startsWith("data:image/") || info.icon.length > 100_000
      || typeof info.rdns !== "string" || !RDNS.test(info.rdns) || info.rdns.length > 255
      || typeof provider.request !== "function") {
      return null;
    }
    return Object.freeze({
      info: Object.freeze({
        uuid: info.uuid.toLowerCase(),
        name: info.name,
        icon: info.icon,
        rdns: info.rdns.toLowerCase(),
      }),
      provider,
    });
  } catch {
    return null;
  }
}

function browserEventTarget(): Eip6963EventTarget | null {
  return typeof window === "undefined" ? null : window;
}

export async function discoverEip6963Providers(
  target: Eip6963EventTarget | null = browserEventTarget(),
  settleMilliseconds = 50,
): Promise<readonly Eip6963ProviderDetail[]> {
  if (!Number.isSafeInteger(settleMilliseconds) || settleMilliseconds < 0 || settleMilliseconds > 1_000) {
    throw new RangeError("EIP-6963 discovery delay must be an integer from 0 to 1000 milliseconds");
  }
  if (!target) return Object.freeze([]);

  const providers = new Map<string, Eip6963ProviderDetail>();
  const listener: EventListener = (event) => {
    const detail = canonicalProviderDetail((event as Event & { detail?: unknown }).detail);
    if (detail && !providers.has(detail.info.uuid)) providers.set(detail.info.uuid, detail);
  };
  target.addEventListener(EIP6963_ANNOUNCE_EVENT, listener);
  try {
    target.dispatchEvent(new Event(EIP6963_REQUEST_EVENT));
    await new Promise<void>((resolve) => setTimeout(resolve, settleMilliseconds));
  } finally {
    target.removeEventListener(EIP6963_ANNOUNCE_EVENT, listener);
  }
  return Object.freeze([...providers.values()].sort((left, right) => (
    left.info.rdns.localeCompare(right.info.rdns)
      || left.info.name.localeCompare(right.info.name)
      || left.info.uuid.localeCompare(right.info.uuid)
  )));
}

export function selectEip6963Provider(
  providers: readonly Eip6963ProviderDetail[],
  preferredRdns: string,
): Eip6963ProviderDetail | null {
  if (typeof preferredRdns !== "string" || !RDNS.test(preferredRdns) || preferredRdns.length > 255) {
    throw new TypeError("Preferred wallet RDNS is invalid");
  }
  const canonical = preferredRdns.toLowerCase();
  return providers.find((entry) => entry.info.rdns === canonical) ?? null;
}
