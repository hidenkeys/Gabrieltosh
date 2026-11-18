import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  RefreshCw,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { uuid } from "../../api";
import BranchSettings from "./BranchSettings";
import StaffOrderItems from "./StaffOrderItems";
import PolicyEditor from "./PolicyEditor";
import Bills from "./Bills";
import ReservationSettlement from "./ReservationSettlement";
import TableEditor from "./TableEditor";
import PrintStudio from "./PrintStudio";
import DepositPolicy from "./DepositPolicy";
import QrCodes from "./QrCodes";
import Integrations from "./Integrations";
import { Complaints, Waitlist } from "./Operations";
import ExportJobs from "./ExportJobs";
import Invoices from "./Invoices";
import ReportDetails from "./ReportDetails";
import { workspaceApi, formatMoney, WorkspaceError } from "./api";

type RecordData = Record<string, any>;
type Props = { user: any; notify: (message: string) => void };
const nextState: Record<string, string> = {
  submitted: "accepted",
  accepted: "preparing",
  preparing: "ready",
  ready: "collected",
  collected: "completed",
};
const sections = [
  ["overview", "Your branch", "reports.view"],
  ["onboarding", "Getting started", "organization.manage"],
  ["menu", "Menu & stock", "menu.edit"],
  ["orders", "Orders", "orders.view"],
  ["preparation", "Preparation", "orders.prepare"],
  ["tables", "Tables & visits", "tables.manage"],
  ["reservations", "Reservations", "reservations.manage"],
  ["payments", "Transactions", "payments.record"],
  ["shifts", "Shifts & cash", "shifts.manage"],
  ["team", "People", "members.manage"],
  ["billing", "Subscription", "billing.manage"],
  ["printing", "Receipt studio", "menu.edit"],
  ["qr", "Menu QR codes", "qr.manage"],
  ["integrations", "Integrations", "organization.manage"],
  ["care", "Customer care", "organization.manage"],
  ["waitlist", "Front desk", "reservations.manage"],
  ["exports", "Report exports", "reports.export"],
];
const sourceLabel = (value: string) => value?.replaceAll("_", " ") || "—";
const list = (value: any) => (Array.isArray(value) ? value : []);
const dateLabel = (value: any) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

