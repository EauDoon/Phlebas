export const RENDER_FAILURE_MESSAGE =
  "Labeled rendering-failure demonstration. Retry is safe; nothing was submitted.";

export function isRenderFailureQuery(value: string | undefined): boolean {
  return value === "1";
}

export function stripRenderFailureSearch(search: string): string {
  const prefixed = search.startsWith("?");
  const params = new URLSearchParams(prefixed ? search.slice(1) : search);
  if (!isRenderFailureQuery(params.get("error") ?? undefined)) {
    return search;
  }
  params.delete("error");
  const next = params.toString();
  return next.length === 0 ? "" : `?${next}`;
}
