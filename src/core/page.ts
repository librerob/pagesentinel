import { webURL } from "./validation";

// Chrome's current URL is authoritative after navigation, not a pending or typed URL.
export function pageURL(tab: { url?: string } | undefined): string {
  return webURL(tab?.url).href;
}
export function pageSelection(
  tab: { url?: string; title?: string },
  selector: string,
  preview: string,
) {
  return {
    url: pageURL(tab),
    title: (tab.title ?? "").slice(0, 200),
    selector,
    preview,
  };
}
