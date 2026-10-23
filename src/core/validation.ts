import { defaults, type Config, type Settings, defaultSettings } from "./model";
export function webURL(value: unknown): URL {
  if (typeof value !== "string" || value.length > 4096)
    throw new Error("Enter a valid public website URL.");
  const u = new URL(value);
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
    throw new Error("Use an HTTP or HTTPS URL without embedded credentials.");
  const host = u.hostname.toLowerCase();
  // IP literals and single-label/local domains are deliberately unsupported. DNS
  // rebinding cannot be prevented by extension JavaScript; see SECURITY.md.
  if (
    !host.includes(".") ||
    host.includes(":") ||
    host.includes("[") ||
    /^[\d.]+$/.test(host) ||
    /\.(localhost|local|internal|lan|home|test|invalid)$/.test(host) ||
    host.endsWith(".arpa")
  )
    throw new Error(
      "Use a public domain. Local addresses and IP literals are not supported.",
    );
  u.hash = "";
  return u;
}
export function originPattern(value: string) {
  return `${webURL(value).origin}/*`;
}
function record(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw new Error("Invalid data.");
  return x as Record<string, unknown>;
}
export function config(input: unknown): Config {
  const x = record(input),
    c = { ...defaults };
  for (const k of [
    "title",
    "url",
    "selector",
    "exclude",
    "phrase",
    "ignoreText",
  ] as const) {
    if (
      typeof x[k] !== "string" ||
      (x[k] as string).length >
        (k === "url" ? 4096 : k === "title" ? 200 : 1000)
    )
      throw new Error(`Invalid ${k}.`);
    c[k] = (x[k] as string).trim();
  }
  c.url = webURL(c.url).href;
  if (!c.title) c.title = new URL(c.url).hostname;
  if (
    !["text", "policy", "keyword", "price", "availability"].includes(
      String(x.kind),
    )
  )
    throw new Error("Invalid monitor type.");
  c.kind = x.kind as Config["kind"];
  c.interval = Number(x.interval);
  if (
    !Number.isFinite(c.interval) ||
    (c.interval !== 0 && (c.interval < 1 || c.interval > 43200))
  )
    throw new Error(
      "Use manual checks or an interval from 1 minute to 30 days.",
    );
  c.threshold = Number(x.threshold);
  c.target = Number(x.target);
  if (
    !Number.isFinite(c.target) ||
    c.target < 0 ||
    !Number.isFinite(c.threshold) ||
    c.threshold < 0 ||
    c.threshold > 100
  )
    throw new Error("Invalid price target or change threshold.");
  if (!["auto", ".", ","].includes(String(x.decimal)))
    throw new Error("Invalid decimal separator.");
  c.decimal = x.decimal as Config["decimal"];
  const allowed =
    c.kind === "price"
      ? ["below", "decreases", "increases", "lowest"]
      : c.kind === "keyword" || c.kind === "availability"
        ? ["appears", "disappears", "count"]
        : ["any"];
  if (!allowed.includes(String(x.condition)))
    throw new Error("Choose a valid alert condition.");
  c.condition = x.condition as Config["condition"];
  if (["keyword", "availability"].includes(c.kind) && !c.phrase)
    throw new Error("Enter a word or phrase to watch.");
  if (c.kind === "price" && !c.selector)
    throw new Error(
      "Select the price element so unrelated numbers are excluded.",
    );
  for (const k of ["ignoreNumbers", "ignoreDates", "notify"] as const) {
    if (typeof x[k] !== "boolean") throw new Error(`Invalid ${k}.`);
    c[k] = x[k];
  }
  if (c.kind === "price" && (c.ignoreNumbers || c.ignoreDates))
    throw new Error("Price monitors must preserve numbers and dates.");
  return c;
}
export function settings(input: unknown): Settings {
  const x = record(input);
  if (
    !["system", "light", "dark", "amoled"].includes(String(x.theme)) ||
    !["blue", "teal", "violet", "green", "rose", "neutral"].includes(
      String(x.accent),
    ) ||
    typeof x.notifications !== "boolean" ||
    !Number.isInteger(x.retention) ||
    Number(x.retention) < 10 ||
    Number(x.retention) > 200
  )
    throw new Error("Invalid appearance or retention settings.");
  return {
    ...defaultSettings,
    theme: x.theme as Settings["theme"],
    accent: x.accent as Settings["accent"],
    notifications: x.notifications,
    retention: Number(x.retention),
  };
}
