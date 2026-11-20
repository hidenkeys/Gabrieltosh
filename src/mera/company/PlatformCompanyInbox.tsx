import { useEffect, useRef, useState } from "react";
import { workspaceApi, WorkspaceError } from "../workspace/api";
import {
  companyBudgetLabels,
  companyLeadStatuses,
  companyLeadUpdateSchema,
} from "../../../shared/mera-company-contracts.js";

import {
  readCompanyUpdate,
  persistCompanyUpdate,
  clearCompanyUpdate,
  confirmedCompanyUpdate,
  type CompanyUpdate as Pending,
} from "./companyUpdateRecovery";
const base = "/platform/company-leads";
const labels: Record<string, string> = {
  name: "Name",
  company: "Company",
  email: "Email",
  phone: "Phone",
  problem: "Problem to solve",
  intendedUsers: "Intended users",
  capabilities: "Desired capabilities",
  projectType: "Project",
  budgetRange: "Budget indication",
  timeline: "Desired timeline",
  role: "Role",
  interest: "Interest",
};
const human = (value: string) => value.replaceAll("_", " ");
const date = (value: string) => new Date(value).toLocaleString();
export default function PlatformCompanyInbox({
  kind,
  actorId,
}: {
  kind: "consultancy" | "travel_interest";
  actorId: string;
}) {
  const key = `mera.company-update.v1.${actorId}.${kind}`;
  const [recovery] = useState(() => {
    try {
      return { pending: readCompanyUpdate(key, actorId, kind), error: "" };
    } catch {
      return {
        pending: null,
        error:
          "The saved update cannot be read safely. Updates are disabled to protect the original request. Ask an operator to reconcile this browser session before continuing.",
      };
    }
  });
  const [pending, setPending] = useState<Pending | null>(recovery.pending);
  const [items, setItems] = useState<any[]>([]),
    [handlers, setHandlers] = useState<any[]>([]),
    [detail, setDetail] = useState<any>(null),
    [draft, setDraft] = useState<any>(null);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [handler, setHandler] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  const [listFailed, setListFailed] = useState(false);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const alive = useRef(true),
    generation = useRef(0),
    detailGeneration = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      detailGeneration.current++;
    };
  }, []);
  async function load(nextPage = page) {
    const current = ++generation.current;
    setLoading(true);
    setListFailed(false);
    setError("");
    try {
      const q = new URLSearchParams({
        kind,
        page: String(nextPage),
        limit: "20",
        ...(search ? { search } : {}),
        ...(filter ? { status: filter } : {}),
        ...(handler ? { assignedHandlerId: handler } : {}),
      });
      const [result, people] = await Promise.all([
        workspaceApi(`${base}?${q}`),
        workspaceApi(`${base}/handlers`),
      ]);
      if (!alive.current || current !== generation.current) return;
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
      setHandlers(people.handlers);
    } catch (e) {
      if (alive.current && current === generation.current) {
        setListFailed(true);
        setError((e as Error).message);
      }
    } finally {
      if (alive.current && current === generation.current) setLoading(false);
    }
  }
  async function open(id: string, preserveDraft = false) {
    const current = ++detailGeneration.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await workspaceApi(`${base}/${id}`);
      if (!alive.current || current !== detailGeneration.current) return false;
      setDetail(result);
      if (!preserveDraft)
        setDraft({
          status: result.status,
          assignedHandlerId: result.assignedHandlerId || "",
          internalNote: "",
          followUp: result.followUp || {
            stage: "none",
            dueAt: null,
            summary: "",
          },
        });
      setTimeout(() => {
        if (alive.current && current === detailGeneration.current)
          heading.current?.focus();
      }, 0);
      return true;
    } catch (e) {
      if (alive.current && current === detailGeneration.current)
        setError((e as Error).message);
      return false;
    } finally {
      if (alive.current && current === detailGeneration.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load(1);
    if (pending) void open(pending.id);
  }, []);
  async function save(existing?: Pending) {
    setError("");
    setMessage("");
    if (recovery.error) return;
    const request = existing || {
      id: detail.id,
      actorId,
      kind,
      body: {
        ...draft,
        requestKey: crypto.randomUUID(),
        expectedVersion: detail.version,
        assignedHandlerId: draft.assignedHandlerId || null,
      },
    };
    const parsed = companyLeadUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      setError("Check the note, follow-up and selected status before saving.");
      return;
    }
    try {
      persistCompanyUpdate(key, request);
    } catch {
      setError(
        "Your browser cannot preserve this update for recovery. Enable session storage before saving.",
      );
      return;
    }
    setPending(request);
    setBusy(true);
    try {
      const result = await workspaceApi(
        `${base}/${request.id}`,
        "PATCH",
        request.body,
        undefined,
        { expectedActorId: actorId },
      );
      if (!alive.current) return;
      if (!confirmedCompanyUpdate(result, request))
        throw new Error("The update response could not be verified.");
      clearCompanyUpdate(key, request);
      setPending(null);
      setDetail(null);
      setDraft(null);
      const refreshed = await open(request.id);
      if (alive.current)
        setMessage(
          refreshed
            ? "Update saved. Notes and follow-up remain internal."
            : "Update saved. Reopen the submission to load its latest details before another change.",
        );
    } catch (e) {
      if (!alive.current) return;
      const definite =
        !existing &&
        e instanceof WorkspaceError &&
        e.status >= 400 &&
        e.status < 500 &&
        ![401, 403, 408, 429].includes(e.status);
      if (definite) {
        try {
          clearCompanyUpdate(key, request);
          setPending(null);
        } catch {
          setError(
            "The saved update could not be cleared safely. Retry the original update.",
          );
          return;
        }
      }
      setError(
        (e as Error).message +
          (definite
            ? ""
            : " The outcome is not confirmed. Retry the saved update without changing it."),
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section
      className="mera-company-inbox"
      aria-label={
        kind === "consultancy"
          ? "Consultancy enquiries"
          : "Travel interest submissions"
      }
    >
      {recovery.error && (
        <p role="alert" className="info-box">
          {recovery.error}
        </p>
      )}
      {error && (
        <p role="alert" className="info-box">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="info-box">
          {message}
        </p>
      )}
      {pending && (
        <div className="mera-company-recovery">
          <strong>An update needs confirmation</strong>
          <p>
            The original details are retained in this browser session. Retrying
            safely checks the same update.
          </p>
          <button disabled={busy} onClick={() => void save(pending)}>
            {busy ? "Checking…" : "Retry saved update"}
          </button>
        </div>
      )}
      {!detail ? (
        <>
          <form
            className="mera-company-filters"
            onSubmit={(e) => {
              e.preventDefault();
              void load(1);
            }}
          >
            <label>
              Search enquiries
              <input
                value={search}
                maxLength={100}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Reference, name, company or email"
              />
            </label>
            <label>
              Status
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                {companyLeadStatuses.map((s) => (
                  <option key={s} value={s}>
                    {human(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Handler
              <select
                value={handler}
                onChange={(e) => setHandler(e.target.value)}
              >
                <option value="">All handlers</option>
                {handlers.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={loading}>Apply filters</button>
          </form>
          {loading ? (
            <p role="status">Loading submissions…</p>
          ) : listFailed ? (
            <button className="secondary" onClick={() => void load()}>
              Retry loading submissions
            </button>
          ) : (
            <>
              <p>
                {total} {total === 1 ? "submission" : "submissions"}
              </p>
              {!items.length ? (
                <div className="mera-panel">
                  <h2>No submissions found</h2>
                  <p>
                    New{" "}
                    {kind === "consultancy"
                      ? "project briefs"
                      : "Travel interest"}{" "}
                    will appear here. Try changing your filters.
                  </p>
                </div>
              ) : (
                <div
                  className="mera-company-table"
                  tabIndex={0}
                  role="region"
                  aria-label="Submissions table"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Reference / received</th>
                        <th>Contact</th>
                        <th>Status</th>
                        <th>Handler</th>
                        <th>Follow-up</th>
                        <th>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.reference}</strong>
                            <small>{date(item.createdAt)}</small>
                          </td>
                          <td>
                            {item.contact.name}
                            <small>
                              {item.contact.company || item.contact.email}
                            </small>
                          </td>
                          <td>{human(item.status)}</td>
                          <td>{item.assignedHandlerName || "Unassigned"}</td>
                          <td>
                            {item.followUp?.stage !== "none"
                              ? human(item.followUp?.stage || "none")
                              : "Not scheduled"}
                            {item.followUp?.dueAt && (
                              <small>{date(item.followUp.dueAt)}</small>
                            )}
                          </td>
                          <td>
                            <button
                              className="secondary"
                              disabled={busy || !!pending}
                              onClick={() => void open(item.id)}
                              aria-label={`Review ${item.reference}`}
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mera-company-pagination">
                <button
                  className="secondary"
                  disabled={page <= 1 || loading}
                  onClick={() => void load(page - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {Math.max(1, Math.ceil(total / 20))}
                </span>
                <button
                  className="secondary"
                  disabled={page * 20 >= total || loading}
                  onClick={() => void load(page + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="mera-company-detail-heading">
            <button
              className="secondary"
              disabled={busy || !!pending}
              onClick={() => {
                setDetail(null);
                setMessage("");
                void load();
              }}
            >
              Back to submissions
            </button>
            <div>
              <p>
                {kind === "consultancy" ? "Project brief" : "Travel interest"}
              </p>
              <h2 ref={heading} tabIndex={-1}>
                {detail.reference}
              </h2>
              <p>Received {date(detail.createdAt)}</p>
            </div>
            <button
              className="secondary"
              disabled={busy || !!pending}
              onClick={() => void open(detail.id, true)}
            >
              Refresh details
            </button>
          </div>
          <div className="mera-company-detail-grid">
            <article className="mera-panel">
              <h3>Submitted details</h3>
              <dl>
                {Object.entries(labels)
                  .filter(([k]) => detail.data[k])
                  .map(([k, label]) => (
                    <div key={k}>
                      <dt>{label}</dt>
                      <dd>
                        {k === "budgetRange"
                          ? companyBudgetLabels[detail.data[k]]
                          : k === "projectType"
                            ? human(detail.data[k])
                            : detail.data[k]}
                      </dd>
                    </div>
                  ))}
              </dl>
              <h3>Supporting documents</h3>
              {detail.documents.length ? (
                <>
                  <p>{detail.documentSafety}</p>
                  <ul>
                    {detail.documents.map((d: any) => (
                      <li key={d.id}>
                        <a
                          href={`/api/mera/v1${base}/${detail.id}/documents/${d.id}`}
                          download
                        >
                          {d.filename}
                        </a>{" "}
                        <small>({Math.ceil(d.byteLength / 1024)} KB)</small>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>No documents submitted.</p>
              )}
              <p className="mera-company-private-note">
                This is an enquiry, not an accepted project or quotation. No
                confirmation email has been sent.
              </p>
            </article>
            <div>
              <form
                className="mera-panel mera-company-update"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <h3>Manage follow-up</h3>
                <section
                  className="mera-company-saved-summary"
                  aria-label="Latest saved follow-up"
                >
                  <header>
                    <h4>Latest saved details</h4>
                    <span>Version {detail.version}</span>
                  </header>
                  <dl>
                    <div>
                      <dt>Saved status</dt>
                      <dd>{human(detail.status)}</dd>
                    </div>
                    <div>
                      <dt>Saved handler</dt>
                      <dd>
                        {detail.assignedHandlerName ||
                          handlers.find(
                            (person) => person.id === detail.assignedHandlerId,
                          )?.name ||
                          (detail.assignedHandlerId
                            ? "Assigned handler unavailable"
                            : "Unassigned")}
                      </dd>
                    </div>
                    <div>
                      <dt>Saved next stage</dt>
                      <dd>
                        {detail.followUp?.stage &&
                        detail.followUp.stage !== "none"
                          ? human(detail.followUp.stage)
                          : "None"}
                      </dd>
                    </div>
                    <div>
                      <dt>Saved follow-up date</dt>
                      <dd>
                        {detail.followUp?.dueAt
                          ? new Date(detail.followUp.dueAt).toLocaleString(
                              undefined,
                              { timeZone: "UTC" },
                            ) + " UTC"
                          : "Not scheduled"}
                      </dd>
                    </div>
                    {detail.followUp?.summary && (
                      <div className="mera-company-saved-summary-wide">
                        <dt>Saved follow-up summary</dt>
                        <dd>{detail.followUp.summary}</dd>
                      </div>
                    )}
                  </dl>
                  <p>
                    Refreshing updates these saved details and keeps your edits
                    below. Review both before saving.
                  </p>
                  {(draft.status !== detail.status ||
                    (draft.assignedHandlerId || null) !==
                      (detail.assignedHandlerId || null) ||
                    draft.followUp.stage !==
                      (detail.followUp?.stage || "none") ||
                    (draft.followUp.dueAt || null) !==
                      (detail.followUp?.dueAt || null) ||
                    draft.followUp.summary !==
                      (detail.followUp?.summary || "")) && (
                    <p className="mera-company-draft-difference" role="status">
                      Your edits differ from the saved details. Saving will
                      apply the values in the form below.
                    </p>
                  )}
                </section>
                <fieldset disabled={busy || !!pending || !!recovery.error}>
                  <label>
                    Status
                    <select
                      value={draft.status}
                      onChange={(e) =>
                        setDraft({ ...draft, status: e.target.value })
                      }
                    >
                      {companyLeadStatuses.map((s) => (
                        <option key={s} value={s}>
                          {human(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Assigned handler
                    <select
                      value={draft.assignedHandlerId}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          assignedHandlerId: e.target.value,
                        })
                      }
                    >
                      <option value="">Unassigned</option>
                      {handlers.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Next stage
                    <select
                      value={draft.followUp.stage}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          followUp: {
                            ...draft.followUp,
                            stage: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="none">None</option>
                      <option value="discovery">Discovery</option>
                      <option value="proposal">Proposal</option>
                    </select>
                  </label>
                  <label>
                    Follow-up date (UTC)
                    <input
                      type="datetime-local"
                      value={draft.followUp.dueAt?.slice(0, 16) || ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          followUp: {
                            ...draft.followUp,
                            dueAt: e.target.value
                              ? new Date(e.target.value + "Z").toISOString()
                              : null,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Follow-up summary
                    <textarea
                      maxLength={1000}
                      value={draft.followUp.summary}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          followUp: {
                            ...draft.followUp,
                            summary: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Add internal note
                    <textarea
                      maxLength={2000}
                      value={draft.internalNote}
                      onChange={(e) =>
                        setDraft({ ...draft, internalNote: e.target.value })
                      }
                    />
                  </label>
                  <button>{busy ? "Saving…" : "Save update"}</button>
                </fieldset>
                <p>
                  Internal tracking only. Saving does not contact the sender.
                </p>
              </form>
              <section className="mera-panel mera-company-history">
                <h3>Activity</h3>
                {detail.changes.length ? (
                  detail.changes.map((c: any) => (
                    <article key={c.id}>
                      <strong>
                        {c.actorName} · {human(c.data.status)}
                      </strong>
                      <small>{date(c.createdAt)}</small>
                      {c.data.internalNote && <p>{c.data.internalNote}</p>}
                      {c.data.followUp?.summary && (
                        <p>Follow-up: {c.data.followUp.summary}</p>
                      )}
                    </article>
                  ))
                ) : (
                  <p>No updates yet.</p>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
