import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import * as db from "../src/core/db";
import { defaults, type Company } from "../src/core/model";
import { MAX_STORAGE } from "../src/core/model";
import { newMonitor } from "../src/core/engine";
beforeEach(async () => {
  await db.closeDatabase();
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(async () => {
  await db.closeDatabase();
  vi.unstubAllGlobals();
});
const company: Company = {
  id: "company",
  name: "Example",
  url: "https://example.com/",
  domains: ["https://example.com"],
  description: "Local group",
  interval: 1440,
  paused: false,
  created: 1,
};
it("upgrades v2 without changing any monitor, text, history or accounting", async () => {
  const open = indexedDB.open("pagesentinel", 2);
  open.onupgradeneeded = () => {
    for (const name of [
      "monitors",
      "texts",
      "snapshots",
      "snapshotMetadata",
      "accounting",
    ])
      open.result.createObjectStore(name, { keyPath: "id" });
  };
  const old = await db.request(open),
    tx = old.transaction(["accounting", "texts", "monitors"], "readwrite"),
    done = db.complete(tx);
  tx.objectStore("accounting").put({
    id: "usage",
    bytes: 123,
    monitors: 1,
    snapshots: 0,
  });
  tx.objectStore("texts").put({
    id: "saved",
    baseline: "Preserved",
    referenceText: "Reference",
  });
  tx.objectStore("monitors").put({
    ...newMonitor({ ...defaults, url: "https://example.com" }),
    id: "saved",
    recordBytes: 119,
  });
  await done;
  old.close();
  expect((await db.database()).version).toBe(3);
  expect(await db.companies()).toEqual([]);
  expect(await db.storageUsage()).toMatchObject({ bytes: 123 });
  expect(await db.monitor("saved")).toMatchObject({
    baseline: "Preserved",
    referenceText: "Reference",
  });
});
it("groups documents atomically and keeps individual pause and interval overrides", async () => {
  const a = newMonitor({
      ...defaults,
      url: company.url,
      companyId: company.id,
      interval: 1440,
    }),
    b = {
      ...newMonitor({
        ...defaults,
        url: company.url,
        companyId: company.id,
        interval: 60,
        inheritInterval: false,
      }),
      paused: true,
    };
  await db.saveCompany(company, [a, b]);
  await db.saveCompany({ ...company, paused: true, interval: 360 });
  expect(await db.monitor(a.id)).toMatchObject({
    companyPaused: true,
    paused: false,
    interval: 360,
  });
  expect(await db.monitor(b.id)).toMatchObject({
    companyPaused: true,
    paused: true,
    interval: 60,
  });
  await db.saveCompany({ ...company, paused: false });
  expect((await db.monitor(b.id))?.paused).toBe(true);
  expect((await db.storageUsage()).bytes).toBe(
    db.recordBytes(await db.monitors()) +
      db.recordBytes(await db.snapshots()) +
      db.recordBytes(await db.companies()),
  );
  await db.removeCompany(company.id);
  expect(await db.companies()).toEqual([]);
  expect(await db.monitor(a.id)).not.toHaveProperty("companyId", company.id);
  expect((await db.storageUsage()).bytes).toBe(
    db.recordBytes(await db.monitors()) + db.recordBytes(await db.snapshots()),
  );
});
it("rolls back a company and documents when any document insert fails", async () => {
  const a = newMonitor({
    ...defaults,
    url: company.url,
    companyId: company.id,
  });
  await expect(db.saveCompany(company, [a, a])).rejects.toThrow();
  expect(await db.companies()).toEqual([]);
  expect(await db.monitors()).toEqual([]);
  expect((await db.storageUsage()).bytes).toBe(4);
});
it("bulk metadata updates and deletions are atomic and preserve other histories", async () => {
  const a = newMonitor({ ...defaults, url: company.url }),
    b = newMonitor({ ...defaults, url: company.url });
  await db.addImported([a, b]);
  await expect(
    db.updateMany([
      { ...a, paused: true },
      { ...b, id: "missing" },
    ]),
  ).rejects.toThrow();
  expect((await db.monitor(a.id))?.paused).toBe(false);
  await db.updateMany([
    { ...a, paused: true },
    { ...b, paused: true },
  ]);
  expect((await db.monitorMetadata()).every((m) => m.paused)).toBe(true);
  await db.removeMonitors([a.id, b.id]);
  expect(await db.monitors()).toEqual([]);
  expect((await db.storageUsage()).bytes).toBe(4);
});
it("pages histories without skipping equal-time versions", async () => {
  const m = newMonitor({ ...defaults, url: company.url });
  await db.putMonitor(m);
  for (let i = 0; i < 25; i++)
    await db.commitCheck(
      m,
      {
        id: `event-${String(i).padStart(2, "0")}`,
        monitorId: m.id,
        time: 100,
        before: "A",
        after: "B",
        initial: false,
        alert: true,
      },
      40,
    );
  const first = await db.historyPage([m.id]);
  expect(first.items).toHaveLength(20);
  const second = await db.historyPage([m.id], first.next!);
  expect(second.items).toHaveLength(5);
  expect(new Set([...first.items, ...second.items].map((s) => s.id)).size).toBe(
    25,
  );
  expect(second.next).toBeNull();
});
it("enforces the byte budget for new configurations while preserving existing failure reporting", async () => {
  const m = newMonitor({ ...defaults, url: company.url });
  await db.putMonitor(m);
  const usage = await db.storageUsage(),
    database = await db.database(),
    tx = database.transaction("accounting", "readwrite"),
    done = db.complete(tx);
  tx.objectStore("accounting").put({ ...usage, bytes: MAX_STORAGE });
  await done;
  await expect(
    db.putMonitor(newMonitor({ ...defaults, url: company.url })),
  ).rejects.toThrow(/budget/);
  expect(await db.monitorMetadata()).toHaveLength(1);
  await db.putMonitor({
    ...m,
    error: "Storage full. Export and clear history.",
  });
  expect((await db.monitor(m.id))?.error).toContain("Storage full");
});
