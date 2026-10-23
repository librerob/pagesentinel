import { beforeEach, describe, expect, it, vi } from "vitest";
import { extract, normalize } from "../src/core/extract";
import { config, settings, webURL } from "../src/core/validation";
import {
  defaults,
  defaultSettings,
  health,
  MAX_BYTES,
  MAX_TEXT,
  type Monitor,
} from "../src/core/model";
import { evaluate, policyEvidence, price, wordDiff } from "../src/core/compare";
import {
  check,
  newMonitor,
  nextTime,
  type CheckDeps,
} from "../src/core/engine";
import { importConfigs } from "../src/core/backup";
import { fetchHTML } from "../src/core/network";
const c = { ...defaults, url: "https://example.com/page", title: "Example" };
describe("untrusted configuration", () => {
  it.each([
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,hi",
    "chrome://settings",
    "chrome-extension://id/page",
    "http://localhost",
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "https://user:pass@example.com",
    "https://x.internal",
    "https://x.local",
    "http://10.0.0.1",
  ])("rejects %s", (url) => expect(() => webURL(url)).toThrow());
  it("canonicalizes fragments without removing required query parameters", () =>
    expect(webURL("https://example.com/a?q=2#part").href).toBe(
      "https://example.com/a?q=2",
    ));
  it("copies only known fields and rejects invalid intervals and rules", () => {
    expect(config({ ...c, __proto__: { polluted: true } })).not.toHaveProperty(
      "polluted",
    );
    for (const interval of [-1, 0.5, Infinity, NaN, 50000])
      expect(() => config({ ...c, interval })).toThrow();
    expect(() => config({ ...c, kind: "price" })).toThrow();
    expect(() =>
      config({ ...c, kind: "keyword", condition: "appears" }),
    ).toThrow();
    expect(() => settings({ ...defaultSettings, retention: 0 })).toThrow();
  });
  it("imports only valid configurations as new paused monitors atomically", () => {
    const original = newMonitor(c),
      items = importConfigs({ version: 1, monitors: [original] });
    expect(items[0].id).not.toBe(original.id);
    expect(items[0].paused).toBe(true);
    expect(items[0].permissionRequired).toBe(true);
    expect(items[0].baseline).toBe("");
    expect(() =>
      importConfigs({ version: 1, monitors: [c, { ...c, url: "file:///x" }] }),
    ).toThrow();
    expect(() => importConfigs({ version: 9, monitors: [] })).toThrow();
    expect(() =>
      importConfigs({ version: 1, monitors: new Array(501).fill(c) }),
    ).toThrow();
  });
});
describe("inert HTML extraction", () => {
  it("ignores scripts, markup, hidden content and formatting noise", () => {
    const html =
      '<html><head><title>Title</title></head><body><script>fetch("https://evil.com")</script><style>bad</style><p>Price <b>€299</b></p><div hidden>hidden</div><p>In stock</p></body></html>';
    expect(extract(html, c)).toBe("Price €299\n\nIn stock");
    expect(extract("<p>Price <em>€299</em></p><p>In stock</p>", c)).toBe(
      extract(html, c),
    );
  });
  it("extracts unique selections and applies exclusions", () => {
    expect(
      extract(
        '<main><p id="price">€299</p><div class="noise">Today</div></main>',
        { ...c, selector: "main", exclude: ".noise" },
      ),
    ).toBe("€299");
    expect(() => extract("<p>A</p><p>B</p>", { ...c, selector: "p" })).toThrow(
      /multiple/,
    );
    expect(() => extract("<p>A</p>", { ...c, selector: "#price" })).toThrow(
      /missing/,
    );
    expect(() => extract("<p>A</p>", { ...c, selector: "[" })).toThrow(
      /invalid/,
    );
    expect(() => extract("<div></div>", c)).toThrow(/No readable/);
  });
  it("rejects sign-in, bot challenges and oversized text", () => {
    expect(() => extract('<input type="password"><p>Welcome</p>', c)).toThrow(
      /sign-in/,
    );
    expect(() =>
      extract("<title>Just a moment...</title><p>Loading</p>", c),
    ).toThrow();
    expect(() => extract("<p>" + "x".repeat(MAX_TEXT + 1) + "</p>", c)).toThrow(
      /120,000/,
    );
    expect(() => extract("x".repeat(MAX_BYTES + 1), c)).toThrow(/2 MiB/);
  });
  it("preserves meaningful numbers and normalizes only requested noise", () => {
    expect(normalize(" €299  \n\n Stock 4 ", c)).toBe("€299\n\nStock 4");
    expect(
      normalize("Updated 2026-10-23T10:45:12Z. Price 299", {
        ...c,
        ignoreDates: true,
      }),
    ).toBe("Updated [date]. Price 299");
    expect(normalize("Stock 4", { ...c, ignoreNumbers: true })).toBe("Stock #");
    expect(normalize("Hello footer", { ...c, ignoreText: "footer" })).toBe(
      "Hello",
    );
  });
  it("handles malformed nested HTML without executing it", () =>
    expect(extract("<div><p>Hello <b>world", c)).toBe("Hello world"));
});
describe("conservative price rules", () => {
  it.each([
    ["€299.99", 299.99],
    ["€299,99", 299.99],
    ["$1,299.00", 1299],
    ["£49.99", 49.99],
    ["EUR 1.299,00", 1299],
    ["€ 1 299,99", 1299.99],
    ["¥299", 299],
  ])("parses %s", (text, value) => expect(price(text).value).toBe(value));
  it.each([
    "299",
    "$100 $200",
    "€299 £199",
    "$1,299",
    "$12,34.50",
    "$1.2.3",
    "$1 23.99",
    "$99 9",
  ])("refuses ambiguous %s", (text) => expect(() => price(text)).toThrow());
  it("accepts explicitly confirmed thousands separators", () =>
    expect(price("$1,299", ".").value).toBe(1299));
  it("crosses target once and reports currency changes", () => {
    const m = {
      ...newMonitor({
        ...c,
        kind: "price",
        condition: "below",
        selector: "#price",
        target: 250,
      }),
      hash: "x",
      lastPrice: 299,
      currency: "€",
    } as Monitor;
    expect(evaluate(m, "€249").alert).toBe(true);
    expect(evaluate({ ...m, lastPrice: 249 }, "€248").alert).toBe(false);
    expect(() => evaluate(m, "£249")).toThrow(/Currency/);
    expect(
      evaluate({ ...m, condition: "lowest", lowPrice: 200 }, "€249").alert,
    ).toBe(false);
    expect(evaluate({ ...m, condition: "decreases" }, "€249").alert).toBe(true);
    expect(evaluate({ ...m, condition: "increases" }, "€300").alert).toBe(true);
  });
});
describe("exact text differences and policy evidence", () => {
  const before =
    "We do not share data with advertising partners.\n\nWe retain records for 30 days.";
  const after =
    "We may share data with advertising partners.\n\nWe retain records for 90 days.";
  it("reconstructs both source texts from the word diff", () => {
    const parts = wordDiff(before, after);
    expect(
      parts
        .filter((x) => !x.added)
        .map((x) => x.value)
        .join(""),
    ).toBe(before);
    expect(
      parts
        .filter((x) => !x.removed)
        .map((x) => x.value)
        .join(""),
    ).toBe(after);
  });
  it("shows exact relevant added and removed policy paragraphs", () => {
    const evidence = policyEvidence(before, after);
    expect(
      evidence.some(
        (x) => x.topic === "Data sharing" && x.text.startsWith("We may"),
      ),
    ).toBe(true);
    expect(
      evidence.some(
        (x) =>
          x.topic === "Retention" && x.removed && x.text.includes("30 days"),
      ),
    ).toBe(true);
    expect(policyEvidence(before, before)).toEqual([]);
  });
  it("uses case-insensitive transition rules for availability", () => {
    const m = {
      ...newMonitor({
        ...c,
        kind: "availability",
        phrase: "in stock",
        condition: "appears",
      }),
      hash: "x",
      baseline: "Sold out",
    };
    expect(evaluate(m, "IN STOCK").alert).toBe(true);
    expect(evaluate({ ...m, baseline: "In stock" }, "In stock").alert).toBe(
      false,
    );
  });
});
describe("durable check state", () => {
  let deps: CheckDeps;
  beforeEach(() => {
    deps = {
      allowed: vi.fn(async () => true),
      fetch: vi.fn(async () => "<p>A</p>"),
      save: vi.fn(async () => {}),
      commit: vi.fn(async () => {}),
      notify: vi.fn(async () => {}),
    };
  });
  it("rejects a live selection that the public HTML does not reproduce", async () => {
    const result = await check(
      { ...newMonitor(c), initialPreview: "Client-side price 399" },
      defaultSettings,
      deps,
    );
    expect(result.lastSuccess).toBe(0);
    expect(result.baseline).toBe("");
    expect(result.error).toMatch(/differs from the public HTML/);
    expect(deps.commit).not.toHaveBeenCalled();
  });
  it("can check a paused monitor manually without resuming its schedule", async () => {
    const result = await check(
      { ...newMonitor(c), paused: true },
      defaultSettings,
      deps,
      true,
    );
    expect(result.paused).toBe(true);
    expect(result.lastSuccess).toBeGreaterThan(0);
  });
  it("creates a baseline, records changes once, and preserves unread until acknowledged", async () => {
    let m = await check(newMonitor(c), defaultSettings, deps);
    expect(m.lastSuccess).toBeGreaterThan(0);
    expect(m.unread).toBe(0);
    expect(deps.notify).not.toHaveBeenCalled();
    deps.fetch = vi.fn(async () => "<p>B</p>");
    m = await check(m, defaultSettings, deps);
    expect(m.baseline).toBe("B");
    expect(m.unread).toBe(1);
    expect(deps.notify).toHaveBeenCalledTimes(1);
    m = await check(m, defaultSettings, deps);
    expect(m.unread).toBe(1);
    expect(deps.notify).toHaveBeenCalledTimes(1);
  });
  it("retains a good baseline on empty, missing, timeout, storage and permission errors", async () => {
    const baseline = await check(newMonitor(c), defaultSettings, deps);
    for (const fetcher of [
      async () => "",
      async () => {
        throw new Error("Timeout");
      },
    ]) {
      deps.fetch = fetcher;
      const next = await check(baseline, defaultSettings, deps);
      expect(next.hash).toBe(baseline.hash);
      expect(next.baseline).toBe("A");
      expect(next.failures).toBe(1);
      expect(health(next).label).toBe("Needs attention");
    }
    deps.allowed = async () => false;
    const revoked = await check(baseline, defaultSettings, deps);
    expect(revoked.paused).toBe(true);
    expect(revoked.permissionRequired).toBe(true);
    expect(revoked.baseline).toBe("A");
    deps.allowed = async () => true;
    deps.fetch = async () => "<p>B</p>";
    deps.commit = async () => {
      throw new Error("Storage full");
    };
    const full = await check(baseline, defaultSettings, deps);
    expect(full.baseline).toBe("A");
    expect(full.hash).toBe(baseline.hash);
    expect(full.error).toBe("Storage full");
  });
  it("recovers health after failure, respects pause and persisted leases", async () => {
    const base = newMonitor(c);
    expect(
      await check({ ...base, paused: true }, defaultSettings, deps),
    ).toMatchObject({ lastSuccess: 0 });
    expect(
      await check(
        { ...base, lease: Date.now() + 30000 },
        defaultSettings,
        deps,
      ),
    ).toMatchObject({ lastSuccess: 0 });
    const recovered = await check(
      { ...base, error: "Bad", failures: 3 },
      defaultSettings,
      deps,
    );
    expect(recovered.error).toBe("");
    expect(recovered.failures).toBe(0);
    expect(health({ ...recovered, nextCheck: Date.now() - 240000 }).label).toBe(
      "Overdue",
    );
  });
  it("saves the change even if native notifications fail", async () => {
    let m = await check(newMonitor(c), defaultSettings, deps);
    deps.fetch = async () => "<p>B</p>";
    deps.notify = async () => {
      throw new Error("OS disabled");
    };
    m = await check(m, defaultSettings, deps);
    expect(m.baseline).toBe("B");
    expect(m.unread).toBe(1);
    expect(m.notificationError).toMatch(/notification/);
  });
  it("bounds retries and staggers schedules", () => {
    expect(nextTime(0)).toBe(0);
    expect(nextTime(1, 20, 0, 0)).toBe(6 * 3600000);
    expect(nextTime(15, 0, 1000, 0.5)).toBe(908500);
  });
});
describe("bounded credential-free network checks", () => {
  it("omits credentials and rejects automatic redirects", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<p>Hello</p>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    expect(await fetchHTML(c.url)).toBe("<p>Hello</p>");
    expect(mock.mock.calls[0][1]).toMatchObject({
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    mock.mockRestore();
  });
  it("rejects errors, content types and oversized streams", async () => {
    for (const response of [
      new Response("bad", { status: 503 }),
      new Response("{}", { headers: { "content-type": "application/json" } }),
      new Response("x".repeat(MAX_BYTES + 1), {
        headers: { "content-type": "text/html" },
      }),
    ]) {
      const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
      await expect(fetchHTML(c.url)).rejects.toThrow();
      mock.mockRestore();
    }
  });
});
