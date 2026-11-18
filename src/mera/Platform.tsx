import { useEffect, useState } from "react";
import { workspaceApi, formatMoney, WorkspaceError } from "./workspace/api";

export default function Platform() {
  const [data, setData] = useState<any>(null),
    [auth, setAuth] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [code, setCode] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<any>(null),
    [status, setStatus] = useState("trialing"),
    [reason, setReason] = useState(""),
    [support, setSupport] = useState<any>(null),
    [pendingChange, setPendingChange] = useState<any>(null);
  async function load() {
    setError("");
    setBusy(true);
    try {
      const current = await workspaceApi("/platform/auth");
      setAuth(current);
      if (current.verified) setData(await workspaceApi("/platform"));
      else setData(null);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await workspaceApi("/platform/auth/verify", "POST", { code });
      setCode("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function changeSubscription(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const intent = pendingChange || {
      organizationId: selected.id,
      status,
      reason,
      requestKey: crypto.randomUUID(),
    };
    setPendingChange(intent);
    try {
      await workspaceApi(
        "/platform/organizations/" + intent.organizationId + "/subscription",
        "PATCH",
        {
          status: intent.status,
          reason: intent.reason,
          requestKey: intent.requestKey,
        },
      );
      setPendingChange(null);
      setSelected(null);
      setReason("");
      await load();
    } catch (e) {
      if (
        e instanceof WorkspaceError &&
        [400, 401, 403, 404, 422].includes(e.status)
      )
        setPendingChange(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function supportView() {
    setBusy(true);
    setError("");
    try {
      setSupport(
        await workspaceApi(
          "/platform/organizations/" + selected.id + "/support-access",
          "POST",
          { reason },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const organizations = (data?.organizations || []).filter((o: any) =>
    (o.name + " " + o.slug).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <main
      className="mera-workspace mera-platform"
      style={{ maxWidth: 1200, margin: "32px auto", padding: 24 }}
    >
      <a href="/mera">mera. / platform</a>
      <header className="mera-page-heading" style={{ margin: "28px 0" }}>
        <div>
          <p className="eyebrow">Restricted operations</p>
          <h1>Platform administration</h1>
          <p>
            Organization access, service status and configuration support.
            Merchant collections remain separate from platform revenue.
          </p>
        </div>
        <button className="secondary" onClick={load} disabled={busy}>
          {busy ? "Checking…" : "Refresh access"}
        </button>
      </header>
      {error && (
        <div role="alert" className="info-box">
          {error} <a href="/mera/workspace">Organization sign-in</a>
        </div>
      )}
      {!auth && !error && <p role="status">Verifying operator access…</p>}
      {auth && !auth.verified && (
        <section className="mera-panel" style={{ maxWidth: 560, padding: 24 }}>
          <h2>Verify your authenticator</h2>
          <p>
            Access is bound to this sign-in session and expires after ten
            minutes. Each code can be used once.
          </p>
          {auth.enrolled ? (
            <form onSubmit={verify}>
              <label>
                Six-digit code
                <input
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  required
                />
              </label>
              <button disabled={busy || code.length !== 6}>
                Verify access
              </button>
            </form>
          ) : (
            <p role="status">
              An authorized operator must provision your authenticator before
              access is available. Public enrollment is disabled.
            </p>
          )}
        </section>
      )}
      {data && (
        <>
          <section
            className="mera-stat-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
              gap: 16,
              margin: "24px 0",
            }}
          >
            {[
              ["Organizations", data.organizations.length],
              [
                "Proposed monthly base",
                data.policy?.monthlyPrice == null ? "Unresolved" : formatMoney(data.policy.monthlyPrice),
              ],
              ["Live collections", "Disabled"],
              ["Support access", "Configuration only"],
            ].map(([label, value]) => (
              <article
                className="mera-panel"
                style={{ padding: 20 }}
                key={label}
              >
                <p>{label}</p>
                <strong style={{ fontSize: 24 }}>{value}</strong>
              </article>
            ))}
          </section>
          <section className="mera-panel" style={{ padding: 24 }}>
            <h2>Organization directory</h2>
            <label>
              Find an organization
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or subdomain"
              />
            </label>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Subdomain</th>
                    <th>Subscription</th>
                    <th>Operations</th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((org: any) => (
                    <tr key={org.id}>
                      <td>{org.name}</td>
                      <td>{org.slug}</td>
                      <td>
                        {(
                          org.subscription?.status || "Not activated"
                        ).replaceAll("_", " ")}
                      </td>
                      <td>
                        <button
                          className="secondary"
                          disabled={!!pendingChange}
                          onClick={() => {
                            setSelected(org);
                            setStatus(org.subscription?.status || "trialing");
                            setReason("");
                            setSupport(null);
                          }}
                        >
                          Review organization
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!organizations.length && (
              <p>No organizations match your search.</p>
            )}
          </section>
          {selected && (
            <section
              className="mera-panel"
              style={{ padding: 24, marginTop: 20 }}
              aria-label="Organization operations"
            >
              <h2>{selected.name}</h2>
              <form onSubmit={changeSubscription}>
                <label>
                  Service status
                  <select
                    value={status}
                    disabled={!!pendingChange}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {[
                      "trialing",
                      "active",
                      "past_due",
                      "suspended",
                      "cancelled",
                    ].map((s) => (
                      <option key={s} value={s}>
                        {s.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Reason for this action
                  <textarea
                    value={reason}
                    disabled={!!pendingChange}
                    onChange={(e) => setReason(e.target.value)}
                    minLength={10}
                    maxLength={500}
                    required
                  />
                </label>
                <p>
                  Changes are audited. This does not charge an account, verify
                  provider readiness or change an agreed price. Paid active
                  orders remain accessible.
                </p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button disabled={busy || reason.trim().length < 10}>
                    {pendingChange
                      ? "Retry original status change"
                      : "Save service status"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || reason.trim().length < 10}
                    onClick={supportView}
                  >
                    Open audited configuration support
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!!pendingChange}
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </button>
                </div>
              </form>
              {support && (
                <p role="status">
                  Configuration opened for {support.organization.name}.
                  Onboarding status:{" "}
                  {support.organization.onboarding?.status || "In progress"}.
                  Customer records and impersonation are excluded.
                </p>
              )}
            </section>
          )}
          <section
            className="mera-panel"
            style={{ padding: 24, marginTop: 20 }}
          >
            <h2>Provider readiness</h2>
            <p>
              Production collections, settlements, withdrawals, email delivery
              and the live Zidi connection require verified provider access. No
              funds can move through these controls.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {(data.blockedCapabilities || []).map((cap: string) => (
                <span className="status-pill" key={cap}>
                  {cap.replaceAll("_", " ")} · blocked
                </span>
              ))}
            </div>
          </section>
          <section
            className="mera-panel"
            style={{ padding: 24, marginTop: 20 }}
          >
            <h2>Operator audit</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Organization</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.audits || []).map((event: any) => (
                    <tr key={event.id}>
                      <td>{new Date(event.created_at).toLocaleString()}</td>
                      <td>{event.action.replaceAll("_", " ")}</td>
                      <td>
                        {data.organizations.find(
                          (o: any) => o.id === event.organization_id,
                        )?.name || "Platform"}
                      </td>
                      <td>{event.details?.reason || "Session verification"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.audits?.length && <p>No operator activity recorded.</p>}
          </section>
        </>
      )}
    </main>
  );
}