export default function OrganizationWorkspace({ user, notify }: Props) {
  const [context, setContext] = useState<RecordData | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [section, setSection] = useState("overview");
  const [data, setData] = useState<RecordData | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [orderFilters, setOrderFilters] = useState({
    query: "",
    status: "",
    source: "",
    payment: "",
    unassigned: false,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [productEdit, setProductEdit] = useState<RecordData | null>(null);
  const [orderDraft, setOrderDraft] = useState<RecordData>({
    displayName: "",
    fulfillment: "counter_pickup",
    items: [],
    note: "",
  });
  const requestKey = useRef<string | null>(null);
  const [uncertainOrder, setUncertainOrder] = useState<RecordData | null>(null);
  const pendingRequests = useRef(new Map<string, string>());
  const uncertainOrders = useRef(new Map<string, RecordData>());
  const [tabForm, setTabForm] = useState<RecordData>({});
  const organizations = list(context?.organizations);
  const organization = organizations.find(
    (row: any) => row.id === organizationId,
  );
  const permissions = list(organization?.permissions);
  const allowed = (permission: string) => permissions.includes(permission);
  const branches = list(organization?.branches).filter(
    (branch: any) =>
      !organization?.branchIds?.length ||
      organization.branchIds.includes(branch.id),
  );
  const activeScope = useRef("");
  const contextGeneration = useRef(0);
  const mutationGeneration = useRef(0);
  const branchBase = `/organizations/${encodeURIComponent(organizationId)}/branches/${encodeURIComponent(branchId)}`;
  const scopeEpoch = useRef({ path: "", generation: 0 });
  if (scopeEpoch.current.path !== branchBase)
    scopeEpoch.current = {
      path: branchBase,
      generation: scopeEpoch.current.generation + 1,
    };
  const scopeVersion = scopeEpoch.current.generation;
  activeScope.current = branchBase;

  const loadContext = useCallback(async () => {
    const generation = ++contextGeneration.current;
    setLoading(true);
    setError("");
    try {
      const result = await workspaceApi("/context");
      if (generation !== contextGeneration.current) return;
      setContext(result);
      setOffline(false);
      setOrganizationId((current) =>
        result.organizations?.some((org: any) => org.id === current)
          ? current
          : result.organizations?.[0]?.id || "",
      );
    } catch (e) {
      if (generation !== contextGeneration.current) return;
      setError((e as Error).message);
      setOffline(true);
    } finally {
      if (generation === contextGeneration.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadContext();
  }, [loadContext]);
  useEffect(() => {
    setData(null);
    setMembers([]);
    setTabForm({});
    setOrderDraft({
      displayName: "",
      fulfillment: "counter_pickup",
      items: [],
      note: "",
    });
    requestKey.current = null;
    setBranchId((current) =>
      branches.some((branch: any) => branch.id === current)
        ? current
        : branches[0]?.id || "",
    );
  }, [organizationId]);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!organizationId || !branchId) return;
      try {
        const response = await workspaceApi(
          branchBase + "/workspace",
          "GET",
          undefined,
          signal,
        );
        if (
          signal?.aborted ||
          activeScope.current !== branchBase ||
          scopeEpoch.current.generation !== scopeVersion
        )
          return;
        setData(response);
        setOffline(false);
        setError("");
      } catch (e) {
        if (
          (e as Error).name !== "AbortError" &&
          activeScope.current === branchBase &&
          scopeEpoch.current.generation === scopeVersion
        ) {
          setError((e as Error).message);
          setOffline(true);
        }
      }
    },
    [organizationId, branchId, branchBase, scopeVersion],
  );
  useEffect(() => {
    setData(null);
    setTabForm({});
    setProductEdit(null);
    setOrderFilters({
      query: "",
      status: "",
      source: "",
      payment: "",
      unassigned: false,
    });
    setMembers([]);
    setBusy(false);
    setOrderDraft({
      displayName: "",
      fulfillment: "counter_pickup",
      items: [],
      note: "",
    });
    requestKey.current = null;
    const unresolved = uncertainOrders.current.get(branchBase);
    setUncertainOrder(unresolved || null);
    if (unresolved) {
      setOrderDraft(unresolved);
      requestKey.current = unresolved.requestKey;
    }
    const controller = new AbortController();
    void refresh(controller.signal);
    const interval = setInterval(() => {
      if (!document.hidden) void refresh(controller.signal);
    }, 2500);
    const reconnect = () => void refresh(controller.signal);
    window.addEventListener("online", reconnect);
    return () => {
      controller.abort();
      clearInterval(interval);
      window.removeEventListener("online", reconnect);
    };
  }, [refresh]);
  useEffect(() => {
    setTabForm({});
    if (section === "team" && organizationId && allowed("members.manage")) {
      const requestedScope = branchBase;
      const controller = new AbortController();
      workspaceApi(
        `/organizations/${organizationId}/members`,
        "GET",
        undefined,
        controller.signal,
      )
        .then((rows) => {
          if (
            !controller.signal.aborted &&
            activeScope.current === requestedScope &&
            scopeEpoch.current.generation === scopeVersion
          )
            setMembers(list(rows.members ?? rows));
        })
        .catch((e) => {
          if (
            e.name !== "AbortError" &&
            activeScope.current === requestedScope &&
            scopeEpoch.current.generation === scopeVersion
          )
            setError(e.message);
        });
      return () => controller.abort();
    }
  }, [section, organizationId, branchBase]);
  const mutate = async (
    path: string,
    method: string,
    body: any,
    success: string,
  ) => {
    const requestedScope = activeScope.current;
    const generation = ++mutationGeneration.current;
    setBusy(true);
    setError("");
    try {
      const signature = body?.requestKey
        ? path + JSON.stringify({ ...body, requestKey: undefined })
        : null;
      if (signature) {
        const stable =
          pendingRequests.current.get(signature) || body.requestKey;
        pendingRequests.current.set(signature, stable);
        body = { ...body, requestKey: stable };
      }
      const result = await workspaceApi(path, method, body);
      if (signature) pendingRequests.current.delete(signature);
      if (
        activeScope.current !== requestedScope ||
        scopeEpoch.current.generation !== scopeVersion
      )
        throw new DOMException(
          "The workspace changed while the action was running.",
          "AbortError",
        );
      await refresh();
      if (
        activeScope.current !== requestedScope ||
        scopeEpoch.current.generation !== scopeVersion
      )
        throw new DOMException(
          "The workspace changed while the action was running.",
          "AbortError",
        );
      notify(success);
      return result;
    } catch (e) {
      if (
        activeScope.current === requestedScope &&
        scopeEpoch.current.generation === scopeVersion
      )
        setError((e as Error).message);
      throw e;
    } finally {
      if (
        generation === mutationGeneration.current &&
        activeScope.current === requestedScope &&
        scopeEpoch.current.generation === scopeVersion
      )
        setBusy(false);
    }
  };
  const sendStaffOrder = async () => {
    const scope = branchBase;
    requestKey.current ||= uuid();
    const body = uncertainOrder || {
      ...orderDraft,
      menuVersion: data?.menuVersion,
      requestKey: requestKey.current,
    };
    uncertainOrders.current.set(scope, body);
    try {
      await mutate(branchBase + "/orders", "POST", body, "Order submitted.");
      if (
        activeScope.current !== scope ||
        scopeEpoch.current.generation !== scopeVersion
      )
        return;
      uncertainOrders.current.delete(scope);
      setUncertainOrder(null);
      requestKey.current = null;
      setOrderDraft({
        displayName: "",
        fulfillment: "counter_pickup",
        items: [],
        note: "",
      });
    } catch (error) {
      if (
        error instanceof WorkspaceError &&
        (!error.status || error.status >= 500 || error.status === 409)
      ) {
        uncertainOrders.current.set(scope, body);
        if (
          activeScope.current === scope &&
          scopeEpoch.current.generation === scopeVersion
        )
          setUncertainOrder(body);
      } else if ((error as Error).name !== "AbortError")
        uncertainOrders.current.delete(scope);
      throw error;
    }
  };
  const checkStaffOrder = async () => {
    const scope = branchBase;
    const result = await workspaceApi(branchBase + "/workspace");
    if (
      activeScope.current !== scope ||
      scopeEpoch.current.generation !== scopeVersion
    )
      return;
    setData(result);
    if (
      list(result.orders).some(
        (order: any) => order.requestKey === uncertainOrder?.requestKey,
      )
    ) {
      uncertainOrders.current.delete(scope);
      setUncertainOrder(null);
      requestKey.current = null;
      setOrderDraft({
        displayName: "",
        fulfillment: "counter_pickup",
        items: [],
        note: "",
      });
      notify("The original order is confirmed in the order queue.");
    } else
      setError(
        "The original order is not yet visible. Retry the unchanged submission safely; do not create a duplicate.",
      );
  };
  const act = (path: string, body: any, success: string, method = "POST") =>
    void mutate(path, method, body, success).catch(() => {});
  const updateForm = (key: string, value: any) =>
    setTabForm((current) => ({ ...current, [key]: value }));
  const field = (
    label: string,
    key: string,
    type = "text",
    required = true,
  ) => (
    <label>
      {label}
      <input
        type={type}
        required={required}
        value={tabForm[key] ?? ""}
        onChange={(event) => updateForm(key, event.target.value)}
      />
    </label>
  );
  const submit =
    (callback: () => Promise<any> | void) => (event: React.FormEvent) => {
      event.preventDefault();
      const requestedScope = activeScope.current;
      try {
        const result = callback();
        if (result instanceof Promise)
          void result.catch((e) => {
            if (
              activeScope.current === requestedScope &&
              scopeEpoch.current.generation === scopeVersion
            )
              setError((e as Error).message);
          });
      } catch (e) {
        setError((e as Error).message);
      }
    };
  const button = (label: string, action: () => void, permission?: string) =>
    (!permission || allowed(permission)) && (
      <button
        className="secondary"
        type="button"
        disabled={busy || offline}
        onClick={action}
      >
        {label}
      </button>
    );
  const empty = (text: string) => <div className="mw-empty">{text}</div>;
  const visibleSections = sections.filter(([, , permission]) =>
    permission === "qr.manage"
      ? allowed("menu.publish") || allowed("tables.manage")
      : allowed(permission),
  );
  const activeSection = visibleSections.some(([id]) => id === section)
    ? section
    : visibleSections[0]?.[0] || "";
  const orders = list(data?.orders);
  const filteredOrders = orders.filter((order: any) => {
    const query = orderFilters.query.trim().toLowerCase();
    return (
      (!query ||
        [
          order.reference,
          order.id,
          order.displayName,
          order.actorName,
          order.handlerName,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(query),
        )) &&
      (!orderFilters.status || order.status === orderFilters.status) &&
      (!orderFilters.source || order.source === orderFilters.source) &&
      (!orderFilters.payment || order.paymentStatus === orderFilters.payment) &&
      (!orderFilters.unassigned || !order.handlerId)
    );
  });
  const products = list(data?.products);
  const branch =
    data?.branch || branches.find((row: any) => row.id === branchId);

  return (
    <div className="mera-workspace">
      <header className="mw-header">
        <a href="/mera" className="mw-brand" aria-label="Mera home">
          mera<span>.</span>
        </a>
        <div className="mw-context">
          <label>
            Organization
            <select
              value={organizationId}
              disabled={busy}
              onChange={(event) => setOrganizationId(event.target.value)}
            >
              {organizations.map((org: any) => (
                <option value={org.id} key={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Branch
            <select
              value={branchId}
              disabled={busy}
              onChange={(event) => setBranchId(event.target.value)}
            >
              {branches.map((row: any) => (
                <option value={row.id} key={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary"
            onClick={() => {
              void loadContext();
              void refresh();
            }}
            aria-label="Refresh workspace"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>
      <div className="mw-heading">
        <div>
          <div className="mw-eyebrow">
            {organization?.name || "Organization workspace"} /{" "}
            {branch?.name || "Choose a branch"}
          </div>
          <h1>A good service starts here.</h1>
          <p>
            Welcome, {user?.name || "team member"}. Keep every order, handoff
            and collection in view.
          </p>
        </div>
        <span className="mw-pill">{sourceLabel(organization?.role)}</span>
      </div>
      {error && (
        <div className="mw-note mw-error" role="alert">
          {offline && <WifiOff size={15} />} {error}
          <div className="mw-actions">
            <button className="secondary" onClick={() => void refresh()}>
              Refresh records
            </button>
          </div>
        </div>
      )}
      {loading && (
        <div className="mw-card" role="status">
          Opening your organization workspace…
        </div>
      )}
      {!loading && !organizations.length && (
        <div className="mw-card">
          <Building2 size={30} />
          <h2>No organization access yet</h2>
          <p>
            Your account has no active Mera membership. Ask the organization
            owner to invite you. Existing store access does not automatically
            grant platform access.
          </p>
          <form
            className="mw-form"
            onSubmit={submit(async () => {
              await mutate(
                "/organizations",
                "POST",
                {
                  name: tabForm.organizationName,
                  slug: tabForm.slug,
                  branchName: tabForm.branchName,
                },
                "Organization created.",
              );
              await loadContext();
            })}
          >
            {field("Organization name", "organizationName")}
            {field("Requested subdomain", "slug")}
            {field("First branch name", "branchName")}
            <div className="mw-wide">
              <button className="primary" disabled={busy}>
                Create organization
              </button>
            </div>
          </form>
          <p className="mw-muted">
            Subdomain ownership and uniqueness are checked by the server.
            Creating a development organization does not publish a hosted site
            or activate a wallet.
          </p>
        </div>
      )}
      {!!organizations.length && (
        <>
          <nav className="mw-tabs" aria-label="Organization workspace">
            <div role="tablist" className="mw-tabs">
              {visibleSections.map(([id, name]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={activeSection === id}
                  onClick={() => setSection(id)}
                >
                  {name}
                </button>
              ))}
            </div>
          </nav>
          {!data ? (
            <div className="mw-card" role="status">
              {branchId
                ? "Loading branch records…"
                : "No branch is available for this membership."}
            </div>
          ) : (
            <main>
              {activeSection === "qr" && (
                <QrCodes
                  key={branchBase}
                  base={branchBase}
                  tables={list(data.tables)}
                  demo={!!context?.demo}
                />
              )}
              {activeSection === "integrations" && (
                <Integrations
                  key={branchBase}
                  base={branchBase}
                  demo={!!context?.demo}
                />
              )}
              {activeSection === "care" && (
                <Complaints
                  key={branchBase}
                  base={branchBase}
                  complaints={list(data.complaints)}
                  disabled={busy || offline}
                  save={mutate}
                />
              )}
              {activeSection === "waitlist" && (
                <Waitlist
                  key={branchBase}
                  base={branchBase}
                  disabled={busy || offline}
                  save={mutate}
                />
              )}
              {activeSection === "exports" && (
                <ExportJobs
                  key={branchBase}
                  base={branchBase}
                  disabled={busy || offline}
                  save={mutate}
                />
              )}
              {activeSection === "billing" && (
                <Invoices
                  key={organizationId}
                  organizationId={organizationId}
                  disabled={busy || offline}
                  save={mutate}
                />
              )}
              {activeSection === "printing" && (
                <PrintStudio
                  key={branchId}
                  base={branchBase}
                  disabled={busy || offline}
                  canViewJobs={allowed("orders.view")}
                  canReprint={allowed("orders.fulfill")}
                  save={mutate}
                />
              )}
              {activeSection === "overview" && (
                <>
                  <div className="mw-grid">
                    {[
                      [
                        "Order value",
                        formatMoney(
                          data.report?.grossOrderValue ??
                            data.report?.grossSales,
                        ),
                      ],
                      ["Collections", formatMoney(data.report?.collections)],
                      [
                        "Recognized sales",
                        formatMoney(data.report?.grossSales),
                      ],
                      ["Outstanding", formatMoney(data.report?.outstanding)],
                      ["Orders", data.report?.orders ?? orders.length],
                    ].map(([name, value]) => (
                      <section key={String(name)} className="mw-card mw-stat">
                        <div className="mw-eyebrow">{name}</div>
                        <strong>{value}</strong>
                        <small>
                          {name === "Collections"
                            ? "Recorded money received, separate from sales"
                            : "Canonical branch records"}
                        </small>
                      </section>
                    ))}
                  </div>
                  <ReportDetails report={data.report} />
                  <section className="mw-card">
                    <h2>Service at a glance</h2>
                    <div className="mw-grid">
                      <div>
                        <h3>Order flow</h3>
                        {["submitted", "accepted", "preparing", "ready"].map(
                          (status) => (
                            <div className="mw-row" key={status}>
                              <span>{sourceLabel(status)}</span>
                              <b>
                                {
                                  orders.filter(
                                    (order) => order.status === status,
                                  ).length
                                }
                              </b>
                            </div>
                          ),
                        )}
                      </div>
                      <div>
                        <h3>Connections</h3>
                        {Object.entries(
                          data.providers || context?.providers || {},
                        ).map(([name, state]: any) => (
                          <div className="mw-row" key={name}>
                            <span>{name}</span>
                            <span className="mw-pill blocked">
                              {typeof state === "string"
                                ? state
                                : state.state || state.status || "not verified"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                </>
              )}
              {activeSection === "onboarding" && (
                <section className="mw-card">
                  <h2>Make this workspace yours</h2>
                  <p>
                    Save progress as you configure the business. Provider
                    verification remains separate from organization readiness.
                  </p>
                  <form
                    className="mw-form"
                    onSubmit={submit(() =>
                      mutate(
                        `/organizations/${organizationId}/onboarding`,
                        "PATCH",
                        { step: 1, data: tabForm },
                        "Onboarding progress saved.",
                      ),
                    )}
                  >
                    {field("Business contact", "contact")}
                    {field("Phone", "phone", "tel", false)}
                    <label>
                      Service modes
                      <select
                        value={tabForm.serviceMode || "counter_takeaway"}
                        onChange={(event) =>
                          updateForm("serviceMode", event.target.value)
                        }
                      >
                        <option value="counter_takeaway">
                          Counter & takeaway
                        </option>
                        <option value="table_service">Table service</option>
                        <option value="reservations">Reservations</option>
                        <option value="lounge">Lounge & club</option>
                      </select>
                    </label>
                    <div className="mw-wide mw-actions">
                      <button className="primary" disabled={busy || offline}>
                        Save business details
                      </button>
                    </div>
                  </form>
                  <div className="mw-note">
                    Live wallet approval, domains and commercial policies
                    require verified provider and owner decisions. Saving this
                    step does not activate online collection.
                  </div>
                </section>
              )}
              {activeSection === "onboarding" && (
                <BranchSettings
                  key={branchId}
                  branch={branch}
                  organization={organization}
                  base={branchBase}
                  disabled={busy || offline}
                  save={mutate}
                />
              )}
              {activeSection === "onboarding" &&
                allowed("organization.manage") && (
                  <DepositPolicy
                    key={branchId}
                    policy={branch?.settings?.depositPolicy}
                    base={branchBase}
                    disabled={busy || offline}
                    save={mutate}
                  />
                )}
              {activeSection === "menu" && (
                <>
                  <section className="mw-card">
                    <div className="mw-heading">
                      <div>
                        <h2>Your menu, carefully curated</h2>
                        <p>
                          Publication version{" "}
                          {data.menuVersion || "not published"}. Historical
                          orders keep their original prices.
                        </p>
                      </div>
                      <div className="mw-actions">
                        {button(
                          "New product",
                          () =>
                            setProductEdit({
                              name: "",
                              code: "",
                              category: "",
                              description: "",
                              price: 0,
                              size: "",
                              stockMode: "unlimited",
                              stock: 0,
                              available: true,
                              station: "bar",
                            }),
                          "menu.edit",
                        )}
                        {button(
                          "Publish menu",
                          () =>
                            act(
                              branchBase + "/menu/publish",
                              {},
                              "Menu published.",
                            ),
                          "menu.publish",
                        )}
                      </div>
                    </div>
                    <div className="mw-list">
                      {products.map((product) => (
                        <div className="mw-row" key={product.id}>
                          <div>
                            <b>{product.name}</b>
                            <small>
                              {product.category} · {product.size} ·{" "}
                              {formatMoney(product.price)}
                            </small>
                          </div>
                          <span className="mw-pill">
                            {product.stockMode === "counted"
                              ? `${product.stock} in stock`
                              : "Unlimited stock"}
                          </span>
                          <div className="mw-actions">
                            {button(
                              "Edit",
                              () => setProductEdit({ ...product }),
                              "menu.edit",
                            )}
                            {allowed("stock.adjust") && (
                              <form
                                onSubmit={submit(async () => {
                                  const form = document.getElementById(
                                    "stock-" + product.id,
                                  ) as HTMLInputElement;
                                  const reason = document.getElementById(
                                    "reason-" + product.id,
                                  ) as HTMLInputElement;
                                  await mutate(
                                    branchBase + "/stock",
                                    "POST",
                                    {
                                      productId: product.id,
                                      quantity: Number(form.value),
                                      reason: reason.value,
                                    },
                                    "Stock balance updated.",
                                  );
                                })}
                                className="mw-actions"
                              >
                                <input
                                  id={"stock-" + product.id}
                                  aria-label={
                                    "Stock balance for " + product.name
                                  }
                                  type="number"
                                  min="0"
                                  required
                                  placeholder="Count"
                                  style={{ width: 90 }}
                                />
                                <input
                                  id={"reason-" + product.id}
                                  aria-label={
                                    "Stock reason for " + product.name
                                  }
                                  required
                                  placeholder="Adjustment reason"
                                  style={{ width: 150 }}
                                />
                                <button
                                  className="secondary"
                                  disabled={busy || offline}
                                >
                                  Set stock
                                </button>
                              </form>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  {productEdit && (
                    <section className="mw-card" aria-label="Product editor">
                      <h2>
                        {productEdit.id ? "Edit product" : "Add a product"}
                      </h2>
                      <form
                        className="mw-form"
                        onSubmit={submit(async () => {
                          const {
                            variantsJson,
                            modifierGroupsJson,
                            allergensText,
                            dietaryText,
                            ...product
                          } = productEdit;
                          for (const [key, text] of [
                            ["allergens", allergensText],
                            ["dietary", dietaryText],
                          ])
                            if (text !== undefined)
                              product[key as string] = (text as string)
                                .split(",")
                                .map((value) => value.trim())
                                .filter(Boolean);
                          try {
                            product.variants =
                              variantsJson === undefined
                                ? product.variants || []
                                : JSON.parse(variantsJson);
                            product.modifierGroups =
                              modifierGroupsJson === undefined
                                ? product.modifierGroups || []
                                : JSON.parse(modifierGroupsJson);
                          } catch {
                            throw new Error(
                              "Variants and modifier groups must be valid JSON arrays.",
                            );
                          }
                          await mutate(
                            branchBase +
                              "/products" +
                              (productEdit.id ? "/" + productEdit.id : ""),
                            productEdit.id ? "PUT" : "POST",
                            product,
                            "Product saved.",
                          );
                          setProductEdit(null);
                        })}
                      >
                        {[
                          ["Product name", "name"],
                          ["Product code", "code"],
                          ["Category", "category"],
                          ["Parent category", "parentCategory"],
                          ["Size", "size"],
                        ].map(([label, key]) => (
                          <label key={key}>
                            {label}
                            <input
                              value={productEdit[key] || ""}
                              required={
                                key !== "parentCategory" && key !== "size"
                              }
                              onChange={(event) =>
                                setProductEdit({
                                  ...productEdit,
                                  [key]:
                                    event.target.value ||
                                    (key === "parentCategory" ? null : ""),
                                })
                              }
                            />
                          </label>
                        ))}
                        <label>
                          Price in naira
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={productEdit.price / 100}
                            required
                            onChange={(event) =>
                              setProductEdit({
                                ...productEdit,
                                price: Math.round(
                                  Number(event.target.value) * 100,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          Stock mode
                          <select
                            value={productEdit.stockMode}
                            onChange={(event) =>
                              setProductEdit({
                                ...productEdit,
                                stockMode: event.target.value,
                              })
                            }
                          >
                            <option value="unlimited">Unlimited</option>
                            <option value="counted">
                              Counted sellable stock
                            </option>
                          </select>
                        </label>
                        <label>
                          Preparation station
                          <select
                            value={productEdit.station}
                            onChange={(event) =>
                              setProductEdit({
                                ...productEdit,
                                station: event.target.value,
                              })
                            }
                          >
                            <option value="bar">Bar</option>
                            <option value="kitchen">Kitchen</option>
                          </select>
                        </label>
                        <label>
                          Available
                          <select
                            value={String(productEdit.available)}
                            onChange={(event) =>
                              setProductEdit({
                                ...productEdit,
                                available: event.target.value === "true",
                              })
                            }
                          >
                            <option value="true">Available</option>
                            <option value="false">Unavailable</option>
                          </select>
                        </label>
                        <label className="mw-wide">
                          Description
                          <textarea
                            value={productEdit.description}
                            onChange={(event) =>
                              setProductEdit({
                                ...productEdit,
                                description: event.target.value,
                              })
                            }
                          />
                        </label>
                        <details className="mw-wide">
                          <summary>
                            Sizes, modifier groups & dietary information
                          </summary>
                          <p className="mw-muted">
                            Advanced structured editor. Prices are integer kobo.
                            The server validates group limits and option
                            selections.
                          </p>
                          <label>
                            Variants JSON
                            <textarea
                              rows={5}
                              value={
                                productEdit.variantsJson ??
                                JSON.stringify(
                                  productEdit.variants || [],
                                  null,
                                  2,
                                )
                              }
                              onChange={(e) =>
                                setProductEdit({
                                  ...productEdit,
                                  variantsJson: e.target.value,
                                })
                              }
                            />
                          </label>
                          <p className="mw-muted">
                            Variant: id, name, price. Example:
                            [&#123;"id":"large","name":"Large","price":380000&#125;]
                          </p>
                          <label>
                            Modifier groups JSON
                            <textarea
                              rows={7}
                              value={
                                productEdit.modifierGroupsJson ??
                                JSON.stringify(
                                  productEdit.modifierGroups || [],
                                  null,
                                  2,
                                )
                              }
                              onChange={(e) =>
                                setProductEdit({
                                  ...productEdit,
                                  modifierGroupsJson: e.target.value,
                                })
                              }
                            />
                          </label>
                          <p className="mw-muted">
                            Each group: id, name, min, max, options. Each
                            option: id, name, price.
                          </p>
                          <label>
                            Allergens (comma separated)
                            <input
                              value={
                                productEdit.allergensText ??
                                (productEdit.allergens || []).join(", ")
                              }
                              onChange={(e) =>
                                setProductEdit({
                                  ...productEdit,
                                  allergensText: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            Dietary labels (comma separated)
                            <input
                              value={
                                productEdit.dietaryText ??
                                (productEdit.dietary || []).join(", ")
                              }
                              onChange={(e) =>
                                setProductEdit({
                                  ...productEdit,
                                  dietaryText: e.target.value,
                                })
                              }
                            />
                          </label>
                        </details>
                        <div className="mw-actions mw-wide">
                          <button
                            className="primary"
                            disabled={busy || offline}
                          >
                            Save product
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setProductEdit(null)}
                          >
                            Close editor
                          </button>
                        </div>
                      </form>
                    </section>
                  )}
                </>
              )}
              {(activeSection === "orders" ||
                activeSection === "preparation") && (
                <>
                  <section className="mw-card">
                    <h2>
                      {activeSection === "preparation"
                        ? "Kitchen & bar handoffs"
                        : "Every order, with responsibility"}
                    </h2>
                    <div className="mw-form">
                      <label>
                        Find orders
                        <input
                          type="search"
                          placeholder="Reference, customer or staff"
                          value={orderFilters.query}
                          onChange={(event) =>
                            setOrderFilters({
                              ...orderFilters,
                              query: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Order status
                        <select
                          value={orderFilters.status}
                          onChange={(event) =>
                            setOrderFilters({
                              ...orderFilters,
                              status: event.target.value,
                            })
                          }
                        >
                          <option value="">All states</option>
                          {[
                            "submitted",
                            "accepted",
                            "preparing",
                            "ready",
                            "collected",
                            "completed",
                            "rejected",
                            "cancelled",
                          ].map((status) => (
                            <option key={status}>{status}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Order channel
                        <select
                          value={orderFilters.source}
                          onChange={(event) =>
                            setOrderFilters({
                              ...orderFilters,
                              source: event.target.value,
                            })
                          }
                        >
                          <option value="">All channels</option>
                          {Array.from(
                            new Set(
                              orders
                                .map((order: any) => order.source)
                                .filter(Boolean),
                            ),
                          ).map((source) => (
                            <option key={source} value={source}>
                              {sourceLabel(source)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Payment state
                        <select
                          value={orderFilters.payment}
                          onChange={(event) =>
                            setOrderFilters({
                              ...orderFilters,
                              payment: event.target.value,
                            })
                          }
                        >
                          <option value="">All payment states</option>
                          {[
                            "unpaid",
                            "pending",
                            "partially_paid",
                            "paid",
                            "partially_refunded",
                            "refunded",
                            "failed",
                            "expired",
                          ].map((state) => (
                            <option key={state}>{state}</option>
                          ))}
                        </select>
                      </label>
                      <label className="mw-row">
                        <span>Unassigned orders only</span>
                        <input
                          type="checkbox"
                          checked={orderFilters.unassigned}
                          onChange={(event) =>
                            setOrderFilters({
                              ...orderFilters,
                              unassigned: event.target.checked,
                            })
                          }
                        />
                      </label>
                    </div>
                    {filteredOrders.length
                      ? filteredOrders
                          .filter(
                            (order) =>
                              activeSection !== "preparation" ||
                              ![
                                "completed",
                                "collected",
                                "cancelled",
                                "rejected",
                              ].includes(order.status),
                          )
                          .map((order) => (
                            <div className="mw-row" key={order.id}>
                              <div>
                                <b>
                                  {order.reference || order.id.slice(0, 8)} ·{" "}
                                  {order.displayName}
                                </b>
                                <small>
                                  {sourceLabel(order.source)} ·{" "}
                                  {sourceLabel(order.fulfillment)} ·{" "}
                                  {formatMoney(order.total)} ·{" "}
                                  {sourceLabel(order.paymentStatus)}
                                </small>
                                <small>
                                  Handler:{" "}
                                  {order.handlerName ||
                                    order.assignedTo ||
                                    order.handlerId ||
                                    "Unassigned"}{" "}
                                  · {dateLabel(order.createdAt)}
                                </small>
                                {list(order.items).map(
                                  (line: any, index: number) => (
                                    <small key={index}>
                                      {line.quantity} ×{" "}
                                      {line.name || line.productName}
                                    </small>
                                  ),
                                )}
                                <details style={{ marginTop: 8 }}>
                                  <summary>
                                    Responsibility & payment history
                                  </summary>
                                  {list(order.history).map(
                                    (entry: any, index: number) => (
                                      <small key={index}>
                                        {sourceLabel(entry.action)} ·{" "}
                                        {entry.actorName ||
                                          entry.actorId ||
                                          "System"}{" "}
                                        · {dateLabel(entry.at)}
                                        {entry.amount
                                          ? " · " + formatMoney(entry.amount)
                                          : ""}
                                      </small>
                                    ),
                                  )}
                                </details>
                              </div>
                              <div className="mw-actions">
                                <span className="mw-pill">
                                  {sourceLabel(order.status)}
                                </span>
                                {nextState[order.status] &&
                                  button(
                                    "Mark " +
                                      sourceLabel(nextState[order.status]),
                                    () =>
                                      act(
                                        branchBase +
                                          `/orders/${order.id}/status`,
                                        {
                                          status: nextState[order.status],
                                          version: order.version,
                                        },
                                        "Order updated.",
                                      ),
                                    [
                                      "submitted",
                                      "accepted",
                                      "preparing",
                                    ].includes(order.status)
                                      ? "orders.prepare"
                                      : "orders.fulfill",
                                  )}
                                {button(
                                  "Assign to me",
                                  () =>
                                    act(
                                      branchBase + `/orders/${order.id}/assign`,
                                      {
                                        userId: user.id,
                                        version: order.version,
                                      },
                                      "Order assigned.",
                                    ),
                                  "orders.assign",
                                )}
                              </div>
                            </div>
                          ))
                      : empty("No orders match the current filters.")}
                  </section>
                  {activeSection === "orders" && allowed("orders.create") && (
                    <section className="mw-card">
                      <h2>Create a staff-assisted order</h2>
                      <form onSubmit={submit(sendStaffOrder)}>
                        <fieldset
                          disabled={busy || offline || !!uncertainOrder}
                          style={{
                            border: 0,
                            padding: 0,
                            margin: 0,
                            minWidth: 0,
                          }}
                        >
                          <div className="mw-form">
                            <label>
                              Customer display name
                              <input
                                required
                                value={orderDraft.displayName}
                                onChange={(event) => (
                                  (requestKey.current = null),
                                  setOrderDraft({
                                    ...orderDraft,
                                    displayName: event.target.value,
                                  })
                                )}
                              />
                            </label>
                            <label>
                              Fulfillment
                              <select
                                value={orderDraft.fulfillment}
                                onChange={(event) => (
                                  (requestKey.current = null),
                                  setOrderDraft({
                                    ...orderDraft,
                                    fulfillment: event.target.value,
                                    visitId: undefined,
                                  })
                                )}
                              >
                                <option value="counter_pickup">
                                  Counter pickup
                                </option>
                                <option value="takeaway">Takeaway</option>
                                {allowed("tables.manage") && (
                                  <option value="table_service">
                                    Table service
                                  </option>
                                )}
                              </select>
                            </label>
                          </div>
                          {orderDraft.fulfillment === "table_service" && (
                            <label>
                              Open table visit
                              <select
                                required
                                value={orderDraft.visitId || ""}
                                onChange={(event) => {
                                  requestKey.current = null;
                                  setOrderDraft({
                                    ...orderDraft,
                                    visitId: event.target.value,
                                  });
                                }}
                              >
                                <option value="">Select an open visit</option>
                                {list(data.visits)
                                  .filter(
                                    (visit: any) => visit.status === "open",
                                  )
                                  .map((visit: any) => (
                                    <option key={visit.id} value={visit.id}>
                                      {list(data.tables).find(
                                        (table: any) =>
                                          table.id === visit.tableId,
                                      )?.name || "Table"}{" "}
                                      ·{" "}
                                      {visit.displayName ||
                                        visit.id.slice(0, 8)}
                                    </option>
                                  ))}
                              </select>
                            </label>
                          )}
                          <label>
                            Order note
                            <input
                              value={orderDraft.note}
                              onChange={(event) => {
                                requestKey.current = null;
                                setOrderDraft({
                                  ...orderDraft,
                                  note: event.target.value,
                                });
                              }}
                            />
                          </label>
                          <StaffOrderItems
                            products={products}
                            lines={orderDraft.items}
                            disabled={busy || offline}
                            onChange={(items) => {
                              requestKey.current = null;
                              setOrderDraft({ ...orderDraft, items });
                            }}
                          />
                          <div className="mw-note">
                            The server validates current publication, modifier
                            requirements, prices and stock. No payment is
                            confirmed by creating an order.
                          </div>
                          <button
                            className="primary"
                            disabled={
                              busy ||
                              offline ||
                              !orderDraft.items.length ||
                              !data.menuVersion
                            }
                          >
                            Submit order
                          </button>
                        </fieldset>
                        {uncertainOrder && (
                          <div className="mw-note" role="status">
                            <strong>Submission not confirmed</strong>
                            <p>
                              This draft is locked while its original request is
                              unresolved. Check the queue or retry the exact
                              same submission with its original request key.
                            </p>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void checkStaffOrder().catch((e) => {
                                  if (
                                    activeScope.current === branchBase &&
                                    scopeEpoch.current.generation ===
                                      scopeVersion
                                  )
                                    setError(e.message);
                                })
                              }
                            >
                              Check original order
                            </button>
                            <button
                              type="button"
                              disabled={busy || offline}
                              onClick={() =>
                                void sendStaffOrder().catch(() => {})
                              }
                            >
                              Retry original submission
                            </button>
                          </div>
                        )}
                      </form>
                    </section>
                  )}
                </>
              )}
              {activeSection === "tables" && (
                <>
                  <section className="mw-card">
                    <h2>The floor</h2>
                    <div className="mw-grid">
                      {list(data.tables).map((table: any) => (
                        <div className="mw-card" key={table.id}>
                          <div className="mw-eyebrow">
                            {table.zone || "Main floor"}
                          </div>
                          <h3>{table.name}</h3>
                          <p>{table.capacity} seats</p>
                          <TableEditor
                            table={table}
                            base={branchBase}
                            disabled={busy || offline}
                            save={mutate}
                          />
                          <span className="mw-pill">
                            {table.status || "Available"}
                          </span>
                        </div>
                      ))}
                    </div>
                    {!data.tables?.length &&
                      empty("Create a table to begin table service.")}
                    <form
                      className="mw-form"
                      onSubmit={submit(() =>
                        mutate(
                          branchBase + "/tables",
                          "POST",
                          {
                            name: tabForm.tableName,
                            capacity: Number(tabForm.capacity),
                            zone: tabForm.zone || "Main floor",
                            x: 0,
                            y: 0,
                          },
                          "Table created.",
                        ),
                      )}
                    >
                      {field("Table label", "tableName")}
                      {field("Seats", "capacity", "number")}
                      {field("Zone", "zone", "text", false)}
                      <div className="mw-wide">
                        <button className="primary" disabled={busy || offline}>
                          Create table
                        </button>
                      </div>
                    </form>
                  </section>
                  <section className="mw-card">
                    <h2>Current visits</h2>
                    {list(data.visits).map((visit: any) => (
                      <div className="mw-row" key={visit.id}>
                        <div>
                          <b>{visit.displayName || visit.id.slice(0, 8)}</b>
                          <small>
                            Table{" "}
                            {list(data.tables).find(
                              (table: any) => table.id === visit.tableId,
                            )?.name || visit.tableId}{" "}
                            · {visit.status}
                          </small>
                        </div>
                        {visit.status !== "closed" &&
                          button("Close visit", () =>
                            act(
                              branchBase + `/visits/${visit.id}/close`,
                              {},
                              "Visit closed.",
                            ),
                          )}
                      </div>
                    ))}
                    <form
                      className="mw-form"
                      onSubmit={submit(() =>
                        mutate(
                          branchBase + "/visits",
                          "POST",
                          {
                            tableId: tabForm.tableId,
                            displayName: tabForm.visitName,
                          },
                          "Visit opened.",
                        ),
                      )}
                    >
                      <label>
                        Table
                        <select
                          required
                          value={tabForm.tableId || ""}
                          onChange={(event) =>
                            updateForm("tableId", event.target.value)
                          }
                        >
                          <option value="">Choose a table</option>
                          {list(data.tables).map((table: any) => (
                            <option key={table.id} value={table.id}>
                              {table.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {field("Guest display name", "visitName")}
                      <div className="mw-wide">
                        <button className="primary" disabled={busy || offline}>
                          Open visit
                        </button>
                      </div>
                    </form>
                    <p>
                      Private visit access requires a controlled guest session;
                      a table QR alone does not expose a bill. Unresolved
                      balances prevent closure.
                    </p>
                  </section>
                </>
              )}
              {activeSection === "tables" && (
                <Bills
                  bills={list(data.bills)}
                  base={branchBase}
                  disabled={busy || offline}
                  canPay={allowed("payments.record")}
                  save={mutate}
                />
              )}
              {activeSection === "reservations" && (
                <section className="mw-card">
                  <h2>Reservations & front desk</h2>
                  {list(data.reservations).map((reservation: any) => (
                    <div className="mw-row" key={reservation.id}>
                      <div>
                        <b>
                          {reservation.displayName} · {reservation.partySize}{" "}
                          guests
                        </b>
                        <small>
                          {dateLabel(reservation.startsAt)} —{" "}
                          {dateLabel(reservation.endsAt)}
                        </small>
                        <span className="mw-pill">
                          {sourceLabel(reservation.status)}
                        </span>
                      </div>
                      <ReservationSettlement
                        reservation={reservation}
                        tables={list(data.tables)}
                        base={branchBase}
                        disabled={busy || offline}
                        canPay={allowed("payments.record")}
                        save={mutate}
                      />
                      <div className="mw-actions">
                        {reservation.status === "requested" &&
                          button("Confirm", () =>
                            act(
                              branchBase +
                                `/reservations/${reservation.id}/status`,
                              { status: "confirmed" },
                              "Reservation confirmed.",
                            ),
                          )}
                        {reservation.status === "confirmed" &&
                          button("Mark arrived", () =>
                            act(
                              branchBase +
                                `/reservations/${reservation.id}/status`,
                              { status: "arrived" },
                              "Arrival recorded.",
                            ),
                          )}
                        {["requested", "confirmed"].includes(
                          reservation.status,
                        ) &&
                          button("Cancel", () =>
                            act(
                              branchBase +
                                `/reservations/${reservation.id}/status`,
                              { status: "cancelled" },
                              "Reservation cancelled.",
                            ),
                          )}
                      </div>
                    </div>
                  ))}
                  <form
                    className="mw-form"
                    onSubmit={submit(() => {
                      const startsAt = new Date(tabForm.startsAt).toISOString();
                      const endsAt = new Date(tabForm.endsAt).toISOString();
                      return mutate(
                        branchBase + "/reservations",
                        "POST",
                        {
                          requestKey: uuid(),
                          displayName: tabForm.name,
                          contact: tabForm.contact,
                          partySize: Number(tabForm.partySize),
                          startsAt,
                          endsAt,
                          ...(tabForm.tableId
                            ? { tableId: tabForm.tableId }
                            : {}),
                          notes: tabForm.notes || "",
                        },
                        "Reservation requested.",
                      );
                    })}
                  >
                    {field("Guest name", "name")}
                    {field("Contact", "contact")}
                    {field("Party size", "partySize", "number")}
                    {field(
                      "Starts at (this device’s local time)",
                      "startsAt",
                      "datetime-local",
                    )}
                    {field(
                      "Ends at (this device’s local time)",
                      "endsAt",
                      "datetime-local",
                    )}
                    <label>
                      Preferred table
                      <select
                        value={tabForm.tableId || ""}
                        onChange={(event) =>
                          updateForm("tableId", event.target.value)
                        }
                      >
                        <option value="">No preference</option>
                        {list(data.tables).map((table: any) => (
                          <option key={table.id} value={table.id}>
                            {table.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="mw-wide">
                      <button className="primary" disabled={busy || offline}>
                        Request reservation
                      </button>
                    </div>
                  </form>
                  <div className="mw-note">
                    Capacity and overlapping bookings are checked by the server.
                    Deposits and cancellation/refund policies must be approved
                    before live collection.
                  </div>
                </section>
              )}
              {activeSection === "payments" && (
                <section className="mw-card">
                  <h2>Collections & refunds</h2>
                  <p>
                    Record only money already received. A customer payment claim
                    does not confirm a collection.
                  </p>
                  <form
                    className="mw-form"
                    onSubmit={submit(() =>
                      mutate(
                        branchBase + `/orders/${tabForm.orderId}/payments`,
                        "POST",
                        {
                          requestKey: uuid(),
                          amount: Math.round(Number(tabForm.amount) * 100),
                          method: tabForm.method || "cash",
                          reference: tabForm.reference || "",
                        },
                        "Collection recorded.",
                      ),
                    )}
                  >
                    <label>
                      Order
                      <select
                        required
                        value={tabForm.orderId || ""}
                        onChange={(event) =>
                          updateForm("orderId", event.target.value)
                        }
                      >
                        <option value="">Choose an order</option>
                        {orders.map((order) => (
                          <option key={order.id} value={order.id}>
                            {order.reference || order.id.slice(0, 8)} ·{" "}
                            {order.displayName} · {formatMoney(order.total)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {field("Amount received (naira)", "amount", "number")}
                    <label>
                      Payment origin
                      <select
                        value={tabForm.method || "cash"}
                        onChange={(event) =>
                          updateForm("method", event.target.value)
                        }
                      >
                        <option value="cash">Cash</option>
                        <option value="external_pos">External POS</option>
                        <option value="external_transfer">
                          Verified external transfer
                        </option>
                      </select>
                    </label>
                    {field(
                      "Receipt / transfer reference",
                      "reference",
                      "text",
                      false,
                    )}
                    <div className="mw-wide">
                      <button className="primary" disabled={busy || offline}>
                        Record verified collection
                      </button>
                    </div>
                  </form>
                  <div className="mw-list">
                    {list(data.payments).map((payment: any) => (
                      <div className="mw-row" key={payment.id}>
                        <div>
                          <b>{formatMoney(payment.amount)}</b>
                          <small>
                            {sourceLabel(payment.method)} ·{" "}
                            {payment.reference || "No reference"} ·{" "}
                            {dateLabel(payment.createdAt)}
                          </small>
                        </div>
                        <span className="mw-pill">
                          {payment.status || "recorded"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {allowed("refunds.approve") && (
                    <form
                      className="mw-form"
                      onSubmit={submit(() =>
                        mutate(
                          branchBase + `/orders/${tabForm.refundOrder}/refunds`,
                          "POST",
                          {
                            requestKey: uuid(),
                            amount: Math.round(
                              Number(tabForm.refundAmount) * 100,
                            ),
                            reason: tabForm.reason,
                            method: tabForm.refundMethod,
                          },
                          "Refund recorded.",
                        ),
                      )}
                    >
                      <label>
                        Refund order
                        <select
                          required
                          value={tabForm.refundOrder || ""}
                          onChange={(event) =>
                            updateForm("refundOrder", event.target.value)
                          }
                        >
                          <option value="">Choose order</option>
                          {orders.map((order) => (
                            <option key={order.id} value={order.id}>
                              {order.reference || order.id.slice(0, 8)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {field(
                        "Amount returned (naira)",
                        "refundAmount",
                        "number",
                      )}
                      <label>
                        Refund payout method
                        <select
                          required
                          value={tabForm.refundMethod || ""}
                          onChange={(event) =>
                            updateForm("refundMethod", event.target.value)
                          }
                        >
                          <option value="">
                            Choose how money was actually returned
                          </option>
                          <option value="cash">Cash returned</option>
                          <option value="external_pos">
                            External POS refund
                          </option>
                          <option value="external_transfer">
                            External transfer returned
                          </option>
                        </select>
                      </label>
                      {field("Refund reason", "reason")}
                      <div className="mw-wide">
                        <button
                          className="secondary"
                          disabled={busy || offline}
                        >
                          Record authorized refund
                        </button>
                      </div>
                    </form>
                  )}
                  <div className="mw-note">
                    Rubies live collections and withdrawals remain disabled
                    until credentials, contract capabilities and fee policies
                    are verified.
                  </div>
                </section>
              )}
              {activeSection === "shifts" && (
                <section className="mw-card">
                  <h2>Shifts & cash reconciliation</h2>
                  {list(data.shifts).map((shift: any) => (
                    <div className="mw-card" key={shift.id}>
                      <h3>
                        {shift.status} ·{" "}
                        {dateLabel(shift.createdAt || shift.openedAt)}
                      </h3>
                      <p>
                        Opening float {formatMoney(shift.openingFloat)} ·
                        Expected{" "}
                        {Number.isSafeInteger(shift.expectedCash)
                          ? formatMoney(shift.expectedCash)
                          : "calculated at close"}{" "}
                        · Counted{" "}
                        {Number.isSafeInteger(shift.countedCash)
                          ? formatMoney(shift.countedCash)
                          : "not counted"}
                      </p>
                      {shift.status === "open" && (
                        <form
                          className="mw-form"
                          onSubmit={submit(() =>
                            mutate(
                              branchBase + `/shifts/${shift.id}/movements`,
                              "POST",
                              {
                                direction: tabForm.direction || "out",
                                amount: Math.round(
                                  Number(tabForm.movementAmount) * 100,
                                ),
                                reason: tabForm.movementReason,
                              },
                              "Cash movement recorded.",
                            ),
                          )}
                        >
                          <label>
                            Cash movement
                            <select
                              value={tabForm.direction || "out"}
                              onChange={(event) =>
                                updateForm("direction", event.target.value)
                              }
                            >
                              <option value="out">Cash out</option>
                              <option value="in">Cash in</option>
                            </select>
                          </label>
                          {field(
                            "Movement amount (naira)",
                            "movementAmount",
                            "number",
                          )}
                          {field("Movement reason", "movementReason")}
                          <div className="mw-wide">
                            <button
                              className="secondary"
                              disabled={busy || offline}
                            >
                              Record cash movement
                            </button>
                          </div>
                        </form>
                      )}
                      {shift.status !== "closed" && (
                        <form
                          className="mw-form"
                          onSubmit={submit(() =>
                            mutate(
                              branchBase + `/shifts/${shift.id}/close`,
                              "POST",
                              {
                                countedCash: Math.round(
                                  Number(tabForm.counted) * 100,
                                ),
                                reason: tabForm.variance || "",
                              },
                              "Shift closed.",
                            ),
                          )}
                        >
                          {field("Counted cash (naira)", "counted", "number")}
                          {field(
                            "Variance explanation",
                            "variance",
                            "text",
                            false,
                          )}
                          <div className="mw-wide">
                            <button
                              className="secondary"
                              disabled={busy || offline}
                            >
                              Close & reconcile
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  ))}
                  <form
                    className="mw-form"
                    onSubmit={submit(() =>
                      mutate(
                        branchBase + "/shifts",
                        "POST",
                        {
                          openingFloat: Math.round(Number(tabForm.float) * 100),
                        },
                        "Shift opened.",
                      ),
                    )}
                  >
                    {field("Opening float (naira)", "float", "number")}
                    <div className="mw-wide">
                      <button className="primary" disabled={busy || offline}>
                        Open shift
                      </button>
                    </div>
                  </form>
                </section>
              )}
              {activeSection === "team" && (
                <section className="mw-card">
                  <h2>The people behind the service</h2>
                  {members.map((member: any) => (
                    <div className="mw-row" key={member.id}>
                      <div>
                        <b>{member.name || member.userId}</b>
                        <small>
                          {sourceLabel(member.role)} ·{" "}
                          {member.active ? "Active" : "Suspended"}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy || offline || member.userId === user.id}
                        onClick={() => {
                          void mutate(
                            `/organizations/${organizationId}/members/${member.id}`,
                            "PATCH",
                            { active: !member.active },
                            member.active
                              ? "Membership suspended."
                              : "Membership restored.",
                          )
                            .then(() =>
                              workspaceApi(
                                `/organizations/${organizationId}/members`,
                              ),
                            )
                            .then((rows) => {
                              if (
                                activeScope.current === branchBase &&
                                scopeEpoch.current.generation === scopeVersion
                              )
                                setMembers(list(rows.members ?? rows));
                            })
                            .catch(() => {});
                        }}
                      >
                        {member.active ? "Suspend access" : "Restore access"}
                      </button>
                    </div>
                  ))}
                  <form
                    className="mw-form"
                    onSubmit={submit(() =>
                      mutate(
                        `/organizations/${organizationId}/invitations`,
                        "POST",
                        {
                          email: tabForm.email,
                          role: tabForm.role || "cashier",
                          branchIds: [branchId],
                        },
                        "Invitation created. Check delivery status before assuming it was sent.",
                      ),
                    )}
                  >
                    {field("Staff email", "email", "email")}
                    <label>
                      Role
                      <select
                        value={tabForm.role || "cashier"}
                        onChange={(event) =>
                          updateForm("role", event.target.value)
                        }
                      >
                        {[
                          "organization_admin",
                          "branch_manager",
                          "cashier",
                          "waiter",
                          "kitchen",
                          "bar",
                          "front_desk",
                          "stock_controller",
                          "reports_only",
                        ].map((role) => (
                          <option key={role} value={role}>
                            {sourceLabel(role)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="mw-wide">
                      <button className="primary" disabled={busy || offline}>
                        Create branch invitation
                      </button>
                    </div>
                  </form>
                  <div className="mw-note">
                    Delivery requires a configured email provider. Creating an
                    invitation is not evidence that an email was sent.
                  </div>
                </section>
              )}
              {activeSection === "billing" && (
                <section className="mw-card">
                  <h2>Subscription & commercial policy</h2>
                  <div className="mw-grid">
                    <div>
                      <div className="mw-eyebrow">Subscription</div>
                      <h3>
                        {sourceLabel(
                          data.subscription?.status || "not configured",
                        )}
                      </h3>
                      <p>
                        Current policy:{" "}
                        {data.policy?.version ||
                          context?.policy?.version ||
                          "not approved"}
                      </p>
                    </div>
                    <div>
                      <div className="mw-eyebrow">Proposed monthly price</div>
                      <h3>
                        {Number.isSafeInteger(data.policy?.monthlyPrice)
                          ? formatMoney(data.policy.monthlyPrice)
                          : "Unresolved"}
                      </h3>
                      <p>
                        One organization, one included branch. Additional branch
                        pricing remains unresolved.
                      </p>
                    </div>
                  </div>
                  <div className="mw-note">
                    <ShieldCheck size={16} /> Live billing is disabled. Fee
                    payer, basis, rounding, refund treatment, trial and grace
                    policies need approval before charging.
                  </div>
                  <p>
                    The proposed integrated collection rate is 0.1%. Recorded
                    cash, external POS and manually verified external transfers
                    do not incur this integrated collection fee.
                  </p>
                </section>
              )}
            </main>
          )}
        </>
      )}
      {data && activeSection === "billing" && allowed("billing.manage") && (
        <PolicyEditor
          key={data.policy?.version || organizationId}
          organizationId={organizationId}
          policy={data.policy || context?.policy || {}}
          disabled={busy || offline}
          save={mutate}
        />
      )}
      <footer className="mw-footer">
        Mera development workspace · Canonical server state refreshes every 2.5
        seconds. Offline actions are not queued or assumed successful.
      </footer>
    </div>
  );
}
