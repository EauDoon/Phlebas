export function activateSkipLink(event: {
  currentTarget: { getAttribute(name: string): string | null; blur(): void };
  preventDefault(): void;
}): void {
  const href = event.currentTarget.getAttribute("href");
  if (!href?.startsWith("#") || href.length < 2) return;
  const target = globalThis.document?.getElementById(href.slice(1));
  if (!target || typeof target.focus !== "function") return;
  event.preventDefault();
  event.currentTarget.blur();
  target.focus();
  globalThis.history.replaceState(null, "", href);
}
