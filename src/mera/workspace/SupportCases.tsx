import { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { workspaceApi, WorkspaceError } from "./api";
export default function SupportCases({
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
    [pending, setPending] = useState<any>(null);
  const generation = useRef(0),
    form = useRef<HTMLFormElement>(null);
  async function load() {
    const current = generation.current;
    try {
      const result = await workspaceApi<any>(base);
      if (current === generation.current) {
        setCases(result.cases);
        setError("");
      }
    } catch (e) {
      if (current !== generation.current) return;
      setCases([]);
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    setCases([]);
    setPending(null);
    setBusy(false);
    setError("");
    void load();
    return () => {
      generation.current++;
    };
  }, [base]);
  async function perform(body: any) {
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      await save(
        base,
        "POST",
        body,
        "Support case recorded inside Mera. No external message was sent.",
      );
      if (current !== generation.current) return;
      setPending(null);
      form.current?.reset();
      await load();
    } catch (e) {
      if (current !== generation.current) return;
      if (!(e instanceof WorkspaceError) || !e.status || e.status >= 500)
        setPending(body);
      else setPending(null);
      setError((e as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <section className="mw-card">
      <h2>Contact Mera support</h2>
      <p>
        Create an in-app support case for your organization. No email, SMS or
        push notification is sent.
      </p>
      {error && <p role="alert">{error}</p>}
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
          <button>Create support case</button>
        </fieldset>
      </form>
      {pending && (
        <>
          <p role="status">
            The case creation outcome is unknown. Its original request key and
            details are preserved. Retry the same request to avoid creating a
            duplicate.
          </p>
          <button
            disabled={disabled || busy}
            onClick={() => void perform(pending)}
          >
            Retry original support case
          </button>
        </>
      )}
      <button disabled={disabled || busy} onClick={() => void load()}>
        Refresh support cases
      </button>
      <h3>Your organization’s cases</h3>
      {!cases.length ? (
        <p>No support cases shown for this organization.</p>
      ) : (
        cases.map((item) => (
          <article key={item.id}>
            <h4>
              {item.reference} · {item.subject}
            </h4>
            <p>
              {item.topic} · Status: {item.status}
            </p>
            <p>{item.message}</p>
            {item.customerReply && <p>Mera reply: {item.customerReply}</p>}
            <p>In-app case only; external delivery unavailable.</p>
            {item.history?.length > 0 && (
              <details>
                <summary>Case history</summary>
                {item.history.map((entry: any, index: number) => (
                  <p key={index}>
                    {entry.status} · {new Date(entry.at).toLocaleString()}
                    {entry.customerReply ? " · " + entry.customerReply : ""}
                  </p>
                ))}
              </details>
            )}
          </article>
        ))
      )}
    </section>
  );
}
