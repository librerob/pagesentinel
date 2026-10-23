import { describe, expect, it, vi } from "vitest";
import { check, newMonitor, type CheckDeps } from "../src/core/engine";
import { defaults, defaultSettings, type Snapshot } from "../src/core/model";
describe("cumulative text thresholds", () => {
  it.each(["text", "policy"] as const)(
    "accumulates small %s edits until an alert, then starts a new reference",
    async (kind) => {
      let content = Array(100).fill("x").join(" ");
      const history: Snapshot[] = [];
      const deps: CheckDeps = {
        allowed: async () => true,
        fetch: async () => `<p>${content}</p>`,
        save: async () => {},
        commit: async (_m, s) => {
          if (s) history.push(s);
        },
        notify: vi.fn(async () => {}),
      };
      let m = await check(
        newMonitor({
          ...defaults,
          url: "https://example.com",
          kind,
          threshold: 5,
        }),
        defaultSettings,
        deps,
      );
      const initial = m.baseline,
        alerts: number[] = [];
      for (let i = 1; i <= 10; i++) {
        const before = m.baseline;
        content = Array(100 - i)
          .fill("x")
          .join(" ");
        m = await check(m, defaultSettings, deps);
        if (history.at(-1)?.alert) alerts.push(i);
        expect(history.at(-1)?.before).toBe(before);
        expect(m.baseline).toBe(content);
        if (i < 5) expect(m.referenceText).toBe(initial);
        if (i === 5) expect(m.referenceText).toBe(content);
      }
      expect(alerts).toEqual([5, 10]);
      expect(deps.notify).toHaveBeenCalledTimes(2);
      const stable = await check(m, defaultSettings, deps);
      expect(stable.unread).toBe(2);
      expect(history).toHaveLength(11);
      deps.fetch = async () => {
        throw new Error("Offline");
      };
      const failed = await check(stable, defaultSettings, deps);
      expect(failed.referenceText).toBe(stable.referenceText);
      expect(failed.baseline).toBe(stable.baseline);
    },
  );
  it("initializes a fresh reference when the baseline is reset", async () => {
    const deps: CheckDeps = {
      allowed: async () => true,
      fetch: async () => "<p>New starting point</p>",
      save: async () => {},
      commit: async () => {},
      notify: async () => {},
    };
    const m = await check(
      {
        ...newMonitor({ ...defaults, url: "https://example.com" }),
        referenceText: "Old text",
        baseline: "",
        hash: "",
      },
      defaultSettings,
      deps,
    );
    expect(m.referenceText).toBe("New starting point");
    expect(m.unread).toBe(0);
  });
});
