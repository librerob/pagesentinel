import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BRAND, health } from "../core/model";
import { originPattern } from "../core/validation";
import { pageURL } from "../core/page";
import { api, appearance, emptyState, type State } from "./api";
import { Icon, Logo } from "./icons";
import "./theme.css";
function Popup() {
  const [state, setState] = useState<State>(emptyState),
    [tab, setTab] = useState<chrome.tabs.Tab>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<State>("state")
      .then((x) => {
        setState(x);
        appearance(x.settings);
      })
      .catch((e) => setError(e.message));
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((x) => setTab(x[0]));
  }, []);
  let url = "";
  try {
    url = pageURL(tab);
  } catch {
    /* Restricted tabs have no monitoring action. */
  }
  function open(hash = "monitors") {
    void chrome.tabs.create({
      url: chrome.runtime.getURL(`dashboard.html#${hash}`),
    });
  }
  async function watch() {
    setError("");
    try {
      const permission = chrome.permissions.request({
        origins: [originPattern(url)],
      });
      setBusy(true);
      if (!(await permission))
        throw new Error(
          "Access was denied. No monitor was created. Try again to allow this website.",
        );
      const { defaults } = await import("../core/model");
      await api("save", {
        config: {
          ...defaults,
          url,
          title: tab?.title?.slice(0, 200) || new URL(url).hostname,
        },
      });
      open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not monitor this page.");
    } finally {
      setBusy(false);
    }
  }
  async function pick() {
    try {
      await api("pick", { tabId: tab?.id });
      window.close();
    } catch {
      setError(
        "Could not select this page. Open an ordinary website and try the toolbar icon again.",
      );
    }
  }
  async function privacy() {
    setBusy(true);
    setError("");
    try {
      await api("discoverTab", { tabId: tab?.id });
      open("policies");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not find policies on this page.",
      );
    } finally {
      setBusy(false);
    }
  }
  const attention = state.monitors.filter((m) =>
    ["error", "warning"].includes(health(m).tone),
  ).length;
  const unread = state.monitors.reduce((n, m) => n + m.unread, 0);
  return (
    <div className="popup">
      <header>
        <div className="brand">
          <Logo size={29} />
          <strong>{BRAND}</strong>
        </div>
        <button
          className="icon-button"
          aria-label="Settings"
          onClick={() => open("settings")}
        >
          <Icon name="settings" size={20} />
        </button>
      </header>
      <div className="popup-content">
        <p className="eyebrow">THIS PAGE</p>
        <h1>
          {url
            ? tab?.title || new URL(url).hostname
            : "Open a website to begin"}
        </h1>
        <p className="domain">
          {url
            ? new URL(url).hostname
            : "Chrome’s internal pages cannot be monitored."}
        </p>
        <button
          disabled={!url || busy}
          className="primary full"
          onClick={() => void watch()}
        >
          <Icon name="plus" size={20} />
          {busy ? "Verifying first check…" : "Monitor this page"}
        </button>
        <button
          disabled={!url || busy}
          className="full"
          onClick={() => void pick()}
        >
          <Icon name="select" size={20} />
          Select an element
        </button>
        <p className="popup-hint">
          Public HTML checks. Chrome asks for access only to the website you
          choose.
        </p>
        <button
          className="full"
          disabled={!url || busy}
          onClick={() => void privacy()}
        >
          <Icon name="policy" size={20} />
          Privacy Watch
        </button>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="popup-summary">
          <span>
            {state.monitors.filter((m) => !m.paused).length} active monitors
          </span>
          <span>{unread} unread</span>
        </div>
        {attention > 0 && (
          <p className="error-message">
            {attention} monitor{attention === 1 ? "" : "s"} need attention
          </p>
        )}
        <button className="text-button full" onClick={() => open()}>
          My Monitors
          <Icon name="arrow" size={18} />
        </button>
      </div>
      <footer>
        <span className="status-dot" />
        Local to your device
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Popup />);
