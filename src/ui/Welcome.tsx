import { useEffect, useRef, useState } from "react";
import { health, type MonitorMetadata } from "../core/model";
import { api, type State } from "./api";
import { Icon, Logo } from "./icons";
export function Onboarding({ start }: { start: () => void }) {
  const [show, setShow] = useState(false),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    void Promise.all([
      chrome.storage.local.get("onboardingComplete"),
      api<State>("state"),
    ])
      .then(([local, state]) => {
        if (!local.onboardingComplete) {
          if (state.monitors.length || state.companies.length)
            void chrome.storage.local.set({ onboardingComplete: true });
          else setShow(true);
        }
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (show && !dialog.current?.open) dialog.current?.showModal();
  }, [show]);
  function done() {
    void chrome.storage.local.set({ onboardingComplete: true });
    setShow(false);
  }
  if (!show) return null;
  return (
    <dialog ref={dialog} aria-labelledby="welcome-title" onCancel={done}>
      <div className="welcome-content">
        <Logo size={48} />
        <p className="eyebrow">A LITTLE LESS CHECKING</p>
        <h2 id="welcome-title">Your pages, kept in view.</h2>
        <p>
          PageSentinel checks webpages and shows the exact text that changed.
          Watch a price, an announcement, or a company’s privacy policies.
        </p>
        <ul>
          <li>
            Choose each website. Chrome asks for access only where you want
            monitoring.
          </li>
          <li>
            Checks run locally while Chrome is open. Sleep or closing Chrome can
            delay them.
          </li>
          <li>
            Your monitors and history stay on this device. No account or
            telemetry.
          </li>
        </ul>
        <div className="dialog-actions">
          <button onClick={done}>Skip for now</button>
          <button
            className="primary"
            onClick={() => {
              done();
              start();
            }}
          >
            Monitor a website
          </button>
        </div>
      </div>
    </dialog>
  );
}
export function Overview({
  monitors,
  start,
}: {
  monitors: MonitorMetadata[];
  start: () => void;
}) {
  const issues = monitors.filter((m) =>
    ["warning", "error"].includes(health(m).tone),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LESS CHECKING. MORE KNOWING.</p>
          <h1>What would you like to watch?</h1>
          <p className="subtitle">
            Choose a page once. Come back when something changes.
          </p>
        </div>
      </div>
      <div className="start-actions">
        <button onClick={start}>
          <Icon name="plus" size={28} />
          <strong>Monitor a Website</strong>
          <span>A price, a job listing, or an announcement.</span>
        </button>
        <a href="#policies">
          <Icon name="policy" size={28} />
          <strong>Privacy Watch</strong>
          <span>Follow company policies and their exact changes.</span>
        </a>
        <a href="#monitors">
          <Icon name="monitor" size={28} />
          <strong>My Monitors</strong>
          <span>
            See what’s running, what changed, and what needs attention.
          </span>
        </a>
      </div>
      {issues.length > 0 && (
        <div className="health-panel warning">
          <div>
            <h2>{issues.length} monitors need attention</h2>
            <p>Review failed, unverified or overdue checks.</p>
          </div>
          <a className="button" href="#monitors">
            Review monitors
          </a>
        </div>
      )}
      <p className="workspace-footnote">
        Checks read public HTML without sign-in cookies. Chrome must be running;
        the last successful check confirms what was actually read.
      </p>
    </>
  );
}
