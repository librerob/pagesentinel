import { parseDocument } from "htmlparser2";
import { selectAll } from "css-select";
import { textContent } from "domutils";
import type { AnyNode, Element } from "domhandler";
import { MAX_BYTES, type Company, type PolicyType } from "./model";
import { webURL } from "./validation";

export const policyTypes: PolicyType[] = [
  "privacy",
  "terms",
  "cookies",
  "retention",
  "deletion",
  "security",
  "other",
];
export interface PolicyLink {
  url: string;
  title: string;
  type: PolicyType;
  language: string;
}
const names: [PolicyType, RegExp][] = [
  ["cookies", /\bcookies?\b|informasjonskaps|témoins|galletas/i],
  [
    "retention",
    /retention|aufbewahrung|lagringstid|conservaci[oó]n|conservation/i,
  ],
  [
    "deletion",
    /account.delet|slett.{0,15}konto|l[oö]schung|eliminar.{0,15}cuenta|suppression.{0,15}compte/i,
  ],
  [
    "privacy",
    /privacy|personvern|datenschutz|privacidad|confidentialit[eé]|protection.des.donn[eé]es/i,
  ],
  [
    "terms",
    /terms|vilk[aå]r|nutzungsbedingungen|condiciones|conditions.d.utilisation|conditions.g[eé]n[eé]rales/i,
  ],
  ["security", /security|sikkerhet|sicherheit|seguridad|s[eé]curit[eé]/i],
];
export function discoverPolicies(base: string, links: unknown): PolicyLink[] {
  const source = webURL(base);
  if (!Array.isArray(links) || links.length > 2000)
    throw new Error("Too many page links. Use a policy URL directly.");
  const found = new Map<string, PolicyLink>();
  for (const link of links) {
    if (!link || typeof link !== "object") continue;
    const { href, text, language } = link as Record<string, unknown>;
    if (
      typeof href !== "string" ||
      href.length > 4096 ||
      href.startsWith("#") ||
      typeof text !== "string" ||
      text.length > 300
    )
      continue;
    try {
      const url = webURL(new URL(href, source).href);
      const type = names.find(
        ([, pattern]) =>
          pattern.test(text) || pattern.test(decodeURIComponent(url.pathname)),
      )?.[0];
      if (!type || found.has(url.href)) continue;
      found.set(url.href, {
        url: url.href,
        title: text.trim().slice(0, 200) || type,
        type,
        language:
          typeof language === "string" &&
          /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(language)
            ? language
            : "",
      });
      if (found.size === 80) break;
    } catch {
      /* Malformed or nonpublic links are not candidates. */
    }
  }
  return [...found.values()];
}
export function discoverHTML(url: string, html: string) {
  if (new TextEncoder().encode(html).byteLength > MAX_BYTES)
    throw new Error("Page exceeds the discovery limit.");
  const doc = parseDocument(html);
  return discoverPolicies(
    url,
    selectAll<AnyNode, Element>("a[href]", doc)
      .slice(0, 2000)
      .map((a) => ({
        href: a.attribs.href,
        text: textContent(a).trim().slice(0, 300),
        language: a.attribs.hreflang ?? "",
      })),
  );
}
export function companyConfig(input: unknown, existing?: Company): Company {
  if (!input || typeof input !== "object") throw new Error("Invalid company.");
  const x = input as Record<string, unknown>;
  if (
    typeof x.name !== "string" ||
    !x.name.trim() ||
    x.name.length > 200 ||
    typeof x.description !== "string" ||
    x.description.length > 1000 ||
    typeof x.paused !== "boolean" ||
    !Number.isInteger(x.interval) ||
    Number(x.interval) < 0 ||
    Number(x.interval) > 43200
  )
    throw new Error("Enter a company name and a valid schedule.");
  const url = webURL(x.url).href;
  if (
    !Array.isArray(x.domains) ||
    x.domains.length > 2000 ||
    !x.domains.every((d) => typeof d === "string")
  )
    throw new Error("Invalid associated domains.");
  const domains = [
    ...new Set([
      new URL(url).origin,
      ...x.domains.map((d) => webURL(d).origin),
    ]),
  ];
  return {
    id: existing?.id ?? crypto.randomUUID(),
    created: existing?.created ?? Date.now(),
    name: x.name.trim(),
    url,
    description: x.description,
    domains,
    interval: Number(x.interval),
    paused: x.paused,
  };
}
export function companyHealth(
  company: Company,
  monitors: {
    companyId?: string;
    paused: boolean;
    error: string;
    permissionRequired: boolean;
    notificationError?: string;
    lastSuccess: number;
    unread: number;
    interval: number;
    nextCheck: number;
  }[],
  now = Date.now(),
) {
  const documents = monitors.filter((m) => m.companyId === company.id);
  const attention = documents.filter(
    (m) =>
      m.error ||
      m.notificationError ||
      m.permissionRequired ||
      (!company.paused &&
        !m.paused &&
        m.interval &&
        now > m.nextCheck + 180000),
  ).length;
  return {
    documents: documents.length,
    attention,
    unread: documents.reduce((n, m) => n + m.unread, 0),
    lastSuccess:
      documents.length && documents.every((m) => m.lastSuccess)
        ? Math.min(...documents.map((m) => m.lastSuccess))
        : 0,
    label: company.paused
      ? "Paused"
      : attention
        ? "Needs attention"
        : !documents.length
          ? "No documents"
          : documents.some((m) => !m.lastSuccess)
            ? "Awaiting first check"
            : documents.every((m) => m.paused)
              ? "Documents paused"
              : documents.every((m) => !m.interval)
                ? "Manual only"
                : "Checks succeeding",
  };
}
