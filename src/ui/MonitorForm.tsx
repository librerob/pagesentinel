import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  defaults,
  type Config,
  type Company,
  type MonitorMetadata as Monitor,
} from "../core/model";
import { config, originPattern } from "../core/validation";
import { api } from "./api";
import { Icon } from "./icons";
export interface Selection {
  url: string;
  title: string;
  selector: string;
  preview: string;
}
export function MonitorForm({
  monitor,
  selection,
  policy = false,
  companyId,
  companies = [],
  close,
  saved,
}: {
  monitor?: Monitor;
  selection?: Selection;
  policy?: boolean;
  companyId?: string;
  companies?: Company[];
  close: () => void;
  saved: () => void;
}) {
  const [value, setValue] = useState<Config>({
    ...defaults,
    ...(monitor ?? selection ?? {}),
    kind: monitor?.kind ?? (policy ? "policy" : "text"),
    companyId: monitor?.companyId ?? companyId,
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const update = <K extends keyof Config>(key: K, next: Config[K]) =>
    setValue((x) => ({ ...x, [key]: next }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const c = config(value);
      setBusy(true);
      // Called directly in the user gesture, before a runtime message or other await.
      const granted = await chrome.permissions.request({
        origins: [originPattern(c.url)],
      });
      if (!granted)
        throw new Error(
          "Access was denied. Nothing was saved. Allow this website to schedule checks.",
        );
      const preview =
        selection &&
        c.selector === selection.selector &&
        c.url === selection.url &&
        !c.exclude &&
        !c.ignoreText &&
        !c.ignoreDates &&
        !c.ignoreNumbers
          ? selection.preview
          : undefined;
      await api("save", { config: c, id: monitor?.id, preview });
      saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this monitor.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
      aria-labelledby="form-title"
    >
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">
              {monitor ? "MONITOR SETTINGS" : "A LITTLE LESS CHECKING"}
            </p>
            <h2 id="form-title">
              {monitor ? "Edit monitor" : "Watch something important"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            disabled={busy}
            onClick={close}
          >
            <Icon name="close" />
          </button>
        </div>
        {value.kind === "policy" && (
          <details open={!!value.companyId}>
            <summary>Company & regional document</summary>
            <label>
              Company
              <select
                value={value.companyId ?? ""}
                onChange={(e) =>
                  update("companyId", e.target.value || undefined)
                }
              >
                <option value="">Independent document</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Document type
              <select
                value={value.policyType ?? "other"}
                onChange={(e) =>
                  update("policyType", e.target.value as Config["policyType"])
                }
              >
                {[
                  "privacy",
                  "terms",
                  "cookies",
                  "retention",
                  "deletion",
                  "security",
                  "other",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Language
                <input
                  maxLength={100}
                  placeholder="e.g. English"
                  value={value.language ?? ""}
                  onChange={(e) => update("language", e.target.value)}
                />
              </label>
              <label>
                Region
                <input
                  maxLength={100}
                  placeholder="e.g. European Union"
                  value={value.region ?? ""}
                  onChange={(e) => update("region", e.target.value)}
                />
              </label>
            </div>
            {value.companyId && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={value.inheritInterval !== false}
                  onChange={(e) => update("inheritInterval", e.target.checked)}
                />
                Use the company’s check frequency
              </label>
            )}
          </details>
        )}
        <label>
          Website URL
          <input
            autoFocus
            type="url"
            required
            placeholder="https://example.com/privacy"
            value={value.url}
            onChange={(e) => update("url", e.target.value)}
          />
        </label>
        <label>
          Name
          <input
            maxLength={200}
            placeholder="A name you’ll recognize"
            value={value.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Watch for
            <select
              value={value.kind}
              onChange={(e) => {
                const kind = e.target.value as Config["kind"];
                setValue((x) => ({
                  ...x,
                  kind,
                  condition:
                    kind === "price"
                      ? "decreases"
                      : kind === "keyword" || kind === "availability"
                        ? "appears"
                        : "any",
                  ignoreNumbers: false,
                }));
              }}
            >
              <option value="text">Text changes</option>
              <option value="policy">Policy changes</option>
              <option value="price">Price changes</option>
              <option value="keyword">Word or phrase</option>
              <option value="availability">Availability phrase</option>
            </select>
          </label>
          <label>
            Check every
            <select
              value={
                [0, 5, 15, 30, 60, 360, 1440].includes(value.interval)
                  ? value.interval
                  : -1
              }
              onChange={(e) =>
                update(
                  "interval",
                  Number(e.target.value) === -1 ? 10 : Number(e.target.value),
                )
              }
            >
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>Hour</option>
              <option value={360}>6 hours</option>
              <option value={1440}>Day</option>
              <option value={0}>Manual only</option>
              <option value={-1}>Custom interval</option>
            </select>
          </label>
        </div>
        {![0, 5, 15, 30, 60, 360, 1440].includes(value.interval) && (
          <label>
            Interval in minutes
            <input
              type="number"
              min="1"
              max="43200"
              value={value.interval}
              onChange={(e) => update("interval", Number(e.target.value))}
            />
          </label>
        )}
        {selection?.preview && (
          <div className="selection-preview">
            <span className="eyebrow">SELECTED TEXT</span>
            <p>{selection.preview}</p>
            <small>
              The first background check will verify that this text is present
              in the public HTML.
            </small>
          </div>
        )}
        {(value.kind === "keyword" || value.kind === "availability") && (
          <>
            <label>
              Word or phrase
              <input
                required
                value={value.phrase}
                placeholder={
                  value.kind === "availability" ? "In stock" : "Remote"
                }
                onChange={(e) => update("phrase", e.target.value)}
              />
            </label>
            <label>
              Notify when it
              <select
                value={value.condition}
                onChange={(e) =>
                  update("condition", e.target.value as Config["condition"])
                }
              >
                <option value="appears">Appears</option>
                <option value="disappears">Disappears</option>
                <option value="count">Changes occurrence count</option>
              </select>
            </label>
            <small>
              Case insensitive phrase matching. Check that the phrase describes
              the exact state you want.
            </small>
          </>
        )}
        {value.kind === "price" && (
          <>
            <div className="form-grid">
              <label>
                Notify when price
                <select
                  value={value.condition}
                  onChange={(e) =>
                    update("condition", e.target.value as Config["condition"])
                  }
                >
                  <option value="decreases">Decreases</option>
                  <option value="below">Crosses below target</option>
                  <option value="increases">Increases</option>
                  <option value="lowest">Reaches a new low</option>
                </select>
              </label>
              <label>
                Decimal separator
                <select
                  value={value.decimal}
                  onChange={(e) =>
                    update("decimal", e.target.value as Config["decimal"])
                  }
                >
                  <option value="auto">Detect conservatively</option>
                  <option value=".">Period (1,299.00)</option>
                  <option value=",">Comma (1.299,00)</option>
                </select>
              </label>
            </div>
            {value.condition === "below" && (
              <label>
                Target price
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={value.target}
                  onChange={(e) => update("target", Number(e.target.value))}
                />
              </label>
            )}
            <p className="note">
              Select one price element containing its currency. Ambiguous prices
              produce a visible error.
            </p>
          </>
        )}
        <details open={value.kind === "price" && !value.selector}>
          <summary>Advanced: page section & noise controls</summary>
          <label>
            CSS selector{" "}
            <span className="optional">optional for full-page text</span>
            <input
              value={value.selector}
              required={value.kind === "price"}
              placeholder="Whole page, or e.g. #product-price"
              onChange={(e) => update("selector", e.target.value)}
            />
          </label>
          <label>
            Exclude elements
            <input
              placeholder="e.g. nav, footer, .timestamp"
              value={value.exclude}
              onChange={(e) => update("exclude", e.target.value)}
            />
          </label>
          <label>
            Ignore exact text{" "}
            <span className="optional">one phrase per line</span>
            <textarea
              rows={2}
              value={value.ignoreText}
              onChange={(e) => update("ignoreText", e.target.value)}
            />
          </label>
          <label>
            Minimum text change (%)
            <input
              type="number"
              min="0"
              max="100"
              value={value.threshold}
              onChange={(e) => update("threshold", Number(e.target.value))}
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={value.ignoreDates}
              disabled={value.kind === "price"}
              onChange={(e) => update("ignoreDates", e.target.checked)}
            />
            Ignore ISO dates and timestamps
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={value.ignoreNumbers}
              disabled={value.kind === "price"}
              onChange={(e) => update("ignoreNumbers", e.target.checked)}
            />
            Ignore numeric changes
          </label>
        </details>
        <label className="check-label">
          <input
            type="checkbox"
            checked={value.notify}
            onChange={(e) => update("notify", e.target.checked)}
          />
          Show native notifications
        </label>
        <div className="info-box">
          <Icon name="info" size={20} />
          <p>
            Chrome will ask for access to this website. Checks read its public
            HTML without your sign-in cookies, while Chrome is active. Timing
            can be delayed.
          </p>
        </div>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy
              ? "Verifying first check…"
              : monitor
                ? "Save & verify"
                : "Allow & start monitoring"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
