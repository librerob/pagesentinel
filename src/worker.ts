import * as db from "./core/db";
import { check, newMonitor, nextTime } from "./core/engine";
import {
  config,
  originPattern,
  settings as validateSettings,
  webURL,
} from "./core/validation";
import { defaultSettings, type Settings } from "./core/model";
import { importConfigs } from "./core/backup";
let queue = Promise.resolve<unknown>(undefined);
function serial<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.catch(() => undefined);
  return result;
}
async function preferences(): Promise<Settings> {
  const result = await chrome.storage.local.get("settings");
  try {
    return validateSettings(result.settings);
  } catch {
    return defaultSettings;
  }
}
async function badge() {
  const all = await db.monitors();
  const issue = all.some(
    (m) =>
      m.error ||
      m.notificationError ||
      m.permissionRequired ||
      (!m.paused && m.interval && m.nextCheck < Date.now() - 180_000),
  );
  const unread = all.reduce((n, m) => n + m.unread, 0);
  await chrome.action.setBadgeText({
    text: issue ? "!" : unread ? String(unread) : "",
  });
  await chrome.action.setBadgeBackgroundColor({
    color: issue ? "#a13236" : "#006b5e",
  });
}
async function reconcile(run: boolean) {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  if (!(await chrome.alarms.get("scheduler")))
    await chrome.alarms.create("scheduler", { periodInMinutes: 1 });
  const all = await db.monitors(),
    prefs = await preferences();
  let index = 0;
  for (let m of all) {
    if (
      !(await chrome.permissions.contains({ origins: [originPattern(m.url)] }))
    ) {
      if (!m.permissionRequired)
        await db.putMonitor({
          ...m,
          paused: true,
          permissionRequired: true,
          lease: 0,
          error: "Website access was removed. Grant access to resume checks.",
        });
      continue;
    }
    if (m.lease && m.lease < Date.now()) {
      m = {
        ...m,
        lease: 0,
        error: "The previous check was interrupted. A retry is scheduled.",
        nextCheck: Date.now() + index++ * 15_000,
      };
      await db.putMonitor(m);
    }
    if (!m.paused && m.interval && m.nextCheck < Date.now() - 180_000 && !run) {
      await db.putMonitor({
        ...m,
        nextCheck: Date.now() + 15_000 + index++ * 15_000,
      });
    }
  }
  if (run) {
    const due = (await db.monitors())
      .filter(
        (m) =>
          !m.paused &&
          m.interval &&
          m.nextCheck <= Date.now() &&
          m.lease <= Date.now(),
      )
      .sort((a, b) => a.nextCheck - b.nextCheck)
      .slice(0, 3);
    for (const m of due) await check(m, prefs);
  }
  await badge();
}
function trusted(sender: chrome.runtime.MessageSender) {
  return (
    sender.id === chrome.runtime.id &&
    ["dashboard.html", "popup.html"].some(
      (path) => sender.url?.split("#")[0] === chrome.runtime.getURL(path),
    )
  );
}
async function command(message: unknown) {
  if (
    !message ||
    typeof message !== "object" ||
    !("type" in message) ||
    typeof message.type !== "string"
  )
    throw new Error("Invalid extension message.");
  const msg = message as Record<string, unknown>;
  if (msg.type === "state")
    return { monitors: await db.monitors(), settings: await preferences() };
  if (msg.type === "save") {
    const c = config(msg.config);
    if (
      msg.preview !== undefined &&
      (typeof msg.preview !== "string" || msg.preview.length > 2000)
    )
      throw new Error("Invalid selection preview.");
    if (
      !(await chrome.permissions.contains({ origins: [originPattern(c.url)] }))
    )
      throw new Error(
        "Website access was denied. Grant permission before saving.",
      );
    const existing =
      typeof msg.id === "string"
        ? (await db.monitors()).find((m) => m.id === msg.id)
        : undefined;
    if (msg.id && !existing) throw new Error("Monitor not found.");
    if ((await db.monitors()).length >= 500 && !existing)
      throw new Error(
        "This local profile has reached its safety budget of 500 monitors. Export or remove unused monitors.",
      );
    const reset =
      existing &&
      [
        "url",
        "selector",
        "exclude",
        "kind",
        "ignoreText",
        "ignoreNumbers",
        "ignoreDates",
        "decimal",
      ].some((k) => existing[k as keyof typeof c] !== c[k as keyof typeof c]);
    const m =
      existing && !reset
        ? {
            ...existing,
            ...c,
            permissionRequired: false,
            paused: false,
            nextCheck: nextTime(c.interval),
          }
        : {
            ...newMonitor(c),
            id: existing?.id ?? crypto.randomUUID(),
            created: existing?.created ?? Date.now(),
          };
    if (!m.hash && typeof msg.preview === "string")
      m.initialPreview = msg.preview;
    await db.putMonitor(m);
    return check(m, await preferences());
  }
  if (msg.type === "settings") {
    const value = validateSettings(msg.settings);
    await chrome.storage.local.set({ settings: value });
    // Apply shorter retention immediately, without changing successful baselines.
    for (const m of await db.monitors())
      await db.commitCheck(m, undefined, value.retention);
    return value;
  }
  if (msg.type === "export")
    return {
      version: 1,
      exported: new Date().toISOString(),
      monitors: await db.monitors(),
      history: await db.snapshots(),
      settings: await preferences(),
    };
  if (msg.type === "import") {
    const items = importConfigs(msg.data);
    if ((await db.monitors()).length + items.length > 500)
      throw new Error(
        "Import would exceed the local safety budget of 500 monitors.",
      );
    await db.addImported(items);
    return items.length;
  }
  if (msg.type === "clearAllHistory") {
    await db.clearHistory();
    return true;
  }
  if (msg.type === "resetAll") {
    for (const m of await db.monitors()) await db.removeMonitor(m.id);
    await chrome.storage.local.clear();
    const grants = await chrome.permissions.getAll();
    if (grants.origins?.length)
      await chrome.permissions.remove({ origins: grants.origins });
    return true;
  }
  if (msg.type === "pick") {
    if (!Number.isInteger(msg.tabId) || Number(msg.tabId) < 0)
      throw new Error("Select an ordinary website tab first.");
    const tab = await chrome.tabs.get(Number(msg.tabId));
    webURL(tab.url);
    await chrome.scripting.executeScript({
      target: { tabId: Number(msg.tabId) },
      files: ["picker.js"],
    });
    return true;
  }
  const id = typeof msg.id === "string" ? msg.id : "";
  const m = (await db.monitors()).find((m) => m.id === id);
  if (!m) throw new Error("Monitor not found.");
  if (msg.type === "history") return db.snapshots(id);
  if (msg.type === "delete") {
    await db.removeMonitor(id);
    return true;
  }
  if (msg.type === "read") {
    await db.putMonitor({ ...m, unread: 0 });
    return true;
  }
  if (msg.type === "pause") {
    await db.putMonitor({ ...m, paused: true });
    return true;
  }
  if (msg.type === "resume" || msg.type === "retry") {
    if (
      !(await chrome.permissions.contains({ origins: [originPattern(m.url)] }))
    ) {
      const denied = {
        ...m,
        paused: true,
        permissionRequired: true,
        error: "Website permission is required. Grant access to resume checks.",
      };
      await db.putMonitor(denied);
      return denied;
    }
    return check(
      {
        ...m,
        paused: msg.type === "resume" ? false : m.paused,
        permissionRequired: false,
      },
      await preferences(),
      undefined,
      msg.type === "retry",
    );
  }
  if (msg.type === "reset") {
    await db.putMonitor({
      ...m,
      hash: "",
      baseline: "",
      lastPrice: undefined,
      lowPrice: undefined,
      currency: undefined,
      unread: 0,
      lastSuccess: 0,
    });
    return true;
  }
  if (msg.type === "clearHistory") {
    await db.clearHistory(id);
    return true;
  }
  throw new Error("Unknown extension action.");
}
chrome.runtime.onMessage.addListener((msg: unknown, sender, reply) => {
  if (
    msg &&
    typeof msg === "object" &&
    "type" in msg &&
    msg.type === "selected"
  ) {
    if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0)
      return;
    const value = msg as Record<string, unknown>;
    try {
      const url = webURL(sender.tab.url).href;
      if (
        typeof value.selector !== "string" ||
        value.selector.length > 1000 ||
        typeof value.preview !== "string" ||
        value.preview.length > 2000
      )
        return;
      void chrome.storage.session
        .set({
          selection: {
            url,
            title: (sender.tab.title ?? "").slice(0, 200),
            selector: value.selector,
            preview: value.preview,
          },
        })
        .then(() =>
          chrome.tabs.create({
            url: chrome.runtime.getURL("dashboard.html#new"),
          }),
        );
    } catch {
      /* Invalid page selection is ignored. */
    }
    return;
  }
  if (!trusted(sender)) {
    reply({
      ok: false,
      error: "This action is only available from PageSentinel.",
    });
    return;
  }
  void serial(async () => {
    const data = await command(msg);
    await badge();
    return data;
  }).then(
    (data) => reply({ ok: true, data }),
    (e) =>
      reply({
        ok: false,
        error:
          e instanceof Error
            ? e.message
            : "The operation failed. Reload and retry.",
      }),
  );
  // Return useful validated errors without including page contents or request URLs.
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "scheduler")
    void serial(() => reconcile(true)).catch(() =>
      chrome.action.setBadgeText({ text: "!" }),
    );
});
chrome.runtime.onStartup.addListener(() => {
  void serial(() => reconcile(false)).catch(() =>
    chrome.action.setBadgeText({ text: "!" }),
  );
});
chrome.runtime.onInstalled.addListener(() => {
  void serial(() => reconcile(false)).catch(() =>
    chrome.action.setBadgeText({ text: "!" }),
  );
});
chrome.permissions.onRemoved.addListener(() => {
  void serial(() => reconcile(false)).catch(() =>
    chrome.action.setBadgeText({ text: "!" }),
  );
});
chrome.notifications.onClicked.addListener((id) => {
  void chrome.tabs.create({
    url: chrome.runtime.getURL(
      `dashboard.html#monitor/${encodeURIComponent(id)}`,
    ),
  });
});
void serial(() => reconcile(false)).catch(() =>
  chrome.action.setBadgeText({ text: "!" }),
);
