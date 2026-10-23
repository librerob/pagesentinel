import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import * as db from "../src/core/db";
import { defaults, type Snapshot } from "../src/core/model";
import { newMonitor } from "../src/core/engine";
describe("IndexedDB transactions and retention", () => {
  it("commits snapshot and baseline together, bounds history, and deletes complete monitors", async () => {
    const m = newMonitor({
      ...defaults,
      title: "DB fixture",
      url: "https://example.com",
    });
    await db.putMonitor(m);
    for (let i = 0; i < 14; i++) {
      const event: Snapshot = {
        id: String(i),
        monitorId: m.id,
        time: 1000 + i,
        before: String(i - 1),
        after: String(i),
        alert: true,
        initial: i === 0,
      };
      await db.commitCheck(
        { ...m, baseline: String(i), hash: String(i), unread: i },
        event,
        10,
      );
    }
    expect((await db.snapshots(m.id)).length).toBe(10);
    expect((await db.snapshots(m.id))[0].after).toBe("13");
    expect((await db.monitors()).find((x) => x.id === m.id)?.baseline).toBe(
      "13",
    );
    await db.clearHistory(m.id);
    expect(await db.snapshots(m.id)).toEqual([]);
    expect((await db.monitors()).find((x) => x.id === m.id)?.baseline).toBe(
      "13",
    );
    await db.removeMonitor(m.id);
    expect((await db.monitors()).find((x) => x.id === m.id)).toBeUndefined();
  });
  it("adds imported monitors in a single transaction without overwriting existing data", async () => {
    const m = newMonitor({
      ...defaults,
      title: "Import",
      url: "https://example.com",
    });
    await db.addImported([m]);
    await expect(
      db.addImported([{ ...m, title: "overwrite" }]),
    ).rejects.toThrow();
    expect((await db.monitors()).find((x) => x.id === m.id)?.title).toBe(
      "Import",
    );
  });
});
