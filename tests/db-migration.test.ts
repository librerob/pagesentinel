import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../src/core/db";
import { newMonitor } from "../src/core/engine";
import {
  defaults,
  MAX_STORAGE,
  type Monitor,
  type Snapshot,
} from "../src/core/model";
beforeEach(async () => {
  await db.closeDatabase();
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(async () => {
  await db.closeDatabase();
  vi.unstubAllGlobals();
});
const fixture = () => ({
  ...newMonitor({
    ...defaults,
    url: "https://example.com",
    title: "Migration fixture",
  }),
  baseline: "Current wording",
  hash: "good",
  unread: 1,
});
async function versionOne(monitors: unknown[], snapshots: unknown[]) {
  const r = indexedDB.open("pagesentinel", 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore("monitors", { keyPath: "id" });
    r.result
      .createObjectStore("snapshots", { keyPath: "id" })
      .createIndex("monitorId", "monitorId");
  };
  const legacy = await db.request(r),
    tx = legacy.transaction(["monitors", "snapshots"], "readwrite"),
    done = db.complete(tx);
  for (const m of monitors) tx.objectStore("monitors").add(m);
  for (const s of snapshots) tx.objectStore("snapshots").add(s);
  await done;
  legacy.close();
}
async function expectAccounting() {
  expect((await db.storageUsage()).bytes).toBe(
    db.recordBytes(await db.monitors()) + db.recordBytes(await db.snapshots()),
  );
}
describe("version 1 migration and byte ledger", () => {
  it("atomically preserves data and recovers the last-alert reference from retained history", async () => {
    const m = fixture(),
      history: Snapshot[] = [
        {
          id: "a",
          monitorId: m.id,
          time: 1,
          before: "",
          after: "Initial wording",
          initial: true,
          alert: false,
        },
        {
          id: "b",
          monitorId: m.id,
          time: 2,
          before: "Initial wording",
          after: "Last alert wording",
          initial: false,
          alert: true,
        },
        {
          id: "c",
          monitorId: m.id,
          time: 3,
          before: "Last alert wording",
          after: m.baseline,
          initial: false,
          alert: false,
        },
      ];
    await versionOne([m], history);
    expect((await db.database()).version).toBe(2);
    expect(await db.monitor(m.id)).toMatchObject({
      baseline: m.baseline,
      hash: m.hash,
      unread: 1,
      referenceText: "Last alert wording",
    });
    expect(await db.snapshots(m.id)).toEqual([...history].reverse());
    const metadata = (await db.monitorMetadata())[0];
    expect(metadata).not.toHaveProperty("baseline");
    expect(metadata).not.toHaveProperty("referenceText");
    expect(metadata).not.toHaveProperty("recordBytes");
    await expectAccounting();
    await db.putMetadata({ ...metadata, error: "Offline", paused: true });
    expect((await db.monitor(m.id))?.baseline).toBe(m.baseline);
    await expectAccounting();
  });
  it("rolls back an invalid migration without replacing version 1 stores or data", async () => {
    const corrupt = { ...fixture(), baseline: 42 };
    await versionOne([corrupt], []);
    await expect(db.database()).rejects.toThrow(/not.*replaced/);
    const old = await db.request(indexedDB.open("pagesentinel", 1));
    expect(old.version).toBe(1);
    expect([...old.objectStoreNames]).toEqual(["monitors", "snapshots"]);
    expect(
      await db.request(
        old.transaction("monitors").objectStore("monitors").get(corrupt.id),
      ),
    ).toEqual(corrupt);
    old.close();
  });
  it("accounts exactly for multibyte text, retention, metadata updates, clear, imports and deletion", async () => {
    const m = {
      ...fixture(),
      baseline: "Price € / 日本語",
      referenceText: "Earlier €",
    };
    await db.putMonitor(m);
    await expectAccounting();
    for (let i = 0; i < 4; i++)
      await db.commitCheck(
        { ...m, baseline: `Revision ${i} €` },
        {
          id: String(i),
          monitorId: m.id,
          time: i,
          before: m.baseline,
          after: `Revision ${i} €`,
          initial: false,
          alert: true,
        },
        2,
      );
    await expectAccounting();
    expect(await db.snapshots(m.id)).toHaveLength(2);
    await db.pruneHistory(m.id, 1);
    await expectAccounting();
    await db.clearHistory(m.id);
    await expectAccounting();
    const copy = { ...m, id: "copy" };
    await db.addImported([copy]);
    await expectAccounting();
    await expect(db.addImported([{ ...m, id: "new" }, copy])).rejects.toThrow();
    expect(await db.monitor("new")).toBeUndefined();
    await expectAccounting();
    await db.removeMonitor(m.id);
    await db.removeMonitor(copy.id);
    await expectAccounting();
    expect((await db.storageUsage()).bytes).toBe(4);
  });
  it("rolls back baseline, reference, history and ledger together when a check exceeds budget", async () => {
    const m = fixture();
    await db.putMonitor(m);
    const native = await db.database(),
      tx = native.transaction("accounting", "readwrite"),
      done = db.complete(tx);
    const usage = await db.request(tx.objectStore("accounting").get("usage"));
    tx.objectStore("accounting").put({ ...usage, bytes: MAX_STORAGE });
    await done;
    await expect(
      db.commitCheck(
        {
          ...m,
          baseline: "New wording that must not commit",
          referenceText: "New reference",
        },
        {
          id: "overflow",
          monitorId: m.id,
          time: 1,
          before: m.baseline,
          after: "Changed",
          initial: false,
          alert: true,
        },
        40,
      ),
    ).rejects.toThrow(/50 MiB/);
    expect((await db.monitor(m.id))?.baseline).toBe(m.baseline);
    expect((await db.monitor(m.id))?.referenceText).toBeUndefined();
    expect(await db.snapshots(m.id)).toHaveLength(0);
    expect((await db.storageUsage()).bytes).toBe(MAX_STORAGE);
  });
  it("metadata ticks and per-monitor commits never read unrelated text or full history stores", async () => {
    const items: Monitor[] = Array.from({ length: 500 }, (_, i) => ({
      ...fixture(),
      id: String(i),
      baseline: "Public paragraph. ".repeat(1100),
      referenceText: "Public paragraph. ".repeat(1100),
    }));
    await db.addImported(items);
    const getAll = vi.spyOn(IDBObjectStore.prototype, "getAll");
    const start = performance.now(),
      metadata = await db.monitorMetadata(),
      elapsed = performance.now() - start;
    expect(metadata).toHaveLength(500);
    expect(
      getAll.mock.contexts.map((store) => (store as IDBObjectStore).name),
    ).toEqual(["monitors"]);
    getAll.mockClear();
    await db.commitCheck(items[0], undefined, 40);
    expect(
      getAll.mock.contexts.map((store) => (store as IDBObjectStore).name),
    ).toEqual([]);
    expect(
      getAll.mock.contexts.every(
        (store) =>
          (store as IDBObjectStore).name !== "texts" &&
          (store as IDBObjectStore).name !== "snapshots",
      ),
    ).toBe(true);
    getAll.mockRestore();
    const full = await db.monitors();
    const before = db.recordBytes(full),
      after = db.recordBytes(metadata);
    expect(after).toBeLessThan(before / 20);
    console.log(
      JSON.stringify({
        fixture: "500 monitors",
        fullReadBytes: before,
        metadataReadBytes: after,
        metadataTickMs: Number(elapsed.toFixed(3)),
      }),
    );
    await expectAccounting();
  });
});
