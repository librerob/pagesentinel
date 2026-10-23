import { MAX_STORAGE, type Monitor, type Snapshot } from "./model";
let connection: Promise<IDBDatabase> | undefined;
export function database(): Promise<IDBDatabase> {
  return (connection ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("pagesentinel", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("monitors", { keyPath: "id" });
      req.result
        .createObjectStore("snapshots", { keyPath: "id" })
        .createIndex("monitorId", "monitorId");
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => {
        req.result.close();
        connection = undefined;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      connection = undefined;
      reject(new Error("Local storage could not be opened."));
    };
  }));
}
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
export async function monitors(): Promise<Monitor[]> {
  const db = await database();
  return request(db.transaction("monitors").objectStore("monitors").getAll());
}
export async function snapshots(id?: string): Promise<Snapshot[]> {
  const db = await database(),
    store = db.transaction("snapshots").objectStore("snapshots");
  const list = await request<Snapshot[]>(
    id ? store.index("monitorId").getAll(id) : store.getAll(),
  );
  return list.sort((a, b) => b.time - a.time);
}
export async function putMonitor(m: Monitor) {
  const db = await database(),
    tx = db.transaction("monitors", "readwrite"),
    done = complete(tx);
  tx.objectStore("monitors").put(m);
  await done;
}
export async function commitCheck(
  m: Monitor,
  snapshot: Snapshot | undefined,
  retention: number,
) {
  // Quota accounting is serialized by the worker. Reserve room for the monitor's
  // current baseline too; the IDB transaction commits its baseline and event together.
  const [history, all] = await Promise.all([snapshots(), monitors()]);
  const retained = history
    .filter((s) => s.monitorId !== m.id)
    .concat(
      history
        .filter((s) => s.monitorId === m.id)
        .slice(0, snapshot ? retention - 1 : retention),
    );
  if (snapshot) retained.push(snapshot);
  const bytes = new TextEncoder().encode(
    JSON.stringify(retained) +
      JSON.stringify(all.filter((x) => x.id !== m.id).concat(m)),
  ).byteLength;
  if (bytes > MAX_STORAGE)
    throw new Error(
      "The 50 MiB local history budget is full. Export and clear older history before retrying.",
    );
  const keep = new Set(retained.map((s) => s.id));
  const db = await database(),
    tx = db.transaction(["monitors", "snapshots"], "readwrite"),
    done = complete(tx);
  tx.objectStore("monitors").put(m);
  const store = tx.objectStore("snapshots");
  for (const old of history) if (!keep.has(old.id)) store.delete(old.id);
  if (snapshot) store.put(snapshot);
  await done;
}
export async function removeMonitor(id: string) {
  const history = await snapshots(id),
    db = await database(),
    tx = db.transaction(["monitors", "snapshots"], "readwrite"),
    done = complete(tx);
  tx.objectStore("monitors").delete(id);
  for (const s of history) tx.objectStore("snapshots").delete(s.id);
  await done;
}
export async function clearHistory(id?: string) {
  const [all, history, db] = await Promise.all([
    monitors(),
    snapshots(id),
    database(),
  ]);
  const tx = db.transaction(["monitors", "snapshots"], "readwrite"),
    done = complete(tx);
  for (const s of history) tx.objectStore("snapshots").delete(s.id);
  for (const m of all)
    if (!id || m.id === id) tx.objectStore("monitors").put({ ...m, unread: 0 });
  await done;
}
export async function addImported(items: Monitor[]) {
  const db = await database(),
    tx = db.transaction("monitors", "readwrite"),
    done = complete(tx);
  for (const item of items) tx.objectStore("monitors").add(item);
  await done;
}
