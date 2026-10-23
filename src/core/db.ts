import {
  MAX_STORAGE,
  type Monitor,
  type MonitorMetadata,
  type Snapshot,
  type Company,
} from "./model";
const DB_VERSION = 3;
const budgetError =
  "The 50 MiB local history budget is full. Export and clear older history before retrying.";
type StoredMonitor = MonitorMetadata & { recordBytes: number };
interface TextRecord {
  id: string;
  baseline: string;
  referenceText?: string;
  initialPreview?: string;
}
interface SnapshotMetadata {
  id: string;
  monitorId: string;
  time: number;
  bytes: number;
}
interface Usage {
  id: "usage";
  bytes: number;
  monitors: number;
  snapshots: number;
  companies?: number;
}
const emptyUsage = (): Usage => ({
  id: "usage",
  bytes: 4,
  monitors: 0,
  snapshots: 0,
});
const encoder = new TextEncoder();
export function recordBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}
function split(m: Monitor): { metadata: StoredMonitor; text: TextRecord } {
  const { baseline, referenceText, initialPreview, ...metadata } = m;
  return {
    metadata: { ...metadata, recordBytes: recordBytes(m) },
    text: { id: m.id, baseline, referenceText, initialPreview },
  };
}
function publicMetadata(m: StoredMonitor): MonitorMetadata {
  const { recordBytes: storedSize, ...metadata } = m;
  void storedSize;
  return metadata;
}
function join(m: StoredMonitor, text: TextRecord | undefined): Monitor {
  if (!text || typeof text.baseline !== "string")
    throw new Error(
      "Local monitor text is missing. Export data before resetting this monitor.",
    );
  return {
    ...publicMetadata(m),
    baseline: text.baseline,
    referenceText: text.referenceText,
    initialPreview: text.initialPreview,
  };
}
function commaDelta(before: number, after: number) {
  return Math.max(0, after - 1) - Math.max(0, before - 1);
}
let connection: Promise<IDBDatabase> | undefined;
export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () =>
      reject(
        new Error(
          "Local storage write failed. Export data or free space before retrying.",
        ),
      );
  });
}
function migrate(db: IDBDatabase, tx: IDBTransaction, oldVersion: number) {
  db.createObjectStore("companies", { keyPath: "id" });
  if (oldVersion >= 2) return;
  if (oldVersion === 0) {
    db.createObjectStore("monitors", { keyPath: "id" });
    db.createObjectStore("snapshots", { keyPath: "id" }).createIndex(
      "monitorId",
      "monitorId",
    );
  }
  const texts = db.createObjectStore("texts", { keyPath: "id" });
  const history = db.createObjectStore("snapshotMetadata", { keyPath: "id" });
  history.createIndex("monitorId", "monitorId");
  const accounting = db.createObjectStore("accounting", { keyPath: "id" });
  const usage = emptyUsage();
  const references = new Map<string, { time: number; text: string }>();
  const snapshots = tx.objectStore("snapshots").openCursor();
  snapshots.onsuccess = () => {
    try {
      const cursor = snapshots.result;
      if (cursor) {
        const s = cursor.value as Snapshot;
        if (
          typeof s.id !== "string" ||
          typeof s.monitorId !== "string" ||
          typeof s.before !== "string" ||
          typeof s.after !== "string" ||
          !Number.isFinite(s.time)
        )
          throw new Error("Invalid saved history.");
        const bytes = recordBytes(s);
        history.add({ id: s.id, monitorId: s.monitorId, time: s.time, bytes });
        usage.bytes += bytes;
        usage.snapshots++;
        if (
          (s.alert || s.initial) &&
          (!references.has(s.monitorId) ||
            references.get(s.monitorId)!.time < s.time)
        )
          references.set(s.monitorId, { time: s.time, text: s.after });
        cursor.continue();
        return;
      }
      const monitors = tx.objectStore("monitors").openCursor();
      monitors.onsuccess = () => {
        try {
          const cursor = monitors.result;
          if (cursor) {
            const m = cursor.value as Monitor;
            if (
              typeof m.id !== "string" ||
              typeof m.baseline !== "string" ||
              typeof m.hash !== "string"
            )
              throw new Error("Invalid saved monitor.");
            if (
              m.hash &&
              (m.kind === "text" || m.kind === "policy") &&
              m.referenceText === undefined
            )
              m.referenceText = references.get(m.id)?.text ?? m.baseline;
            const record = split(m);
            cursor.update(record.metadata);
            texts.add(record.text);
            usage.bytes += record.metadata.recordBytes;
            usage.monitors++;
            cursor.continue();
            return;
          }
          usage.bytes +=
            Math.max(0, usage.monitors - 1) + Math.max(0, usage.snapshots - 1);
          // Preserve legacy data even if added references put a profile over budget.
          // Successful checks remain blocked until history cleanup frees space.
          accounting.add(usage);
        } catch {
          tx.abort();
        }
      };
    } catch {
      tx.abort();
    }
  };
}
export function database(): Promise<IDBDatabase> {
  return (connection ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("pagesentinel", DB_VERSION);
    req.onupgradeneeded = (event) =>
      migrate(req.result, req.transaction!, event.oldVersion);
    req.onsuccess = () => {
      req.result.onversionchange = () => {
        req.result.close();
        connection = undefined;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      connection = undefined;
      reject(
        new Error(
          "Local storage could not be opened or upgraded. Existing data was not replaced.",
        ),
      );
    };
  }));
}
export async function closeDatabase() {
  const db = await connection;
  db?.close();
  connection = undefined;
}
async function write<T>(
  stores: string[],
  operation: (tx: IDBTransaction, usage: Usage) => Promise<T>,
): Promise<T> {
  const db = await database(),
    tx = db.transaction([...new Set([...stores, "accounting"])], "readwrite"),
    done = complete(tx);
  void done.catch(() => undefined);
  try {
    const usage = await request<Usage | undefined>(
      tx.objectStore("accounting").get("usage"),
    );
    if (!usage || !Number.isSafeInteger(usage.bytes) || usage.bytes < 4)
      throw new Error(
        "Local storage accounting is unavailable. Export data before resetting the application.",
      );
    const result = await operation(tx, usage);
    tx.objectStore("accounting").put(usage);
    await done;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* Already aborted. */
    }
    await done.catch(() => undefined);
    throw error;
  }
}
export async function monitorMetadata(): Promise<MonitorMetadata[]> {
  const db = await database();
  const records = await request<StoredMonitor[]>(
    db.transaction("monitors").objectStore("monitors").getAll(),
  );
  return records.map(publicMetadata);
}
export async function monitor(id: string): Promise<Monitor | undefined> {
  const db = await database(),
    tx = db.transaction(["monitors", "texts"]);
  const [metadata, text] = await Promise.all([
    request<StoredMonitor | undefined>(tx.objectStore("monitors").get(id)),
    request<TextRecord | undefined>(tx.objectStore("texts").get(id)),
  ]);
  return metadata ? join(metadata, text) : undefined;
}
// Full scans are reserved for explicit exports, never scheduler or badge reads.
export async function monitors(): Promise<Monitor[]> {
  const db = await database(),
    tx = db.transaction(["monitors", "texts"]);
  const [metadata, texts] = await Promise.all([
    request<StoredMonitor[]>(tx.objectStore("monitors").getAll()),
    request<TextRecord[]>(tx.objectStore("texts").getAll()),
  ]);
  const byId = new Map(texts.map((text) => [text.id, text]));
  return metadata.map((m) => join(m, byId.get(m.id)));
}
export async function storageUsage(): Promise<Usage> {
  const db = await database();
  return request(
    db.transaction("accounting").objectStore("accounting").get("usage"),
  );
}
export async function snapshots(id?: string): Promise<Snapshot[]> {
  const db = await database(),
    store = db.transaction("snapshots").objectStore("snapshots");
  return (
    await request<Snapshot[]>(
      id ? store.index("monitorId").getAll(id) : store.getAll(),
    )
  ).sort((a, b) => b.time - a.time);
}
async function setMonitor(
  tx: IDBTransaction,
  usage: Usage,
  m: Monitor,
  add = false,
) {
  const store = tx.objectStore("monitors"),
    old = await request<StoredMonitor | undefined>(store.get(m.id));
  if (add && old) throw new Error("A monitor with this ID already exists.");
  const record = split(m),
    count = usage.monitors + (old ? 0 : 1);
  usage.bytes +=
    record.metadata.recordBytes -
    (old?.recordBytes ?? 0) +
    commaDelta(usage.monitors, count);
  usage.monitors = count;
  store.put(record.metadata);
  tx.objectStore("texts").put(record.text);
}
export async function putMonitor(m: Monitor) {
  await write(["monitors", "texts"], async (tx, usage) => {
    await setMonitor(tx, usage, m);
  });
}
export async function putMetadata(m: MonitorMetadata) {
  await write(["monitors"], async (tx, usage) => {
    const store = tx.objectStore("monitors"),
      old = await request<StoredMonitor | undefined>(store.get(m.id));
    if (!old) throw new Error("Monitor not found.");
    const bytes =
      old.recordBytes - recordBytes(publicMetadata(old)) + recordBytes(m);
    usage.bytes += bytes - old.recordBytes;
    store.put({ ...m, recordBytes: bytes });
  });
}
async function trim(
  tx: IDBTransaction,
  usage: Usage,
  id: string,
  retention: number,
  snapshot?: Snapshot,
) {
  const metadata = tx.objectStore("snapshotMetadata");
  const records = await request<SnapshotMetadata[]>(
    metadata.index("monitorId").getAll(id),
  );
  const obsolete = records
    .sort((a, b) => b.time - a.time)
    .slice(snapshot ? retention - 1 : retention);
  const previousCount = usage.snapshots;
  for (const old of obsolete) {
    tx.objectStore("snapshots").delete(old.id);
    metadata.delete(old.id);
    usage.bytes -= old.bytes;
    usage.snapshots--;
  }
  if (snapshot) {
    if (snapshot.monitorId !== id)
      throw new Error("History does not belong to this monitor.");
    const bytes = recordBytes(snapshot);
    tx.objectStore("snapshots").add(snapshot);
    metadata.add({
      id: snapshot.id,
      monitorId: id,
      time: snapshot.time,
      bytes,
    });
    usage.bytes += bytes;
    usage.snapshots++;
  }
  usage.bytes += commaDelta(previousCount, usage.snapshots);
}
export async function commitCheck(
  m: Monitor,
  snapshot: Snapshot | undefined,
  retention: number,
) {
  await write(
    ["monitors", "texts", "snapshots", "snapshotMetadata"],
    async (tx, usage) => {
      await setMonitor(tx, usage, m);
      await trim(tx, usage, m.id, retention, snapshot);
      if (usage.bytes > MAX_STORAGE) throw new Error(budgetError);
    },
  );
}
export async function pruneHistory(id: string, retention: number) {
  await write(["snapshots", "snapshotMetadata"], async (tx, usage) => {
    await trim(tx, usage, id, retention);
  });
}
export async function removeMonitor(id: string) {
  await write(
    ["monitors", "texts", "snapshots", "snapshotMetadata"],
    async (tx, usage) => {
      const store = tx.objectStore("monitors"),
        old = await request<StoredMonitor | undefined>(store.get(id));
      if (!old) return;
      await trim(tx, usage, id, 0);
      usage.bytes -= old.recordBytes;
      usage.bytes += commaDelta(usage.monitors, usage.monitors - 1);
      usage.monitors--;
      store.delete(id);
      tx.objectStore("texts").delete(id);
    },
  );
}
export async function clearHistory(id?: string) {
  await write(
    ["monitors", "snapshots", "snapshotMetadata"],
    async (tx, usage) => {
      const store = tx.objectStore("monitors");
      const items = id
        ? [await request<StoredMonitor | undefined>(store.get(id))].filter(
            (x): x is StoredMonitor => !!x,
          )
        : await request<StoredMonitor[]>(store.getAll());
      for (const old of items) {
        await trim(tx, usage, old.id, 0);
        const metadata = { ...publicMetadata(old), unread: 0 };
        const bytes =
          old.recordBytes -
          recordBytes(publicMetadata(old)) +
          recordBytes(metadata);
        usage.bytes += bytes - old.recordBytes;
        store.put({ ...metadata, recordBytes: bytes });
      }
    },
  );
}
export async function addImported(items: Monitor[]) {
  await write(["monitors", "texts"], async (tx, usage) => {
    for (const item of items) await setMonitor(tx, usage, item, true);
    if (usage.bytes > MAX_STORAGE) throw new Error(budgetError);
  });
}

