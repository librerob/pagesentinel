import { useEffect, useState } from "react";
import type { MonitorMetadata as Monitor, Snapshot } from "../core/model";
import { policyEvidence, wordDiff } from "../core/compare";
import { api, when } from "./api";
import { Icon } from "./icons";
export function History({
  monitor,
  refresh,
  onError,
}: {
  monitor: Monitor;
  refresh: () => void;
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<Snapshot[]>([]),
    [active, setActive] = useState(""),
    [query, setQuery] = useState(""),
    [mode, setMode] = useState("diff");
  useEffect(() => {
    void api<Snapshot[]>("history", { id: monitor.id })
      .then((x) => {
        setItems(x);
        setActive((a) => (x.some((s) => s.id === a) ? a : (x[0]?.id ?? "")));
      })
      .catch((e) => onError(String(e)));
  }, [monitor.id, monitor.lastSuccess, onError]);
  const chosen = items.find((x) => x.id === active),
    evidence =
      chosen && monitor.kind === "policy" && !chosen.initial
        ? policyEvidence(chosen.before, chosen.after)
        : [];
  async function read() {
    try {
      await api("read", { id: monitor.id });
      refresh();
    } catch (e) {
      onError(String(e));
    }
  }
  return (
    <section className="history-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">A RECORD YOU OWN</p>
          <h2>Change history</h2>
        </div>
        <button onClick={() => void read()} disabled={!monitor.unread}>
          <Icon name="check" size={18} />
          Mark as read
        </button>
      </div>
      <div className="history-layout">
        <aside className="timeline" aria-label="Recorded versions">
          <label className="search small-search">
            <Icon name="search" size={18} />
            <input
              aria-label="Search history"
              placeholder="Find in history"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {items
            .filter((x) =>
              (x.after + x.before).toLowerCase().includes(query.toLowerCase()),
            )
            .map((s) => (
              <button
                key={s.id}
                className={`timeline-item ${s.id === active ? "selected" : ""}`}
                onClick={() => setActive(s.id)}
              >
                <span className="timeline-dot" />
                <span>
                  <strong>
                    {s.initial
                      ? "First successful baseline"
                      : s.alert
                        ? "Change detected"
                        : "Recorded, no alert"}
                  </strong>
                  <small>{when(s.time)}</small>
                </span>
              </button>
            ))}
          {!items.length && (
            <p className="note">
              A successful first check will establish the baseline. Failed
              checks never replace it.
            </p>
          )}
        </aside>
        <div className="comparison">
          {chosen ? (
            <>
              <div className="comparison-toolbar">
                <div>
                  <strong>
                    {chosen.initial ? "Starting point" : "What changed"}
                  </strong>
                  <small>{when(chosen.time)}</small>
                </div>
                <div className="segmented" aria-label="Comparison view">
                  {["diff", "before", "after"].map((x) => (
                    <button
                      key={x}
                      aria-pressed={mode === x}
                      onClick={() => setMode(x)}
                    >
                      {x === "diff"
                        ? "Changes"
                        : x === "before"
                          ? "Before"
                          : "After"}
                    </button>
                  ))}
                </div>
              </div>
              {!chosen.initial && mode === "diff" && (
                <p className="diff-key">
                  <span className="added-key">Added</span>
                  <span className="removed-key">Removed</span>
                </p>
              )}
              {evidence.length > 0 && (
                <details className="policy-evidence" open>
                  <summary>Potentially relevant policy passages</summary>
                  <p className="note">
                    Keyword matches in changed paragraphs, not a legal or
                    privacy-risk assessment.
                  </p>
                  {[...new Set(evidence.map((x) => x.topic))].map((topic) => (
                    <div key={topic}>
                      <strong>{topic}</strong>
                      {evidence
                        .filter((x) => x.topic === topic)
                        .map((x, i) => (
                          <blockquote
                            key={i}
                            className={x.removed ? "removed" : "added"}
                          >
                            <small>{x.removed ? "Removed" : "Added"}</small>
                            {x.text}
                          </blockquote>
                        ))}
                    </div>
                  ))}
                </details>
              )}
              <div className="diff-content" aria-label="Recorded page text">
                {mode === "before"
                  ? chosen.before || "No earlier baseline."
                  : mode === "after" || chosen.initial
                    ? chosen.after
                    : wordDiff(chosen.before, chosen.after).map((part, i) =>
                        part.added ? (
                          <ins key={i}>{part.value}</ins>
                        ) : part.removed ? (
                          <del key={i}>{part.value}</del>
                        ) : (
                          <span key={i}>{part.value}</span>
                        ),
                      )}
              </div>
              <p className="note comparison-footer">
                Text captured from the public HTML. Formatting is normalized;
                unchanged versions are not duplicated.
              </p>
            </>
          ) : (
            <div className="empty-inline">
              <Icon name="changes" size={38} />
              <h3>No recorded versions yet</h3>
              <p>Run a successful check to start this history.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
