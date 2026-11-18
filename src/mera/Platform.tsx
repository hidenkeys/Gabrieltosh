import { useEffect, useState, useRef } from "react";
import { workspaceApi, formatMoney, WorkspaceError } from "./workspace/api";

export default function Platform() {
  const accessEpoch = useRef(0);
  const principal = useRef<string | null>(null);
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
    [pendingChange, setPendingChange] = useState<any>(null),
    [reference, setReference] = useState(""),
    [lookup, setLookup] = useState<any>(null),
    [backupReason, setBackupReason] = useState(""),
    [newSlug, setNewSlug] = useState(""),
    [dates, setDates] = useState<Record<string, string>>({
      trialEndsAt: "",
      paidThrough: "",
      dueAt: "",
    }),
    [featureDraft, setFeatureDraft] = useState<Record<string, boolean>>({}),
    [supportCases, setSupportCases] = useState<any[]>([]),
    [caseDrafts, setCaseDrafts] = useState<Record<string, any>>({}),
    [caseError, setCaseError] = useState("");
  async function loadCases(epoch = accessEpoch.current) {
    try {
      const result = await workspaceApi("/platform/support-cases");
      if (epoch !== accessEpoch.current) return;
      setSupportCases(result.cases || []);
      setCaseError("");
    } catch (e) {
      if (epoch !== accessEpoch.current) return;
      setCaseError((e as Error).message);
    }
  }
  async function load() {
    let epoch = accessEpoch.current;
    setError("");
    setBusy(true);
    try {
      const current = await workspaceApi("/platform/auth");
      if (epoch !== accessEpoch.current) return;
      if (
        current.userId &&
        principal.current &&
        principal.current !== current.userId
      ) {
        epoch = ++accessEpoch.current;
        setData(null);
        setSelected(null);
        setPendingChange(null);
        setLookup(null);
        setSupport(null);
        setSupportCases([]);
        setCaseDrafts({});
        setReason("");
      }
      if (current.userId) principal.current = current.userId;
      setAuth(current);
      if (current.verified) {
        const next = await workspaceApi("/platform");
        if (epoch !== accessEpoch.current) return;
        setData(next);
        await loadCases(epoch);
      } else {
        setData(null);
        setSupportCases([]);
        setCaseDrafts({});
      }
    } catch (e) {
      if (epoch !== accessEpoch.current) return;
      setError((e as Error).message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const denied = () => {
      accessEpoch.current++;
      setBusy(false);
      setError("Your access changed. Verify your session again.");
      setData(null);
      setAuth(null);
      setSupportCases([]);
      setCaseDrafts({});
      setSelected(null);
      setSupport(null);
      setLookup(null);
    };
    window.addEventListener("mera:access-denied", denied);
    return () => window.removeEventListener("mera:access-denied", denied);
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
      ...Object.fromEntries(
        Object.entries(dates).map(([key, value]) => [
          key,
          value ? value + ":00.000Z" : null,
        ]),
      ),
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
          trialEndsAt: intent.trialEndsAt,
          paidThrough: intent.paidThrough,
          dueAt: intent.dueAt,
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
    const epoch = accessEpoch.current;
    setBusy(true);
    setError("");
    try {
      const result = await workspaceApi(
        "/platform/organizations/" + selected.id + "/support-access",
        "POST",
        { reason },
      );
      if (epoch === accessEpoch.current) setSupport(result);
    } catch (e) {
      if (epoch === accessEpoch.current) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function lookupReference() {
    const epoch = accessEpoch.current;
    setBusy(true);
    setError("");
    setLookup(null);
    try {
      const result = await workspaceApi(
        "/platform/organizations/" + selected.id + "/lookup",
        "POST",
        { reference, reason },
      );
      if (epoch === accessEpoch.current) setLookup(result);
    } catch (e) {
      if (epoch === accessEpoch.current) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function approvePolicy() {
    setBusy(true);
    setError("");
    try {
      await workspaceApi(
        "/platform/organizations/" + selected.id + "/policy-approval",
        "POST",
        { version: selected.policy.version, reason },
      );
      setSelected(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function retryBackup(id: string) {
    setBusy(true);
    setError("");
    try {
      await workspaceApi("/platform/backups/" + id + "/retry-upload", "POST", {
        reason: backupReason,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveFeatures() {
    setBusy(true);
    setError("");
    try {
      await workspaceApi(
        "/platform/organizations/" + selected.id + "/feature-flags",
        "PATCH",
        {
          version: selected.features?.version || 1,
          flags: featureDraft,
          reason,
        },
      );
      setSelected(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function renameOrganization(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await workspaceApi(
        "/platform/organizations/" + selected.id + "/rename",
        "POST",
        {
          expectedSlug: selected.slug,
          newSlug,
          reason,
        },
      );
      setSelected(null);
      setNewSlug("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function editCase(row: any, key: string, value: string) {
    setCaseDrafts((current) => ({
      ...current,
      [row.id]: {
        version: row.version,
        status: row.status === "open" ? "acknowledged" : row.status,
        customerReply: row.customerReply || "",
        internalNote: "",
        ...current[row.id],
        [key]: value,
      },
    }));
  }
  async function saveCase(row: any) {
    const draft = caseDrafts[row.id] || {
      version: row.version,
      status: row.status === "open" ? "acknowledged" : row.status,
      customerReply: row.customerReply || "",
      internalNote: "",
    };
    setBusy(true);
    setCaseError("");
    try {
      await workspaceApi("/platform/support-cases/" + row.id, "PATCH", draft);
      setCaseDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      await loadCases();
    } catch (e) {
      setCaseError((e as Error).message);
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
                data.policy?.monthlyPrice == null
                  ? "Unresolved"
                  : formatMoney(data.policy.monthlyPrice),
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
          {data.operationalSignals && (
            <section
              className="mera-panel"
              style={{ padding: 24, marginBottom: 20 }}
              aria-label="Operational signals"
            >
              <h2>Operational signals</h2>
              <p>
                Orders waiting over 15 minutes:{" "}
                <strong>
                  {data.operationalSignals.ordersOlderThan15Minutes}
                </strong>
                . Review these with the organization; elapsed time alone does
                not establish a service failure.
              </p>
              <p>
                Export jobs:{" "}
                {(data.operationalSignals.jobs || [])
                  .map((j: any) => `${j.status}: ${j.count}`)
                  .join(" · ") || "No jobs recorded"}
                .
              </p>
              <p>
                Invoices:{" "}
                {(data.operationalSignals.invoices || [])
                  .map((i: any) => `${i.status}: ${i.count}`)
                  .join(" · ") || "No invoices recorded"}
                . Draft invoices are not collected revenue.
              </p>
              <p>
                Database snapshot at{" "}
                {new Date(data.operationalSignals.observedAt).toLocaleString()}.
                External alerts require hosting configuration.
              </p>
            </section>
          )}
          <section
            className="mera-panel"
            style={{ padding: 24, marginBottom: 20 }}
          >
            <h2>Organization support</h2>
            <p>
              Replies appear in the organization's support inbox. Operator notes
              stay private; external message delivery is not configured.
            </p>
            {caseError && <p role="alert">{caseError}</p>}
            {!supportCases.length && <p>No support cases recorded.</p>}
            {supportCases.map((row) => {
              const draft = caseDrafts[row.id] || row;
              return (
                <details
                  key={row.id}
                  style={{
                    padding: "16px 0",
                    borderBottom: "1px solid #e4dfd4",
                  }}
                >
                  <summary>
                    {row.reference} ·{" "}
                    {data.organizations.find(
                      (o: any) => o.id === row.organizationId,
                    )?.name || "Organization"}{" "}
                    · {row.subject} · {row.status.replaceAll("_", " ")}
                  </summary>
                  <p style={{ whiteSpace: "pre-wrap" }}>{row.message}</p>
                  <label>
                    Status
                    <select
                      value={
                        draft.status === "open" ? "acknowledged" : draft.status
                      }
                      disabled={busy}
                      onChange={(e) => editCase(row, "status", e.target.value)}
                    >
                      <option value="acknowledged">Acknowledged</option>
                      <option value="in_progress">In progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </label>
                  <label>
                    Reply visible to the organization
                    <textarea
                      value={draft.customerReply || ""}
                      maxLength={4000}
                      disabled={busy}
                      onChange={(e) =>
                        editCase(row, "customerReply", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Private operator note
                    <textarea
                      value={caseDrafts[row.id]?.internalNote || ""}
                      maxLength={4000}
                      disabled={busy}
                      onChange={(e) =>
                        editCase(row, "internalNote", e.target.value)
                      }
                    />
                  </label>
                  {!!row.internalNotes?.length && (
                    <div>
                      <strong>Private notes</strong>
                      {row.internalNotes.map((n: any, i: number) => (
                        <p key={i}>
                          {new Date(n.at).toLocaleString()} · {n.text}
                        </p>
                      ))}
                    </div>
                  )}
                  <button
                    className="secondary"
                    disabled={
                      busy ||
                      (draft.status === "resolved" &&
                        !draft.customerReply?.trim())
                    }
                    onClick={() => saveCase(row)}
                  >
                    Save support response
                  </button>
                </details>
              );
            })}
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
                    <th>Branches</th>
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
                      <td>{org.branches?.length ?? "—"}</td>
                      <td>
                        <button
                          className="secondary"
                          disabled={busy || !!pendingChange}
                          onClick={() => {
                            setSelected(org);
                            setFeatureDraft(
                              Object.fromEntries(
                                [
                                  "customer_ordering",
                                  "new_reservations",
                                  "new_table_visits",
                                  "zidi",
                                ].map((key) => [
                                  key,
                                  org.features?.flags?.[key] !== false,
                                ]),
                              ),
                            );
                            setStatus(org.subscription?.status || "trialing");
                            setReason("");
                            setSupport(null);
                            setLookup(null);
                            setReference("");
                            setDates(
                              Object.fromEntries(
                                ["trialEndsAt", "paidThrough", "dueAt"].map(
                                  (key) => [
                                    key,
                                    org.subscription?.[key]?.slice(0, 16) || "",
                                  ],
                                ),
                              ),
                            );
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
              <form onSubmit={renameOrganization} style={{ marginBottom: 24 }}>
                <h3>Organization address</h3>
                <p>
                  Current address: {selected.slug}. Previous addresses stay
                  reserved for this organization, and existing QR codes keep
                  working. DNS and certificates require separate setup.
                </p>
                <label>
                  New organization address
                  <input
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
                    pattern="[a-z][a-z0-9]*(-[a-z0-9]+)*"
                    minLength={3}
                    maxLength={50}
                    required
                    disabled={busy || !!pendingChange}
                  />
                </label>
                <p>Use the action reason below before saving.</p>
                <button
                  disabled={
                    busy ||
                    !!pendingChange ||
                    reason.trim().length < 10 ||
                    newSlug === selected.slug
                  }
                >
                  Save organization address
                </button>
              </form>
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
                {[
                  ["trialEndsAt", "Trial ends (UTC)"],
                  ["paidThrough", "Paid through (UTC)"],
                  ["dueAt", "Payment due (UTC)"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="datetime-local"
                      value={dates[key]}
                      disabled={!!pendingChange}
                      onChange={(e) =>
                        setDates({ ...dates, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <p>
                  Blank dates stay unresolved. A production trial needs an
                  explicit end date; grace periods require approved policy.
                  Manual activation does not collect a payment.
                </p>
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
              <section style={{ marginTop: 24 }}>
                <h3>Service controls</h3>
                <p>
                  These controls apply to new requests. Accepted requests,
                  existing service and permitted exports can continue. Provider
                  approval and billing remain separate.
                </p>
                {[
                  ["customer_ordering", "New customer orders"],
                  ["new_reservations", "New reservations"],
                  ["new_table_visits", "New walk-in visits"],
                  ["zidi", "New Zidi requests"],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <input
                      style={{ width: "auto" }}
                      type="checkbox"
                      checked={featureDraft[key] !== false}
                      disabled={busy || !!pendingChange}
                      onChange={(e) =>
                        setFeatureDraft({
                          ...featureDraft,
                          [key]: e.target.checked,
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
                <button
                  type="button"
                  className="secondary"
                  disabled={
                    busy || !!pendingChange || reason.trim().length < 10
                  }
                  onClick={saveFeatures}
                >
                  Save reviewed service controls
                </button>
              </section>
              <h3 style={{ marginTop: 24 }}>Reference lookup</h3>
              <p>
                Enter an exact order, payment or invoice reference. Results
                exclude customer names and contact details; every lookup records
                the reason above.
              </p>
              <label>
                Record reference
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={120}
                />
              </label>
              <button
                className="secondary"
                type="button"
                disabled={
                  busy ||
                  !!pendingChange ||
                  reason.trim().length < 10 ||
                  reference.trim().length < 3
                }
                onClick={lookupReference}
              >
                Look up reference
              </button>
              {lookup && (
                <div role="status">
                  {!lookup.records.length ? (
                    <p>No matching reference in this organization.</p>
                  ) : (
                    lookup.records.map((r: any) => (
                      <p key={r.id}>
                        {r.kind} · {r.reference} · {formatMoney(r.amount)} ·{" "}
                        {r.status}. Provider and settlement: unverified.
                      </p>
                    ))
                  )}
                </div>
              )}
              {!!selected.branches?.length && (
                <div>
                  <h3 style={{ marginTop: 24 }}>Branch configuration</h3>
                  {selected.branches.map((b: any) => (
                    <p key={b.id}>
                      {b.name} · {b.timezone} · {b.launch_state || "draft"} ·{" "}
                      {b.contact || "No published contact"}
                    </p>
                  ))}
                </div>
              )}
              {selected.policy && (
                <section style={{ marginTop: 24 }}>
                  <h3>Commercial policy review</h3>
                  <p>
                    Current state: {selected.policy.status || "proposed"}. Live
                    billing remains disabled.
                  </p>
                  <dl>
                    {[
                      ["monthlyPrice", "Monthly price"],
                      ["includedBranches", "Included branches"],
                      ["additionalBranchPrice", "Additional branch price"],
                      ["integratedFeeBps", "Integrated fee (basis points)"],
                      ["feePayer", "Fee payer"],
                      ["feeBasis", "Fee basis"],
                      ["refundTreatment", "Refund treatment"],
                      ["trialDays", "Trial days"],
                      ["graceDays", "Grace days"],
                    ].map(([field, label]) => (
                      <div key={field}>
                        <dt>{label}</dt>
                        <dd>
                          {selected.policy[field] == null
                            ? "Unresolved"
                            : field.toLowerCase().includes("price")
                              ? formatMoney(selected.policy[field])
                              : String(selected.policy[field]).replaceAll(
                                  "_",
                                  " ",
                                )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p>
                    Review the proposal in organization billing. Approval
                    requires resolved commercial choices and records your reason
                    above; it does not activate collections or recurring debit.
                  </p>
                  <button
                    className="secondary"
                    type="button"
                    disabled={
                      busy ||
                      !!pendingChange ||
                      reason.trim().length < 10 ||
                      selected.policy.status === "approved"
                    }
                    onClick={approvePolicy}
                  >
                    Approve reviewed commercial policy
                  </button>
                </section>
              )}
            </section>
          )}
          <section
            className="mera-panel"
            style={{ padding: 24, marginTop: 20 }}
          >
            <h2>Backup readiness</h2>
            <p>
              {data.backupConfiguration?.enabled
                ? "Encrypted snapshots are scheduled. Check transfer status and run restore exercises regularly."
                : "Backups are not enabled in this environment. Configure the schedule, retention and encryption key before enabling them."}
            </p>
            {!!data.backups?.length ? (
              <>
                <label>
                  Reason for retrying a failed transfer
                  <input
                    value={backupReason}
                    onChange={(e) => setBackupReason(e.target.value)}
                    maxLength={500}
                  />
                </label>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Snapshot time</th>
                        <th>Snapshot</th>
                        <th>Cloud transfer</th>
                        <th>Encryption</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.backups.map((backup: any) => (
                        <tr key={backup.id}>
                          <td>
                            {new Date(backup.created_at).toLocaleString()}
                          </td>
                          <td>{backup.status}</td>
                          <td>{backup.cloud_status}</td>
                          <td>
                            {backup.encrypted
                              ? "Encrypted"
                              : backup.status === "pruned"
                                ? "Removed by retention policy"
                                : "Not confirmed"}
                          </td>
                          <td>
                            {backup.cloud_status === "failed" && (
                              <button
                                className="secondary"
                                disabled={
                                  busy ||
                                  !data.backupConfiguration?.enabled ||
                                  backupReason.trim().length < 10
                                }
                                onClick={() => retryBackup(backup.id)}
                              >
                                Retry upload
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p>No backup runs recorded.</p>
            )}
          </section>
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
