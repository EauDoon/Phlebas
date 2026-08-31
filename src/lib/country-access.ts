export type CountryAccessPolicy = {
  default: "deny";
  enabled: readonly string[];
};

export const COUNTRY_ACCESS: CountryAccessPolicy = {
  default: "deny",
  enabled: [],
};

export function isCountryEnabled(isoAlpha2: string, policy: CountryAccessPolicy = COUNTRY_ACCESS): boolean {
  if (!/^[A-Z]{2}$/.test(isoAlpha2)) return false;
  return policy.default === "deny" && policy.enabled.includes(isoAlpha2);
}
