export const BRAND = "PageSentinel";
export const VERSION = 1;
export const MAX_TEXT = 120_000;
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_STORAGE = 50 * 1024 * 1024;
export type Kind = "text" | "policy" | "keyword" | "price" | "availability";
export type Condition =
  | "any"
  | "appears"
  | "disappears"
  | "count"
  | "below"
  | "decreases"
  | "increases"
  | "lowest";
export interface Config {
  title: string;
  url: string;
  selector: string;
  exclude: string;
  kind: Kind;
  interval: number;
  phrase: string;
  condition: Condition;
  target: number;
  decimal: "auto" | "." | ",";
  ignoreNumbers: boolean;
  ignoreDates: boolean;
  ignoreText: string;
  threshold: number;
  notify: boolean;
}
export interface Monitor extends Config {
  id: string;
  created: number;
  paused: boolean;
  permissionRequired: boolean;
  nextCheck: number;
  lastAttempt: number;
  lastSuccess: number;
  lastChange: number;
  failures: number;
  error: string;
  unread: number;
  lease: number;
  hash: string;
  baseline: string;
  lastPrice?: number;
  lowPrice?: number;
  currency?: string;
  notificationError?: string;
  initialPreview?: string;
}
export interface Snapshot {
  id: string;
  monitorId: string;
  time: number;
  before: string;
  after: string;
  alert: boolean;
  initial: boolean;
}
export interface Settings {
  theme: "system" | "light" | "dark" | "amoled";
  accent: "blue" | "teal" | "violet" | "green" | "rose" | "neutral";
  retention: number;
  notifications: boolean;
}
export const defaultSettings: Settings = {
  theme: "system",
  accent: "teal",
  retention: 40,
  notifications: true,
};
export const defaults: Config = {
  title: "",
  url: "",
  selector: "",
  exclude: "",
  kind: "text",
  interval: 15,
  phrase: "",
  condition: "any",
  target: 0,
  decimal: "auto",
  ignoreNumbers: false,
  ignoreDates: false,
  ignoreText: "",
  threshold: 0,
  notify: true,
};
export function health(
  m: Monitor,
  now = Date.now(),
): { label: string; tone: string; detail: string } {
  if (m.permissionRequired)
    return {
      label: "Permission required",
      tone: "error",
      detail: "Website access was removed. Grant access to resume checks.",
    };
  if (m.paused)
    return {
      label: "Paused",
      tone: "muted",
      detail: "Scheduled checks are paused.",
    };
  if (m.lease > now)
    return {
      label: "Checking",
      tone: "neutral",
      detail: "Reading the public page…",
    };
  if (m.error)
    return { label: "Needs attention", tone: "error", detail: m.error };
  if (m.interval && m.nextCheck && now > m.nextCheck + 180_000)
    return {
      label: "Overdue",
      tone: "warning",
      detail:
        "The expected check is late. Chrome may have been asleep. Retry now.",
    };
  if (!m.lastSuccess)
    return {
      label: "Awaiting baseline",
      tone: "warning",
      detail: "No successful check yet. Monitoring is not confirmed.",
    };
  if (m.unread)
    return {
      label: "Changed",
      tone: "changed",
      detail: `${m.unread} unread change${m.unread === 1 ? "" : "s"}. Last check succeeded.`,
    };
  return {
    label: m.interval ? "Healthy" : "Manual only",
    tone: "success",
    detail: m.interval
      ? "The last check succeeded. Checks run while Chrome is active."
      : "No scheduled checks. Use Check now to refresh.",
  };
}
