import { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { workspaceApi } from "./api";
import {
  readHelpUpdateMarker,
  saveHelpUpdateMarker,
  clearHelpUpdateMarker,
  type HelpUpdateMarker,
} from "./helpUpdateJournal";
const access: Record<string, string[]> = {
  service: ["orders.fulfill", "tables.manage"],
  payment: ["payments.record", "refunds.approve"],
  reservation: ["reservations.manage"],
  other: ["organization.manage"],
};
const categories: Record<string, string> = {
  service: "Service",
  payment: "Payment",
  reservation: "Reservation",
  other: "Other",
};
const states: Record<string, string> = {
  open: "Awaiting response",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
};
type Body = {
  requestKey: string;
  status: string;
  customerReply: string;
  internalNote: string;
};
type Props = {
  base: string;
  actorId: string;
  timeZone?: string;
  disabled: boolean;
  permissions: string[];
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
function validRequest(r: any) {
  return (
    !!r &&
    typeof r.id === "string" &&
    typeof r.message === "string" &&
    !!categories[r.category] &&
    !!states[r.status] &&
    (!r.internalNotes ||
      (Array.isArray(r.internalNotes) &&
        r.internalNotes.every((n: any) => n && typeof n.text === "string")))
  );
}
function time(value: unknown, zone?: string) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return "Time unavailable";
  try {
    return (
      new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone || "UTC",
      }).format(new Date(value)) +
      " · " +
      (zone || "UTC")
    );
  } catch {
    return new Date(value).toISOString() + " · UTC";
  }
}
export default function HelpRequests(props: Props) {
  return (
    <ScopedHelpRequests
      key={
        props.base +
        "|" +
        props.actorId +
        "|" +
        [...props.permissions].sort().join(",")
      }
      {...props}
    />
  );
}
function ScopedHelpRequests({
  base,
  actorId,
  timeZone,
  disabled,
  permissions,
  save,
}: Props) {
  const allowed = Object.keys(access).filter((c) =>
    access[c].some((p) => permissions.includes(p)),
  );
  const [requests, setRequests] = useState<any[]>([]),
    [category, setCategory] = useState("all"),
    [error, setError] = useState(""),
    [readError, setReadError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [denied, setDenied] = useState(false),
    [pending, setPending] = useState<HelpUpdateMarker | null>(null),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState(""),
    [resets, setResets] = useState<Record<string, number>>({});
  const mounted = useRef(true),
    flight = useRef(false),
    loadSequence = useRef(0),
    pendingRef = useRef<HelpUpdateMarker | null>(null),
    bodyRef = useRef<Body | null>(null),
    denyRef = useRef(false);
  const options = { expectedActorId: actorId };
  const attemptPath = (m: HelpUpdateMarker) =>
    base +
    `/help-requests/${encodeURIComponent(m.helpRequestId)}/update-attempts/${m.requestKey}`;
  function failure(e: any) {
    if (!mounted.current) return;
    if ([401, 403, 404].includes(e?.status)) {
      denyRef.current = true;
      setDenied(true);
      bodyRef.current = null;
      setRequests([]);
    }
    setError(e?.message || "The update could not be confirmed.");
  }
  function validateProof(result: any, m: HelpUpdateMarker) {
    const parts = base.split("/");
    if (
      !result ||
      result.requestKey !== m.requestKey ||
      result.actorId !== actorId ||
      result.organizationId !== parts[2] ||
      result.branchId !== parts[4] ||
      result.helpRequestId !== m.helpRequestId ||
      !["recorded", "not_found", "abandoned"].includes(result.status)
    )
      throw Error(
        "The update outcome could not be verified. Keep the saved reference and check again.",
      );
    if (
      result.status === "recorded" &&
      (!validRequest(result.request) ||
        result.request.id !== m.helpRequestId ||
        result.resultBasis !== "recorded_operation_snapshot" ||
        !result.operationRecord?.id ||
        result.operationRecord.requestKey !== m.requestKey ||
        result.operationRecord.actorId !== actorId ||
        result.operationRecord.helpRequestId !== m.helpRequestId)
    )
      throw Error("The recorded update could not be verified.");
    const original = bodyRef.current;
    if (
      result.status === "recorded" &&
      original &&
      (result.operationRecord.intent?.status !== original.status ||
        result.operationRecord.intent?.customerReply !==
          original.customerReply.trim() ||
        result.operationRecord.intent?.internalNote !==
          original.internalNote.trim())
    )
      throw Error(
        "The recorded response differs from the original update. Ask a supervisor to review it.",
      );
    if (
      result.status === "abandoned" &&
      typeof result.resolutionId !== "string"
    )
      throw Error("The stopped update could not be verified.");
    return result;
  }
  async function load() {
    if (denyRef.current || !allowed.length) return;
    const seq = ++loadSequence.current;
    setLoading(true);
    try {
      const result = await workspaceApi<any>(
        base + "/help-requests",
        "GET",
        undefined,
        undefined,
        options,
      );
      if (!mounted.current || seq !== loadSequence.current) return;
      if (
        !Array.isArray(result?.requests) ||
        !result.requests.every(validRequest)
      )
        throw Error("Help requests could not be read. Refresh to try again.");
      setRequests(
        result.requests.filter((r: any) => allowed.includes(r.category)),
      );
      setReadError("");
    } catch (e: any) {
      if (mounted.current && seq === loadSequence.current) {
        setReadError(e?.message || "Help requests could not be loaded.");
        if ([401, 403, 404].includes(e?.status)) failure(e);
      }
    } finally {
      if (mounted.current && seq === loadSequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    try {
      const m = readHelpUpdateMarker(actorId, base);
      pendingRef.current = m;
      setPending(m);
      setReady(true);
    } catch (e: any) {
      setError(
        "Saved update details could not be read. Keep this tab open and ask a supervisor to review them.",
      );
    }
    if (allowed.length) void load();
    else setLoading(false);
    return () => {
      mounted.current = false;
      loadSequence.current++;
      bodyRef.current = null;
    };
  }, []);
  async function inspect(m: HelpUpdateMarker) {
    const proof = validateProof(
      await workspaceApi<any>(
        attemptPath(m),
        "GET",
        undefined,
        undefined,
        options,
      ),
      m,
    );
    if (!mounted.current || denyRef.current) return;
    if (proof.status === "not_found") {
      setNotice(
        "No completed update was found. This does not confirm that an in-flight update has stopped. Retry the original update or stop it before writing a new response.",
      );
      return;
    }
    if (proof.status === "recorded")
      setRequests((rows) =>
        rows.map((row) => (row.id === m.helpRequestId ? proof.request : row)),
      );
    clearHelpUpdateMarker(m);
    pendingRef.current = null;
    bodyRef.current = null;
    setPending(null);
    setResets((v) => ({
      ...v,
      [m.helpRequestId]: (v[m.helpRequestId] || 0) + 1,
    }));
    setNotice(
      proof.status === "recorded"
        ? "The original help response was recorded. The latest request details are shown after refresh."
        : "The original update is stopped. It cannot be applied later. You can write a new response.",
    );
    await load();
  }
  async function run(action: () => Promise<void>) {
    if (disabled || flight.current || denyRef.current || !ready) return;
    flight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      failure(e);
    } finally {
      flight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function submit(request: any, body: Omit<Body, "requestKey">) {
    await run(async () => {
      if (pendingRef.current) return;
      const intent = { ...body, requestKey: uuid() };
      let marker: HelpUpdateMarker;
      try {
        marker = saveHelpUpdateMarker({
          version: 1,
          actorId,
          base,
          helpRequestId: request.id,
          requestKey: intent.requestKey,
        });
      } catch {
        setReady(false);
        throw Error(
          "This tab could not save a recovery reference. No update was sent. Reload and review saved references before continuing.",
        );
      }
      pendingRef.current = marker;
      bodyRef.current = intent;
      setPending(marker);
      await save(
        base + "/help-requests/" + request.id,
        "PATCH",
        intent,
        "Help response received; checking the recorded outcome.",
      );
      if (mounted.current) await inspect(marker);
    });
  }
  async function retry() {
    await run(async () => {
      const m = pendingRef.current,
        b = bodyRef.current;
      if (!m || !b) return;
      await save(
        base + "/help-requests/" + m.helpRequestId,
        "PATCH",
        b,
        "Checking the original help response.",
      );
      if (mounted.current) await inspect(m);
    });
  }
  if (!allowed.length)
    return <p>Your role cannot view customer help requests.</p>;
  if (denied)
    return (
      <section className="mw-card">
        <h2>Customer help requests</h2>
        <p role="alert">
          Access to these requests is no longer available. Refresh the workspace
          and ask a supervisor to review the saved update reference.
        </p>
      </section>
    );
  const visible = requests.filter(
    (r) => category === "all" || r.category === category,
  );
  return (
    <section className="mw-card mw-help">
      <h2>Customer help requests</h2>
      <p className="mw-note">
        Requests and replies stay inside this workspace and the customer’s
        current guest session. Email, SMS and push delivery are unavailable.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {pending && (
        <section className="mw-help-recovery" aria-label="Help update recovery">
          <h3>Review the previous response</h3>
          <p>
            A response is not yet confirmed. Refreshing the list does not
            resolve this update. Replies and private notes are not saved in this
            tab’s recovery reference.
          </p>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() =>
              void run(async () => {
                await inspect(pending);
              })
            }
          >
            Check update outcome
          </button>
          {bodyRef.current && (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => void retry()}
            >
              Retry original update
            </button>
          )}
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() =>
              void run(async () => {
                validateProof(
                  await workspaceApi(
                    attemptPath(pending) + "/abandon",
                    "POST",
                    {
                      reason:
                        "Staff explicitly stopped the unresolved help response.",
                    },
                    undefined,
                    options,
                  ),
                  pending,
                );
                if (mounted.current) await inspect(pending);
              })
            }
          >
            Stop original update
          </button>
        </section>
      )}
      <div className="mw-help-toolbar">
        <label>
          Help category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All permitted categories</option>
            {allowed.map((c) => (
              <option key={c} value={c}>
                {categories[c]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          disabled={disabled || busy || loading}
          onClick={() => void load()}
        >
          Refresh help requests
        </button>
      </div>
      {loading && <p role="status">Loading help requests…</p>}
      {readError && <p role="alert">{readError}</p>}
      <div hidden={!!readError || loading}>
        {requests.map((r) => (
          <HelpRow
            key={r.id}
            request={r}
            hidden={category !== "all" && r.category !== category}
            blocked={disabled || busy || !!pending || !ready}
            timeZone={timeZone}
            reset={resets[r.id] || 0}
            submit={(body) => submit(r, body)}
          />
        ))}
      </div>
      {!loading && !readError && !visible.length && (
        <p>No help requests in this view.</p>
      )}
    </section>
  );
}
function HelpRow({
  request,
  hidden,
  blocked,
  timeZone,
  reset,
  submit,
}: {
  request: any;
  hidden: boolean;
  blocked: boolean;
  timeZone?: string;
  reset: number;
  submit: (body: Omit<Body, "requestKey">) => Promise<void>;
}) {
  const [status, setStatus] = useState(
      request.status === "resolved" ? "resolved" : "acknowledged",
    ),
    [reply, setReply] = useState(request.customerReply || ""),
    [note, setNote] = useState("");
  useEffect(() => {
    if (reset) {
      setStatus(request.status === "resolved" ? "resolved" : "acknowledged");
      setReply(request.customerReply || "");
      setNote("");
    }
  }, [reset]);
  return (
    <article className="mw-help-request" hidden={hidden}>
      <header>
        <h3>
          {request.reference || "Reference unavailable"} ·{" "}
          {categories[request.category]}
        </h3>
        <span>{states[request.status]}</span>
      </header>
      <p>{request.message}</p>
      <p className="mw-help-time">
        Requested {time(request.createdAt, timeZone)}
        {request.updatedAt
          ? " · Updated " + time(request.updatedAt, timeZone)
          : ""}
      </p>
      {request.customerReply && (
        <p>
          <strong>Current customer-visible reply:</strong>{" "}
          {request.customerReply}
        </p>
      )}
      {request.internalNotes?.length > 0 && (
        <details>
          <summary>Private staff notes</summary>
          {request.internalNotes.map((n: any, i: number) => (
            <div key={i}>
              <p>{n.text}</p>
              <small>
                {n.actorName || "Staff name unavailable"} ·{" "}
                {time(n.at, timeZone)}
              </small>
            </div>
          ))}
        </details>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit({ status, customerReply: reply, internalNote: note });
        }}
      >
        <fieldset disabled={blocked} className="mw-help-fields">
          <label>
            Request status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option
                value="acknowledged"
                disabled={request.status === "resolved"}
              >
                Acknowledged
              </option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
          <label>
            Customer-visible reply
            <textarea
              maxLength={1000}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
          </label>
          <label>
            Private staff note
            <textarea
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button type="submit">Save help response</button>
        </fieldset>
      </form>
    </article>
  );
}
