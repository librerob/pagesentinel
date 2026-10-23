import { diffWordsWithSpace, diffArrays } from "diff";
import type { Config, Monitor } from "./model";
export interface Price {
  value: number;
  currency: string;
}
export function price(
  text: string,
  decimal: Config["decimal"] = "auto",
): Price {
  const currencies = [
    ...new Set(text.match(/EUR|USD|GBP|CAD|AUD|JPY|CHF|€|£|\$|¥/g) ?? []),
  ];
  const tokens =
    text
      .match(/\d(?:[\d.,\u00a0 ]*\d)?/g)
      ?.map((x) => x.trim())
      .filter(Boolean) ?? [];
  if (tokens.length !== 1 || currencies.length !== 1)
    throw new Error("Price is ambiguous. Select one price with one currency.");
  let value = tokens[0].replace(/[\s\u00a0]/g, "");
  let separator = decimal;
  if (separator === "auto") {
    const dot = value.lastIndexOf("."),
      comma = value.lastIndexOf(",");
    if (dot >= 0 && comma >= 0) separator = dot > comma ? "." : ",";
    else if (dot >= 0 || comma >= 0) {
      const char = dot >= 0 ? "." : ",";
      const count = value.split(char).length - 1;
      const tail = value.length - value.lastIndexOf(char) - 1;
      if (count !== 1 || tail === 3)
        throw new Error(
          "Ambiguous separators. Choose the decimal separator in monitor settings.",
        );
      if (tail !== 1 && tail !== 2)
        throw new Error("Unrecognized price format.");
      separator = char;
    }
  }
  if (separator !== "auto") {
    const group = separator === "." ? "," : ".";
    const parts = value.split(separator);
    if (
      parts.length > 2 ||
      (parts[1] && !/^\d{1,2}$/.test(parts[1])) ||
      (parts[0].includes(group) &&
        !new RegExp(`^\\d{1,3}(\\${group}\\d{3})+$`).test(parts[0]))
    )
      throw new Error("Unrecognized price grouping.");
    value = parts[0].split(group).join("") + (parts[1] ? "." + parts[1] : "");
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0)
    throw new Error("Could not read a valid price.");
  return { value: number, currency: currencies[0] };
}
export function occurrences(text: string, phrase: string) {
  return text.toLocaleLowerCase().split(phrase.toLocaleLowerCase()).length - 1;
}
export function evaluate(
  m: Monitor,
  next: string,
): { alert: boolean; price?: Price } {
  if (m.kind === "price") {
    const p = price(next, m.decimal);
    if (m.currency && p.currency !== m.currency)
      throw new Error(
        "Currency changed. Confirm the page and reset its baseline.",
      );
    const previous = m.lastPrice;
    const alert =
      previous !== undefined &&
      (m.condition === "below"
        ? previous >= m.target && p.value < m.target
        : m.condition === "decreases"
          ? p.value < previous
          : m.condition === "increases"
            ? p.value > previous
            : p.value < (m.lowPrice ?? previous));
    return { alert, price: p };
  }
  if (!m.hash) return { alert: false };
  if (m.kind === "keyword" || m.kind === "availability") {
    const before = occurrences(m.baseline, m.phrase),
      after = occurrences(next, m.phrase);
    return {
      alert:
        m.condition === "appears"
          ? before === 0 && after > 0
          : m.condition === "disappears"
            ? before > 0 && after === 0
            : before !== after,
    };
  }
  const parts = wordDiff(m.baseline, next);
  const changed = parts
    .filter((p) => p.added || p.removed)
    .reduce((n, p) => n + p.value.length, 0);
  return {
    alert:
      m.baseline !== next &&
      (100 * changed) / Math.max(m.baseline.length, next.length, 1) >=
        m.threshold,
  };
}
export function wordDiff(before: string, after: string) {
  return (
    diffWordsWithSpace(before, after, { timeout: 120 }) ?? [
      { value: before, removed: true },
      { value: after, added: true },
    ]
  );
}
export function paragraphs(before: string, after: string) {
  const parts = diffArrays(before.split(/\n\n+/), after.split(/\n\n+/), {
    timeout: 120,
  });
  return (
    parts ?? [
      { value: before.split(/\n\n+/), removed: true },
      { value: after.split(/\n\n+/), added: true },
    ]
  );
}
const topics: [string, RegExp][] = [
  ["Data sharing", /third.part|shar(?:e|ing)|advertis|sell(?:ing)?/i],
  [
    "Retention",
    /retention|retain|storage period|keep.{0,30}(?:days|months|years)/i,
  ],
  ["Account deletion", /delet|eras(?:e|ure)/i],
  ["Tracking", /cookie|track|fingerprint/i],
  [
    "International transfers",
    /international|cross.border|transfer.{0,30}(?:data|countr)/i,
  ],
  ["Consent", /consent|opt.out|opt.in/i],
  ["Security", /secur|encrypt|breach/i],
  ["Subscription terms", /subscription|renew|arbitrat/i],
];
export function policyEvidence(before: string, after: string) {
  return paragraphs(before, after)
    .filter((p) => p.added || p.removed)
    .flatMap((p) =>
      p.value.flatMap((text) =>
        topics
          .filter(([, rule]) => rule.test(text))
          .map(([topic]) => ({ topic, text, removed: !!p.removed })),
      ),
    );
}