export async function companies(): Promise<Company[]> {
  const db = await database();
  return request(db.transaction("companies").objectStore("companies").getAll());
}
// Company controls and affected document metadata commit together. Text is never
// loaded here; individual document pause choices survive company pause/resume.
export async function saveCompany(company: Company, documents: Monitor[] = []) {
  await write(["companies", "monitors", "texts"], async (tx, usage) => {
    const store = tx.objectStore("companies");
    const old = await request<Company | undefined>(store.get(company.id));
    const count = usage.companies ?? 0;
    usage.bytes +=
      recordBytes(company) -
      (old ? recordBytes(old) : 0) +
      (old ? 0 : count ? 1 : 2);
    usage.companies = count + (old ? 0 : 1);
    store.put(company);
    const monitors = tx.objectStore("monitors");
    for (const item of await request<StoredMonitor[]>(monitors.getAll())) {
      if (item.companyId !== company.id) continue;
      const metadata = {
        ...publicMetadata(item),
        companyPaused: company.paused,
        ...(item.inheritInterval !== false
          ? { interval: company.interval, nextCheck: Date.now() }
          : {}),
      };
      const bytes =
        item.recordBytes -
        recordBytes(publicMetadata(item)) +
        recordBytes(metadata);
      usage.bytes += bytes - item.recordBytes;
      monitors.put({ ...metadata, recordBytes: bytes });
    }
    for (const document of documents) {
      if (document.companyId !== company.id)
        throw new Error("Invalid company document.");
      await setMonitor(tx, usage, document, true);
    }
    if (usage.bytes > MAX_STORAGE) throw new Error(budgetError);
  });
}
export async function removeCompany(id: string) {
  await write(["companies", "monitors"], async (tx, usage) => {
    const store = tx.objectStore("companies"),
      old = await request<Company | undefined>(store.get(id));
    if (!old) throw new Error("Company not found.");
    const count = usage.companies ?? 1;
    usage.bytes -= recordBytes(old) + (count === 1 ? 2 : 1);
    usage.companies = count - 1;
    store.delete(id);
    const monitors = tx.objectStore("monitors");
    for (const item of await request<StoredMonitor[]>(monitors.getAll())) {
      if (item.companyId !== id) continue;
      const metadata = {
        ...publicMetadata(item),
        companyId: undefined,
        companyPaused: undefined,
        inheritInterval: undefined,
      };
      const bytes =
        item.recordBytes -
        recordBytes(publicMetadata(item)) +
        recordBytes(metadata);
      usage.bytes += bytes - item.recordBytes;
      monitors.put({ ...metadata, recordBytes: bytes });
    }
  });
}
