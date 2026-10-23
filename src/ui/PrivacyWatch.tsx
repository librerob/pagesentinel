import { useEffect, useMemo, useRef, useState } from "react";
import {
  defaults,
  health,
  type Company,
  type MonitorMetadata,
  type Snapshot,
} from "../core/model";
import { companyHealth, policyTypes, type PolicyLink } from "../core/privacy";
import { policyEvidence, policySummary, wordDiff } from "../core/compare";
import { originPattern, webURL } from "../core/validation";
import { api, when } from "./api";
import { Icon } from "./icons";
export interface Discovery {
  url: string;
  title: string;
  links: PolicyLink[];
}

export function PrivacyWatch({
  companies,
  monitors,
  refresh,
  onError,
  addDocument,
}: {
  companies: Company[];
  monitors: MonitorMetadata[];
  refresh: () => void;
  onError: (message: string) => void;
  addDocument: (companyId?: string) => void;
}) {
  const [edit, setEdit] = useState<Company | null | undefined>(undefined),
    [discovery, setDiscovery] = useState<Discovery>();
  useEffect(() => {
    void chrome.storage.session.get("discovery").then((x) => {
      if (x.discovery) {
        setDiscovery(x.discovery as Discovery);
        setEdit(null);
        void chrome.storage.session.remove("discovery");
      }
    });
  }, []);
  async function toggle(company: Company) {
    try {
      await api("companySave", {
        id: company.id,
        company: { ...company, paused: !company.paused },
        documents: [],
      });
      refresh();
    } catch (e) {
      onError(String(e));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">IMPORTANT WORDS, KEPT IN VIEW</p>
          <h1>Privacy Watch</h1>
          <p className="subtitle">
            Follow a company’s policies together. Read the exact wording that
            changed.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setDiscovery(undefined);
            setEdit(null);
          }}
        >
          <Icon name="plus" /> Add company
        </button>
      </div>
      {!companies.length && (
        <div className="empty-state">
          <Icon name="policy" size={44} />
          <h2>A clearer view of the fine print</h2>
          <p>
            Start on a company’s website and choose Privacy Watch from the
            toolbar. Or add a company here and find its published policy links.
          </p>
          <button onClick={() => setEdit(null)}>
            Create your first company
          </button>
        </div>
      )}
      <div className="company-grid">
        {companies.map((company) => {
          const status = companyHealth(company, monitors),
            docs = monitors.filter((m) => m.companyId === company.id);
          return (
            <section className="company-card" key={company.id}>
              <div className="section-heading">
                <div>
                  <h2>{company.name}</h2>
                  <a href={company.url} target="_blank" rel="noreferrer">
                    {new URL(company.url).hostname}
                  </a>
                </div>
                <span
                  className={`status ${status.attention ? "error" : "neutral"}`}
                >
                  {status.label}
                </span>
              </div>
              {company.description && <p>{company.description}</p>}
              <p className="note">
                {status.documents} documents · {status.unread} unread{" "}
                {status.unread === 1 ? "alert" : "alerts"}
                <br />
                All documents last succeeded: {when(status.lastSuccess)}
              </p>
              <div className="actions-wrap">
                <button onClick={() => setEdit(company)}>
                  Edit & find policies
                </button>
                <button onClick={() => void toggle(company)}>
                  {company.paused ? "Resume company" : "Pause company"}
                </button>
                <button onClick={() => addDocument(company.id)}>
                  Add document
                </button>
              </div>
              <details open={status.attention > 0}>
                <summary>Monitored documents ({docs.length})</summary>
                {docs.length ? (
                  docs.map((m) => (
                    <div key={m.id} className="company-document">
                      <a href={`#monitor/${m.id}`}>
                        <strong>{m.title}</strong>
                        <small>
                          {m.policyType ?? "Policy"}
                          {m.language ? ` · ${m.language}` : ""}
                          {m.region ? ` · ${m.region}` : ""}
                        </small>
                      </a>
                      <span className={`status ${health(m).tone}`}>
                        {health(m).label}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="note">
                    No documents yet. Find policies or add a document URL.
                  </p>
                )}
              </details>
              <details>
                <summary>Company controls</summary>
                <p className="note">
                  Removing this company keeps its monitors and their histories
                  as independent documents.
                </p>
                <button
                  className="danger"
                  onClick={() => {
                    if (
                      confirm(
                        `Remove ${company.name} from Privacy Watch? Its documents and history will be kept.`,
                      )
                    )
                      void api("companyDelete", { id: company.id })
                        .then(refresh)
                        .catch((e) => onError(String(e)));
                  }}
                >
                  Remove company
                </button>
              </details>
            </section>
          );
        })}
      </div>
      {monitors.some((m) => m.kind === "policy" && !m.companyId) && (
        <section className="maintenance">
          <h2>Independent policy monitors</h2>
          <p className="note">
            Existing policy monitors are preserved. Edit one to associate it
            with a company.
          </p>
          {monitors
            .filter((m) => m.kind === "policy" && !m.companyId)
            .map((m) => (
              <p key={m.id}>
                <a href={`#monitor/${m.id}`}>{m.title}</a> · {health(m).label}
              </p>
            ))}
        </section>
      )}
      <section className="privacy-timeline">
        <h2>Policy changes</h2>
        <ChangeTimeline
          monitors={monitors.filter((m) => m.kind === "policy")}
          companies={companies}
          policyOnly
          refresh={refresh}
          onError={onError}
        />
      </section>
      {edit !== undefined && (
        <CompanyForm
          company={edit ?? undefined}
          discovery={discovery}
          close={() => setEdit(undefined)}
          saved={() => {
            setEdit(undefined);
            refresh();
          }}
        />
      )}
    </>
  );
}
function CompanyForm({
  company,
  discovery,
  close,
  saved,
}: {
  company?: Company;
  discovery?: Discovery;
  close: () => void;
  saved: () => void;
}) {
  const [value, setValue] = useState({
    name: company?.name ?? discovery?.title ?? "",
    url: company?.url ?? discovery?.url ?? "",
    description: company?.description ?? "",
    interval: company?.interval ?? 1440,
    paused: company?.paused ?? false,
    domains: company?.domains ?? [],
  });
  const [links, setLinks] = useState<PolicyLink[]>(discovery?.links ?? []),
    [chosen, setChosen] = useState<string[]>([]),
    [manual, setManual] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function discover() {
    setError("");
    try {
      const url = webURL(value.url).href;
      const grant = chrome.permissions.request({
        origins: [originPattern(url)],
      });
      setBusy(true);
      if (!(await grant))
        throw new Error("Access was denied. No policy pages were requested.");
      setLinks(await api<PolicyLink[]>("discover", { url }));
      setChosen([]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setError("");
    try {
      if (!value.name.trim()) throw new Error("Enter a company name.");
      webURL(value.url);
      const selected = links.filter((l) => chosen.includes(l.url));
      const origins = [...new Set(selected.map((l) => originPattern(l.url)))];
      // Request every selected origin explicitly from this direct user gesture.
      const grant = origins.length
        ? chrome.permissions.request({ origins })
        : Promise.resolve(true);
      setBusy(true);
      if (!(await grant))
        throw new Error("Website access was denied. Nothing was saved.");
      await api("companySave", {
        id: company?.id,
        company: value,
        documents: selected.map((l) => ({
          ...defaults,
          url: l.url,
          title: l.title,
          kind: "policy",
          interval: value.interval,
          policyType: l.type,
          language: l.language,
          inheritInterval: true,
        })),
      });
      saved();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="company-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">PRIVACY WATCH</p>
            <h2 id="company-title">
              {company ? "Edit company" : "Follow a company"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close company form"
            disabled={busy}
            onClick={close}
          >
            <Icon name="close" />
          </button>
        </div>
        <label>
          Company name
          <input
            autoFocus
            required
            maxLength={200}
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </label>
        <label>
          Company website
          <input
            type="url"
            required
            value={value.url}
            onChange={(e) => setValue({ ...value, url: e.target.value })}
            placeholder="https://example.com"
          />
        </label>
        <button
          type="button"
          disabled={busy || !value.url}
          onClick={() => void discover()}
        >
          {busy ? "Working…" : "Find privacy and legal policies"}
        </button>
        <p className="note">
          Only actual links are suggested. Review each source; an external
          policy host needs its own website permission. Finding links does not
          monitor them.
        </p>
        {!!links.length && (
          <fieldset className="policy-candidates">
            <legend>Choose documents to monitor</legend>
            {links.map((link) => (
              <div key={link.url}>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={chosen.includes(link.url)}
                    onChange={(e) =>
                      setChosen(
                        e.target.checked
                          ? [...chosen, link.url]
                          : chosen.filter((u) => u !== link.url),
                      )
                    }
                  />
                  <span>
                    {link.title}
                    <small>
                      {link.type}
                      {link.language ? ` · ${link.language}` : ""}
                    </small>
                  </span>
                </label>
                <a href={link.url} target="_blank" rel="noreferrer">
                  {link.url}
                </a>
                {value.url &&
                  (() => {
                    try {
                      return (
                        new URL(link.url).origin !== new URL(value.url).origin
                      );
                    } catch {
                      return false;
                    }
                  })() && (
                    <small className="external-origin">
                      Additional website access required
                    </small>
                  )}
              </div>
            ))}
          </fieldset>
        )}
        <details>
          <summary>Add a policy URL manually</summary>
          <label>
            Document URL
            <input
              type="url"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              try {
                const url = webURL(manual).href;
                if (!links.some((l) => l.url === url)) {
                  setLinks([
                    ...links,
                    {
                      url,
                      title: "Policy document",
                      type: "other",
                      language: "",
                    },
                  ]);
                  setChosen([...chosen, url]);
                }
                setManual("");
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Add to review list
          </button>
        </details>
        <details>
          <summary>Advanced company settings</summary>
          <label>
            Description
            <textarea
              maxLength={1000}
              value={value.description}
              onChange={(e) =>
                setValue({ ...value, description: e.target.value })
              }
            />
          </label>
          <label>
            Shared check frequency
            <select
              value={value.interval}
              onChange={(e) =>
                setValue({ ...value, interval: Number(e.target.value) })
              }
            >
              {[0, 60, 360, 1440, 10080].map((n) => (
                <option key={n} value={n}>
                  {n === 0
                    ? "Manual only"
                    : n === 1440
                      ? "Daily"
                      : `Every ${n} minutes`}
                </option>
              ))}
            </select>
          </label>
          <p className="note">
            Documents inherit this frequency unless you override it in their
            monitor settings. Existing individual pause choices are preserved.
          </p>
        </details>
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
              ? "Saving…"
              : `Save company${chosen.length ? ` & ${chosen.length} documents` : ""}`}
          </button>
        </div>
      </form>
    </dialog>
  );
}
type Page = { items: Snapshot[]; next: { time: number; id: string } | null };
export function ChangeTimeline({
  monitors,
  companies,
  policyOnly = false,
  refresh,
  onError,
}: {
  monitors: MonitorMetadata[];
  companies: Company[];
  policyOnly?: boolean;
  refresh: () => void;
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<Snapshot[]>([]),
    [next, setNext] = useState<Page["next"]>(null),
    [busy, setBusy] = useState(false),
    [company, setCompany] = useState(""),
    [type, setType] = useState(""),
    [category, setCategory] = useState(""),
    [unread, setUnread] = useState(false),
    [date, setDate] = useState(""),
    [status, setStatus] = useState("");
  const signature = monitors.map((m) => `${m.id}:${m.lastChange}`).join("|");
  const analyses = useMemo(
    () =>
      new Map(
        items.map((s) => [
          s.id,
          {
            evidence: policyEvidence(s.before, s.after),
            summaries: policySummary(s.before, s.after),
          },
        ]),
      ),
    [items],
  );
  useEffect(() => {
    let live = true;
    setBusy(true);
    void api<Page>("timeline", { companyId: company, policyOnly })
      .then((p) => {
        if (live) {
          setItems(p.items);
          setNext(p.next);
        }
      })
      .catch((e) => onError(String(e)))
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [company, policyOnly, signature, onError]);
  const rows = items.flatMap((s) => {
    const m = monitors.find((m) => m.id === s.monitorId);
    if (
      !m ||
      s.initial ||
      (type && m.policyType !== type) ||
      (date && s.time < new Date(date).getTime()) ||
      (status &&
        (status === "paused"
          ? !m.paused && !m.companyPaused
          : health(m).tone !== "error")) ||
      (unread && (!m.unread || s.time <= (m.readThrough ?? 0) || !s.alert))
    )
      return [];
    const evidence = m.kind === "policy" ? analyses.get(s.id)!.evidence : [];
    if (category && !evidence.some((e) => e.topic === category)) return [];
    return [
      {
        s,
        m,
        summaries: m.kind === "policy" ? analyses.get(s.id)!.summaries : [],
      },
    ];
  });
  const categories = [
    ...new Set(
      items.flatMap((s) => analyses.get(s.id)!.evidence.map((e) => e.topic)),
    ),
  ];
  return (
    <>
      <details className="timeline-filters">
        <summary>Filter changes</summary>
        <div className="form-grid">
          <label>
            Company
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="">All companies</option>
              {companies.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Document type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All document types</option>
              {policyTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories in loaded changes</option>
              {categories.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Since date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Monitor status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option>
              <option value="paused">Paused</option>
              <option value="attention">Needs attention</option>
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={unread}
              onChange={(e) => setUnread(e.target.checked)}
            />
            Unread alerts only
          </label>
        </div>
      </details>
      {busy && <p role="status">Loading recorded changes…</p>}
      {!busy && !rows.length && (
        <p className="note">
          No matching changes in the loaded history. First successful checks
          establish a starting point without an alert.
        </p>
      )}
      <div className="change-feed">
        {rows.map(({ s, m, summaries }) => (
          <article key={s.id} className="change-card">
            <div className="section-heading">
              <div>
                <a href={`#monitor/${m.id}`}>
                  <h3>{m.title}</h3>
                </a>
                <small>
                  {when(s.time)} · {s.alert ? "Alert" : "Recorded, no alert"}
                  {m.unread && s.alert && s.time > (m.readThrough ?? 0)
                    ? " · Unread"
                    : ""}
                </small>
              </div>
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open source for ${m.title}`}
              >
                <Icon name="open" />
              </a>
            </div>
            <p>
              {summaries[0] ??
                (m.kind === "policy"
                  ? "Policy text changed. Review the highlighted passages."
                  : "Page text changed. Review the recorded differences.")}
            </p>
            <ChangeEvidence before={s.before} after={s.after} />
            {m.unread > 0 && (
              <button
                className="text-button"
                onClick={() =>
                  void api("read", { id: m.id })
                    .then(refresh)
                    .catch((e) => onError(String(e)))
                }
              >
                Mark document as read
              </button>
            )}
          </article>
        ))}
      </div>
      {next && (
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void api<Page>("timeline", {
              companyId: company,
              policyOnly,
              cursor: next,
            })
              .then((p) => {
                setItems((old) => [...old, ...p.items]);
                setNext(p.next);
              })
              .catch((e) => onError(String(e)))
              .finally(() => setBusy(false));
          }}
        >
          Load older versions
        </button>
      )}
      <p className="note">
        Categories are local keyword matches in changed paragraphs, not legal
        conclusions or risk scores. Filters apply to loaded versions; load older
        versions to search further.
      </p>
    </>
  );
}
function ChangeEvidence({ before, after }: { before: string; after: string }) {
  const [open, setOpen] = useState(false);
  const parts = useMemo(
    () => (open ? wordDiff(before, after) : []),
    [open, before, after],
  );
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Show the exact change</summary>
      {open && (
        <div className="diff-content">
          {parts.map((p, i) =>
            p.added ? (
              <ins key={i}>{p.value}</ins>
            ) : p.removed ? (
              <del key={i}>{p.value}</del>
            ) : (
              <span key={i}>{p.value}</span>
            ),
          )}
        </div>
      )}
    </details>
  );
}
