import { expect, it, vi } from "vitest";
import { availabilityState } from "../src/core/compare";
import { newMonitor, check, type CheckDeps } from "../src/core/engine";
import {
  defaults,
  defaultSettings,
  health,
  type Snapshot,
} from "../src/core/model";
import { importBundle } from "../src/core/backup";
it("requires an exact availability state and rejects negated or unrelated phrases", () => {
  expect(availabilityState(" IN STOCK ", "in stock")).toBe(1);
  expect(availabilityState("Sold out", "in stock")).toBe(0);
  expect(() => availabilityState("Not in stock", "in stock")).toThrow(
    /ambiguous/,
  );
  expect(() =>
    availabilityState("Other products in stock", "in stock"),
  ).toThrow(/ambiguous/);
});
it("keeps snoozed alerts in the inbox and uses the committed change ID for notifications", async () => {
  let text = "Before",
    snapshot: Snapshot | undefined;
  const deps: CheckDeps = {
    allowed: async () => true,
    fetch: async () => `<p>${text}</p>`,
    save: async () => {},
    commit: async (_m, s) => {
      snapshot = s;
    },
    notify: vi.fn(async () => {}),
  };
  let m = await check(
    newMonitor({
      ...defaults,
      url: "https://example.com",
      snoozeUntil: Date.now() + 3600000,
    }),
    defaultSettings,
    deps,
  );
  text = "After";
  m = await check(m, defaultSettings, deps);
  expect(m.unread).toBe(1);
  expect(snapshot?.alert).toBe(true);
  expect(deps.notify).not.toHaveBeenCalled();
  text = "Final";
  m = await check({ ...m, snoozeUntil: 0 }, defaultSettings, deps);
  expect(deps.notify).toHaveBeenCalledWith(
    `change:${m.id}:${snapshot!.id}`,
    expect.any(String),
  );
  await check(m, defaultSettings, deps);
  expect(deps.notify).toHaveBeenCalledTimes(1);
});
it("reversions and threshold edits preserve the alert reference until an actual alert", async () => {
  let text = "x ".repeat(100).trim();
  const deps: CheckDeps = {
    allowed: async () => true,
    fetch: async () => `<p>${text}</p>`,
    save: async () => {},
    commit: async () => {},
    notify: async () => {},
  };
  let m = await check(
    newMonitor({ ...defaults, url: "https://example.com", threshold: 10 }),
    defaultSettings,
    deps,
  );
  const reference = m.referenceText;
  text = "x ".repeat(99).trim();
  m = await check(m, defaultSettings, deps);
  text = reference!;
  m = await check(m, defaultSettings, deps);
  expect(m.unread).toBe(0);
  expect(m.referenceText).toBe(reference);
  text = "x ".repeat(98).trim();
  m = await check({ ...m, threshold: 1 }, defaultSettings, deps);
  expect(m.unread).toBe(1);
  expect(m.referenceText).toBe(text);
});
it("imports company profiles as fresh paused groups without trusting baselines or old IDs", () => {
  const company = {
    id: "old-company",
    name: "Example",
    url: "https://example.com",
    domains: [],
    description: "",
    interval: 1440,
    paused: false,
  };
  const original = {
    ...newMonitor({
      ...defaults,
      kind: "policy",
      url: company.url,
      companyId: company.id,
    }),
    baseline: "Untrusted",
    hash: "old",
  };
  const bundle = importBundle({
    version: 1,
    companies: [company],
    monitors: [original],
  });
  expect(bundle.companies[0].paused).toBe(true);
  expect(bundle.companies[0].id).not.toBe(company.id);
  expect(bundle.monitors[0]).toMatchObject({
    companyId: bundle.companies[0].id,
    paused: true,
    permissionRequired: true,
    baseline: "",
    hash: "",
  });
  expect(
    importBundle({ version: 1, monitors: [original] }).monitors[0].companyId,
  ).toBeUndefined();
  expect(() =>
    importBundle({ version: 1, companies: [company, company], monitors: [] }),
  ).toThrow(/duplicate/);
});
it("shows actionable health distinctions without hiding the original error", () => {
  const m = newMonitor({ ...defaults, url: "https://example.com" });
  expect(health({ ...m, error: "Selected element is missing." }).label).toBe(
    "Selected content missing",
  );
  expect(health({ ...m, error: "Website returned HTTP 503." }).label).toBe(
    "Website unavailable",
  );
  expect(health({ ...m, error: "No readable text found." }).label).toBe(
    "Extraction failed",
  );
});
