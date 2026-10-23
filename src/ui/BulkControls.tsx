import { useState } from "react";
import type { MonitorMetadata } from "../core/model";
import { api } from "./api";
export function BulkControls({
  monitors,
  refresh,
  onError,
}: {
  monitors: MonitorMetadata[];
  refresh: () => void;
  onError: (text: string) => void;
}) {
  const [ids, setIds] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [interval, setInterval] = useState(60);
  async function apply(action: string) {
    if (
      action === "delete" &&
      !confirm(
        `Delete ${ids.length} selected monitors and their history? This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api("bulk", { ids, action, interval });
      setIds([]);
      refresh();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="bulk-controls">
      <summary>Manage several monitors</summary>
      <p className="note">
        Select up to 200 visible monitors per action. Company pause settings
        still apply.
      </p>
      <button
        disabled={busy}
        onClick={() => setIds(monitors.slice(0, 200).map((m) => m.id))}
      >
        Select visible monitors
      </button>
      <fieldset disabled={busy}>
        <legend>Selected monitors ({ids.length})</legend>
        <div className="bulk-selection">
          {monitors.map((m) => (
            <label key={m.id} className="check-label">
              <input
                type="checkbox"
                checked={ids.includes(m.id)}
                onChange={(e) =>
                  setIds(
                    e.target.checked
                      ? [...ids, m.id]
                      : ids.filter((id) => id !== m.id),
                  )
                }
              />
              {m.title}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="actions-wrap">
        <button
          disabled={busy || !ids.length}
          onClick={() => void apply("pause")}
        >
          Pause selected
        </button>
        <button
          disabled={busy || !ids.length}
          onClick={() => void apply("resume")}
        >
          Resume selected
        </button>
        <button
          className="danger"
          disabled={busy || !ids.length}
          onClick={() => void apply("delete")}
        >
          Delete selected
        </button>
      </div>
      <label>
        Check frequency
        <select
          value={interval}
          onChange={(e) => setInterval(Number(e.target.value))}
        >
          {[0, 5, 15, 60, 360, 1440].map((n) => (
            <option key={n} value={n}>
              {n ? `Every ${n} minutes` : "Manual only"}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={busy || !ids.length}
        onClick={() => void apply("interval")}
      >
        Apply frequency to selected
      </button>
    </details>
  );
}
