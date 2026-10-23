import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BRAND,
  health,
  type MonitorMetadata as Monitor,
  type Settings,
} from "../core/model";
import { originPattern } from "../core/validation";
import { api, appearance, emptyState, relative, when, type State } from "./api";
import { Icon, Logo } from "./icons";
import { MonitorForm, type Selection } from "./MonitorForm";
import { History } from "./History";
import "./theme.css";
function App() {
  const [state, setState] = useState<State>(emptyState),
    [route, setRoute] = useState(location.hash.slice(1) || "monitors");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const [form, setForm] = useState<{
    monitor?: Monitor;
    selection?: Selection;
    policy?: boolean;
  } | null>(null);
  const [, tick] = useState(0);
  const refresh = useCallback(() => {
    void api<State>("state")
      .then(setState)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      refresh();
      tick((x) => x + 1);
    }, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const change = () => setRoute(location.hash.slice(1) || "monitors");
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (route !== "new") return;
    if (!chrome.storage) {
      setForm({});
      return;
    }
    void chrome.storage.session.get("selection").then((x) => {
      setForm({ selection: x.selection as Selection | undefined });
      void chrome.storage.session.remove("selection");
    });
  }, [route]);
  useEffect(() => {
    appearance(state.settings);
    const change = () => appearance(state.settings);
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [state.settings]);
  async function action(
    type: string,
    id?: string,
    extra: Record<string, unknown> = {},
  ) {
    setBusy(id ?? type);
    setError("");
    try {
      await api(type, { id, ...extra });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy("");
    }
  }
  const selected = route.startsWith("monitor/")
    ? state.monitors.find((m) => m.id === decodeURIComponent(route.slice(8)))
    : undefined;
  const issues = state.monitors.filter((m) =>
    ["error", "warning"].includes(health(m).tone),
  );
  const unread = state.monitors.reduce((n, m) => n + m.unread, 0);
  const policy = route === "policies";
  const list = state.monitors
    .filter(
      (m) =>
        (!policy || m.kind === "policy") &&
        (route !== "changes" || m.lastChange) &&
        (filter === "all" ||
          (filter === "attention" && issues.some((x) => x.id === m.id)) ||
          (filter === "unread" && m.unread) ||
          (filter === "paused" && m.paused)) &&
        `${m.title} ${new URL(m.url).hostname}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      route === "changes" ? b.lastChange - a.lastChange : b.created - a.created,
    );
  function closeForm() {
    setForm(null);
    if (route === "new") location.hash = "monitors";
  }
  async function grant(m: Monitor) {
    try {
      if (await chrome.permissions.request({ origins: [originPattern(m.url)] }))
        await action("resume", m.id);
      else setError("Access was denied. The monitor remains paused.");
    } catch (e) {
      setError(String(e));
    }
  }
  const nav = [
    {
      id: "monitors",
      name: "Monitors",
      icon: "monitor",
      count: state.monitors.length,
    },
    { id: "changes", name: "Changes", icon: "changes", count: unread },
    { id: "policies", name: "Policy watch", icon: "policy", count: 0 },
  ];
  return (
    <div className="app-shell">
      <aside className="navigation">
        <a className="brand" href="#monitors">
          <Logo />
          <span>
            {BRAND}
            <small>LOCAL WEBSITE MONITOR</small>
          </span>
        </a>
        <button className="primary add-nav" onClick={() => setForm({ policy })}>
          <Icon name="plus" />
          Add monitor
        </button>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className={
                route === n.id || (n.id === "monitors" && selected)
                  ? "active"
                  : ""
              }
            >
              <Icon name={n.icon} />
              <span>{n.name}</span>
              {n.count > 0 && <span className="nav-count">{n.count}</span>}
            </a>
          ))}
          <div className="nav-separator" />
          <a className={route === "settings" ? "active" : ""} href="#settings">
            <Icon name="settings" />
            Settings
          </a>
          <a className={route === "about" ? "active" : ""} href="#about">
            <Icon name="info" />
            About
          </a>
        </nav>
        <div className="local-note">
          <span className="status-dot" />
          <div>
            On your device<small>No account. No telemetry.</small>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            {selected
              ? "Monitors / Monitor details"
              : route === "policies"
                ? "Policy watch"
                : route === "settings"
                  ? "Preferences"
                  : route === "about"
                    ? "About PageSentinel"
                    : "Your workspace"}
          </span>
          <span className="version">v0.1.0 · working title</span>
        </header>
        <div className="main-content">
          {error && (
            <div className="error-banner" role="alert">
              <Icon name="info" />
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <Icon name="close" />
              </button>
            </div>
          )}
          {selected ? (
            <>
              <a href="#monitors" className="back-link">
                <Icon name="back" size={18} />
                All monitors
              </a>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {selected.kind === "policy"
                      ? "POLICY WATCH"
                      : "MONITOR DETAILS"}
                  </p>
                  <h1>{selected.title}</h1>
                  <a
                    className="source-link"
                    href={selected.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {new URL(selected.url).hostname}
                    {new URL(selected.url).pathname}
                    <Icon name="open" size={15} />
                  </a>
                </div>
                <button onClick={() => setForm({ monitor: selected })}>
                  <Icon name="settings" size={18} />
                  Edit monitor
                </button>
              </div>
              <div className={`health-panel ${health(selected).tone}`}>
                <div>
                  <Status m={selected} />
                  <p>{health(selected).detail}</p>
                </div>
                <button
                  className="primary"
                  disabled={!!busy || selected.lease > Date.now()}
                  onClick={() =>
                    void (selected.permissionRequired
                      ? grant(selected)
                      : action("retry", selected.id))
                  }
                >
                  <Icon name="refresh" size={18} />
                  {busy === selected.id
                    ? "Checking…"
                    : selected.permissionRequired
                      ? "Grant access"
                      : "Check now"}
                </button>
              </div>
              <dl className="monitor-facts">
                <div>
                  <dt>Last successful check</dt>
                  <dd>{when(selected.lastSuccess)}</dd>
                </div>
                <div>
                  <dt>Next expected check</dt>
                  <dd>
                    {selected.paused
                      ? "Paused"
                      : selected.interval
                        ? when(selected.nextCheck)
                        : "Manual only"}
                  </dd>
                </div>
                <div>
                  <dt>Schedule</dt>
                  <dd>
                    {selected.interval
                      ? `Every ${selected.interval} minutes`
                      : "Manual only"}
                  </dd>
                </div>
                <div>
                  <dt>Consecutive failures</dt>
                  <dd>{selected.failures}</dd>
                </div>
              </dl>
              <History
                monitor={selected}
                refresh={refresh}
                onError={setError}
              />
              <details className="maintenance">
                <summary>Monitor controls & diagnostics</summary>
                <p className="note">
                  Selection: {selected.selector || "Whole page"} · Last attempt:{" "}
                  {when(selected.lastAttempt)} · Notifications:{" "}
                  {selected.notify ? "enabled" : "muted"}
                </p>
                <div className="actions-wrap">
                  <button
                    disabled={!!busy || selected.permissionRequired}
                    onClick={() =>
                      void action(
                        selected.paused ? "resume" : "pause",
                        selected.id,
                      )
                    }
                  >
                    {selected.paused ? "Resume" : "Pause"}
                  </button>
                  <button
                    disabled={!!busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Reset the baseline? Your next successful check becomes the starting point. Recorded history remains.",
                        )
                      )
                        void action("reset", selected.id);
                    }}
                  >
                    Reset baseline
                  </button>
                  <button
                    disabled={!!busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Delete this monitor’s recorded history? The current baseline is kept.",
                        )
                      )
                        void action("clearHistory", selected.id);
                    }}
                  >
                    Clear history
                  </button>
                  <button
                    disabled={!!busy}
                    className="danger"
                    onClick={() => {
                      if (
                        confirm(
                          "Delete this monitor and all its history? This cannot be undone.",
                        )
                      ) {
                        void action("delete", selected.id);
                        location.hash = "monitors";
                      }
                    }}
                  >
                    Delete monitor
                  </button>
                </div>
              </details>
            </>
          ) : route === "settings" ? (
            <SettingsView
              value={state.settings}
              save={(next) =>
                void action("settings", undefined, { settings: next })
              }
              action={action}
              busy={!!busy}
              onError={setError}
            />
          ) : route === "about" ? (
            <About />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {policy
                      ? "IMPORTANT WORDS, KEPT IN VIEW"
                      : route === "changes"
                        ? "THE LATEST FROM YOUR PAGES"
                        : "LESS CHECKING. MORE KNOWING."}
                  </p>
                  <h1>
                    {policy
                      ? "Keep an eye on the fine print."
                      : route === "changes"
                        ? "See what’s changed."
                        : "Your pages, in view."}
                  </h1>
                  <p className="subtitle">
                    {policy
                      ? "Follow privacy policies, terms, and security notices. Read the actual changes."
                      : route === "changes"
                        ? "A local record of changes, with the wording that came before."
                        : "Follow the changes that matter. Everything stays on your device."}
                  </p>
                </div>
                <button
                  className="primary heading-add"
                  onClick={() => setForm({ policy })}
                >
                  <Icon name="plus" size={20} />
                  Add monitor
                </button>
              </div>
              {issues.length > 0 && (
                <button
                  className="attention-banner"
                  onClick={() => setFilter("attention")}
                >
                  <Icon name="info" />
                  <span>
                    <strong>
                      {issues.length} monitor{issues.length === 1 ? "" : "s"}{" "}
                      need{issues.length === 1 ? "s" : ""} attention
                    </strong>
                    <small>
                      Review failed or overdue checks so you know what’s being
                      watched.
                    </small>
                  </span>
                  <Icon name="arrow" />
                </button>
              )}
              <div className="list-toolbar">
                <div className="chips" aria-label="Filter monitors">
                  {[
                    ["all", "All monitors"],
                    ["unread", "Unread changes"],
                    ["attention", "Needs attention"],
                    ["paused", "Paused"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      aria-pressed={filter === id}
                      onClick={() => setFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Icon name="search" size={18} />
                  <input
                    aria-label="Search monitors"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search your pages"
                  />
                </label>
              </div>
              {list.length ? (
                <div className="monitor-list">
                  <div className="list-header">
                    <span>Website</span>
                    <span>Monitor health</span>
                    <span>Last successful check</span>
                    <span />
                  </div>
                  {list.map((m) => (
                    <article className="monitor-row" key={m.id}>
                      <a className="monitor-name" href={`#monitor/${m.id}`}>
                        <div
                          className={`site-icon ${m.kind === "policy" ? "policy-icon" : ""}`}
                        >
                          <Icon
                            name={m.kind === "policy" ? "policy" : "monitor"}
                          />
                        </div>
                        <div>
                          <h2>{m.title}</h2>
                          <p>
                            {new URL(m.url).hostname}
                            <span className="type-label">
                              {m.kind === "policy"
                                ? "Policy"
                                : m.kind === "text"
                                  ? m.selector
                                    ? "Selected text"
                                    : "Page text"
                                  : m.kind[0].toUpperCase() + m.kind.slice(1)}
                            </span>
                          </p>
                        </div>
                      </a>
                      <div className="row-status">
                        <Status m={m} />
                        <small>
                          {m.permissionRequired
                            ? "Grant website access"
                            : m.error
                              ? `${m.failures} failed check${m.failures === 1 ? "" : "s"}`
                              : m.paused
                                ? "Not checking"
                                : m.interval
                                  ? `Every ${m.interval} min`
                                  : "Check when you need"}
                        </small>
                      </div>
                      <div className="last-check">
                        <span title={when(m.lastSuccess)}>
                          {relative(m.lastSuccess)}
                        </span>
                        <small>
                          {m.unread
                            ? `${m.unread} unread change${m.unread === 1 ? "" : "s"}`
                            : m.lastSuccess
                              ? "Baseline is safe"
                              : "Not verified yet"}
                        </small>
                      </div>
                      <a
                        href={`#monitor/${m.id}`}
                        className="icon-button"
                        aria-label={`View ${m.title}`}
                      >
                        <Icon name="arrow" size={20} />
                      </a>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-illustration">
                    <Logo size={64} />
                    <span className="orbit-dot" />
                  </div>
                  <h2>
                    {query || filter !== "all"
                      ? "No matching monitors"
                      : policy
                        ? "Important words deserve a watch."
                        : "Your next change starts here."}
                  </h2>
                  <p>
                    {query || filter !== "all"
                      ? "Try another search or filter."
                      : policy
                        ? "Add a policy URL to preserve versions and see the exact paragraphs that change."
                        : "Add a website, or use the toolbar icon to select a price, paragraph, or page. We’ll keep an eye on it."}
                  </p>
                  {filter === "all" && !query && (
                    <button
                      className="primary"
                      onClick={() => setForm({ policy })}
                    >
                      <Icon name="plus" size={18} />
                      {policy ? "Watch a policy" : "Add your first monitor"}
                    </button>
                  )}
                </div>
              )}
              <div className="workspace-footnote">
                <Icon name="info" size={18} />
                <span>
                  Checks run while Chrome is active. A sleeping browser may
                  delay checks. Monitor health always shows the last successful
                  result.
                </span>
              </div>
              {policy && (
                <div className="future-note">
                  <h3>A starting point for Privacy Watch</h3>
                  <p>
                    Each policy has its own history today. Company groups and a
                    unified multi-document timeline are planned for a later
                    release.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      {form && (
        <MonitorForm
          {...form}
          close={closeForm}
          saved={() => {
            closeForm();
            refresh();
          }}
        />
      )}
    </div>
  );
}
function Status({ m }: { m: Monitor }) {
  const status = health(m);
  return (
    <span className={`status ${status.tone}`}>
      <span className="status-dot" />
      {status.label}
    </span>
  );
}
function SettingsView({
  value,
  save,
  action,
  busy,
  onError,
}: {
  value: Settings;
  save: (value: Settings) => void;
  action: (
    type: string,
    id?: string,
    extra?: Record<string, unknown>,
  ) => Promise<void>;
  busy: boolean;
  onError: (message: string) => void;
}) {
  const [notice, setNotice] = useState("");
  const set = <K extends keyof Settings>(key: K, next: Settings[K]) =>
    save({ ...value, [key]: next });
  async function exportData() {
    try {
      const data = await api("export"),
        blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `pagesentinel-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      onError(String(e));
    }
  }
  async function importData(file: File) {
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Backup exceeds 10 MiB.");
      const data: unknown = JSON.parse(await file.text());
      if (
        !confirm(
          "Import monitor configurations as paused copies? You will grant each website access before resuming. Exported history remains in your backup and is not imported as a baseline.",
        )
      )
        return;
      await action("import", undefined, { data });
      setNotice(
        "Import processed. Imported monitors are paused until you grant access.",
      );
    } catch (e) {
      onError(String(e));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MAKE YOURSELF AT HOME</p>
          <h1>Settings</h1>
          <p className="subtitle">
            A few thoughtful defaults. You’re in control.
          </p>
        </div>
      </div>
      <div className="settings-content">
        <section>
          <h2>Appearance</h2>
          <label>
            Theme
            <select
              disabled={busy}
              value={value.theme}
              onChange={(e) =>
                set("theme", e.target.value as Settings["theme"])
              }
            >
              {["system", "light", "dark", "amoled"].map((t) => (
                <option key={t} value={t}>
                  {t === "amoled"
                    ? "AMOLED · true black"
                    : t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="accent-picker" disabled={busy}>
            <legend>Accent color</legend>
            {["teal", "blue", "violet", "green", "rose", "neutral"].map((c) => (
              <button
                key={c}
                data-color={c}
                aria-label={c}
                aria-pressed={value.accent === c}
                onClick={() => set("accent", c as Settings["accent"])}
              >
                {value.accent === c && <Icon name="check" size={19} />}
              </button>
            ))}
          </fieldset>
          <p className="note">
            System follows your device’s light or dark preference. Custom Chrome
            theme accents are not exposed to this extension.
          </p>
        </section>
        <section>
          <h2>Monitoring & history</h2>
          <label className="check-label">
            <input
              disabled={busy}
              type="checkbox"
              checked={value.notifications}
              onChange={(e) => set("notifications", e.target.checked)}
            />
            Enable browser notifications
          </label>
          <label>
            Recorded versions per monitor
            <select
              disabled={busy}
              value={value.retention}
              onChange={(e) => set("retention", Number(e.target.value))}
            >
              {[10, 20, 40, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n} versions
                </option>
              ))}
            </select>
          </label>
          <p className="note">
            Older versions are removed automatically. The current successful
            baseline remains. Total monitoring data has a 50 MiB safety budget;
            a full budget produces a visible error.
          </p>
        </section>
        <section>
          <h2>Your data</h2>
          <p>
            Export configurations, settings, and recorded history to a local
            JSON file. Imports restore validated configurations as paused
            copies; history stays in the backup for archival use.
          </p>
          <div className="actions-wrap">
            <button onClick={() => void exportData()}>Export backup</button>
            <label className="button file-button">
              Import configurations
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importData(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {notice && <p role="status">{notice}</p>}
          <p className="note">
            Backups contain page text and URLs in plain text. Store them
            somewhere private.
          </p>
          <div className="actions-wrap">
            <button
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Clear all recorded history? Current baselines remain.",
                  )
                )
                  void action("clearAllHistory");
              }}
            >
              Clear all history
            </button>
            <button
              disabled={busy}
              className="danger"
              onClick={() => {
                if (
                  confirm(
                    "Delete every monitor, history, and preference, and remove granted website access? This cannot be undone.",
                  )
                )
                  void action("resetAll");
              }}
            >
              Reset all data
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
function About() {
  return (
    <div className="about-content">
      <Logo size={56} />
      <h1>PageSentinel</h1>
      <p className="subtitle">
        Local website monitoring, with a clear view of what changed.
      </p>
      <p>
        Free software under GPL-3.0-or-later. No accounts, advertising,
        analytics, developer backend, or external AI.
      </p>
      <h2>What stays here</h2>
      <p>
        Monitor URLs, rules, text snapshots, and settings are stored on this
        device. They are not encrypted by the extension. Websites you monitor
        receive ordinary requests from your network address. Checks omit
        credentials and reject redirects.
      </p>
      <h2>What this release can watch</h2>
      <p>
        Public HTML pages and uniquely selected elements, including policy
        documents, prices, and availability phrases. JavaScript-only content,
        signed-in pages, screenshots, PDFs, and company-wide Privacy Watch
        groups are not supported yet.
      </p>
      <h2>A working title</h2>
      <p>
        PageSentinel is also used by an unrelated commercial service. This
        project is not affiliated with it. A final public brand will be chosen
        before a Chrome Web Store submission.
      </p>
      <a
        href="https://github.com/librerob/pagesentinel"
        target="_blank"
        rel="noreferrer"
      >
        Source code & documentation
        <Icon name="open" size={16} />
      </a>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
