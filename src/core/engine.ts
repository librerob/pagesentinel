import { extract } from "./extract";
import { evaluate } from "./compare";
import { fetchHTML } from "./network";
import { originPattern } from "./validation";
import { commitCheck, putMonitor } from "./db";
import { BRAND, type Monitor, type Settings, type Snapshot } from "./model";
export function nextTime(
  interval: number,
  failures = 0,
  now = Date.now(),
  jitter = Math.random(),
) {
  if (!interval) return 0;
  return (
    now +
    Math.max(
      interval * 60_000,
      failures
        ? Math.min(6 * 3600_000, 60_000 * 2 ** Math.min(failures, 9))
        : 0,
    ) +
    Math.round(jitter * 15_000)
  );
}
export function newMonitor(
  c: Omit<
    Monitor,
    | "id"
    | "created"
    | "paused"
    | "permissionRequired"
    | "nextCheck"
    | "lastAttempt"
    | "lastSuccess"
    | "lastChange"
    | "failures"
    | "error"
    | "unread"
    | "lease"
    | "hash"
    | "baseline"
  >,
): Monitor {
  return {
    ...c,
    id: crypto.randomUUID(),
    created: Date.now(),
    paused: false,
    permissionRequired: false,
    nextCheck: Date.now(),
    lastAttempt: 0,
    lastSuccess: 0,
    lastChange: 0,
    failures: 0,
    error: "",
    unread: 0,
    lease: 0,
    hash: "",
    baseline: "",
  };
}
export interface CheckDeps {
  allowed: (url: string) => Promise<boolean>;
  fetch: (url: string) => Promise<string>;
  save: typeof putMonitor;
  commit: typeof commitCheck;
  notify: (id: string, message: string) => Promise<void>;
}
const production: CheckDeps = {
  allowed: (url) =>
    chrome.permissions.contains({ origins: [originPattern(url)] }),
  fetch: fetchHTML,
  save: putMonitor,
  commit: commitCheck,
  notify: async (id, message) => {
    await chrome.notifications.create(id, {
      type: "basic",
      iconUrl: "icons/128.png",
      title: BRAND,
      message,
    });
  },
};
export async function check(
  original: Monitor,
  settings: Settings,
  deps: CheckDeps = production,
): Promise<Monitor> {
  const now = Date.now();
  if (original.lease > now || original.paused) return original;
  let m = { ...original, lastAttempt: now, lease: now + 45_000 };
  let committed = false;
  await deps.save(m);
  try {
    if (!(await deps.allowed(m.url))) {
      m = { ...m, paused: true, permissionRequired: true };
      throw new Error(
        "Website permission is required. Grant access to resume monitoring.",
      );
    }
    const text = extract(await deps.fetch(m.url), m);
    if (!m.hash && m.initialPreview) {
      const compact = (value: string) => value.replace(/\s+/g, " ").trim();
      if (!compact(text).startsWith(compact(m.initialPreview)))
        throw new Error(
          "The selected text differs from the public HTML. This page may require JavaScript or sign-in; monitoring is not verified.",
        );
    }
    const hash = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
      ),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const outcome = evaluate(m, text);
    const changed = !!m.hash && hash !== m.hash;
    const snapshot: Snapshot | undefined =
      changed || !m.hash
        ? {
            id: crypto.randomUUID(),
            monitorId: m.id,
            time: Date.now(),
            before: m.baseline,
            after: text,
            alert: changed && outcome.alert,
            initial: !m.hash,
          }
        : undefined;
    m = {
      ...m,
      hash,
      baseline: text,
      lastSuccess: Date.now(),
      lastChange: changed ? Date.now() : m.lastChange,
      nextCheck: nextTime(m.interval),
      failures: 0,
      error: "",
      permissionRequired: false,
      lease: 0,
      unread: m.unread + (changed && outcome.alert ? 1 : 0),
      initialPreview: undefined,
    };
    if (outcome.price)
      m = {
        ...m,
        lastPrice: outcome.price.value,
        lowPrice: Math.min(outcome.price.value, m.lowPrice ?? Infinity),
        currency: outcome.price.currency,
      };
    await deps.commit(m, snapshot, settings.retention);
    committed = true;
    if (changed && outcome.alert && m.notify && settings.notifications) {
      try {
        await deps.notify(
          m.id,
          m.kind === "price"
            ? `${m.title}: price changed from ${original.lastPrice} to ${m.lastPrice} ${m.currency}.`
            : `${m.title}: ${m.kind === "policy" ? "Policy wording changed. Review the modified paragraphs." : "New change detected. View the recorded differences."}`,
        );
        if (m.notificationError) {
          m.notificationError = "";
          await deps.save(m);
        }
      } catch {
        m.notificationError =
          "Chrome could not display a notification. Changes are saved here; check browser and OS notification settings.";
        await deps.save(m);
      }
    }
    return m;
  } catch (e) {
    if (committed) throw e;
    // A failed check always retains the last committed baseline, including quota failures.
    m = {
      ...original,
      paused: m.paused,
      permissionRequired: m.permissionRequired,
      lastAttempt: now,
      lease: 0,
      failures: original.failures + 1,
      error:
        e instanceof Error
          ? e.message
          : "Check failed. Retry or edit this monitor.",
      nextCheck: nextTime(original.interval, original.failures + 1),
    };
    await deps.save(m);
    if (m.failures === 1 && m.notify && settings.notifications) {
      try {
        await deps.notify(
          m.id,
          `${m.title}: monitor needs attention. ${m.error}`,
        );
      } catch {
        /* Health remains visible in the dashboard. */
      }
    }
    return m;
  }
}
