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
import RefundRequests from "./RefundRequests";
import StaffPos from "./StaffPos";
import WorkspaceNavigation from "./WorkspaceNavigation";
import WorkspaceAccount from "./WorkspaceAccount";
import OperationalOverview from "./OperationalOverview";
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
import ReportExplorer from "./ReportExplorer";
import Tickets from "./Tickets";
import RoleManager from "./RoleManager";
import TimeWindows from "./TimeWindows";
import VariantsEditor from "./VariantsEditor";
import SharedMenus from "./SharedMenus";
import LaunchReadiness from "./LaunchReadiness";
import ReservationPolicy from "./ReservationPolicy";
import ItemCancellation from "./ItemCancellation";
import Reconciliation from "./Reconciliation";
import VisitTables from "./VisitTables";
import CashMovement from "./CashMovement";
import ShiftActions from "./ShiftActions";
import MediaUpload from "../MediaUpload";
import PricingPolicy from "./PricingPolicy";
import {
  financialKind,
  storeFinancialIntent,
  restoreFinancialIntent,
  removeFinancialIntent,
  clearFinancialJournals,
} from "./financialJournal";
import ItemFulfillment from "./ItemFulfillment";
import Categories, { categoryPath } from "./Categories";
import CatalogOperations from "./CatalogOperations";
import StockMovements from "./StockMovements";
import FloorMap from "./FloorMap";
import HelpRequests from "./HelpRequests";
import ModifierGroupsEditor from "./ModifierGroupsEditor";
import WriteOff from "./WriteOff";
import MinimumSpendPolicy from "./MinimumSpendPolicy";
import VisitMinimumSpend from "./VisitMinimumSpend";
import PrivateVisitAccess from "./PrivateVisitAccess";
import SupportCases from "./SupportCases";
import DepositOutcomes from "./DepositOutcomes";
import OrderHistory from "./OrderHistory";
import OrderInstructions from "./OrderInstructions";
import { workspaceApi, formatMoney, WorkspaceError } from "./api";

