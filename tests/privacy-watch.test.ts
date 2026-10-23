import { describe, expect, it } from "vitest";
import {
  companyConfig,
  companyHealth,
  discoverHTML,
  discoverPolicies,
} from "../src/core/privacy";
import {
  paragraphChanges,
  policyEvidence,
  policySummary,
} from "../src/core/compare";
import { config } from "../src/core/validation";
import { defaults } from "../src/core/model";
import { newMonitor } from "../src/core/engine";
import { extract } from "../src/core/extract";
describe("policy discovery", () => {
  it.each([
    "Privacy Policy",
    "Personvernerklæring",
    "Política de privacidad",
    "Datenschutzerklärung",
    "Politique de confidentialité",
  ])("recognizes %s without inventing a URL", (text) => {
    const found = discoverPolicies("https://example.com/home", [
      { text, href: "/legal", language: "fr" },
    ]);
    expect(found).toEqual([
      {
        title: text,
        url: "https://example.com/legal",
        type: "privacy",
        language: "fr",
      },
    ]);
  });
  it("keeps distinct regional URLs and external candidates for explicit review, rejecting private or executable destinations", () => {
    const found = discoverHTML(
      "https://example.com/",
      `<a href="/privacy?region=EU" hreflang="en">Privacy</a><a href="/privacy?region=US">Privacy</a><a href="https://legal.example.org/terms">Terms</a><a href="http://router.local./privacy">Privacy</a><a href="javascript:alert(1)">Privacy</a><a href="#privacy">Privacy</a><a href="/privacy?region=EU#part">Privacy</a>`,
    );
    expect(found).toHaveLength(3);
    expect(found[0].language).toBe("en");
    expect(found[2].url).toBe("https://legal.example.org/terms");
  });
  it("bounds link input and returns only observed candidates", () => {
    expect(
      discoverPolicies("https://example.com", [
        { href: "/products", text: "Shop" },
      ]),
    ).toEqual([]);
    expect(() =>
      discoverPolicies("https://example.com", new Array(2001)),
    ).toThrow();
  });
});
describe("company grouping", () => {
  const input = {
    name: "Example",
    url: "https://example.com",
    domains: ["https://legal.example.org/privacy"],
    description: "Regional policies",
    paused: false,
    interval: 1440,
  };
  it("validates metadata, preserves identities on edits and canonicalizes domains", () => {
    const c = companyConfig(input),
      edited = companyConfig({ ...input, name: "Edited", id: "spoofed" }, c);
    expect(edited.id).toBe(c.id);
    expect(edited.created).toBe(c.created);
    expect(c.domains).toEqual([
      "https://example.com",
      "https://legal.example.org",
    ]);
    expect(() =>
      companyConfig({ ...input, url: "http://internal.local." }),
    ).toThrow();
    expect(() => companyConfig({ ...input, interval: -1 })).toThrow();
  });
  it("never reports a company healthy before every document has succeeded", () => {
    const c = companyConfig(input),
      m = newMonitor({ ...defaults, companyId: c.id, url: input.url });
    expect(companyHealth(c, [m]).label).toBe("Awaiting first check");
    expect(
      companyHealth(c, [
        { ...m, lastSuccess: 1, nextCheck: Date.now() + 10000 },
      ]).lastSuccess,
    ).toBe(1);
    expect(
      companyHealth(c, [{ ...m, lastSuccess: 1, error: "Missing selector" }])
        .label,
    ).toBe("Needs attention");
    expect(companyHealth({ ...c, paused: true }, [m]).label).toBe("Paused");
  });
  it("validates optional labels without permitting extra privileged fields", () => {
    const c = config({
      ...defaults,
      url: input.url,
      kind: "policy",
      companyId: "group",
      policyType: "privacy",
      language: "English",
      region: "EU",
      inheritInterval: false,
      paused: true,
    });
    expect(c.companyId).toBe("group");
    expect(c).not.toHaveProperty("paused");
    expect(() => config({ ...c, policyType: "invented" })).toThrow();
  });
});
describe("verifiable policy comparisons", () => {
  it("prefers a unique document landmark, preserving paragraphs and numbers", () => {
    expect(
      extract(
        "<nav>Sale today</nav><main><p>We retain data for 30 days.</p><p>Deletion is available.</p></main><footer>Menu</footer>",
        { ...defaults, kind: "policy" },
      ),
    ).toBe("We retain data for 30 days.\n\nDeletion is available.");
    expect(
      extract("<article>A</article><article>B</article>", {
        ...defaults,
        kind: "policy",
      }),
    ).toContain("B");
  });
  it("shows exact retention evidence without inferring legal impact", () => {
    const before = "We retain account data for 30 days.",
      after = "We retain account data for 180 days.";
    expect(policyEvidence(before, after)).toContainEqual({
      topic: "Retention",
      text: before,
      removed: true,
    });
    expect(policyEvidence(before, after)).toContainEqual({
      topic: "Retention",
      text: after,
      removed: false,
    });
    expect(policySummary(before, after)).toContain(
      "Retention wording changed. Review the exact passages.",
    );
  });
  it("distinguishes paragraph reordering from changed wording and handles duplicates", () => {
    const a = "We retain data.\n\nWe use cookies.",
      b = "We use cookies.\n\nWe retain data.";
    expect(policyEvidence(a, b)).toEqual([]);
    expect(policySummary(a, b)[0]).toContain("order changed");
    expect(paragraphChanges("A\n\nA", "A").removed).toEqual(["A"]);
  });
  it("does not categorize an unchanged retention sentence because another sentence in its paragraph changed", () => {
    const before =
        "We retain data for 30 days. We do not share data with advertising partners.",
      after =
        "We retain data for 30 days. We may share data with advertising partners.";
    expect(
      policyEvidence(before, after).some((e) => e.topic === "Retention"),
    ).toBe(false);
    expect(
      policyEvidence(before, after).some((e) => e.topic === "Advertising"),
    ).toBe(true);
  });
});
