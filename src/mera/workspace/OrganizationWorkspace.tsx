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
import BusinessDetails from "./BusinessDetails";
import BranchAdministration from "./BranchAdministration";
import MenuManagement from "./MenuManagement";
import { catalogPriceLabel } from "./catalogPresentation";
import MenuPublication from "./MenuPublication";
import { ProductImage } from "../../ProductImage";
import SetupChecklist from "./SetupChecklist";
import RefundRequests from "./RefundRequests";
import StaffPos from "./StaffPos";
import { validateStaffSelection } from "./staffSelection";
import PosOrderContext from "./PosOrderContext";
import WorkspaceNavigation from "./WorkspaceNavigation";
import { chooseWorkspaceLanding, getSectionPresentation } from "./presentation";
import WorkspaceAccount from "./WorkspaceAccount";
import OperationalOverview from "./OperationalOverview";
import PolicyEditor from "./PolicyEditor";
import BillingManagement from "./BillingManagement";
import LiveOrderCard, {
  orderStatusLabel,
  paymentStatusLabel,
} from "./LiveOrderCard";
import { Disclosure } from "../ui/OperationalPrimitives";
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
import ServiceAttention from "./ServiceAttention";
import TableServiceView from "./TableServiceView";
import NonReplayForm from "./NonReplayForm";
import { PaymentRecords, ShiftRecord } from "./FinanceRecords";
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
  const [sectionSelection, setSectionSelection] = useState<{
    section: string;
    scopeKey: string;
  } | null>(null);
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
  const [writeError, setError] = useState("");
  const [readError, setReadError] = useState("");
  const error = writeError || readError;
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [productEdit, setProductEdit] = useState<RecordData | null>(null);
  const productEditorRef = useRef<HTMLElement | null>(null);
  const productEditorTrigger = useRef<HTMLElement | null>(null);
  const beginProductEdit = (product: RecordData) => {
    productEditorTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setProductEdit(product);
  };
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
  const activeScope = useRef("");
  const contextGeneration = useRef(0);
  const permissionFingerprint = useRef("");
  const accessDenied = useRef(false);
  const authorizationEpoch = useRef(0);
  const renderedAuthorizationVersion = authorizationEpoch.current;
  const lastDenialCheck = useRef(0);
  const mutationGeneration = useRef(0);
  const branchBase = `/organizations/${encodeURIComponent(organizationId)}/branches/${encodeURIComponent(branchId)}`;
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
  const navigationScope = JSON.stringify([
    context?.user?.id || principal,
    organizationId,
    branchId,
  ]);
  const activeSection =
    chooseWorkspaceLanding({
      role: organization?.role,
      permissions,
      visibleSectionIds: visibleSections.map(([id]) => id),
      organizationWide: organization?.organizationWide === true,
      scopeKey: navigationScope,
      selection: sectionSelection,
    }) || "";
  const selectSection = (section: string) => {
    if (visibleSections.some(([id]) => id === section))
      setSectionSelection({ section, scopeKey: navigationScope });
  };
  const pagePresentation = getSectionPresentation(activeSection);
  useEffect(() => {
    if (!productEdit) {
      if (productEditorTrigger.current?.isConnected)
        productEditorTrigger.current.focus();
      productEditorTrigger.current = null;
      return;
    }
    const input = productEditorRef.current?.querySelector<HTMLInputElement>(
      "input:not(:disabled)",
    );
    input?.focus();
    input?.scrollIntoView?.({ block: "center", behavior: "instant" });
  }, [!!productEdit, productEdit?.id, branchBase]);
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
    setError("");
    setReadError("");
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
        setReadError("");
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
        if (!accessDenied.current) setReadError("");
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
        setReadError((e as Error).message);
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
    setError("");
    setReadError("");
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
        setReadError("");
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
          setReadError((e as Error).message);
          setOffline(true);
        }
      }
    },
    [organizationId, branchId, branchBase, scopeVersion],
  );
  useEffect(() => {
    accessDenied.current = false;
    setPrivateAccess(null);
    setError("");
    setReadError("");
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
    if (
      activeSection === "team" &&
      organizationId &&
      allowed("members.manage")
    ) {
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
            setReadError(e.message);
        });
      return () => controller.abort();
    }
  }, [activeSection, organizationId, branchBase]);
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
    if (!uncertainOrder && (requiresQuote || !!staffQuote) && !validQuote) {
      setError("Review the total again before submitting this order.");
      return;
    }
    if (
      !uncertainOrder &&
      (!Array.isArray(data?.counterProducts) ||
        !validateStaffSelection(data.counterProducts, orderDraft.items)
          .complete)
    ) {
      setError("Complete the item selections before submitting this order.");
      return;
    }
    const scope = branchBase;
    requestKey.current ||= uuid();
    const resolvingUncertain = !!uncertainOrder;
    const body = uncertainOrder || {
      ...orderDraft,
      displayName:
        String(orderDraft.displayName || "").trim() || "Walk-in customer",
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
        (resolvingUncertain ||
          !error.status ||
          [401, 403, 404, 408, 429].includes(error.status) ||
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
    step?: number,
  ) => (
    <label>
      {label}
      <input
        type={type}
        step={step}
        min={step ? 0 : undefined}
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
          : "The original request was stopped. A delayed retry cannot create an entry.",
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
        : "The original request was stopped. No recorded payment or refund was reversed.",
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
  const counterMenuAvailable = Array.isArray(data?.counterProducts);
  const counterProducts = counterMenuAvailable ? data?.counterProducts : [];
  const staffSelection = validateStaffSelection(
    counterProducts,
    orderDraft.items,
  );
  const branch =
    data?.branch || branches.find((row: any) => row.id === branchId);

  return (
    <div className="mera-workspace mw-operational">
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
          <WorkspaceAccount
            name={context?.user?.name || user?.name || "Staff member"}
            role={sourceLabel(organization?.role)}
            disabled={busy}
            signingOut={logoutBusy}
            notice={
              allowed("billing.manage") &&
              entitlements?.warning ===
                "Development trial duration is unresolved." &&
              entitlements.newOrdersAllowed !== false
                ? {
                    message: "Trial end date needs review.",
                    label: "Review subscription",
                    onReview: () => selectSection("billing"),
                  }
                : undefined
            }
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
              Signing out clears this tab’s recovery details. It does not cancel
              a submission or reverse a recorded transaction. Keep this tab open
              to check its result, or make an explicit choice to sign out and
              arrange reconciliation.
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
                : pagePresentation.title}
          </h1>
          <p>
            {activeSection === "overview"
              ? "Today’s sales and service, in one place."
              : activeSection === "counter"
                ? "Good things, made to order."
                : pagePresentation.description}
          </p>
        </div>
        <span className="mw-pill">{sourceLabel(organization?.role)}</span>
      </div>
      {error && (
        <div className="mw-note mw-error" role="alert">
          {offline && <WifiOff size={15} />} {error}
          {writeError && readError && (
            <p>Records could not be refreshed: {readError}</p>
          )}
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
            {writeError && (
              <button
                type="button"
                className="secondary"
                onClick={() => setError("")}
              >
                Dismiss message
              </button>
            )}
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
            The requested address must be available and verified before
            publication. Creating a development organization does not publish a
            hosted site or activate a wallet.
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
      <ServiceAttention
        orders={delayedOrders}
        threshold={data?.delayedOrderThresholdMinutes}
        onReview={() => {
          setOrderFilters({
            query: "",
            status: "",
            source: "",
            payment: "",
            unassigned: false,
          });
          selectSection("orders");
        }}
      />
      {entitlements?.warning &&
        !(
          entitlements.warning ===
            "Development trial duration is unresolved." &&
          entitlements.newOrdersAllowed !== false
        ) && (
          <div role="status" className="mw-note">
            <strong>Subscription attention</strong>
            <p>
              {entitlements.warning ===
              "Development trial duration is unresolved."
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
              <button
                className="secondary"
                onClick={() => selectSection("billing")}
              >
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
              We will check whether this request was recorded. If it was, its
              entry stays unchanged. Otherwise, it will be stopped so that a
              delayed retry cannot record it. This does not reverse a recorded
              payment or refund.
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
                Resolve original request
              </button>
            </form>
          </details>
        </div>
      )}
      {!!organizations.length && (
        <>
          {branchId && branches.some((row: any) => row.id === branchId) && (
            <WorkspaceNavigation
              sections={visibleSections}
              active={activeSection}
              onSelect={selectSection}
              organization={organization?.name || "Organization"}
              branch={branch?.name || "Choose a branch"}
              logo={organization?.branding?.logo}
              connectionState={
                offline ? "offline" : data ? "connected" : "connecting"
              }
            />
          )}
          {!activeSection ? (
            <section className="mw-card" role="status">
              <h2>No tasks assigned</h2>
              <p>
                Your account has no available workspace pages for this branch.
                Ask your organization administrator to review your access.
              </p>
            </section>
          ) : !data ? (
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
              {activeSection === "onboarding" && (
                <SetupChecklist
                  key={branchBase}
                  basics={
                    <BusinessDetails
                      key={organizationId}
                      organizationId={organizationId}
                      onboarding={data.onboarding || organization?.onboarding}
                      canEdit={
                        organization?.organizationWide === true &&
                        allowed("organization.manage")
                      }
                      disabled={busy || offline}
                      save={mutate}
                    />
                  }
                  branchAdministration={
                    <BranchAdministration
                      actorId={context?.user?.id}
                      organizationId={organizationId}
                      branches={branches}
                      activeBranchId={branchId}
                      canManage={allowed("organization.manage")}
                      organizationWide={organization?.organizationWide === true}
                      creationIdempotencyReady={true}
                      disabled={busy || offline}
                      onChoose={setBranchId}
                      onRefresh={loadContext}
                      save={mutate}
                    />
                  }
                  operations={
                    <BranchSettings
                      key={branchId}
                      branch={branch}
                      organization={organization}
                      base={branchBase}
                      disabled={busy || offline}
                      save={mutate}
                    />
                  }
                  booking={
                    <ReservationPolicy
                      key={branchBase + "reservation-policy"}
                      base={branchBase}
                      policy={branch?.settings?.reservationPolicy}
                      disabled={busy || offline}
                      save={mutate}
                    />
                  }
                  pricing={
                    <PricingPolicy
                      key={branchBase + "pricing"}
                      base={branchBase}
                      policy={branch?.settings?.pricingPolicy}
                      disabled={busy || offline}
                      save={mutate}
                    />
                  }
                  minimumSpend={
                    <MinimumSpendPolicy
                      key={branchBase + "minimum-spend-policy"}
                      base={branchBase}
                      policy={minimumSpendPolicy}
                      disabled={busy || offline}
                      save={mutate}
                    />
                  }
                  deposits={
                    <DepositPolicy
                      key={branchId}
                      policy={branch?.settings?.depositPolicy}
                      base={branchBase}
                      disabled={busy || offline}
                      save={mutate}
                    />
                  }
                  readiness={
                    <LaunchReadiness
                      key={branchBase + "launch"}
                      base={branchBase}
                      settings={branch?.settings}
                      disabled={busy || offline}
                      save={mutate}
                    />
                  }
                />
              )}
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

              {activeSection === "help" && (
                <HelpRequests
                  key={branchBase}
                  base={branchBase}
                  permissions={permissions}
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
                  complaints={data.complaints}
                  timezone={branch?.timezone}
                  disabled={busy || offline}
                  save={mutate}
                />
              )}
              {activeSection === "waitlist" && (
                <Waitlist
                  key={branchBase}
                  base={branchBase}
                  timeZone={branch?.timezone}
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
              {activeSection === "billing" && allowed("billing.manage") && (
                <BillingManagement
                  status={
                    <p className="mw-billing-status">
                      {data.subscription?.status
                        ? sourceLabel(data.subscription.status)
                        : "Subscription status unavailable"}
                    </p>
                  }
                  services={
                    <dl className="mw-billing-service-list">
                      {[
                        [
                          "New orders",
                          typeof data.entitlements?.newOrdersAllowed ===
                          "boolean"
                            ? data.entitlements.newOrdersAllowed
                              ? "Allowed"
                              : "Restricted"
                            : "Unavailable",
                        ],
                        [
                          "Existing paid orders",
                          typeof data.entitlements
                            ?.existingPaidOrdersContinue === "boolean"
                            ? data.entitlements.existingPaidOrdersContinue
                              ? "Continue service"
                              : "Review required"
                            : "Unavailable",
                        ],
                        [
                          "Report exports",
                          typeof data.entitlements?.exportsAllowed === "boolean"
                            ? data.entitlements.exportsAllowed
                              ? "Available with permission"
                              : "Restricted"
                            : "Unavailable",
                        ],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  }
                  invoices={
                    <Invoices
                      key={organizationId}
                      organizationId={organizationId}
                      showServiceSummary={false}
                      disabled={busy || offline}
                      save={mutate}
                    />
                  }
                  proposedPolicy={
                    <>
                      <section className="mw-card">
                        <h2>Proposed pricing</h2>
                        <p>
                          Proposal version:{" "}
                          {data.policy?.version ||
                            context?.policy?.version ||
                            "Not configured"}
                        </p>
                        <dl className="mw-billing-service-list">
                          <div>
                            <dt>Monthly price</dt>
                            <dd>
                              {Number.isSafeInteger(data.policy?.monthlyPrice)
                                ? formatMoney(data.policy.monthlyPrice)
                                : "Unresolved"}
                            </dd>
                          </div>
                          <div>
                            <dt>Included branches</dt>
                            <dd>
                              {Number.isSafeInteger(
                                data.policy?.includedBranches,
                              )
                                ? data.policy.includedBranches
                                : "Unresolved"}
                            </dd>
                          </div>
                          <div>
                            <dt>Additional branch price</dt>
                            <dd>
                              {Number.isSafeInteger(
                                data.policy?.additionalBranchPrice,
                              )
                                ? formatMoney(data.policy.additionalBranchPrice)
                                : "Unresolved"}
                            </dd>
                          </div>
                        </dl>
                        <div className="mw-note">
                          <ShieldCheck size={16} />
                          Live billing is disabled. Fee payer, calculation,
                          rounding, refunds, trial and grace periods require
                          approval before charging.
                        </div>
                        <p>
                          Proposed integrated collection rate:{" "}
                          {Number.isSafeInteger(data.policy?.integratedFeeBps)
                            ? `${data.policy.integratedFeeBps / 100}%`
                            : "Unresolved"}
                          . Recorded cash, external POS and manually verified
                          external transfers are excluded from the integrated
                          collection fee.
                        </p>
                      </section>
                      <PolicyEditor
                        key={data.policy?.version || organizationId}
                        organizationId={organizationId}
                        policy={data.policy || context?.policy || {}}
                        disabled={busy || offline}
                        save={mutate}
                      />
                    </>
                  }
                  reconciliation={
                    <Reconciliation
                      key={branchBase + "reconciliation"}
                      base={branchBase}
                      orders={liveOrders}
                      demo={!!context?.demo}
                      disabled={busy || offline}
                      save={mutate}
                    />
                  }
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
                  canNavigate={(id) =>
                    visibleSections.some(([sectionId]) => sectionId === id)
                  }
                  canViewAudit={allowed("organization.manage")}
                  canViewShifts={allowed("shifts.manage")}
                  staff={
                    context?.user?.id && context?.user?.name
                      ? [{ id: context.user.id, name: context.user.name }]
                      : []
                  }
                  canCreate={allowed("orders.create")}
                  canViewOrders={allowed("orders.view")}
                  onNavigate={selectSection}
                />
              )}

              {activeSection === "menu" && (
                <MenuManagement
                  key={branchBase}
                  products={products}
                  header={
                    <div className="mw-heading">
                      <div>
                        <h2>Product catalog</h2>
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
                            beginProductEdit({
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
                        {allowed("menu.publish") && (
                          <MenuPublication
                            key={branchBase + (context?.user?.id || "")}
                            base={branchBase}
                            actorId={context?.user?.id || ""}
                            organizationName={organization?.name}
                            branchName={branch?.name}
                            disabled={busy || offline}
                            onSuccess={async () => {
                              const requestedScope = branchBase;
                              const requestedActor = context?.user?.id;
                              await refresh();
                              if (
                                activeScope.current === requestedScope &&
                                confirmedPrincipal.current === requestedActor
                              )
                                notify("Menu published.");
                            }}
                          />
                        )}
                      </div>
                    </div>
                  }
                  renderProducts={(visibleProducts) => (
                    <div className="mw-list">
                      {visibleProducts.map((product) => (
                        <div
                          className="mw-row mw-menu-product-row"
                          key={product.id}
                        >
                          <div className="mw-menu-product-identity">
                            {product.image ||
                            organization?.slug === "bing-chun" ? (
                              <ProductImage
                                product={{
                                  ...product,
                                  code: product.code || "",
                                  category: product.category || "",
                                }}
                                className="mw-menu-product-photo"
                                decorative
                              />
                            ) : (
                              <span
                                className="mw-menu-product-photo mw-menu-product-fallback"
                                aria-hidden="true"
                              >
                                {product.name?.slice(0, 2)}
                              </span>
                            )}
                            <div>
                              <b>{product.name}</b>
                              <small>
                                {product.category} · {product.size} ·{" "}
                                {catalogPriceLabel(product)}
                              </small>
                            </div>
                          </div>
                          <span className="mw-pill">
                            {product.variants?.length
                              ? `${product.variants.length} ${product.variants.length === 1 ? "size" : "sizes"}`
                              : product.stockMode === "counted"
                                ? `${product.stock} in stock`
                                : "Unlimited stock"}
                          </span>
                          <span className="mw-pill">
                            {product.available === false
                              ? "Unavailable"
                              : product.available === true
                                ? "Available"
                                : "Availability unknown"}
                          </span>
                          <div className="mw-actions">
                            {button(
                              "Edit",
                              () => beginProductEdit({ ...product }),
                              "menu.edit",
                            )}
                            {allowed("stock.adjust") && (
                              <details className="mw-menu-stock-adjust">
                                <summary>Adjust stock</summary>
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
                              </details>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  editor={
                    productEdit && (
                      <section
                        className="mw-card"
                        aria-label="Product editor"
                        ref={productEditorRef}
                      >
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
                            Menu category
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
                              <option value="">Use a category name</option>
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
                                      parentCategory:
                                        event.target.value || null,
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
                              Configure sizes, add-ons and dietary details.
                              Prices are entered in naira. Availability and
                              final totals are checked before an order is
                              accepted.
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
                    )
                  }
                  categories={
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
                  }
                  stock={
                    <>
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
                  }
                  shared={
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
                  }
                />
              )}
              {activeSection === "preparation" && (
                <Tickets
                  key={branchBase}
                  base={branchBase}
                  tickets={Array.isArray(data.tickets) ? data.tickets : null}
                  stationScope={
                    ["kitchen", "bar"].includes(organization?.role)
                      ? organization.role
                      : undefined
                  }
                  orders={Array.isArray(data.orders) ? liveOrders : null}
                  disabled={busy || offline}
                  save={mutate}
                  serverTime={data.serverTime}
                  payLater={data.branch?.settings?.payLater === true}
                  loadError={
                    offline
                      ? readError || "Preparation tickets could not be loaded."
                      : undefined
                  }
                  onRefresh={refresh}
                  refreshDisabled={busy}
                  onViewOrders={
                    allowed("orders.view")
                      ? () => selectSection("orders")
                      : undefined
                  }
                />
              )}
              {activeSection === "orders" && (
                <>
                  <section className="mw-card">
                    <h2>Every order, with responsibility</h2>
                    {activeSection === "orders" && (
                      <>
                        <p className="mw-note">
                          Active and recent orders appear here. Open order
                          history to find older or imported orders.
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
                                        name:
                                          person.name ||
                                          "Staff name unavailable",
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
                            <option key={status} value={status}>
                              {orderStatusLabel(status)}
                            </option>
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
                            <option key={state} value={state}>
                              {paymentStatusLabel(state)}
                            </option>
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
                      ? filteredOrders.map((order) => (
                          <LiveOrderCard
                            key={order.id}
                            order={order}
                            timeZone={branch?.timezone}
                            actions={
                              <div className="mw-actions">
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
                            }
                          >
                            <Disclosure
                              summary="Items, instructions and history"
                              className="mw-live-order-items"
                            >
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
                                        sourceLabel(order.historicalTaxStatus) +
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
                                        (entry.actorId
                                          ? "Staff name unavailable"
                                          : "System")}{" "}
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
                                      branchBase + order.id + financialRevision
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
                            </Disclosure>
                          </LiveOrderCard>
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
                  {!counterMenuAvailable && (
                    <div className="mw-note mw-error" role="alert">
                      <p>
                        The counter menu is unavailable. Refresh it before
                        building a new order.
                      </p>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => void refresh()}
                      >
                        Refresh counter menu
                      </button>
                    </div>
                  )}
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
                        products={counterProducts}
                        lines={orderDraft.items}
                        disabled={busy || offline || !!uncertainOrder}
                        staffName={context?.user?.name || user?.name || "Staff"}
                        useBingChunAssets={organization?.slug === "bing-chun"}
                        onChange={(items) => {
                          requestKey.current = null;
                          setOrderDraft({ ...orderDraft, items });
                        }}
                        details={
                          <PosOrderContext
                            draft={{
                              displayName: orderDraft.displayName,
                              fulfillment: orderDraft.fulfillment,
                              visitId: orderDraft.visitId,
                              note: orderDraft.note,
                            }}
                            visits={list(data.visits)}
                            tables={list(data.tables)}
                            canUseTables={allowed("tables.manage")}
                            disabled={busy || offline || !!uncertainOrder}
                            onChange={(patch) => {
                              requestKey.current = null;
                              setOrderDraft({ ...orderDraft, ...patch });
                            }}
                          />
                        }
                      >
                        <button
                          type="button"
                          className="secondary"
                          disabled={
                            busy ||
                            offline ||
                            !staffSelection.complete ||
                            !counterMenuAvailable ||
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
                            !staffSelection.complete ||
                            !counterMenuAvailable ||
                            !data.menuVersion ||
                            entitlements?.newOrdersAllowed === false ||
                            ((requiresQuote || !!staffQuote) && !validQuote)
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
                          unresolved. Check its result or retry the same order.
                          Keep this tab open until the outcome is confirmed.
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
                  <TableServiceView
                    key={branchBase}
                    tables={data.tables}
                    visits={data.visits}
                    renderTableTools={(table, held) => (
                      <TableEditor
                        key={branchBase + table.id}
                        table={table}
                        held={held}
                        base={branchBase}
                        disabled={busy || offline}
                        save={mutate}
                      />
                    )}
                    renderPartyTools={(visit) => (
                      <>
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
                          <>
                            <div className="mw-party-actions">
                              {allowed("orders.create") && (
                                <button
                                  type="button"
                                  className="primary"
                                  disabled={
                                    busy ||
                                    offline ||
                                    !!uncertainOrder ||
                                    (orderDraft.items.length > 0 &&
                                      orderDraft.visitId !== visit.id)
                                  }
                                  onClick={() => {
                                    if (
                                      uncertainOrder ||
                                      (orderDraft.items.length > 0 &&
                                        orderDraft.visitId !== visit.id)
                                    )
                                      return;
                                    if (!orderDraft.items.length) {
                                      requestKey.current = null;
                                      setStaffQuote(null);
                                      setOrderDraft({
                                        ...orderDraft,
                                        displayName: visit.displayName || "",
                                        fulfillment: "table_service",
                                        visitId: visit.id,
                                      });
                                    }
                                    selectSection("counter");
                                  }}
                                >
                                  Add a round for this party
                                </button>
                              )}
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
                                        list(data.tables)
                                          .filter((table: any) =>
                                            (
                                              visit.tableIds || [visit.tableId]
                                            ).includes(table.id),
                                          )
                                          .map((table: any) => table.name)
                                          .join(" + "),
                                    },
                                    code: null,
                                    uncertain: false,
                                  })
                                }
                              >
                                Private access for this party
                              </button>
                            </div>
                            {allowed("orders.create") &&
                              orderDraft.items.length > 0 &&
                              orderDraft.visitId !== visit.id && (
                                <p className="mw-table-guidance">
                                  Finish the current counter draft before
                                  starting a round for another party.
                                </p>
                              )}
                            <VisitTables
                              key={branchBase + visit.id}
                              base={branchBase}
                              visit={visit}
                              tables={data.tables}
                              visits={data.visits}
                              disabled={busy || offline}
                              save={mutate}
                            />
                            <Disclosure
                              summary="Close this visit"
                              className="mw-table-open"
                            >
                              <p>
                                Close only when this party has finished and its
                                balance is settled. The server checks the latest
                                bill before closing.
                              </p>
                              <NonReplayForm
                                key={branchBase + visit.id + "close"}
                                disabled={busy || offline}
                                label="Close table visit"
                                onSubmit={() =>
                                  mutate(
                                    branchBase + `/visits/${visit.id}/close`,
                                    "POST",
                                    {},
                                    "Visit closed.",
                                  )
                                }
                              >
                                <button className="secondary">
                                  Close visit
                                </button>
                              </NonReplayForm>
                            </Disclosure>
                          </>
                        )}
                      </>
                    )}
                    openParty={
                      <NonReplayForm
                        key={branchBase + "open-visit"}
                        className="mw-form"
                        label="Open table visit"
                        disabled={
                          busy ||
                          offline ||
                          !Array.isArray(data.tables) ||
                          !Array.isArray(data.visits) ||
                          features?.flags?.new_table_visits === false
                        }
                        onSubmit={async () => {
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
                        }}
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
                            {list(data.tables)
                              .filter(
                                (table: any) =>
                                  table.status === "available" &&
                                  !list(data.visits).some(
                                    (visit: any) =>
                                      visit.status === "open" &&
                                      (
                                        visit.tableIds || [visit.tableId]
                                      ).includes(table.id),
                                  ),
                              )
                              .map((table: any) => (
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
                      </NonReplayForm>
                    }
                    setup={
                      <>
                        {Array.isArray(data.tables) && (
                          <FloorMap
                            key={branchBase}
                            tables={data.tables}
                            base={branchBase}
                            disabled={busy || offline}
                            save={mutate}
                          />
                        )}
                        <h3>Create a table</h3>
                        <NonReplayForm
                          key={branchBase + "table-create"}
                          className="mw-form"
                          label="Create branch table"
                          disabled={
                            busy || offline || !Array.isArray(data.tables)
                          }
                          onSubmit={() =>
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
                            )
                          }
                        >
                          {field("Table label", "tableName")}
                          {field("Seats", "capacity", "number")}
                          {field("Zone", "zone", "text", false)}
                          <div className="mw-wide">
                            <button className="primary">Create table</button>
                          </div>
                        </NonReplayForm>
                      </>
                    }
                  />
                  <Bills
                    key={branchBase + financialRevision}
                    bills={data.bills}
                    visits={data.visits}
                    tables={data.tables}
                    base={branchBase}
                    disabled={busy || offline}
                    canPay={allowed("payments.record")}
                    save={mutate}
                  />
                </>
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
                    Availability is checked before a reservation is confirmed.
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
                  <PaymentRecords
                    payments={data.payments}
                    refunds={data.refunds}
                    orders={liveOrders}
                    timeZone={branch?.timezone}
                    canViewRefunds={allowed("refunds.approve")}
                  />
                  <Disclosure
                    className="mw-finance-tools"
                    summary="Record money received"
                    defaultOpen
                  >
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
                      {field(
                        "Amount received (naira)",
                        "amount",
                        "number",
                        true,
                        0.01,
                      )}
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
                  </Disclosure>
                  {allowed("refunds.approve") && (
                    <Disclosure
                      className="mw-finance-tools"
                      summary="Record money returned"
                    >
                      <p>
                        Use this only after an authorized return has actually
                        been completed.
                      </p>
                      <form
                        className="mw-form"
                        onSubmit={submit(() =>
                          mutate(
                            branchBase +
                              `/orders/${tabForm.refundOrder}/refunds`,
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
                    </Disclosure>
                  )}
                  <p className="mw-muted">
                    Online collections and withdrawals are not enabled. These
                    forms record payments handled outside the app.
                  </p>
                </section>
              )}
              {activeSection === "shifts" && (
                <section className="mw-card">
                  <h2>Shifts & cash reconciliation</h2>
                  <p>
                    Review shift cash, handovers and counted balances for this
                    branch.
                  </p>
                  {Array.isArray(data.shifts) && !data.shifts.length && (
                    <p className="mw-note">
                      No shifts recorded for this branch.
                    </p>
                  )}
                  {!Array.isArray(data.shifts) && (
                    <p role="alert">
                      Shift records are unavailable. Refresh the workspace
                      before continuing.
                    </p>
                  )}
                  {list(data.shifts).map((shift: any) => (
                    <ShiftRecord
                      key={shift.id}
                      shift={shift}
                      timeZone={branch?.timezone}
                    >
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
                        <Disclosure
                          summary="Close and reconcile this shift"
                          className="mw-finance-tools"
                        >
                          <form
                            className="mw-form"
                            onSubmit={submit(() =>
                              mutate(
                                branchBase + `/shifts/${shift.id}/close`,
                                "POST",
                                {
                                  countedCash: Math.round(
                                    Number(tabForm[`counted_${shift.id}`]) *
                                      100,
                                  ),
                                  reason: tabForm[`variance_${shift.id}`] || "",
                                },
                                "Shift closed.",
                              ),
                            )}
                          >
                            {field(
                              "Counted cash (naira)",
                              `counted_${shift.id}`,
                              "number",
                              true,
                              0.01,
                            )}
                            {field(
                              "Variance explanation",
                              `variance_${shift.id}`,
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
                        </Disclosure>
                      )}
                    </ShiftRecord>
                  ))}
                  {Array.isArray(data.shifts) &&
                    !data.shifts.some(
                      (shift: any) => shift.status === "open",
                    ) && (
                      <div className="mw-shift-open">
                        <h3>Open a shift</h3>
                        <p>
                          Record the cash float physically present at the start
                          of service.
                        </p>
                        <form
                          className="mw-form"
                          onSubmit={submit(() =>
                            mutate(
                              branchBase + "/shifts",
                              "POST",
                              {
                                openingFloat: Math.round(
                                  Number(tabForm.float) * 100,
                                ),
                              },
                              "Shift opened.",
                            ),
                          )}
                        >
                          {field(
                            "Opening float (naira)",
                            "float",
                            "number",
                            true,
                            0.01,
                          )}
                          <div className="mw-wide">
                            <button
                              className="primary"
                              disabled={busy || offline}
                            >
                              Open shift
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
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
            </main>
          )}
        </>
      )}
      <footer className="mw-footer">
        Mera workspace · Changes require a connection.
      </footer>
    </div>
  );
}