type RecordData = Record<string, any>;
type Props = {
  user: any;
  notify: (message: string) => void;
  onLogout?: () => Promise<void>;
};
const nextState: Record<string, string> = {
  submitted: "accepted",
  ready: "collected",
  collected: "completed",
};
const sections = [
  ["overview", "Your branch", "reports.view"],
  ["onboarding", "Getting started", "organization.manage"],
  ["menu", "Menu & stock", "menu.edit"],
  ["orders", "Orders", "orders.view"],
  ["counter", "Point of sale", "orders.create"],
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
  ["help", "Customer requests", "help.manage"],
  ["support", "Mera support", "support.manage"],
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

export default function OrganizationWorkspace({
  user,
  notify,
  onLogout,
}: Props) {
  const [principal, setPrincipal] = useState("");
  const confirmedPrincipal = useRef("");
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [journalWarning, setJournalWarning] = useState(false);
  const [abandonReason, setAbandonReason] = useState("");
  const [abandonConfirmed, setAbandonConfirmed] = useState(false);
  const [context, setContext] = useState<RecordData | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [section, setSection] = useState("overview");
  const [data, setData] = useState<RecordData | null>(null);
  const [privateAccess, setPrivateAccess] = useState<any>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
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
  const [staffQuote, setStaffQuote] = useState<any>(null);
  const requestKey = useRef<string | null>(null);
  const [uncertainOrder, setUncertainOrder] = useState<RecordData | null>(null);
  const pendingRequests = useRef(new Map<string, string>());
  const financialRequests = useRef(new Map<string, any>());
  const [financialRevision, setFinancialRevision] = useState(0);
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
      organization?.organizationWide === true ||
      !organization?.branchIds?.length ||
      organization.branchIds.includes(branch.id),
  );
  const branchScopeKey = branches.map((branch: any) => branch.id).join("|");
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const activeScope = useRef("");
  const contextGeneration = useRef(0);
  const permissionFingerprint = useRef("");
  const accessDenied = useRef(false);
  const authorizationEpoch = useRef(0);
  const renderedAuthorizationVersion = authorizationEpoch.current;
  const lastDenialCheck = useRef(0);
  const mutationGeneration = useRef(0);
  const branchBase = `/organizations/${encodeURIComponent(organizationId)}/branches/${encodeURIComponent(branchId)}`;
  const scopeEpoch = useRef({
    path: "",
    generation: 0,
    startedAt: performance.now(),
  });
  if (scopeEpoch.current.path !== branchBase)
    scopeEpoch.current = {
      path: branchBase,
      generation: scopeEpoch.current.generation + 1,
      startedAt: performance.now(),
    };
  const scopeVersion = scopeEpoch.current.generation;
  activeScope.current = branchBase;

  const clearProtected = useCallback(() => {
    authorizationEpoch.current++;
    setPrivateAccess(null);
    setData(null);
    setCategories([]);
    setMembers([]);
    setProductEdit(null);
    setTabForm({});
    setUncertainOrder(null);
    setStaffQuote(null);
    uncertainOrders.current.clear();
    requestKey.current = null;
    setOrderDraft({
      displayName: "",
      fulfillment: "counter_pickup",
      items: [],
      note: "",
    });
  }, []);
  useEffect(() => {
    const logout = () => {
      clearFinancialJournals();
      financialRequests.current.clear();
      pendingRequests.current.clear();
      confirmedPrincipal.current = "";
      setPrincipal("");
      clearProtected();
      setFinancialRevision((revision) => revision + 1);
    };
    window.addEventListener("mera:logout", logout);
    return () => window.removeEventListener("mera:logout", logout);
  }, [clearProtected]);
  useEffect(() => {
    if (
      !principal ||
      principal !== user.id ||
      principal !== confirmedPrincipal.current ||
      !organization ||
      !branches.some((branch: any) => branch.id === branchId)
    )
      return;
    const restored = restoreFinancialIntent(
      principal,
      organizationId,
      branchId,
    );
    const kind = restored && financialKind(restored.path, restored.body);
    const permission =
      ["refund", "writeoff"].includes(kind || "") ||
      kind?.startsWith("deposit_")
        ? "refunds.approve"
        : kind === "cash_movement"
          ? "shifts.manage"
          : kind === "item_cancellation"
            ? "orders.fulfill"
            : "payments.record";
    if (
      restored &&
      permissions.includes(permission) &&
      (!restored.body.refundAllocations?.length ||
        permissions.includes("refunds.approve")) &&
      !financialRequests.current.has(branchBase)
    ) {
      financialRequests.current.set(branchBase, restored);
      setFinancialRevision((revision) => revision + 1);
    }
  }, [principal, organizationId, branchId, context]);
  const loadContext = useCallback(
    async (quiet = false) => {
      const generation = ++contextGeneration.current;
      const epoch = scopeEpoch.current.generation;
      if (!quiet) {
        setLoading(true);
        setError("");
      }
      try {
        const result = await workspaceApi("/context");
        if (
          generation !== contextGeneration.current ||
          (quiet && epoch !== scopeEpoch.current.generation)
        )
          return;
        const fingerprint = JSON.stringify(
          (result.organizations || []).map((org: any) => ({
            id: org.id,
            role: org.role,
            permissions: org.permissions,
            branchIds: org.branchIds,
            organizationWide: org.organizationWide,
            branches: org.branches.map((branch: any) => branch.id),
          })),
        );
        if (
          permissionFingerprint.current &&
          permissionFingerprint.current !== fingerprint
        ) {
          clearProtected();
          accessDenied.current = false;
        }
        permissionFingerprint.current = fingerprint;
        const actor = result.user?.id;
        if (typeof actor === "string") {
          if (
            confirmedPrincipal.current &&
            confirmedPrincipal.current !== actor
          ) {
            clearProtected();
            financialRequests.current.clear();
            pendingRequests.current.clear();
            setFinancialRevision((revision) => revision + 1);
          }
          confirmedPrincipal.current = actor;
          setPrincipal(actor);
          clearFinancialJournals(actor);
        }
        setContext(result);
        setOffline(false);
        setOrganizationId((current) =>
          result.organizations?.some((org: any) => org.id === current)
            ? current
            : result.organizations?.[0]?.id || "",
        );
      } catch (e) {
        if (
          generation !== contextGeneration.current ||
          (quiet && epoch !== scopeEpoch.current.generation)
        )
          return;
        if (e instanceof WorkspaceError && [401, 403].includes(e.status)) {
          clearProtected();
          setContext(null);
          setOrganizationId("");
        }
        setError((e as Error).message);
        setOffline(true);
      } finally {
        if (generation === contextGeneration.current) setLoading(false);
      }
    },
    [clearProtected, user.id],
  );
  useEffect(() => {
    void loadContext();
    const timer = setInterval(() => {
      if (!document.hidden) void loadContext(true);
    }, 10000);
    return () => clearInterval(timer);
  }, [loadContext]);
  useEffect(() => {
    const denied = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.startedAt < scopeEpoch.current.startedAt) return;
      const currentOrg = activeScope.current.split("/branches/")[0];
      if (
        detail?.path?.startsWith("/organizations/") &&
        !detail.path.startsWith(currentOrg + "/")
      )
        return;
      if (
        detail?.path?.includes("/branches/") &&
        !detail.path.startsWith(activeScope.current + "/")
      )
        return;
      if (detail?.path?.endsWith("/workspace")) accessDenied.current = true;
      clearProtected();
      if (Date.now() - lastDenialCheck.current >= 10000) {
        lastDenialCheck.current = Date.now();
        void loadContext(true);
      }
    };
    window.addEventListener("mera:access-denied", denied);
    return () => window.removeEventListener("mera:access-denied", denied);
  }, [clearProtected, loadContext]);
  useEffect(() => {
    setPrivateAccess(null);
    setData(null);
    setCategories([]);
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
  }, [organizationId, branchScopeKey]);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!organizationId || !branchId || accessDenied.current) return;
      const authorizationVersion = authorizationEpoch.current;
      try {
        const response = await workspaceApi(
          branchBase + "/workspace",
          "GET",
          undefined,
          signal,
        );
        if (
          signal?.aborted ||
          authorizationEpoch.current !== authorizationVersion ||
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
          if (e instanceof WorkspaceError && [401, 403].includes(e.status)) {
            accessDenied.current = true;
            clearProtected();
          }
          setError((e as Error).message);
          setOffline(true);
        }
      }
    },
    [organizationId, branchId, branchBase, scopeVersion],
  );
  useEffect(() => {
    accessDenied.current = false;
    setPrivateAccess(null);
    setData(null);
    setCategories([]);
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
    setStaffQuote(null);
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
      const authorizationVersion = authorizationEpoch.current;
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
            scopeEpoch.current.generation === scopeVersion &&
            authorizationEpoch.current === authorizationVersion
          )
            setMembers(list(rows.members ?? rows));
        })
        .catch((e) => {
          if (
            e.name !== "AbortError" &&
            activeScope.current === requestedScope &&
            scopeEpoch.current.generation === scopeVersion &&
            authorizationEpoch.current === authorizationVersion
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
    const requestedActor = confirmedPrincipal.current;
    const authorizationVersion = authorizationEpoch.current;
    const generation = ++mutationGeneration.current;
    setBusy(true);
    setError("");
    const financial =
      !!body?.requestKey &&
      (/\/(payments|refunds|deposits|movements|writeoffs)$/.test(path) ||
        /\/items\/[^/]+\/cancel$/.test(path) ||
        /\/deposits\/[^/]+\/outcomes$/.test(path));
    const financialSignature = financial
      ? method + path + JSON.stringify({ ...body, requestKey: undefined })
      : null;
    let attemptedBody: any;
    try {
      const pending = financialRequests.current.get(requestedScope);
      if (financial && pending && pending.signature !== financialSignature)
        throw new WorkspaceError(
          "Resolve the original uncertain financial submission before changing the amount, reference, order or another financial record.",
          409,
          "FINANCIAL_INTENT_PENDING",
        );
      if (financial && pending) body = pending.body;
      const signature = body?.requestKey
        ? path + JSON.stringify({ ...body, requestKey: undefined })
        : null;
      if (signature) {
        const stable =
          pendingRequests.current.get(signature) || body.requestKey;
        pendingRequests.current.set(signature, stable);
        body = { ...body, requestKey: stable };
      }
      attemptedBody = body;
      const result = await workspaceApi(path, method, body);
      if (financial && requestedActor === confirmedPrincipal.current) {
        const match = requestedScope.match(
          /^\/organizations\/([^/]+)\/branches\/([^/]+)$/,
        );
        if (match && requestedActor)
          removeFinancialIntent(requestedActor, match[1], match[2]);
        const hadPending = financialRequests.current.has(requestedScope);
        financialRequests.current.delete(requestedScope);
        if (activeScope.current === requestedScope && hadPending)
          setFinancialRevision((revision) => revision + 1);
      }
      if (signature) pendingRequests.current.delete(signature);
      if (
        activeScope.current !== requestedScope ||
        authorizationEpoch.current !== authorizationVersion ||
        scopeEpoch.current.generation !== scopeVersion
      )
        throw new DOMException(
          "The workspace changed while the action was running.",
          "AbortError",
        );
      await refresh();
      if (
        activeScope.current !== requestedScope ||
        authorizationEpoch.current !== authorizationVersion ||
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
        financial &&
        requestedActor === confirmedPrincipal.current &&
        attemptedBody &&
        e instanceof WorkspaceError &&
        (!e.status || e.status >= 500)
      ) {
        financialRequests.current.set(requestedScope, {
          path,
          method,
          body: JSON.parse(JSON.stringify(attemptedBody)),
          signature: financialSignature,
        });
        const match = requestedScope.match(
          /^\/organizations\/([^/]+)\/branches\/([^/]+)$/,
        );
        if (
          match &&
          requestedActor &&
          !storeFinancialIntent(
            requestedActor,
            match[1],
            match[2],
            financialRequests.current.get(requestedScope),
          )
        )
          setJournalWarning(true);
        if (activeScope.current === requestedScope)
          setFinancialRevision((revision) => revision + 1);
      }
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
      ...(staffQuote?.quote?.id ? { quoteId: staffQuote.quote.id } : {}),
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
      setStaffQuote(null);
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
        (!error.status ||
          error.status >= 500 ||
          (error.status === 409 && error.code === "IDEMPOTENCY_CONFLICT"))
      ) {
        uncertainOrders.current.set(scope, body);
        if (
          activeScope.current === scope &&
          scopeEpoch.current.generation === scopeVersion
        )
          setUncertainOrder(body);
      } else if ((error as Error).name !== "AbortError") {
        uncertainOrders.current.delete(scope);
        requestKey.current = null;
        if (
          error instanceof WorkspaceError &&
          ["QUOTE_CHANGED", "QUOTE_REQUIRED"].includes(error.code || "")
        )
          setStaffQuote(null);
      }
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
      setStaffQuote(null);
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
    permission === "support.manage"
      ? allowed("organization.manage") &&
        organization?.organizationWide === true
      : permission === "help.manage"
        ? permissions.some((permission: string) =>
            [
              "orders.fulfill",
              "tables.manage",
              "payments.record",
              "refunds.approve",
              "reservations.manage",
              "organization.manage",
            ].includes(permission),
          )
        : permission === "qr.manage"
          ? allowed("menu.publish") || allowed("tables.manage")
          : allowed(permission),
  );
  const activeSection = visibleSections.some(([id]) => id === section)
    ? section
    : visibleSections[0]?.[0] || "";
  const orders = list(data?.orders);
  const liveOrders = orders.filter((order: any) => !order.historicalReadOnly);
  const filteredOrders = orders.filter((order: any) => {
    if (order.historicalReadOnly) return false;
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
  const features = data?.features || organization?.features;
  const pausedServices = Object.entries(features?.flags || {}).filter(
    ([name, value]) =>
      value === false &&
      [
        "customer_ordering",
        "new_reservations",
        "new_table_visits",
        "zidi",
      ].includes(name),
  );
  const delayedOrders = allowed("orders.view") ? list(data?.delayedOrders) : [];
  const parsedServerTime = Date.parse(data?.serverTime);
  const serverNow = Number.isFinite(parsedServerTime)
    ? parsedServerTime
    : Date.now();
  const entitlements = data?.entitlements || organization?.entitlements;
  const signOut = async () => {
    if (!onLogout) return;
    setLogoutBusy(true);
    setError("");
    try {
      await onLogout();
      window.dispatchEvent(new window.Event("mera:logout"));
      setLogoutConfirm(false);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLogoutBusy(false);
    }
  };
  const pendingFinancial = financialRequests.current.get(branchBase);
  const canResolveFinancial = permissions.some((permission: string) =>
    [
      "payments.record",
      "refunds.approve",
      "shifts.manage",
      "orders.fulfill",
    ].includes(permission),
  );
  const resolveFinancial = async () => {
    const current = pendingFinancial;
    if (!current) return;
    const epoch = scopeEpoch.current.generation;
    const authorization = authorizationEpoch.current;
    const result = await workspaceApi(
      branchBase +
        "/financial-requests/" +
        encodeURIComponent(current.body.requestKey),
    );
    if (
      epoch !== scopeEpoch.current.generation ||
      authorization !== authorizationEpoch.current
    )
      return;
    if (["recorded", "abandoned"].includes(result.status)) {
      removeFinancialIntent(
        confirmedPrincipal.current,
        organizationId,
        branchId,
      );
      pendingRequests.current.delete(
        current.path +
          JSON.stringify({ ...current.body, requestKey: undefined }),
      );
      financialRequests.current.delete(branchBase);
      setFinancialRevision((revision) => revision + 1);
      setTabForm({});
      await refresh();
      notify(
        result.status === "recorded"
          ? "The original financial submission is recorded. No second entry was created."
          : "The original request is fenced as abandoned. A delayed retry cannot create an entry.",
      );
    } else
      setError(
        "The original submission is not yet recorded. This does not prove it was rejected. Retry the unchanged original request to resolve it safely.",
      );
  };
  const fenceFinancial = async () => {
    const current = pendingFinancial;
    if (!current) return;
    const kind = financialKind(current.path, current.body);
    if (!kind)
      throw new Error("Original financial request type is not recognized.");
    const result = await mutate(
      branchBase +
        "/financial-requests/" +
        encodeURIComponent(current.body.requestKey) +
        "/abandon",
      "POST",
      { kind, reason: abandonReason },
      "Original financial request outcome verified.",
    );
    if (!["recorded", "abandoned"].includes(result.status))
      throw new Error(
        "No safe resolution was returned. The original request remains blocked.",
      );
    removeFinancialIntent(confirmedPrincipal.current, organizationId, branchId);
    pendingRequests.current.delete(
      current.path + JSON.stringify({ ...current.body, requestKey: undefined }),
    );
    financialRequests.current.delete(branchBase);
    setFinancialRevision((revision) => revision + 1);
    setTabForm({});
    setAbandonReason("");
    setAbandonConfirmed(false);
    setJournalWarning(false);
    notify(
      result.status === "recorded"
        ? "The original entry was already recorded and remains intact."
        : "The original request is abandoned and fenced against delayed retries. No posted funds were reversed.",
    );
  };
  const minimumSpendPolicy = data?.branch?.settings?.minimumSpendPolicy;
  const minimumSpendAck = minimumSpendPolicy?.enabled
    ? {
        minimumSpendAcknowledged:
          tabForm.minimumSpendAckVersion === minimumSpendPolicy.version,
        minimumSpendPolicyVersion: minimumSpendPolicy.version,
      }
    : {};
  const minimumSpendField = minimumSpendPolicy?.enabled ? (
    <div className="mw-wide mw-note">
      <strong>
        Minimum-spend terms: {formatMoney(minimumSpendPolicy.amount)}
      </strong>
      <p>{minimumSpendPolicy.disclosure}</p>
      <label className="mw-row">
        <span>
          The customer reviewed and accepted these disclosed minimum-spend
          terms.
        </span>
        <input
          type="checkbox"
          required
          checked={
            tabForm.minimumSpendAckVersion === minimumSpendPolicy.version
          }
          onChange={(event) =>
            updateForm(
              "minimumSpendAckVersion",
              event.target.checked ? minimumSpendPolicy.version : "",
            )
          }
        />
      </label>
    </div>
  ) : null;
  const captureVisitAccess = (visit: any) => {
    if (
      activeScope.current !== branchBase ||
      scopeEpoch.current.generation !== scopeVersion ||
      authorizationEpoch.current !== renderedAuthorizationVersion
    )
      return;
    if (
      typeof visit?.joiningCode !== "string" ||
      !visit.joiningCode ||
      visit.joiningCode.length > 80
    )
      return;
    setPrivateAccess({
      visit: {
        id: visit.id,
        displayName: visit.displayName,
        tableId: visit.tableId,
        tableName:
          visit.tableName ||
          list(data?.tables).find((table: any) => table.id === visit.tableId)
            ?.name,
        version: visit.version || 1,
        status: visit.status,
      },
      code: visit.joiningCode,
      uncertain: false,
    });
  };
  const rotateVisitAccess = async (reason: string) => {
    const visit = privateAccess?.visit;
    if (!visit) return;
    const current =
      list(data?.visits).find((row: any) => row.id === visit.id) || visit;
    setPrivateAccess({ visit: current, code: null, uncertain: true });
    const result = await mutate(
      branchBase + "/visits/" + visit.id + "/joining-code",
      "POST",
      { version: current.version || 1, reason },
      "Replacement private code generated. Existing guest sessions were retained.",
    );
    if (
      activeScope.current !== branchBase ||
      scopeEpoch.current.generation !== scopeVersion ||
      authorizationEpoch.current !== renderedAuthorizationVersion
    )
      return;
    if (typeof result.joiningCode !== "string" || !result.joiningCode)
      throw new Error("No current code was confirmed.");
    setPrivateAccess({
      visit: { ...current, version: result.version },
      code: result.joiningCode,
      uncertain: false,
    });
  };
  useEffect(() => {
    if (!privateAccess) return;
    const visit = list(data?.visits).find(
      (visit: any) => visit.id === privateAccess.visit.id,
    );
    if (visit?.status === "closed") setPrivateAccess(null);
    else if (
      visit &&
      privateAccess.code &&
      (visit.version || 1) !== (privateAccess.visit.version || 1)
    )
      setPrivateAccess({
        visit: {
          ...visit,
          tableName:
            visit.tableName ||
            list(data?.tables).find((table: any) => table.id === visit.tableId)
              ?.name,
        },
        code: null,
        uncertain: true,
      });
  }, [data?.visits, privateAccess?.visit.id]);
  const quoteIntent = JSON.stringify({
    menuVersion: data?.menuVersion,
    items: orderDraft.items,
  });
  const requiresQuote = !!data?.branch?.settings?.pricingPolicy?.enabled;
  const validQuote =
    !!staffQuote &&
    staffQuote.intent === quoteIntent &&
    new Date(staffQuote.quote.expiresAt).getTime() > serverNow &&
    staffQuote.quote.policyVersion ===
      (data?.branch?.settings?.pricingPolicy?.enabled
        ? data.branch.settings.pricingPolicy.version
        : null);
  const products = list(data?.products);
  const branch =
    data?.branch || branches.find((row: any) => row.id === branchId);

  return (
    <div
      className={
        "mera-workspace" +
        (["overview", "counter"].includes(activeSection)
          ? " mw-operational"
          : "")
      }
    >
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
          {["overview", "counter"].includes(activeSection) ? (
            <WorkspaceAccount
              name={context?.user?.name || user?.name || "Staff member"}
              role={sourceLabel(organization?.role)}
              disabled={busy}
              signingOut={logoutBusy}
              onSignOut={
                onLogout
                  ? () => {
                      if (
                        financialRequests.current.size ||
                        uncertainOrders.current.size
                      )
                        setLogoutConfirm(true);
                      else void signOut();
                    }
                  : undefined
              }
            />
          ) : (
            <>
              <div className="mw-staff-profile">
                <span className="mw-staff-avatar" aria-hidden="true">
                  {String(context?.user?.name || user?.name || "Staff")
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((name) => name[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <span>
                  {context?.user?.name || user?.name || "Staff member"}
                </span>
              </div>
              {onLogout && (
                <button
                  className="secondary"
                  disabled={busy || logoutBusy}
                  onClick={() => {
                    if (
                      financialRequests.current.size ||
                      uncertainOrders.current.size
                    )
                      setLogoutConfirm(true);
                    else void signOut();
                  }}
                >
                  {logoutBusy ? "Signing out…" : "Sign out"}
                </button>
              )}
            </>
          )}
          <button
            className="secondary"
            onClick={() => {
              accessDenied.current = false;
              void loadContext();
              void refresh();
            }}
            aria-label="Refresh workspace"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>
      {logoutConfirm && (
        <div className="mw-dialog-backdrop">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mw-signout-title"
            aria-describedby="mw-signout-detail"
            className="mw-card"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !logoutBusy)
                setLogoutConfirm(false);
              if (event.key === "Tab") {
                const buttons =
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  );
                const first = buttons[0],
                  last = buttons[buttons.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <h2 id="mw-signout-title">
              An original submission still needs resolution
            </h2>
            <p id="mw-signout-detail">
              Signing out clears this tab’s recovery details. It does not
              cancel, abandon or reverse the server request. Keep the session
              open to check its result, or make an explicit choice to sign out
              and arrange reconciliation.
            </p>
            <div className="mw-actions">
              <button
                autoFocus
                className="primary"
                disabled={logoutBusy}
                onClick={() => setLogoutConfirm(false)}
              >
                Keep this session open
              </button>
              <button
                className="secondary"
                disabled={logoutBusy}
                onClick={() => void signOut()}
              >
                Sign out and clear tab recovery
              </button>
            </div>
          </section>
        </div>
      )}
      <div className="mw-heading">
        <div>
          <div className="mw-eyebrow">
            {organization?.name || "Organization workspace"} /{" "}
            {branch?.name || "Choose a branch"}
          </div>
          <h1>
            {activeSection === "overview"
              ? "Branch overview."
              : activeSection === "counter"
                ? "The counter."
                : "A good service starts here."}
          </h1>
          <p>
            {activeSection === "overview" ? (
              "Today’s sales and service, in one place."
            ) : activeSection === "counter" ? (
              "Good things, made to order."
            ) : (
              <>
                Welcome, {user?.name || "team member"}. Keep every order,
                handoff and collection in view.
              </>
            )}
          </p>
        </div>
        <span className="mw-pill">{sourceLabel(organization?.role)}</span>
      </div>
      {error && (
        <div className="mw-note mw-error" role="alert">
          {offline && <WifiOff size={15} />} {error}
          <div className="mw-actions">
            <button
              className="secondary"
              onClick={() => {
                accessDenied.current = false;
                void refresh();
              }}
            >
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
      {!loading && !context && error && (
        <section className="mw-card">
          <h2>Workspace access unavailable</h2>
          <p>Refresh access to recheck your current session and permissions.</p>
          <button className="secondary" onClick={() => void loadContext()}>
            Refresh workspace access
          </button>
        </section>
      )}
      {!loading && context && !organizations.length && (
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
      {!!pausedServices.length && (
        <section role="status" className="mw-note">
          <strong>Some new services are paused</strong>
          <ul>
            {pausedServices.map(([name]) => (
              <li key={name}>
                {
                  (
                    {
                      customer_ordering: "New customer orders",
                      new_reservations: "New reservations",
                      new_table_visits: "New table visits",
                      zidi: "New Zidi integration access",
                    } as Record<string, string>
                  )[name]
                }
              </li>
            ))}
          </ul>
          <p>
            Continue handling existing paid service and current visits. History
            and permitted exports remain available.
          </p>
        </section>
      )}
      {!!delayedOrders.length && (
        <section role="status" className="mw-note">
          <strong>
            {delayedOrders.length} active{" "}
            {delayedOrders.length === 1 ? "order needs" : "orders need"}{" "}
            attention
          </strong>
          <p>
            These orders have been waiting longer than the server’s{" "}
            {data?.delayedOrderThresholdMinutes || 15}-minute threshold. Review
            the current handoffs with your branch team.
          </p>
          <ul>
            {delayedOrders.slice(0, 10).map((order: any) => (
              <li key={order.id}>
                {order.reference || String(order.id).slice(0, 8)} ·{" "}
                {order.ageMinutes} minutes
              </li>
            ))}
          </ul>
          {delayedOrders.length > 10 && (
            <p>{delayedOrders.length - 10} more delayed orders.</p>
          )}
          <button
            className="secondary"
            onClick={() => {
              setOrderFilters({
                query: "",
                status: "",
                source: "",
                payment: "",
                unassigned: false,
              });
              setSection("orders");
            }}
          >
            Review branch orders
          </button>
        </section>
      )}
      {entitlements?.warning && (
        <div role="status" className="mw-note">
          <strong>Subscription attention</strong>
          <p>
            {["overview", "counter"].includes(activeSection) &&
            entitlements.warning === "Development trial duration is unresolved."
              ? "Trial end date needs review."
              : entitlements.warning}
          </p>
          {entitlements.restrictionAt && (
            <p>
              Configured restriction time:{" "}
              {dateLabel(entitlements.restrictionAt)}
            </p>
          )}
          {allowed("billing.manage") && (
            <button className="secondary" onClick={() => setSection("billing")}>
              Review subscription
            </button>
          )}
        </div>
      )}
      {pendingFinancial && canResolveFinancial && data && (
        <div role="status" className="mw-note">
          <strong>
            {pendingFinancial.restored
              ? "Restored unconfirmed financial submission"
              : "Financial submission not confirmed"}
          </strong>
          <details>
            <summary>Review original intended entry</summary>
            <dl>
              <dt>Entry type</dt>
              <dd>
                {financialKind(
                  pendingFinancial.path,
                  pendingFinancial.body,
                )?.replaceAll("_", " ")}
              </dd>
              {pendingFinancial.body.amount !== undefined && (
                <>
                  <dt>Amount</dt>
                  <dd>{formatMoney(pendingFinancial.body.amount)}</dd>
                </>
              )}
              {pendingFinancial.body.quantity !== undefined && (
                <>
                  <dt>Item quantity</dt>
                  <dd>{pendingFinancial.body.quantity}</dd>
                </>
              )}
              {pendingFinancial.body.method && (
                <>
                  <dt>Manual payment method</dt>
                  <dd>{sourceLabel(pendingFinancial.body.method)}</dd>
                </>
              )}
              {pendingFinancial.body.reference && (
                <>
                  <dt>Manual reference</dt>
                  <dd>{pendingFinancial.body.reference}</dd>
                </>
              )}
              {pendingFinancial.body.reason && (
                <>
                  <dt>Reason</dt>
                  <dd>{pendingFinancial.body.reason}</dd>
                </>
              )}
              <dt>Recovery request ID</dt>
              <dd style={{ overflowWrap: "anywhere" }}>
                {pendingFinancial.body.requestKey}
              </dd>
            </dl>
          </details>
          {journalWarning && (
            <p>
              This tab could not save recovery details. Keep it open until the
              original result is resolved.
            </p>
          )}
          <p>
            This session has an unresolved financial action for this branch.
            Changes to its amount, reference or target and other financial
            submissions from this session are blocked until the original result
            is known. No new entry is created automatically.
          </p>
          <div className="mw-actions">
            <button
              disabled={busy || offline}
              onClick={() =>
                void mutate(
                  pendingFinancial.path,
                  pendingFinancial.method,
                  pendingFinancial.body,
                  "Original financial submission confirmed.",
                )
                  .then(() => setTabForm({}))
                  .catch(() => {})
              }
            >
              Retry original financial submission
            </button>
            <button
              disabled={busy || offline}
              onClick={() =>
                void resolveFinancial().catch((error) => {
                  if (
                    activeScope.current === branchBase &&
                    scopeEpoch.current.generation === scopeVersion
                  )
                    setError(error.message);
                })
              }
            >
              Check original financial record
            </button>
          </div>
          <details>
            <summary>
              Resolve an original request that should no longer post
            </summary>
            <p>
              The server checks the original request under a lock. If already
              recorded, its entry remains intact. Otherwise a durable fence
              prevents delayed retries from posting. This never reverses a
              recorded payment or refund.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void fenceFinancial().catch((error) => {
                  if (
                    activeScope.current === branchBase &&
                    scopeEpoch.current.generation === scopeVersion
                  )
                    setError(error.message);
                });
              }}
            >
              <label>
                Resolution reason
                <input
                  required
                  minLength={3}
                  maxLength={300}
                  value={abandonReason}
                  onChange={(event) => setAbandonReason(event.target.value)}
                />
              </label>
              <label className="mw-row">
                <span>
                  I want to prevent the unresolved original request from posting
                  if it is not already recorded.
                </span>
                <input
                  type="checkbox"
                  required
                  checked={abandonConfirmed}
                  onChange={(event) =>
                    setAbandonConfirmed(event.target.checked)
                  }
                />
              </label>
              <button disabled={busy || offline || !abandonConfirmed}>
                Fence original request or confirm its recorded result
              </button>
            </form>
          </details>
        </div>
      )}
      {!!organizations.length && (
        <>
          {["overview", "counter"].includes(activeSection) ? (
            <WorkspaceNavigation
              sections={visibleSections}
              active={activeSection}
              onSelect={setSection}
              organization={organization?.name || "Organization"}
              branch={branch?.name || "Choose a branch"}
            />
          ) : (
            <nav className="mw-navigation" aria-label="Organization workspace">
              <div className="mw-nav-tools">
                <label>
                  All workspace pages
                  <select
                    aria-label="Workspace page"
                    value={activeSection}
                    onChange={(event) => setSection(event.target.value)}
                  >
                    {visibleSections.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mw-actions">
                  <button
                    type="button"
                    aria-label="Scroll workspace pages left"
                    onClick={() =>
                      tabsRef.current?.scrollBy?.({
                        left: -300,
                        behavior: "smooth",
                      })
                    }
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label="Scroll workspace pages right"
                    onClick={() =>
                      tabsRef.current?.scrollBy?.({
                        left: 300,
                        behavior: "smooth",
                      })
                    }
                  >
                    →
                  </button>
                </div>
              </div>
              <div
                role="tablist"
                aria-label="Workspace pages"
                className="mw-tabs"
                ref={tabsRef}
              >
                {visibleSections.map(([id, name], index) => (
                  <button
                    key={id}
                    id={"mw-tab-" + id}
                    type="button"
                    role="tab"
                    aria-controls="mw-workspace-panel"
                    tabIndex={activeSection === id ? 0 : -1}
                    aria-selected={activeSection === id}
                    onClick={() => setSection(id)}
                    onKeyDown={(event) => {
                      let target: number;
                      if (event.key === "ArrowRight")
                        target = (index + 1) % visibleSections.length;
                      else if (event.key === "ArrowLeft")
                        target =
                          (index - 1 + visibleSections.length) %
                          visibleSections.length;
                      else if (event.key === "Home") target = 0;
                      else if (event.key === "End")
                        target = visibleSections.length - 1;
                      else return;
                      event.preventDefault();
                      setSection(visibleSections[target][0]);
                      const element =
                        tabsRef.current?.querySelectorAll<HTMLButtonElement>(
                          '[role="tab"]',
                        )[target];
                      element?.focus();
                      element?.scrollIntoView?.({
                        block: "nearest",
                        inline: "nearest",
                      });
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </nav>
          )}
          {!data ? (
            <div className="mw-card" role="status">
              {branchId
                ? "Loading branch records…"
                : "No branch is available for this membership."}
            </div>
          ) : (
            <main
              id="mw-workspace-panel"
              role="tabpanel"
              aria-labelledby={"mw-tab-" + activeSection}
              tabIndex={0}
            >
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
                  newAccessAllowed={features?.flags?.zidi !== false}
                />
              )}
              {activeSection === "onboarding" && (
                <>
                  <LaunchReadiness
                    key={branchBase + "launch"}
                    base={branchBase}
                    settings={branch?.settings}
                    disabled={busy || offline}
                    save={mutate}
                  />
                  <ReservationPolicy
                    key={branchBase + "reservation-policy"}
                    base={branchBase}
                    policy={branch?.settings?.reservationPolicy}
                    disabled={busy || offline}
                    save={mutate}
                  />
                </>
              )}
              {activeSection === "onboarding" && (
                <PricingPolicy
                  key={branchBase + "pricing"}
                  base={branchBase}
                  policy={branch?.settings?.pricingPolicy}
                  disabled={busy || offline}
                  save={mutate}
                />
              )}
              {activeSection === "help" && (
                <HelpRequests
                  key={branchBase}
                  base={branchBase}
                  permissions={permissions}
                  disabled={busy || offline}
                  save={mutate}
                />
              )}
              {activeSection === "onboarding" && (
                <MinimumSpendPolicy
                  key={branchBase + "minimum-spend-policy"}
                  base={branchBase}
                  policy={minimumSpendPolicy}
                  disabled={busy || offline}
                  save={mutate}
                />
              )}
              {privateAccess &&
                ["tables", "reservations"].includes(activeSection) && (
                  <PrivateVisitAccess
                    key={branchBase + privateAccess.visit.id}
                    visit={privateAccess.visit}
                    code={privateAccess.code}
                    uncertain={privateAccess.uncertain}
                    disabled={busy || offline}
                    canRotate={allowed("tables.manage")}
                    onClear={() => setPrivateAccess(null)}
                    onRotate={rotateVisitAccess}
                    onRefresh={refresh}
                  />
                )}
              {activeSection === "support" &&
                allowed("organization.manage") &&
                organization?.organizationWide === true && (
                  <SupportCases
                    key={organizationId}
                    organizationId={organizationId}
                    branches={branches}
                    disabled={busy || offline}
                    save={mutate}
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
                <Reconciliation
                  key={branchBase + "reconciliation"}
                  base={branchBase}
                  orders={liveOrders}
                  demo={!!context?.demo}
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
                <OperationalOverview
                  data={data}
                  orders={liveOrders}
                  base={branchBase}
                  disabled={busy || offline}
                  canCreate={allowed("orders.create")}
                  canViewOrders={allowed("orders.view")}
                  onNavigate={setSection}
                />
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
                  <Categories
                    key={branchBase + "categories"}
                    base={branchBase}
                    disabled={busy || offline}
                    save={mutate}
                    onCategories={(rows) => {
                      if (
                        activeScope.current === branchBase &&
                        scopeEpoch.current.generation === scopeVersion &&
                        authorizationEpoch.current ===
                          renderedAuthorizationVersion
                      )
                        setCategories(rows);
                    }}
                  />
                  <CatalogOperations
                    key={branchBase + "catalog-operations"}
                    base={branchBase}
                    products={products}
                    alerts={list(data.lowStockAlerts)}
                    disabled={busy || offline}
                    save={mutate}
                  />
                  {allowed("stock.adjust") && (
                    <StockMovements
                      key={branchBase}
                      base={branchBase}
                      products={products}
                      disabled={busy || offline}
                      save={mutate}
                    />
                  )}
                </>
              )}
              {activeSection === "menu" && (
                <SharedMenus
                  key={branchBase}
                  organizationId={organizationId}
                  base={branchBase}
                  products={products}
                  categories={categories}
                  disabled={busy || offline}
                  canPublish={allowed("menu.publish")}
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
                                  const variant = document.getElementById(
                                    "variant-" + product.id,
                                  ) as HTMLSelectElement | null;
                                  await mutate(
                                    branchBase + "/stock",
                                    "POST",
                                    {
                                      productId: product.id,
                                      ...(variant?.value
                                        ? { variantId: variant.value }
                                        : {}),
                                      quantity: Number(form.value),
                                      reason: reason.value,
                                    },
                                    "Stock balance updated.",
                                  );
                                })}
                                className="mw-actions"
                              >
                                {!!product.variants?.length && (
                                  <select
                                    aria-label={
                                      "Stock target for " + product.name
                                    }
                                    id={"variant-" + product.id}
                                  >
                                    <option value="">Product balance</option>
                                    {product.variants.map((variant: any) => (
                                      <option
                                        key={variant.id}
                                        value={variant.id}
                                      >
                                        {variant.name} ·{" "}
                                        {variant.stockMode === "counted"
                                          ? (variant.stock || 0) + " in stock"
                                          : "unlimited"}
                                      </option>
                                    ))}
                                  </select>
                                )}
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
                            imagePreview,
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
                          Structured category
                          <select
                            value={productEdit.categoryId || ""}
                            onChange={(event) => {
                              const category = categories.find(
                                (row) => row.id === event.target.value,
                              );
                              setProductEdit({
                                ...productEdit,
                                categoryId: event.target.value || null,
                                ...(category
                                  ? {
                                      category: category.name,
                                      categoryPath: categoryPath(
                                        category,
                                        categories,
                                      ),
                                    }
                                  : {}),
                              });
                            }}
                          >
                            <option value="">Use existing text category</option>
                            {categories
                              .filter((category) => category.active)
                              .map((category) => (
                                <option key={category.id} value={category.id}>
                                  {categoryPath(category, categories)}
                                </option>
                              ))}
                          </select>
                        </label>
                        {!productEdit.categoryId && (
                          <>
                            <label>
                              Category
                              <input
                                required
                                value={productEdit.category || ""}
                                onChange={(event) =>
                                  setProductEdit({
                                    ...productEdit,
                                    category: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              Parent category
                              <input
                                value={productEdit.parentCategory || ""}
                                onChange={(event) =>
                                  setProductEdit({
                                    ...productEdit,
                                    parentCategory: event.target.value || null,
                                  })
                                }
                              />
                            </label>
                          </>
                        )}
                        <label>
                          Low-stock alert threshold
                          <input
                            required
                            type="number"
                            min={0}
                            max={1000000}
                            step={1}
                            value={productEdit.lowStockThreshold ?? 5}
                            onChange={(event) =>
                              setProductEdit({
                                ...productEdit,
                                lowStockThreshold: Number(event.target.value),
                              })
                            }
                          />
                        </label>
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
                            disabled={!!productEdit.id}
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
                        <div className="mw-wide">
                          <h3>Product photo</h3>
                          {productEdit.image && (
                            <img
                              alt="Selected product"
                              style={{
                                width: 160,
                                height: 160,
                                objectFit: "cover",
                                borderRadius: 12,
                              }}
                              src={
                                productEdit.imagePreview ||
                                productEdit.image.replace(
                                  "/api/mera/v1/public/assets/",
                                  "/api/mera/v1" + branchBase + "/assets/",
                                )
                              }
                            />
                          )}
                          <MediaUpload
                            endpoint={"/api/mera/v1" + branchBase + "/assets"}
                            disabled={busy || offline}
                            onUploaded={(asset) =>
                              setProductEdit((current) =>
                                current
                                  ? {
                                      ...current,
                                      image: asset.url,
                                      imagePreview: asset.previewUrl,
                                    }
                                  : current,
                              )
                            }
                          />
                        </div>
                        <details className="mw-wide">
                          <summary>
                            Sizes, modifier groups & dietary information
                          </summary>
                          <p className="mw-muted">
                            Configure sizes, add-ons and dietary details. Prices
                            are entered in naira; the server validates selection
                            limits and final totals.
                          </p>
                          <VariantsEditor
                            value={productEdit.variants || []}
                            onChange={(variants) =>
                              setProductEdit({
                                ...productEdit,
                                variants,
                                variantsJson: undefined,
                              })
                            }
                          />
                          <TimeWindows
                            label="Product availability schedule"
                            value={productEdit.availabilityWindows || []}
                            onChange={(availabilityWindows) =>
                              setProductEdit({
                                ...productEdit,
                                availabilityWindows,
                              })
                            }
                          />
                          <ModifierGroupsEditor
                            value={productEdit.modifierGroups || []}
                            disabled={busy || offline}
                            onChange={(modifierGroups) =>
                              setProductEdit({
                                ...productEdit,
                                modifierGroups,
                                modifierGroupsJson: undefined,
                              })
                            }
                          />
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
              {activeSection === "preparation" && (
                <Tickets
                  key={branchBase}
                  base={branchBase}
                  tickets={list(data.tickets)}
                  stationScope={
                    ["kitchen", "bar"].includes(organization?.role)
                      ? organization.role
                      : undefined
                  }
                  orders={liveOrders}
                  disabled={busy || offline}
                  save={mutate}
                />
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
                    {activeSection === "orders" && (
                      <>
                        <p className="mw-note">
                          {data.history?.bounded
                            ? `The live view contains active orders and up to ${data.history.recentOrderLimit} recent orders, plus records needed for current service.`
                            : "This live view is an operational snapshot."}{" "}
                          Browse bounded history pages for older and imported
                          records.
                        </p>
                        <details
                          open={historyOpen}
                          onToggle={(event) =>
                            setHistoryOpen(event.currentTarget.open)
                          }
                        >
                          <summary>Browse full order history</summary>
                          {historyOpen && (
                            <OrderHistory
                              key={branchBase}
                              base={branchBase}
                              disabled={busy}
                              staffChoices={Array.from(
                                new Map(
                                  [
                                    user,
                                    ...liveOrders.flatMap((order: any) => [
                                      {
                                        id: order.handlerId,
                                        name: order.handlerName,
                                      },
                                      {
                                        id: order.staffCreatorId,
                                        name:
                                          order.staffCreatorName ||
                                          order.actorName,
                                      },
                                    ]),
                                  ]
                                    .filter((person) => person.id)
                                    .map((person) => [
                                      person.id,
                                      {
                                        userId: person.id,
                                        name: person.name || person.id,
                                      },
                                    ]),
                                ).values(),
                              )}
                            />
                          )}
                        </details>
                      </>
                    )}
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
                                <OrderInstructions order={order} />
                                {list(order.items).map(
                                  (line: any, index: number) => (
                                    <div key={line.orderLineId || index}>
                                      <small>
                                        {line.quantity} ×{" "}
                                        {line.name || line.productName}
                                        {line.size ? " · " + line.size : ""}
                                      </small>
                                      <OrderInstructions item={line} />
                                    </div>
                                  ),
                                )}
                                {order.historicalReadOnly && (
                                  <div className="mw-note">
                                    <strong>
                                      Imported source history · read only
                                    </strong>
                                    <p>
                                      Original source status:{" "}
                                      {sourceLabel(
                                        order.legacyStatus || order.status,
                                      )}
                                      .{" "}
                                      {(order.historicalRecognitionBasis ||
                                        order.recognitionBasis) &&
                                        "Recognition basis: " +
                                          sourceLabel(
                                            order.historicalRecognitionBasis ||
                                              order.recognitionBasis,
                                          ) +
                                          "."}{" "}
                                      {order.historicalTaxStatus &&
                                        "Historical tax: " +
                                          sourceLabel(
                                            order.historicalTaxStatus,
                                          ) +
                                          "."}{" "}
                                      This record does not create a live bill,
                                      stock hold or preparation ticket.
                                    </p>
                                  </div>
                                )}
                                {Number.isSafeInteger(order.writtenOff) &&
                                  order.writtenOff > 0 && (
                                    <small>
                                      Non-cash written-off debt:{" "}
                                      {formatMoney(order.writtenOff)} ·
                                      Outstanding:{" "}
                                      {formatMoney(order.outstandingBalance)}
                                    </small>
                                  )}
                                {!order.historicalReadOnly &&
                                  allowed("refunds.approve") && (
                                    <WriteOff
                                      key={
                                        branchBase +
                                        order.id +
                                        financialRevision +
                                        "writeoff"
                                      }
                                      base={branchBase}
                                      order={order}
                                      disabled={busy || offline}
                                      save={mutate}
                                    />
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
                                {!order.historicalReadOnly &&
                                  allowed("orders.fulfill") && (
                                    <ItemFulfillment
                                      key={branchBase + order.id}
                                      base={branchBase}
                                      order={order}
                                      tickets={list(data.tickets)}
                                      disabled={busy || offline}
                                      save={mutate}
                                    />
                                  )}
                                {!order.historicalReadOnly &&
                                  allowed("orders.fulfill") && (
                                    <ItemCancellation
                                      key={
                                        branchBase +
                                        order.id +
                                        financialRevision
                                      }
                                      base={branchBase}
                                      order={order}
                                      refunds={list(data.refunds)}
                                      canRefund={allowed("refunds.approve")}
                                      tickets={list(data.tickets)}
                                      disabled={busy || offline}
                                      save={mutate}
                                    />
                                  )}
                              </div>
                              <div className="mw-actions">
                                <span className="mw-pill">
                                  {sourceLabel(order.status)}
                                </span>
                                {!order.historicalReadOnly &&
                                  nextState[order.status] &&
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
                                {!order.historicalReadOnly &&
                                  button(
                                    "Assign to me",
                                    () =>
                                      act(
                                        branchBase +
                                          `/orders/${order.id}/assign`,
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
                  {activeSection === "orders" &&
                    (allowed("refunds.request") ||
                      allowed("refunds.approve")) && (
                      <RefundRequests
                        key={branchBase + financialRevision}
                        base={branchBase}
                        userId={user.id}
                        orders={list(data.orders)}
                        canRequest={allowed("refunds.request")}
                        canApprove={allowed("refunds.approve")}
                        disabled={busy || offline}
                        save={mutate}
                      />
                    )}
                </>
              )}
              {activeSection === "counter" && allowed("orders.create") && (
                <section className="mw-pos-container">
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
                      <StaffPos
                        key={branchBase}
                        products={products}
                        lines={orderDraft.items}
                        disabled={busy || offline || !!uncertainOrder}
                        staffName={user?.name || "Staff"}
                        useBingChunAssets={organization?.slug === "bing-chun"}
                        onChange={(items) => {
                          requestKey.current = null;
                          setOrderDraft({ ...orderDraft, items });
                        }}
                        details={
                          <>
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
                          </>
                        }
                      >
                        <button
                          type="button"
                          className="secondary"
                          disabled={
                            busy ||
                            offline ||
                            !orderDraft.items.length ||
                            !data.menuVersion
                          }
                          onClick={() => {
                            const intent = quoteIntent;
                            void mutate(
                              branchBase + "/quote",
                              "POST",
                              {
                                menuVersion: data.menuVersion,
                                items: orderDraft.items,
                              },
                              "Order quote prepared. No order was placed.",
                            )
                              .then((quote) => setStaffQuote({ intent, quote }))
                              .catch(() => {});
                          }}
                        >
                          Review current order total
                        </button>
                        {staffQuote && (
                          <div className="mw-note">
                            <strong>
                              {validQuote
                                ? "Reviewed order total"
                                : "Quote changed or expired · review again"}
                            </strong>
                            <div className="mw-row">
                              <span>Items</span>
                              <b>{formatMoney(staffQuote.quote.subtotal)}</b>
                            </div>
                            {list(staffQuote.quote.lines).map(
                              (line: any, index: number) => (
                                <div className="mw-row" key={index}>
                                  <span>{line.label}</span>
                                  <b>{formatMoney(line.amount)}</b>
                                </div>
                              ),
                            )}
                            <div className="mw-row">
                              <strong>Total</strong>
                              <strong>
                                {formatMoney(staffQuote.quote.total)}
                              </strong>
                            </div>
                          </div>
                        )}
                        <div className="mw-note">
                          Payment is recorded separately after the order is
                          submitted.
                        </div>
                        <button
                          className="primary"
                          disabled={
                            busy ||
                            offline ||
                            !orderDraft.items.length ||
                            !data.menuVersion ||
                            entitlements?.newOrdersAllowed === false ||
                            (requiresQuote && !validQuote)
                          }
                        >
                          Submit order
                        </button>
                      </StaffPos>
                    </fieldset>
                    {uncertainOrder && (
                      <div className="mw-note" role="status">
                        <strong>Submission not confirmed</strong>
                        <p>
                          This draft is locked while its original request is
                          unresolved. Check the queue or retry the exact same
                          submission with its original request key.
                        </p>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void checkStaffOrder().catch((e) => {
                              if (
                                activeScope.current === branchBase &&
                                scopeEpoch.current.generation === scopeVersion
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
                          onClick={() => void sendStaffOrder().catch(() => {})}
                        >
                          Retry original submission
                        </button>
                      </div>
                    )}
                  </form>
                </section>
              )}

              {activeSection === "tables" && (
                <>
                  <FloorMap
                    key={branchBase}
                    tables={list(data.tables)}
                    base={branchBase}
                    disabled={busy || offline}
                    save={mutate}
                  />
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
                            held={list(data.visits).some(
                              (visit: any) =>
                                visit.status === "open" &&
                                (visit.tableIds || [visit.tableId]).includes(
                                  table.id,
                                ),
                            )}
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
                          {visit.minimumSpendPolicy?.enabled && (
                            <VisitMinimumSpend
                              key={branchBase + visit.id + "minimum"}
                              base={branchBase}
                              visitId={visit.id}
                              updatedKey={
                                String(visit.version || 1) +
                                liveOrders
                                  .map(
                                    (order: any) =>
                                      order.id + ":" + order.version,
                                  )
                                  .join("|")
                              }
                              disabled={busy || offline}
                              canWaive={allowed("refunds.approve")}
                              save={mutate}
                            />
                          )}
                          {visit.status === "open" && (
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                setPrivateAccess({
                                  visit: {
                                    ...visit,
                                    tableName:
                                      visit.tableName ||
                                      list(data.tables).find(
                                        (table: any) =>
                                          table.id === visit.tableId,
                                      )?.name,
                                  },
                                  code: null,
                                  uncertain: false,
                                })
                              }
                            >
                              Private access for this party
                            </button>
                          )}
                          {visit.status === "open" && (
                            <VisitTables
                              base={branchBase}
                              visit={visit}
                              tables={list(data.tables)}
                              visits={list(data.visits)}
                              disabled={busy || offline}
                              save={mutate}
                            />
                          )}
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
                      onSubmit={submit(async () => {
                        setPrivateAccess(null);
                        const visit = await mutate(
                          branchBase + "/visits",
                          "POST",
                          {
                            tableId: tabForm.tableId,
                            displayName: tabForm.visitName,
                            ...minimumSpendAck,
                          },
                          "Visit opened.",
                        );
                        captureVisitAccess(visit);
                      })}
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
                      {minimumSpendField}
                      <div className="mw-wide">
                        <button
                          className="primary"
                          disabled={
                            busy ||
                            offline ||
                            features?.flags?.new_table_visits === false
                          }
                        >
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
                  key={branchBase + financialRevision}
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
                      {allowed("refunds.approve") && (
                        <DepositOutcomes
                          key={
                            branchBase +
                            reservation.id +
                            financialRevision +
                            "deposit-outcome"
                          }
                          base={branchBase}
                          reservation={reservation}
                          deposits={list(data.deposits).filter(
                            (deposit: any) =>
                              deposit.reservationId === reservation.id,
                          )}
                          disabled={busy || offline}
                          canManage={allowed("refunds.approve")}
                          save={mutate}
                        />
                      )}
                      <ReservationSettlement
                        key={branchBase + reservation.id + financialRevision}
                        reservation={reservation}
                        onVisitOpening={() => {
                          if (
                            activeScope.current === branchBase &&
                            scopeEpoch.current.generation === scopeVersion
                          )
                            setPrivateAccess(null);
                        }}
                        onVisitOpened={(visit) => {
                          if (
                            activeScope.current === branchBase &&
                            scopeEpoch.current.generation === scopeVersion &&
                            authorizationEpoch.current ===
                              renderedAuthorizationVersion
                          )
                            captureVisitAccess(visit);
                        }}
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
                          ...minimumSpendAck,
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
                    {minimumSpendField}
                    <div className="mw-wide">
                      <button
                        className="primary"
                        disabled={
                          busy ||
                          offline ||
                          features?.flags?.new_reservations === false
                        }
                      >
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
                        {liveOrders.map((order) => (
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
                          {liveOrders.map((order) => (
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
                      <ShiftActions
                        base={branchBase}
                        shift={shift}
                        canApprove={allowed("organization.manage")}
                        disabled={busy || offline}
                        save={mutate}
                      />
                      {shift.status === "open" && (
                        <CashMovement
                          key={branchBase + shift.id + financialRevision}
                          base={branchBase}
                          shiftId={shift.id}
                          disabled={busy || offline}
                          save={mutate}
                        />
                      )}
                      {shift.status === "open" && (
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
                          const authorizationVersion =
                            authorizationEpoch.current;
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
                                scopeEpoch.current.generation ===
                                  scopeVersion &&
                                authorizationEpoch.current ===
                                  authorizationVersion
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
                  <RoleManager
                    key={branchBase}
                    organizationId={organizationId}
                    branchId={branchId}
                    permissions={permissions}
                    canGrantOwner={organization?.role === "owner"}
                    onAccessChanged={() => void loadContext(true)}
                    disabled={busy || offline}
                    save={mutate}
                  />
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
        {["overview", "counter"].includes(activeSection)
          ? "Mera workspace · Changes require a connection."
          : "Mera development workspace · Canonical server state refreshes every 2.5 seconds. Offline actions are not queued or assumed successful."}
      </footer>
    </div>
  );
}
