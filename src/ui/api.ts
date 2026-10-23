import { defaultSettings, type Monitor, type Settings } from "../core/model";
export async function api<T = unknown>(
  type: string,
  rest: Record<string, unknown> = {},
): Promise<T> {
  if (!globalThis.chrome?.runtime?.id)
    throw new Error("Load the built extension in Chrome to use monitoring.");
  const response = await chrome.runtime.sendMessage({ type, ...rest });
  if (!response?.ok)
    throw new Error(
      response?.error ?? "The extension did not respond. Reload and retry.",
    );
  return response.data as T;
}
export interface State {
  monitors: Monitor[];
  settings: Settings;
}
export const emptyState: State = { monitors: [], settings: defaultSettings };
export function appearance(settings: Settings) {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme =
    settings.theme === "system" ? (dark ? "dark" : "light") : settings.theme;
  document.documentElement.dataset.accent = settings.accent;
}
export function when(time: number) {
  return time
    ? new Date(time).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not yet";
}
export function relative(time: number) {
  if (!time) return "Never";
  const delta = Date.now() - time;
  if (delta < 60_000) return "Just now";
  if (delta < 3600_000) return `${Math.floor(delta / 60_000)} min ago`;
  if (delta < 86400_000) return `${Math.floor(delta / 3600_000)} hr ago`;
  return new Date(time).toLocaleDateString(undefined, { dateStyle: "medium" });
}
