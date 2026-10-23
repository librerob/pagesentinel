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
import { pageSelection } from "./core/page";
import { companyConfig, discoverHTML, discoverPolicies } from "./core/privacy";
import { fetchHTML } from "./core/network";
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
  const all = await db.monitorMetadata();
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
  const all = await db.monitorMetadata(),
    prefs = await preferences();
  let index = 0;
  for (let m of all) {
    if (
      !(await chrome.permissions.contains({ origins: [originPattern(m.url)] }))
    ) {
      if (!m.permissionRequired)
        await db.putMetadata({
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
      await db.putMetadata(m);
    }
    if (!m.paused && m.interval && m.nextCheck < Date.now() - 180_000 && !run) {
      await db.putMetadata({
        ...m,
        nextCheck: Date.now() + 15_000 + index++ * 15_000,
      });
    }
  }
  if (run) {
    const due = (await db.monitorMetadata())
      .filter(
        (m) =>
          !m.paused &&
          !m.companyPaused &&
          m.interval &&
          m.nextCheck <= Date.now() &&
          m.lease <= Date.now(),
      )
      .sort((a, b) => a.nextCheck - b.nextCheck)
      .slice(0, 3);
    for (const metadata of due) {
      const m = await db.monitor(metadata.id);
      if (m) await check(m, prefs);
    }
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
    return {
      monitors: await db.monitorMetadata(),
      settings: await preferences(),
      companies: await db.companies(),
    };
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
      typeof msg.id === "string" ? await db.monitor(msg.id) : undefined;
    if (msg.id && !existing) throw new Error("Monitor not found.");
    const company = c.companyId
      ? (await db.companies()).find((x) => x.id === c.companyId)
      : undefined;
    if (c.companyId && (!company || c.kind !== "policy"))
      throw new Error("Choose an existing company for a policy document.");
    if (company && c.inheritInterval !== false) c.interval = company.interval;
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
    m.companyPaused = company?.paused;
    await db.putMonitor(m);
    return check(m, await preferences());
  }
  if (msg.type === "settings") {
    const value = validateSettings(msg.settings);
    await chrome.storage.local.set({ settings: value });
    // Apply shorter retention immediately, without changing successful baselines.
    for (const m of await db.monitorMetadata())
      await db.pruneHistory(m.id, value.retention);
    return value;
  }
  if (msg.type === "export")
    return {
      version: 1,
      exported: new Date().toISOString(),
      monitors: await db.monitors(),
      history: await db.snapshots(),
      settings: await preferences(),
      companies: await db.companies(),
    };
  if (msg.type === "import") {
    const items = importConfigs(msg.data);
    // Unknown group IDs from archival backups must never attach to live groups.
    for (const item of items) {
      item.companyId = undefined;
      item.inheritInterval = undefined;
    }
    await db.addImported(items);
    return items.length;
  }
  if (msg.type === "clearAllHistory") {
    await db.clearHistory();
    return true;
  }
  if (msg.type === "resetAll") {
    for (const m of await db.monitorMetadata()) await db.removeMonitor(m.id);
    for (const company of await db.companies())
      await db.removeCompany(company.id);
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    const grants = await chrome.permissions.getAll();
    if (grants.origins?.length)
      await chrome.permissions.remove({ origins: grants.origins });
    return true;
  }
  if (msg.type === "discover") {
    const url = webURL(msg.url).href;
    if (!(await chrome.permissions.contains({ origins: [originPattern(url)] })))
      throw new Error(
        "Allow access to this website before finding policy links.",
      );
    return discoverHTML(url, await fetchHTML(url));
  }
  if (msg.type === "discoverTab") {
    if (!Number.isInteger(msg.tabId) || Number(msg.tabId) < 0)
      throw new Error("Open a public website first.");
    const tab = await chrome.tabs.get(Number(msg.tabId));
    const url = webURL(tab.url).href;
    // A user-initiated activeTab read only. This does not follow links or fetch
    // candidates and cannot create a monitor or grant ongoing host access.
    const results = await chrome.scripting.executeScript({
      target: { tabId: Number(msg.tabId) },
      func: () => ({
        url: location.href,
        links: Array.from(document.querySelectorAll("a[href]"))
          .slice(0, 2000)
          .map((a) => ({
            href: a.getAttribute("href") ?? "",
            text: (a.textContent ?? "").trim().slice(0, 300),
            language: a.getAttribute("hreflang") ?? "",
          })),
      }),
    });
    const result = results[0]?.result;
    if (
      !result ||
      webURL(result.url).href !== url ||
      webURL((await chrome.tabs.get(Number(msg.tabId))).url).href !== url
    )
      throw new Error(
        "The page changed while finding policies. Try again on the final page.",
      );
    await chrome.storage.session.set({
      discovery: {
        url,
        title: tab.title?.slice(0, 200) ?? new URL(url).hostname,
        links: discoverPolicies(url, result.links),
      },
    });
    return true;
  }
  if (msg.type === "companySave") {
    const all = await db.companies();
    const existing =
      typeof msg.id === "string" ? all.find((x) => x.id === msg.id) : undefined;
    if (msg.id && !existing) throw new Error("Company not found.");
    const company = companyConfig(msg.company, existing);
    if (!Array.isArray(msg.documents) || msg.documents.length > 80)
      throw new Error("Add at most 80 policy documents per action.");
    const documents = msg.documents.map((x: unknown) => {
      const c = config(x);
      if (c.kind !== "policy")
        throw new Error("Company documents must be policy monitors.");
      c.companyId = company.id;
      c.title = `${company.name} · ${c.title}`.slice(0, 200);
      if (c.inheritInterval !== false) c.interval = company.interval;
      return { ...newMonitor(c), companyPaused: company.paused };
    });
    const seen = new Set(
      (await db.monitorMetadata())
        .filter((m) => m.companyId === company.id)
        .map((m) => m.url),
    );
    for (const m of documents) {
      if (seen.has(m.url))
        throw new Error(
          "This company already monitors one of these document URLs. Edit its region/language label or use a distinct source URL.",
        );
      seen.add(m.url);
      if (
        !(await chrome.permissions.contains({
          origins: [originPattern(m.url)],
        }))
      )
        throw new Error(
          "Website access was denied. No company changes were saved.",
        );
    }
    company.domains = [
      ...new Set([
        ...company.domains,
        ...documents.map((m) => new URL(m.url).origin),
      ]),
    ];
    await db.saveCompany(company, documents);
    return company;
  }
  if (msg.type === "companyDelete") {
    if (typeof msg.id !== "string") throw new Error("Invalid company.");
    await db.removeCompany(msg.id);
    return true;
  }
  if (msg.type === "timeline") {
    let cursor: { time: number; id: string } | undefined;
    if (msg.cursor !== undefined && msg.cursor !== null) {
      const c = msg.cursor as Record<string, unknown>;
      if (
        !c ||
        !Number.isFinite(c.time) ||
        typeof c.id !== "string" ||
        c.id.length > 100
      )
        throw new Error("Invalid history cursor.");
      cursor = { time: Number(c.time), id: c.id };
    }
    const monitors = await db.monitorMetadata();
    return db.historyPage(
      monitors
        .filter((m) => !msg.companyId || m.companyId === msg.companyId)
        .filter((m) => !msg.policyOnly || m.kind === "policy")
        .map((m) => m.id),
      cursor,
    );
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
  const metadata = (await db.monitorMetadata()).find((m) => m.id === id);
  if (!metadata) throw new Error("Monitor not found.");
  if (msg.type === "history") return db.snapshots(id);
  if (msg.type === "delete") {
    await db.removeMonitor(id);
    return true;
  }
  if (msg.type === "read") {
    await db.putMetadata({ ...metadata, unread: 0, readThrough: Date.now() });
    return true;
  }
  if (msg.type === "snooze") {
    if (![0, 60, 1440].includes(Number(msg.minutes)))
      throw new Error("Choose one hour or one day.");
    await db.putMetadata({
      ...metadata,
      snoozeUntil: Number(msg.minutes)
        ? Date.now() + Number(msg.minutes) * 60000
        : 0,
    });
    return true;
  }
  if (msg.type === "pause") {
    await db.putMetadata({ ...metadata, paused: true });
    return true;
  }
  if (msg.type === "clearHistory") {
    await db.clearHistory(id);
    return true;
  }
  const m = await db.monitor(id);
  if (!m) throw new Error("Monitor not found.");
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
      referenceText: undefined,
      lastPrice: undefined,
      lowPrice: undefined,
      currency: undefined,
      unread: 0,
      lastSuccess: 0,
    });
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
      if (
        typeof value.selector !== "string" ||
        value.selector.length > 1000 ||
        typeof value.preview !== "string" ||
        value.preview.length > 2000
      )
        return;
      void chrome.storage.session
        .set({
          selection: pageSelection(sender.tab, value.selector, value.preview),
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
  const monitorId = id.startsWith("change:") ? id.split(":")[1] : id;
  void chrome.tabs.create({
    url: chrome.runtime.getURL(
      `dashboard.html#monitor/${encodeURIComponent(monitorId)}`,
    ),
  });
});
void serial(() => reconcile(false)).catch(() =>
  chrome.action.setBadgeText({ text: "!" }),
);
