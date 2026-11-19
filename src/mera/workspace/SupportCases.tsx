import { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { workspaceApi, WorkspaceError } from "./api";
import { Action, Disclosure, ReadState } from "../ui/OperationalPrimitives";
const supportStatus = (status: unknown) =>
  (
    ({
      open: "Awaiting reply",
      acknowledged: "Acknowledged",
      in_progress: "Being reviewed",
      resolved: "Resolved",
    }) as Record<string, string>
  )[String(status)] || "Status unavailable";
const supportTime = (value: unknown) => {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime())
    ? date.toLocaleString()
    : "Time unavailable";
};
type SupportProps = Parameters<typeof ScopedSupportCases>[0];
export default function SupportCases(props: SupportProps) {
  return <ScopedSupportCases key={props.organizationId} {...props} />;
}
function ScopedSupportCases({
  organizationId,
  branches = [],
  disabled,
  save,
}: {
  organizationId: string;
  branches?: { id: string; name: string }[];
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const base =
    "/organizations/" + encodeURIComponent(organizationId) + "/support-cases";
  const [cases, setCases] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [readError, setReadError] = useState(""),
    [accessDenied, setAccessDenied] = useState(false);
  const readGeneration = useRef(0),
    active = useRef(true),
    inFlight = useRef(false),
    pendingRef = useRef<any>(null);
  const generation = useRef(0),
    form = useRef<HTMLFormElement>(null);
  async function load() {
    const current = ++readGeneration.current;
    setLoading(true);
    try {
      const result = await workspaceApi<any>(base);
      if (!active.current || current !== readGeneration.current) return;
      if (!Array.isArray(result?.cases))
        throw new Error(
          "Support records could not be confirmed. Refresh to try again.",
        );
      setCases(result.cases);
      setReadError("");
    } catch (e) {
      if (!active.current || current !== readGeneration.current) return;
      if ([401, 403, 404].includes((e as any).status)) {
        setAccessDenied(true);
        setCases([]);
      }
      setReadError((e as Error).message);
    } finally {
      if (active.current && current === readGeneration.current)
        setLoading(false);
    }
  }
  useEffect(() => {
    active.current = true;
    setCases([]);
    setPending(null);
    setBusy(false);
    setError("");
    void load();
    return () => {
      active.current = false;
      generation.current++;
      readGeneration.current++;
    };
  }, [base]);
  async function perform(body: any) {
    if (disabled || inFlight.current || accessDenied) return;
    const current = generation.current;
    const wasUnconfirmed = !!pendingRef.current;
    body = pendingRef.current || body;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await save(
        base,
        "POST",
        body,
        "Support case recorded inside Mera. No external message was sent.",
      );
      if (!active.current || current !== generation.current) return;
      pendingRef.current = null;
      setPending(null);
      form.current?.reset();
      await load();
    } catch (e) {
      if (!active.current || current !== generation.current) return;
      if (
        wasUnconfirmed ||
        !(e instanceof WorkspaceError) ||
        !e.status ||
        e.status >= 500
      ) {
        pendingRef.current = body;
        setPending(body);
      } else {
        pendingRef.current = null;
        setPending(null);
      }
      if ([401, 403, 404].includes((e as any).status)) {
        readGeneration.current++;
        setLoading(false);
        setAccessDenied(true);
        setCases([]);
      }
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (active.current && current === generation.current) setBusy(false);
    }
  }
  return (
    <section className="mw-card mw-support-cases">
      <header className="mw-support-heading">
        <div>
          <h2>Contact Mera support</h2>
          <p>
            Read replies and send support requests for your organization.
            Messages and replies stay in this app.
          </p>
        </div>
        <Action
          pending={loading}
          disabled={busy || accessDenied}
          onClick={() => void load()}
        >
          Refresh support cases
        </Action>
      </header>
      {error && <p role="alert">{error}</p>}
      {pending && !accessDenied && (
        <>
          <p role="status">
            This support request has not been confirmed. Its original details
            are locked; retry sends the same request. Keep this page open until
            it is checked. Leaving or reloading this page loses the direct retry
            details; ask staff to check your cases before creating another.
          </p>
          <Disclosure summary="Original support request">
            <p>
              <strong>{pending.subject}</strong>
            </p>
            <p>{pending.message}</p>
            <p>
              {pending.branchId
                ? branches.find((branch) => branch.id === pending.branchId)
                    ?.name || "Previously selected branch"
                : "Organization-wide request"}
            </p>
          </Disclosure>
          <button
            disabled={disabled || busy}
            onClick={() => void perform(pending)}
          >
            Retry original support case
          </button>
        </>
      )}
      {accessDenied && (
        <ReadState
          kind="error"
          title="Organization access needs checking. Refresh your workspace or sign in again before sending another support request."
        />
      )}
      {loading && <ReadState kind="loading" title="Loading support cases…" />}
      {readError && <ReadState kind="error" title={readError} />}
      <h3>Your organization’s cases</h3>
      {!loading && !readError && !accessDenied && !cases.length && (
        <ReadState kind="empty" title="No support cases yet." />
      )}
      {!accessDenied &&
        cases.map((item) => (
          <article key={item.id}>
            <h4>
              {item.reference} · {item.subject}
            </h4>
            <p>
              {String(item.topic || "Support").replaceAll("_", " ")} ·{" "}
              {supportStatus(item.status)}
            </p>
            <Disclosure summary="View request and replies">
              <p>{item.message}</p>
              {item.customerReply && <p>Mera reply: {item.customerReply}</p>}
              <p>In-app case only; external delivery unavailable.</p>
              {item.history?.length > 0 && (
                <Disclosure summary="Case history">
                  {item.history.map((entry: any, index: number) => (
                    <p key={index}>
                      {supportStatus(entry.status)} · {supportTime(entry.at)}
                      {entry.customerReply ? " · " + entry.customerReply : ""}
                    </p>
                  ))}
                </Disclosure>
              )}
            </Disclosure>
          </article>
        ))}
      {!accessDenied && (
        <Disclosure summary="New support request" className="mw-support-create">
          {" "}
          <form
            ref={form}
            key={organizationId}
            onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget),
                branchId = String(values.get("branchId") || "");
              void perform(
                pending || {
                  requestKey: uuid(),
                  subject: String(values.get("subject")),
                  topic: String(values.get("topic")),
                  message: String(values.get("message")),
                  ...(branchId ? { branchId } : {}),
                },
              );
            }}
          >
            <fieldset
              disabled={disabled || busy || !!pending}
              style={{ border: 0, padding: 0 }}
            >
              <label>
                Support subject
                <input name="subject" required minLength={3} maxLength={140} />
              </label>
              <label>
                Support topic
                <select name="topic">
                  <option value="operations">Operations</option>
                  <option value="billing">Billing</option>
                  <option value="integration">Integration</option>
                  <option value="account">Account</option>
                </select>
              </label>
              <label>
                Related branch
                <select name="branchId">
                  <option value="">Organization-wide question</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Support message
                <textarea name="message" required maxLength={4000} />
              </label>
              <Action type="submit" variant="primary">
                Create support case
              </Action>
            </fieldset>
          </form>
        </Disclosure>
      )}
    </section>
  );
}
