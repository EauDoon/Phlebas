export const RENDER_FAILURE_MESSAGE =
  "Labeled rendering-failure demonstration. Retry is safe; nothing was submitted.";

export function isRenderFailureQuery(value: string | undefined): boolean {
  return value === "1";
}
