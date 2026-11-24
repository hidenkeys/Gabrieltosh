import AllLocations from "./AllLocations";
import StockTransfers, { useVenueWrite } from "./StockTransfers";
import DoorGuestList from "./DoorGuestList";
import LocationSwitcher from "./LocationSwitcher";
// @ts-expect-error Shared venue contract is plain JavaScript.
import * as venues from "../../../shared/mera-venues.js";
const { effectiveCapabilities, sectionEnabled } = venues;
import ItemKindEditor, { itemKindBody } from "./ItemKindEditor";
import PaymentEntry from "./PaymentEntry";
import ChoiceField from "../ui/ChoiceField";
import { useDialogFocus } from "../ui/useDialogFocus";
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
import OwnerSetup from "./OwnerSetup";
import CreateOrganization from "./CreateOrganization";
import RefundRequests from "./RefundRequests";
import StaffPos from "./StaffPos";
import { validateStaffSelection } from "./staffSelection";
import PosOrderContext from "./PosOrderContext";
import WorkspaceNavigation from "./WorkspaceNavigation";
import { chooseWorkspaceLanding, getSectionPresentation } from "./presentation";
import WorkspaceAccount from "./WorkspaceAccount";
import OperationalOverview from "./OperationalOverview";
import { serviceState } from "./overviewPresentation";
import PolicyEditor from "./PolicyEditor";
import BillingManagement from "./BillingManagement";
import LiveOrderCard, {
  orderStatusLabel,
  paymentStatusLabel,
} from "./LiveOrderCard";
import { Disclosure } from "../ui/OperationalPrimitives";
import Bills from "./Bills";
import ReservationSettlement from "./ReservationSettlement";
import ReservationDesk from "./ReservationDesk";
import ReservationRequest from "./ReservationRequest";
import ShiftOperation from "./ShiftOperation";
import {
  readShiftOperationJournal,
  hasShiftOperationJournals,
  redactShiftOperationJournals,
} from "./shiftOperationJournal";
import {
  staffReservationScopeSchema,
  readStaffReservationJournal,
  hasStaffReservationJournals,
  redactStaffReservationJournals,
} from "./staffReservationJournal";
import ShiftWorkspace from "./ShiftWorkspace";
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
import MemberAccess from "./MemberAccess";
import { AccessOperationProvider } from "./AccessOperationRecovery";
import { hasAnyAccessWrite } from "./accessWriteJournal";
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
import OrderResponsibility from "./OrderResponsibility";
import Categories, { categoryPath } from "./Categories";
import CatalogOperations from "./CatalogOperations";
import StockMovements from "./StockMovements";
import MoneyInput from "../ui/MoneyInput";
import Segmented from "../ui/Segmented";
import Combobox from "../ui/Combobox";
import ReasonInput from "../ui/ReasonInput";
import Stepper from "../ui/Stepper";
import StockAdjustment from "./StockAdjustment";
import FloorMap from "./FloorMap";
import HelpRequests from "./HelpRequests";
import { hasHelpUpdateMarkers } from "./helpUpdateJournal";
import { hasBillChangeMarkers } from "./billChangeJournal";
import { hasPrintStudioMarkers } from "./printStudioJournal";
import ModifierGroupsEditor from "./ModifierGroupsEditor";
import WriteOff from "./WriteOff";
import MinimumSpendPolicy from "./MinimumSpendPolicy";
import VisitMinimumSpend from "./VisitMinimumSpend";
import PrivateVisitAccess from "./PrivateVisitAccess";
import SupportCases from "./SupportCases";
import DepositOutcomes from "./DepositOutcomes";
import OrderHistory, { OrderTimeline } from "./OrderHistory";
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
  ["organization", "All locations", "organization.overview"],
  ["door", "Door & guest list", "door.manage"],
  ["transfers", "Stock transfers", "stock.transfer"],
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
const sourceLabel = (value: string) =>
  value === "room_charge"
    ? "Charged to room"
    : value?.replaceAll("_", " ") || "—";
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
  const logoutDialog = useRef<HTMLElement>(null);
  const accountTrigger = useRef<HTMLElement>(null);

  const [logoutBusy, setLogoutBusy] = useState(false);
  useDialogFocus({
    dialogRef: logoutDialog,
    open: logoutConfirm,
    onClose: () => setLogoutConfirm(false),
    closeDisabled: logoutBusy,
    returnFocusRef: accountTrigger,
  });
  const [, setReservationRecoveryRevision] = useState(0);
  const [reservationPrivacyWarning, setReservationPrivacyWarning] =
    useState(false);
  const [shiftPrivacyWarning, setShiftPrivacyWarning] = useState(false);
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
  const [reportExportSelection, setReportExportSelection] = useState<{
    base: string;
    date: string;
  } | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const taskHeading = useRef<HTMLHeadingElement>(null);
  const shiftOperationPanel = useRef<HTMLDivElement>(null);
  const pendingShiftReveal = useRef<string | null>(null);
  const reservationRequestPanel = useRef<HTMLDivElement>(null);
  const pendingReservationReveal = useRef<string | null>(null);
  const pendingDestinationFocus = useRef<{
    scopeKey: string;
    section: string;
  } | null>(null);
  const [attentionDestination, setAttentionDestination] = useState<{
    scopeKey: string;
    section: string;
    recordId?: string;
  } | null>(null);
  const [orderFilters, setOrderFilters] = useState({
    query: "",
    status: "",
    source: "",
    payment: "",
    unassigned: false,
    serviceQueue: "all",
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
  const membershipPermissions = list(organization?.permissions);
  const branches = list(organization?.branches);
  const selectedBranch = branches.find((row: any) => row.id === branchId);
  const permissions = list(
    selectedBranch?.permissions ?? organization?.permissions,
  );
  const allowed = (permission: string) => permissions.includes(permission);
  const capabilities = effectiveCapabilities(selectedBranch?.settings);
  const turnedOffSections = [
    ...(!sectionEnabled("tables", capabilities) &&
    list(data?.visits).some((v: any) => v.status === "open")
      ? ["tables"]
      : []),
    ...(!sectionEnabled("reservations", capabilities) &&
    list(data?.reservations).some(
      (r: any) =>
        ["requested", "confirmed"].includes(r.status) &&
        Date.parse(r.startsAt) >= Date.now(),
    )
      ? ["reservations"]
      : []),
  ];
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
  const permissionSections = sections.filter(([section, , permission]) =>
    section === "organization"
      ? membershipPermissions.includes("organization.overview")
      : section === "transfers"
        ? (branches.filter((b: any) => b.settings?.role !== "stock_room")
            .length >= 2 ||
            organization?.operating?.inventoryMode === "central") &&
          (allowed("stock.transfer") || allowed("stock.receive"))
        : section === "menu"
          ? allowed("menu.edit") || allowed("stock.adjust")
          : permission === "support.manage"
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
  const visibleSections = permissionSections.filter(
    ([id]) =>
      sectionEnabled(id, capabilities) || turnedOffSections.includes(id),
  );
  const navigationScope = JSON.stringify([
    context?.user?.id || principal,
    organizationId,
    branchId,
  ]);
  const guideRequested =
    new URLSearchParams(window.location.search).get("setup") === "1" &&
    organization?.organizationWide === true &&
    allowed("organization.manage") &&
    !sectionSelection;
  const newSections = ["organization", "transfers", "door"];
  const activeSection: string =
    sectionSelection?.scopeKey === navigationScope &&
    newSections.includes(sectionSelection.section) &&
    visibleSections.some(([id]) => id === sectionSelection.section)
      ? sectionSelection.section
      : guideRequested
        ? "onboarding"
        : chooseWorkspaceLanding({
            role: organization?.role,
            permissions,
            visibleSectionIds: visibleSections.map(([id]) => id),
            organizationWide: organization?.organizationWide === true,
            scopeKey: navigationScope,
            selection: sectionSelection,
          }) ||
          visibleSections.find(([id]) => newSections.includes(id))?.[0] ||
          "";
  const selectSection = (
    section: string,
    options?: { focusDestination: boolean },
  ) => {
    if (visibleSections.some(([id]) => id === section)) {
      if (options?.focusDestination)
        pendingDestinationFocus.current = {
          scopeKey: navigationScope,
          section,
        };
      setAttentionDestination(null);
      setSectionSelection({ section, scopeKey: navigationScope });
    }
  };
  const reviewOverviewSection = (section: string, recordId?: string) => {
    if (!visibleSections.some(([id]) => id === section)) return;
    pendingDestinationFocus.current = { scopeKey: navigationScope, section };
    setAttentionDestination({ scopeKey: navigationScope, section, recordId });
    setSectionSelection({ section, scopeKey: navigationScope });
  };
  const currentAttention =
    attentionDestination?.scopeKey === navigationScope
      ? attentionDestination
      : null;
  useEffect(() => {
    const request = pendingDestinationFocus.current;
    if (!request) return;
    if (
      request.scopeKey !== navigationScope ||
      request.section !== activeSection
    ) {
      pendingDestinationFocus.current = null;
      return;
    }
    if (taskHeading.current) {
      pendingDestinationFocus.current = null;
      taskHeading.current.focus({ preventScroll: true });
      const workspace =
        taskHeading.current.closest<HTMLElement>(".mera-workspace");
      (workspace || taskHeading.current).scrollIntoView?.({
        block: "start",
        behavior: "instant",
      });
    }
  });
  useEffect(() => {
    if (!pendingReservationReveal.current) return;
    if (pendingReservationReveal.current !== navigationScope) {
      pendingReservationReveal.current = null;
      return;
    }
    if (activeSection !== "reservations") return;
    const details = reservationRequestPanel.current?.querySelector("details");
    if (!details) return;
    pendingReservationReveal.current = null;
    details.open = true;
    details.querySelector("summary")?.focus();
    details.scrollIntoView?.({ block: "center" });
  });
  useEffect(() => {
    if (!pendingShiftReveal.current) return;
    if (pendingShiftReveal.current !== navigationScope) {
      pendingShiftReveal.current = null;
      return;
    }
    if (activeSection !== "shifts" || !shiftOperationPanel.current) return;
    pendingShiftReveal.current = null;
    const panel = shiftOperationPanel.current;
    const details = panel.querySelector("details");
    if (details) details.open = true;
    const target = panel.querySelector<HTMLElement>("summary, h3, button");
    if (target) {
      if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
    panel.scrollIntoView?.({ block: "center" });
  });
  const pagePresentation = newSections.includes(activeSection)
    ? {
        title:
          visibleSections.find(([id]) => id === activeSection)?.[1] ||
          "Workspace",
        description: "",
      }
    : getSectionPresentation(activeSection);
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

  useEffect(() => {
    const changed = () => setReservationRecoveryRevision((value) => value + 1);
    window.addEventListener("mera:reservation-recovery", changed);
    window.addEventListener("mera:shift-recovery", changed);
    window.addEventListener("mera:help-recovery", changed);
    window.addEventListener("mera:bill-recovery", changed);
    window.addEventListener("mera:print-recovery", changed);
    window.addEventListener("mera:access-operation", changed);
    return () => {
      window.removeEventListener("mera:reservation-recovery", changed);
      window.removeEventListener("mera:shift-recovery", changed);
      window.removeEventListener("mera:help-recovery", changed);
      window.removeEventListener("mera:bill-recovery", changed);
      window.removeEventListener("mera:print-recovery", changed);
      window.removeEventListener("mera:access-operation", changed);
    };
  }, []);
  const clearProtected = useCallback(() => {
    if (!redactStaffReservationJournals()) setReservationPrivacyWarning(true);
    if (!redactShiftOperationJournals()) setShiftPrivacyWarning(true);
    setError("");
    setReadError("");
    authorizationEpoch.current++;
    setPrivateAccess(null);
    setData(null);
    setCategories([]);
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
            branches: org.branches.map((branch: any) => ({
              id: branch.id,
              permissions: branch.permissions,
              role: branch.role,
              settings: branch.settings,
            })),
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
          setReservationPrivacyWarning(!redactStaffReservationJournals(actor));
          setShiftPrivacyWarning(!redactShiftOperationJournals(actor));
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
    setReportExportSelection(null);
    setError("");
    setReadError("");
    setData(null);
    setCategories([]);
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
  const selectedBranchRef = useRef(selectedBranch);
  selectedBranchRef.current = selectedBranch;
  const canReadWorkspace = permissions.some((p: string) =>
    [
      "orders.view",
      "orders.create",
      "menu.edit",
      "stock.adjust",
      "reports.view",
      "reservations.manage",
      "tables.manage",
      "shifts.manage",
    ].includes(p),
  );
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!organizationId || !branchId || accessDenied.current) return;
      if (!canReadWorkspace) {
        setData({ branch: selectedBranchRef.current });
        setOffline(false);
        setReadError("");
        return;
      }
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
    [organizationId, branchId, branchBase, scopeVersion, canReadWorkspace],
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
      serviceQueue: "all",
    });
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
  }, [activeSection, organizationId, branchBase]);
  const roomWrite = useVenueWrite(principal || user.id, branchBase + "/");
  const mutate = async (
    path: string,
    method: string,
    body: any,
    success: string,
  ) => {
    if (body?.method === "room_charge") {
      if (
        !allowed("room_charge.post") ||
        !allowed("payments.record") ||
        !capabilities.includes("room_charge")
      )
        throw new WorkspaceError(
          "Room charges are turned off for your access at this location.",
          403,
        );
      if (financialRequests.current.has(branchBase))
        throw new WorkspaceError(
          "Resolve the original financial request before recording a room charge.",
          409,
        );
      const result = await roomWrite.write(path, method, body);
      await refresh();
      notify("Charged to room.");
      return result;
    }
    if (
      roomWrite.pending &&
      /\/(payments|refunds|deposits|movements|writeoffs)$/.test(path)
    )
      throw new WorkspaceError(
        "Resolve the original room charge before recording another payment.",
        409,
      );
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
    const originalReservation =
      method === "POST" &&
      /^\/organizations\/[^/]+\/branches\/[^/]+\/reservations$/.test(path);
    const originalShiftOperation =
      method === "POST" &&
      /^\/organizations\/[^/]+\/branches\/[^/]+\/shifts(?:\/[^/]+\/close)?$/.test(
        path,
      );
    const originalHelpUpdate =
      method === "PATCH" &&
      /^\/organizations\/[^/]+\/branches\/[^/]+\/help-requests\/[^/]+$/.test(
        path,
      );
    const originalBillChange =
      method === "POST" &&
      /^\/organizations\/[^/]+\/branches\/[^/]+\/bills\/[^/]+\/(split|merge)$/.test(
        path,
      );
    const originalTemplateSave =
      method === "PUT" &&
      /^\/organizations\/[^/]+\/branches\/[^/]+\/templates$/.test(path);
    const originalReprint =
      method === "POST" &&
      /^\/organizations\/[^/]+\/branches\/[^/]+\/print-jobs\/[^/]+\/reprint$/.test(
        path,
      );
    const originalAccessWrite =
      ["POST", "PATCH", "DELETE"].includes(method) &&
      /^\/organizations\/[^/]+\/(members\/[^/]+|roles(?:\/[^/]+)?|invitations(?:\/[^/]+)?)$/.test(
        path,
      );
    const actorBoundIntent =
      originalAccessWrite ||
      originalTemplateSave ||
      originalReprint ||
      originalReservation ||
      originalShiftOperation ||
      originalHelpUpdate ||
      originalBillChange;
    let attemptedBody: any;
    try {
      if (
        actorBoundIntent &&
        (!requestedActor ||
          requestedActor !== principal ||
          requestedScope !== branchBase ||
          !(originalReservation
            ? path === branchBase + "/reservations"
            : originalAccessWrite
              ? path.startsWith("/organizations/" + organizationId + "/")
              : path.startsWith(
                  branchBase +
                    (originalTemplateSave
                      ? "/templates"
                      : originalReprint
                        ? "/print-jobs/"
                        : originalHelpUpdate
                          ? "/help-requests/"
                          : originalBillChange
                            ? "/bills/"
                            : "/shifts"),
                )) ||
          scopeEpoch.current.generation !== scopeVersion)
      )
        throw new WorkspaceError(
          "The staff account or branch changed. Refresh the workspace and check the original request before continuing.",
          403,
          "WORKSPACE_CHANGED",
        );
      const pending = financialRequests.current.get(requestedScope);
      if (financial && pending && pending.signature !== financialSignature)
        throw new WorkspaceError(
          "Resolve the original uncertain financial submission before changing the amount, reference, order or another financial record.",
          409,
          "FINANCIAL_INTENT_PENDING",
        );
      if (financial && pending) body = pending.body;
      const signature =
        body?.requestKey && !actorBoundIntent
          ? path + JSON.stringify({ ...body, requestKey: undefined })
          : null;
      if (signature) {
        const stable =
          pendingRequests.current.get(signature) || body.requestKey;
        pendingRequests.current.set(signature, stable);
        body = { ...body, requestKey: stable };
      }
      attemptedBody = body;
      const result = await workspaceApi(
        path,
        method,
        body,
        undefined,
        actorBoundIntent ? { expectedActorId: requestedActor } : undefined,
      );
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
  ) =>
    type === "number" && /amount|naira|₦/i.test(label) ? (
      <MoneyInput
        label={label}
        value={String(tabForm[key] ?? "")}
        onChange={(value) => updateForm(key, value)}
        required={required}
        min={step || 0}
      />
    ) : key === "capacity" ? (
      <Stepper
        label={label}
        value={Number(tabForm[key] || 1)}
        onChange={(value) => updateForm(key, value)}
        min={1}
        max={1000}
        required={required}
      />
    ) : key === "reason" ? (
      <ReasonInput
        label={label}
        value={tabForm[key] || ""}
        onChange={(value) => updateForm(key, value)}
        presets={[
          "Wrong item entered",
          "Quality issue",
          "Overcharged",
          "Duplicate payment",
          "Service issue",
        ]}
        required={required}
        minLength={3}
        maxLength={300}
      />
    ) : (
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
  const reviewOverviewOrders = (
    reference?: string,
    queue: "all" | "active" | "delayed" = "delayed",
  ) => {
    if (!allowed("orders.view")) return;
    pendingDestinationFocus.current = {
      scopeKey: navigationScope,
      section: "orders",
    };
    setOrderFilters({
      query: reference || "",
      status: "",
      source: "",
      payment: "",
      unassigned: false,
      serviceQueue: queue,
    });
    selectSection("orders");
  };
  const delayedOrderIds = new Set(
    list(data?.delayedOrders)
      .filter((order: any) => order && typeof order.id === "string")
      .map((order: any) => order.id),
  );
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
      (!orderFilters.unassigned || !order.handlerId) &&
      (orderFilters.serviceQueue !== "mine" || order.handlerId === user.id) &&
      (orderFilters.serviceQueue !== "ready" || order.status === "ready") &&
      (orderFilters.serviceQueue !== "active" ||
        serviceState(order, data?.serverTime) === "active") &&
      (orderFilters.serviceQueue !== "delayed" ||
        delayedOrderIds.has(order.id)) &&
      (orderFilters.serviceQueue !== "unassigned" || !order.handlerId)
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
      if (!redactStaffReservationJournals())
        throw new Error(
          "Guest details could not be cleared safely. Keep this session open and retry signing out after reviewing reservation recovery.",
        );
      if (!redactShiftOperationJournals())
        throw new Error(
          "Shift details could not be cleared safely. Keep this session open and review shift recovery before signing out.",
        );
      await onLogout();
      window.dispatchEvent(new window.Event("mera:logout"));
      setLogoutConfirm(false);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLogoutBusy(false);
    }
  };
  const reservationScope = staffReservationScopeSchema.safeParse({
    actorId: principal || user.id,
    organizationId,
    branchId,
  });
  const reservationRecovery = (() => {
    if (!reservationScope.success) return { pending: false, blocked: false };
    try {
      return {
        pending: !!readStaffReservationJournal(reservationScope.data),
        blocked: false,
      };
    } catch {
      return { pending: true, blocked: true };
    }
  })();
  const shiftRecovery = (() => {
    if (!reservationScope.success) return { pending: false, blocked: false };
    try {
      return {
        pending: !!readShiftOperationJournal(reservationScope.data),
        blocked: false,
      };
    } catch {
      return { pending: true, blocked: true };
    }
  })();
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
          <ChoiceField
            label="Organization"
            searchable
            value={organizationId}
            disabled={busy}
            onChange={(value) => setOrganizationId(value)}
          >
            {organizations.map((org: any) => (
              <option value={org.id} key={org.id}>
                {org.name}
              </option>
            ))}
          </ChoiceField>
          <LocationSwitcher
            branches={branches}
            value={branchId}
            disabled={busy}
            allLocations={membershipPermissions.includes(
              "organization.overview",
            )}
            onChange={setBranchId}
            onAllLocations={() => selectSection("organization")}
          />
          <WorkspaceAccount
            triggerRef={accountTrigger}
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
                      uncertainOrders.current.size ||
                      hasStaffReservationJournals(principal || user.id) ||
                      hasShiftOperationJournals(principal || user.id) ||
                      hasHelpUpdateMarkers(principal || user.id) ||
                      hasBillChangeMarkers(principal || user.id) ||
                      hasPrintStudioMarkers(principal || user.id) ||
                      hasAnyAccessWrite(principal || user.id)
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
            ref={logoutDialog}
            tabIndex={-1}
          >
            <h2 id="mw-signout-title">
              An original submission still needs resolution
            </h2>
            <p id="mw-signout-detail">
              Signing out clears this tab’s financial recovery details and
              private reservation and shift details. Original reservation and
              shift request references are kept for checking after you sign in
              again. Signing out does not cancel a request or reverse a
              transaction. Keep this session open to resolve the original
              submission, or explicitly sign out and arrange reconciliation.
            </p>
            <div className="mw-actions">
              <button
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
                Sign out and clear private details
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
          <h1 ref={taskHeading} tabIndex={-1}>
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
        <CreateOrganization
          key={context.user.id}
          actorId={context.user.id}
          actorName={context.user.name}
          disabled={busy || offline}
          demo={!!context.demo}
          save={mutate}
          onCreated={loadContext}
        />
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
        onReview={() => reviewOverviewOrders(undefined, "delayed")}
        onReviewOrders={(reference) =>
          reviewOverviewOrders(reference, "delayed")
        }
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
      {hasAnyAccessWrite(principal || user.id) && (
        <section
          role="status"
          className="mw-note"
          aria-label="Organization access recovery"
        >
          <strong>An access change needs checking</strong>
          <p>
            Open People in the original organization to review the request. No
            access change is sent automatically.
          </p>
          {allowed("members.manage") ? (
            <button
              type="button"
              className="secondary"
              onClick={() => selectSection("team")}
            >
              Review access changes
            </button>
          ) : (
            <p>
              The original account needs organization staff-management access
              restored to review it.
            </p>
          )}
        </section>
      )}
      {hasPrintStudioMarkers(principal || user.id) && (
        <section
          role="status"
          className="mw-note"
          aria-label="Print studio recovery"
        >
          <strong>A print request needs checking</strong>
          <p>
            Open Receipt studio in the original branch to check the format save
            or duplicate request. No request is sent automatically.
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => selectSection("printing")}
          >
            Review print requests
          </button>
        </section>
      )}
      {hasBillChangeMarkers(principal || user.id) && (
        <section
          role="status"
          className="mw-note"
          aria-label="Shared bill recovery"
        >
          <strong>A bill change needs checking</strong>
          <p>
            Open Tables &amp; visits in the original branch to check the split
            or merge before making another bill change. No request is sent
            automatically.
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => selectSection("tables")}
          >
            Review bill changes
          </button>
        </section>
      )}
      {hasHelpUpdateMarkers(principal || user.id) && (
        <section
          role="status"
          className="mw-note"
          aria-label="Help response recovery"
        >
          <strong>A help response needs checking</strong>
          <p>
            Open Customer requests in the original branch to check the response
            before writing another one. No update is sent automatically. This
            tab keeps only a recovery reference, without the reply or private
            note.
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => selectSection("help")}
          >
            Review help responses
          </button>
        </section>
      )}
      {shiftPrivacyWarning && (
        <div role="alert" className="mw-note">
          Private shift details could not be cleared from this tab. Keep this
          session open and review shift recovery before signing out.
        </div>
      )}
      {shiftRecovery.pending && (
        <section role="status" className="mw-note" aria-label="Shift recovery">
          <strong>An original shift submission needs checking</strong>
          <p>
            {shiftRecovery.blocked
              ? "This tab could not read its saved shift submission. New shift changes remain blocked until recovery is resolved."
              : "Check the original opening or closing submission before making another shift change. No submission is sent automatically."}
          </p>
          {allowed("shifts.manage") ? (
            <button
              className="secondary"
              onClick={() => {
                pendingShiftReveal.current = navigationScope;
                selectSection("shifts");
                setReservationRecoveryRevision((value) => value + 1);
              }}
            >
              Review original shift submission
            </button>
          ) : (
            <p>
              Sign in with the original account and shift access to check this
              submission.
            </p>
          )}
        </section>
      )}
      {reservationPrivacyWarning && (
        <div role="alert" className="mw-note">
          Private reservation details could not be cleared from this tab. Keep
          this session open and resolve reservation recovery before signing out.
        </div>
      )}
      {reservationRecovery.pending && (
        <section
          role="status"
          className="mw-note"
          aria-label="Reservation recovery"
        >
          <strong>An original reservation request needs checking</strong>
          <p>
            {reservationRecovery.blocked
              ? "This tab could not read its saved request. A new booking is blocked until recovery is resolved."
              : "Check the original request before starting another booking. No booking is sent automatically."}
          </p>
          {allowed("reservations.manage") ? (
            <button
              className="secondary"
              onClick={() => {
                pendingReservationReveal.current = navigationScope;
                selectSection("reservations");
                setReservationRecoveryRevision((value) => value + 1);
              }}
            >
              Review original reservation request
            </button>
          ) : (
            <p>
              Sign in with the original account and reservation access to check
              this request.
            </p>
          )}
        </section>
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
              turnedOffSections={turnedOffSections}
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
              {roomWrite.pending && (
                <section className="mw-card" role="alert">
                  <h2>Room charge needs checking</h2>
                  <p>
                    Retry the original room charge before recording another
                    payment.
                  </p>
                  <button
                    disabled={
                      busy ||
                      roomWrite.busy ||
                      roomWrite.pending.blocked ||
                      !allowed("room_charge.post")
                    }
                    onClick={() => {
                      const p = roomWrite.pending;
                      void mutate(
                        p.path,
                        p.method,
                        p.body,
                        "Charged to room.",
                      ).catch(() => {});
                    }}
                  >
                    Retry original room charge
                  </button>
                </section>
              )}
              {roomWrite.error && <p role="alert">{roomWrite.error}</p>}
              {activeSection === "organization" && (
                <AllLocations
                  key={organizationId}
                  organizationId={organizationId}
                  actorId={principal || user.id}
                  branchBase={branchBase}
                  branches={branches}
                  canExport={membershipPermissions.includes("reports.export")}
                  onLocation={(id) => {
                    setBranchId(id);
                  }}
                />
              )}
              {activeSection === "transfers" && (
                <StockTransfers
                  key={branchBase}
                  organizationId={organizationId}
                  actorId={principal || user.id}
                  branches={branches}
                  branchId={branchId}
                  central={organization?.operating?.inventoryMode === "central"}
                  membershipPermissions={membershipPermissions}
                />
              )}
              {activeSection === "door" && (
                <DoorGuestList
                  key={branchBase}
                  base={branchBase}
                  actorId={principal || user.id}
                  branch={branch}
                  disabled={busy || offline}
                  onCollectEntry={(productId) => {
                    const product = counterProducts.find(
                      (p: any) => p.id === productId,
                    );
                    if (!product) {
                      notify("Entry product is unavailable at point of sale.");
                      return;
                    }
                    setOrderDraft({
                      ...orderDraft,
                      serviceMode: "counter_takeaway",
                      items: [{ productId, quantity: 1, extras: [] }],
                      fulfillment: "counter_pickup",
                      visitId: "",
                    });
                    selectSection("counter");
                  }}
                />
              )}
              {activeSection === "onboarding" && (
                <OwnerSetup
                  key={branchBase}
                  organization={organization}
                  branch={branch}
                  branches={branches}
                  onboarding={data.onboarding || organization?.onboarding}
                  actorName={context?.user?.name || user.name}
                  canGuide={
                    organization?.organizationWide === true &&
                    allowed("organization.manage")
                  }
                  disabled={busy || offline}
                  demo={!!context?.demo}
                  permissions={permissions}
                  onOpen={(section) =>
                    selectSection(section, { focusDestination: true })
                  }
                  save={mutate}
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
                      accessBlocked={offline || !allowed("organization.manage")}
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
                  key={branchBase + "|" + (principal || user.id)}
                  base={branchBase}
                  actorId={principal || user.id}
                  timeZone={branch?.timezone}
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
                  timeZone={branch?.timezone}
                  initialDate={
                    reportExportSelection?.base === branchBase
                      ? reportExportSelection.date
                      : data.report?.date
                  }
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
                                : "Not set"}
                            </dd>
                          </div>
                          <div>
                            <dt>Included branches</dt>
                            <dd>
                              {Number.isSafeInteger(
                                data.policy?.includedBranches,
                              )
                                ? data.policy.includedBranches
                                : "Not set"}
                            </dd>
                          </div>
                          <div>
                            <dt>Additional branch price</dt>
                            <dd>
                              {Number.isSafeInteger(
                                data.policy?.additionalBranchPrice,
                              )
                                ? formatMoney(data.policy.additionalBranchPrice)
                                : "Not set"}
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
                            : "Not set"}
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
                  actorId={principal || user.id}
                  branchName={branch?.name}
                  timeZone={branch?.timezone}
                  disabled={busy || offline}
                  canViewJobs={allowed("orders.view")}
                  canReprint={allowed("orders.fulfill")}
                  save={mutate}
                />
              )}
              {activeSection === "overview" && (
                <OperationalOverview
                  data={data}
                  orders={Array.isArray(data.orders) ? liveOrders : undefined}
                  stale={!!readError}
                  onReviewOrders={reviewOverviewOrders}
                  onReviewSection={reviewOverviewSection}
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
                  onExportDate={
                    allowed("reports.export")
                      ? (date: string) => {
                          setReportExportSelection({ base: branchBase, date });
                          selectSection("exports");
                        }
                      : undefined
                  }
                />
              )}

              {activeSection === "menu" && (
                <MenuManagement
                  key={branchBase}
                  products={products}
                  initialView={
                    !allowed("menu.edit") ||
                    currentAttention?.section === "menu"
                      ? "stock"
                      : "products"
                  }
                  allowedViews={
                    !allowed("menu.edit")
                      ? ["stock"]
                      : organization?.organizationWide === true
                        ? undefined
                        : ["products", "categories", "stock"]
                  }
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
                              {product.kind === "package" && <span className="mw-pill">Package</span>}
                              {product.kind === "combo" && <span className="mw-pill">Combo</span>}
                              {product.serves && <span className="mw-pill">Serves {product.serves}</span>}
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
                          {product.stockMode === "counted" && (
                            <span className="mw-stock-level">
                              <meter
                                aria-label={`Stock level for ${product.name}`}
                                min={0}
                                max={Math.max(100, product.stock || 0)}
                                value={product.stock || 0}
                              />
                            </span>
                          )}
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
                            {allowed("stock.adjust") && (product.kind || "single") === "single" && (
                              <StockAdjustment
                                key={branchBase + "/" + product.id}
                                product={product}
                                base={branchBase}
                                disabled={busy || offline}
                                save={mutate}
                              />
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
                              priceDraft,
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
                            Object.assign(product, itemKindBody(product));
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
                          <ItemKindEditor value={productEdit} products={data.products || []} onChange={setProductEdit} disabled={busy || offline} />
                          <ChoiceField
                            label="Menu category"
                            searchable
                            value={productEdit.categoryId || ""}
                            onChange={(value) => {
                              const category = categories.find(
                                (row) => row.id === value,
                              );
                              setProductEdit({
                                ...productEdit,
                                categoryId: value || null,
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
                          </ChoiceField>
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
                          {(productEdit.kind || "single") === "single" && <Stepper
                            label="Low-stock alert threshold"
                            value={productEdit.lowStockThreshold ?? 5}
                            min={0}
                            max={1000000}
                            onChange={(value) =>
                              setProductEdit({
                                ...productEdit,
                                lowStockThreshold: value,
                              })
                            }
                          />
                          }
                          <MoneyInput
                            label="Price in naira"
                            value={
                              productEdit.priceDraft ??
                              String(productEdit.price / 100)
                            }
                            required
                            onChange={(value) =>
                              setProductEdit({
                                ...productEdit,
                                priceDraft: value,
                                price: Math.round(Number(value) * 100),
                              })
                            }
                          />
                          {(productEdit.kind || "single") === "single" && <ChoiceField
                            label="Stock mode"
                            value={productEdit.stockMode}
                            disabled={!!productEdit.id}
                            onChange={(value) =>
                              setProductEdit({
                                ...productEdit,
                                stockMode: value,
                              })
                            }
                          >
                            <option value="unlimited">Unlimited</option>
                            <option value="counted">
                              Counted sellable stock
                            </option>
                          </ChoiceField>
                          }
                          <ChoiceField
                            label="Preparation station"
                            value={productEdit.station}
                            onChange={(value) =>
                              setProductEdit({
                                ...productEdit,
                                station: value,
                              })
                            }
                          >
                            <option value="bar">Bar</option>
                            <option value="kitchen">Kitchen</option>
                          </ChoiceField>
                          <ChoiceField
                            label="Available"
                            value={String(productEdit.available)}
                            onChange={(value) =>
                              setProductEdit({
                                ...productEdit,
                                available: value === "true",
                              })
                            }
                          >
                            <option value="true">Available</option>
                            <option value="false">Unavailable</option>
                          </ChoiceField>
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
                            {(productEdit.kind || "single") === "single" && <VariantsEditor
                              value={productEdit.variants || []}
                              onChange={(variants) =>
                                setProductEdit({
                                  ...productEdit,
                                  variants,
                                  variantsJson: undefined,
                                })
                              }
                            />
                            }
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
                        canEditAvailability={allowed("menu.edit")}
                        disabled={busy || offline}
                        save={mutate}
                      />
                      {allowed("stock.adjust") && (
                        <StockMovements
                          key={branchBase}
                          base={branchBase}
                          products={products}
                          onTransfers={
                            visibleSections.some(([id]) => id === "transfers")
                              ? () => selectSection("transfers")
                              : undefined
                          }
                          disabled={busy || offline}
                          save={mutate}
                        />
                      )}
                    </>
                  }
                  shared={
                    organization?.organizationWide === true ? (
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
                    ) : null
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
                              timeZone={branch?.timezone}
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
                      <ChoiceField
                        label="Show orders"
                        value={orderFilters.serviceQueue}
                        onChange={(value) =>
                          setOrderFilters({
                            ...orderFilters,
                            serviceQueue: value,
                            unassigned: false,
                          })
                        }
                      >
                        <option value="all">All recent orders</option>
                        <option value="active">Active service orders</option>
                        <option value="delayed">Waiting-time alerts</option>
                        <option value="mine">Assigned to me</option>
                        <option value="unassigned">Unassigned orders</option>
                        <option value="ready">Ready for service</option>
                      </ChoiceField>
                    </div>
                    <Disclosure summary="More order filters">
                      <div className="mw-form">
                        <ChoiceField
                          label="Order status"
                          value={orderFilters.status}
                          onChange={(value) =>
                            setOrderFilters({
                              ...orderFilters,
                              status: value,
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
                        </ChoiceField>
                        <ChoiceField
                          label="Order channel"
                          searchable
                          value={orderFilters.source}
                          onChange={(value) =>
                            setOrderFilters({
                              ...orderFilters,
                              source: value,
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
                        </ChoiceField>
                        <ChoiceField
                          label="Payment state"
                          value={orderFilters.payment}
                          onChange={(value) =>
                            setOrderFilters({
                              ...orderFilters,
                              payment: value,
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
                        </ChoiceField>
                      </div>
                    </Disclosure>
                    {liveOrders.map((order) => (
                      <LiveOrderCard
                        key={order.id}
                        hidden={
                          !filteredOrders.some((shown) => shown.id === order.id)
                        }
                        order={order}
                        timeZone={branch?.timezone}
                        actions={
                          <div className="mw-actions">
                            {!order.historicalReadOnly &&
                              nextState[order.status] &&
                              button(
                                "Mark " + sourceLabel(nextState[order.status]),
                                () =>
                                  act(
                                    branchBase + `/orders/${order.id}/status`,
                                    {
                                      status: nextState[order.status],
                                      version: order.version,
                                    },
                                    "Order updated.",
                                  ),
                                ["submitted", "accepted", "preparing"].includes(
                                  order.status,
                                )
                                  ? "orders.prepare"
                                  : "orders.fulfill",
                              )}
                          </div>
                        }
                      >
                        <OrderResponsibility
                          key={branchBase + order.id + "responsibility"}
                          timeZone={branch?.timezone}
                          base={branchBase}
                          order={order}
                          disabled={busy || offline}
                          canAssign={
                            allowed("orders.assign") &&
                            !order.historicalReadOnly
                          }
                          save={mutate}
                          onRefresh={refresh}
                        />
                        {!order.historicalReadOnly &&
                          allowed("orders.fulfill") && (
                            <ItemFulfillment
                              key={branchBase + order.id}
                              base={branchBase}
                              order={order}
                              tickets={data.tickets}
                              preparationFacts={data.preparationFacts}
                              disabled={busy || offline}
                              save={mutate}
                            />
                          )}
                        <Disclosure
                          summary="Items, instructions and history"
                          className="mw-live-order-items"
                        >
                          <OrderInstructions order={order} />
                          {list(order.items).map((line: any, index: number) => (
                            <div key={line.orderLineId || index}>
                              <small>
                                {line.quantity} ×{" "}
                                {line.name || line.productName}
                                {line.size ? " · " + line.size : ""}
                              </small>
                              <OrderInstructions item={line} />
                            </div>
                          ))}
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
                                This record does not create a live bill, stock
                                hold or preparation ticket.
                              </p>
                            </div>
                          )}
                          {Number.isSafeInteger(order.writtenOff) &&
                            order.writtenOff > 0 && (
                              <small>
                                Non-cash written-off debt:{" "}
                                {formatMoney(order.writtenOff)} · Outstanding:{" "}
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
                            <summary>Responsibility & payment history</summary>
                            <OrderTimeline
                              entries={order.history}
                              timeZone={branch?.timezone}
                            />
                          </details>

                          {!order.historicalReadOnly &&
                            allowed("orders.fulfill") && (
                              <ItemCancellation
                                key={branchBase + order.id + financialRevision}
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
                    ))}
                    {!filteredOrders.length &&
                      empty("No orders match the current filters.")}
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
                        hasTable={!!orderDraft.visitId}
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
                        <ChoiceField
                          label="Table"
                          searchable
                          required
                          value={tabForm.tableId || ""}
                          onChange={(value) => updateForm("tableId", value)}
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
                        </ChoiceField>
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
                    bills={
                      <Bills
                        canRoomCharge={
                          capabilities.includes("room_charge") &&
                          allowed("room_charge.post")
                        }
                        key={branchBase + financialRevision}
                        bills={data.bills}
                        actorId={principal || user.id}
                        visits={data.visits}
                        tables={data.tables}
                        base={branchBase}
                        disabled={busy || offline}
                        canPay={allowed("payments.record")}
                        save={mutate}
                      />
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
                                capacity: Number(tabForm.capacity ?? 1),
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
                </>
              )}
              {activeSection === "reservations" && (
                <section className="mw-card">
                  <h2>Reservations & front desk</h2>
                  <ReservationDesk
                    key={branchBase}
                    reservations={data.reservations}
                    serverTime={data.serverTime}
                    timeZone={branch?.timezone}
                    initialQueue={
                      currentAttention?.section === "reservations"
                        ? "arrivals"
                        : "all"
                    }
                    initialReservationId={
                      currentAttention?.section === "reservations"
                        ? currentAttention.recordId
                        : undefined
                    }
                    renderRecord={(reservation) => (
                      <>
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
                      </>
                    )}
                  />
                  <div ref={reservationRequestPanel}>
                    <ReservationRequest
                      userId={principal || user.id}
                      organizationId={organizationId}
                      branchId={branchId}
                      branchName={branch?.name}
                      timeZone={branch?.timezone}
                      tables={
                        Array.isArray(data.tables) ? data.tables : undefined
                      }
                      minimumSpendPolicy={minimumSpendPolicy}
                      depositPolicy={data?.branch?.settings?.depositPolicy}
                      reservationPolicy={
                        data?.branch?.settings?.reservationPolicy
                      }
                      reservationsEnabled={
                        data?.branch?.settings?.reservationsEnabled === true
                      }
                      newReservationsAllowed={
                        features?.flags?.new_reservations !== false
                      }
                      disabled={busy || offline}
                      canRequest={allowed("reservations.manage")}
                      save={mutate}
                      onRecorded={() => {
                        if (
                          activeScope.current === branchBase &&
                          scopeEpoch.current.generation === scopeVersion &&
                          authorizationEpoch.current ===
                            renderedAuthorizationVersion
                        )
                          void refresh();
                      }}
                    />
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
                            reference:
                              tabForm.method === "room_charge"
                                ? `${tabForm.roomNumber || ""} ${tabForm.surname || ""}`
                                : tabForm.reference || "",
                          },
                          "Collection recorded.",
                        ),
                      )}
                    >
                      <Combobox
                        label="Order"
                        value={tabForm.orderId || ""}
                        onChange={(value) =>
                          setTabForm((current) => ({
                            ...current,
                            orderId: value,
                            amount: "",
                            cashTender: "",
                          }))
                        }
                        required
                        options={liveOrders.map((order) => ({
                          value: order.id,
                          label: order.reference || order.id.slice(0, 8),
                          description: `${order.displayName || ""} · ${formatMoney(order.total)} · ${order.status}`,
                          searchText: `${order.tableName || ""} ${order.tableId || ""}`,
                        }))}
                      />
                      <PaymentEntry
                        order={liveOrders.find(
                          (order) => order.id === tabForm.orderId,
                        )}
                        method={tabForm.method || "cash"}
                        amount={tabForm.amount || ""}
                        tender={tabForm.cashTender || ""}
                        onChange={(patch) =>
                          setTabForm((current) => ({ ...current, ...patch }))
                        }
                      />

                      <Segmented
                        label="Payment origin"
                        value={tabForm.method || "cash"}
                        onChange={(value) =>
                          setTabForm((current) => ({
                            ...current,
                            method: value,
                            cashTender: "",
                          }))
                        }
                        options={[
                          ...(capabilities.includes("room_charge") &&
                          allowed("room_charge.post")
                            ? [
                                {
                                  value: "room_charge",
                                  label: "Charge to room",
                                },
                              ]
                            : []),
                          { value: "cash", label: "Cash" },
                          { value: "external_pos", label: "External POS" },
                          {
                            value: "external_transfer",
                            label: "Verified external transfer",
                          },
                        ]}
                      />
                      {tabForm.method === "room_charge" && (
                        <>
                          <label>
                            Room number
                            <input
                              required
                              pattern="[A-Za-z0-9 -]+"
                              maxLength={20}
                              value={tabForm.roomNumber || ""}
                              onChange={(e) =>
                                updateForm("roomNumber", e.target.value)
                              }
                            />
                          </label>
                          <label>
                            Guest surname
                            <input
                              required
                              pattern="[A-Za-z -]+"
                              maxLength={39}
                              value={tabForm.surname || ""}
                              onChange={(e) =>
                                updateForm("surname", e.target.value)
                              }
                            />
                          </label>
                        </>
                      )}
                      {field(
                        "Receipt / transfer reference",
                        "reference",
                        "text",
                        false,
                      )}
                      <div className="mw-wide">
                        <button
                          className="primary"
                          disabled={
                            busy ||
                            offline ||
                            roomWrite.busy ||
                            !!roomWrite.pending
                          }
                        >
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
                        <Combobox
                          label="Refund order"
                          value={tabForm.refundOrder || ""}
                          onChange={(value) => updateForm("refundOrder", value)}
                          required
                          options={liveOrders.map((order) => ({
                            value: order.id,
                            label: order.reference || order.id.slice(0, 8),
                            description: `${order.displayName || ""} · ${formatMoney(order.total)}`,
                          }))}
                        />
                        {field(
                          "Amount returned (naira)",
                          "refundAmount",
                          "number",
                        )}
                        <Segmented
                          label="Refund payout method"
                          value={tabForm.refundMethod || ""}
                          onChange={(value) =>
                            updateForm("refundMethod", value)
                          }
                          required
                          options={[
                            { value: "cash", label: "Cash returned" },
                            {
                              value: "external_pos",
                              label: "External POS refund",
                            },
                            {
                              value: "external_transfer",
                              label: "External transfer returned",
                            },
                          ]}
                        />
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
                  <div ref={shiftOperationPanel}>
                    <ShiftOperation
                      userId={principal || user.id}
                      organizationId={organizationId}
                      branchId={branchId}
                      shifts={data.shifts}
                      timeZone={branch?.timezone}
                      disabled={busy || offline}
                      canManage={allowed("shifts.manage")}
                      save={mutate}
                      onRecorded={() => {
                        if (
                          activeScope.current === branchBase &&
                          scopeEpoch.current.generation === scopeVersion &&
                          authorizationEpoch.current ===
                            renderedAuthorizationVersion
                        )
                          void refresh();
                      }}
                    />
                  </div>
                  <ShiftWorkspace
                    key={branchBase}
                    shifts={data.shifts}
                    initialQueue={
                      currentAttention?.section === "shifts"
                        ? "attention"
                        : "all"
                    }
                    initialShiftId={
                      currentAttention?.section === "shifts"
                        ? currentAttention.recordId
                        : undefined
                    }
                    renderRecord={(shift) => (
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
                      </ShiftRecord>
                    )}
                  />
                </section>
              )}
              {activeSection === "team" && (
                <div className="mw-people">
                  <AccessOperationProvider
                    actorId={user.id}
                    organizationId={organizationId}
                    canManage={allowed("members.manage")}
                    authorityKey={JSON.stringify([
                      permissions.slice().sort(),
                      organization?.role === "owner",
                    ])}
                    disabled={busy || offline}
                    save={mutate}
                  >
                    <MemberAccess
                      organizationId={organizationId}
                      branchId={branchId}
                      branches={branches}
                      userId={user.id}
                      canManage={allowed("members.manage")}
                      disabled={busy || offline}
                      save={mutate}
                    />
                    <RoleManager
                      key={branchBase}
                      userId={user.id}
                      organizationId={organizationId}
                      branchId={branchId}
                      permissions={membershipPermissions}
                      branches={branches}
                      canGrantOwner={organization?.role === "owner"}
                      onAccessChanged={() => void loadContext(true)}
                      disabled={busy || offline}
                      save={mutate}
                    />
                  </AccessOperationProvider>
                </div>
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
