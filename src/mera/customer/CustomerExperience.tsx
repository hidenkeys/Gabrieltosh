import { Combobox } from "../ui/Combobox";
import ReservationOptions from "./ReservationOptions";
import { Chips } from "../ui/Chips";
import { Segmented } from "../ui/Segmented";
import { Stepper } from "../ui/Stepper";
import { useEffect, useRef, useState } from "react";
import { MeraLoading } from "../ui/MeraEntry";
import { brandingStyle } from "../branding";
import {
  orderStateLabel,
  paymentStateLabel,
  activityLabel,
  customerDate,
} from "./orderPresentation";
import { categoryNavigation, matchesCategory } from "./categories";
import { quoteDeadline, quoteReviewExpired } from "./quoteClock";
import {
  assertCheckoutSession,
  parseAttemptResolution,
  buildCheckoutJournal,
  checkoutScopeFromMenu,
  clearCheckoutJournal,
  currentSessionRef,
  readCheckoutJournal,
  saveCheckoutJournal,
  CheckoutRecoveryError,
  type CheckoutJournal,
} from "./checkoutRecovery";
import {
  assertReservationSession,
  buildReservationJournal,
  clearReservationJournal,
  readReservationJournal,
  parseReservationAttempt,
  reservationScope,
  saveReservationJournal,
  type ReservationJournal,
} from "./reservationRecovery";
import SessionOrders from "./SessionOrders";
import HelpRequests from "./HelpRequests";
import GuestActivity from "./GuestActivity";
import VisitSummary from "./VisitSummary";
import CustomizationDialog from "./CustomizationDialog";
import {
  reservationStatusLabel,
  reservationDateLabel,
} from "./reservationPresentation";
import { ProductImage } from "../../ProductImage";
import { money } from "../../api";
import { customerRequest, requestId } from "./client";

type Product = {
  id: string;
  name: string;
  code: string;
  imageCode?: string;
  image?: string;
  category: string;
  categoryId?: string | null;
  parentCategory?: string;
  description: string;
  price: number;
  size: string;
  available: boolean;
  stockMode: string;
  stock: number;
  variants: {
    id: string;
    name: string;
    price: number;
    stockMode?: string;
    stock?: number;
  }[];
  modifierGroups: {
    id: string;
    name: string;
    min: number;
    max: number;
    options: { id: string; name: string; price: number }[];
  }[];
  allergens: string[];
  dietary: string[];
};
type CartLine = {
  key: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  variantId?: string;
  modifiers: string[];
  summary: string;
};
export default function CustomerExperience({
  organizationSlug,
  branchId,
}: { organizationSlug?: string; branchId?: string } = {}) {
  const route = window.location.pathname.split("/").filter(Boolean);
  const slug = organizationSlug || route[2] || "bing-chun";
  const branch = branchId || route[3] || "20000000-0000-4000-8000-000000000001";
  const prefix = `/public/${encodeURIComponent(slug)}/${encodeURIComponent(branch)}`;
  const bingChun = slug === "bing-chun";
  const requestedTable = new URLSearchParams(window.location.search).get(
    "tableId",
  );
  const [joinTable, setJoinTable] = useState(requestedTable || "");
  const [branches, setBranches] = useState<any[]>([]);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutNotice, setCheckoutNotice] = useState("");
  const checkoutNoticeRef = useRef<HTMLDivElement>(null);
  const customerHeaderRef = useRef<HTMLElement>(null);
  const [checkoutNameInvalid, setCheckoutNameInvalid] = useState(false);
  const checkoutErrorRef = useRef<HTMLDivElement>(null);
  const checkoutNameRef = useRef<HTMLInputElement>(null);
  const stopRequestHeadingRef = useRef<HTMLHeadingElement>(null);
  const orderHeadingRef = useRef<HTMLHeadingElement>(null);
  const [hasGuest, setHasGuest] = useState(false);
  const [menu, setMenu] = useState<any>(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All"),
    [tab, setTab] = useState("menu"),
    [cart, setCart] = useState<CartLine[]>([]),
    [selected, setSelected] = useState<Product | null>(null),
    [variant, setVariant] = useState(""),
    [modifiers, setModifiers] = useState<string[]>([]),
    [displayName, setDisplayName] = useState(""),
    [fulfillment, setFulfillment] = useState("counter_pickup"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [order, setOrder] = useState<any>(null),
    [trackingError, setTrackingError] = useState(""),
    [reservation, setReservation] = useState<any>(null),
    [visit, setVisit] = useState<any>(null),
    [success, setSuccess] = useState("");
  const assetUrl = (value: unknown) =>
    typeof value === "string" &&
    /^\/api\/mera\/v1\/public\/assets\/[a-zA-Z0-9-]+$/.test(value)
      ? value
      : undefined;
  const logo = assetUrl(menu?.organization?.branding?.logo);
  const cover = assetUrl(menu?.organization?.branding?.coverImage);
  const [quote, setQuote] = useState<any>(null);
  const [billRefreshing, setBillRefreshing] = useState(false);
  const [visitReadError, setVisitReadError] = useState("");
  const [joinError, setJoinError] = useState("");
  const visitReadGeneration = useRef(0);
  const visitManualRead = useRef(false);
  const [, tickQuoteClock] = useState(0);
  useEffect(() => {
    if (!quote?.expiresAt) return;
    const update = () => tickQuoteClock((value) => value + 1);
    const delay = Math.max(0, (quote.reviewDeadline ?? 0) - performance.now());
    const timer = setTimeout(
      update,
      Math.min(Math.ceil(delay) + 1, 2147483647),
    );
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [quote]);
  const [joinTerms, setJoinTerms] = useState<any>(null);
  const [joinAcknowledged, setJoinAcknowledged] = useState(false);
  const [reservationAcknowledged, setReservationAcknowledged] = useState(false);
  const [reservationIntent, setReservationIntent] = useState<any>(null);
  const minimumPolicy =
    menu?.minimumSpendPolicy || menu?.reservationPolicy?.minimumSpendPolicy;
  const minimumBlocked =
    (minimumPolicy?.enabled && !minimumPolicy.approved) ||
    (!!menu?.reservationPolicy?.minimumSpend && !minimumPolicy?.approved);
  useEffect(() => setReservationAcknowledged(false), [minimumPolicy?.version]);
  const checkoutKey = useRef(requestId());
  const [checkoutIntent, setCheckoutIntent] = useState<any>(null);
  const checkoutIntentRef = useRef<any>(null);
  const checkoutInFlight = useRef(false);
  const checkoutUncertain = useRef(false);
  const checkoutGeneration = useRef(0);
  const [checkoutRecovery, setCheckoutRecovery] = useState<{
    phase: "checking" | "ready" | "blocked";
    message: string;
  }>({ phase: "checking", message: "Checking this tab’s saved orders…" });
  const checkoutJournalRef = useRef<CheckoutJournal | null>(null);
  const checkoutReviewRef = useRef<{ lines: CartLine[]; quote: any } | null>(
    null,
  );
  const recoveryCheck = useRef(0);
  const resolvingAttempt = useRef(false);
  const [confirmStopRequest, setConfirmStopRequest] = useState(false);
  const [stopReason, setStopReason] = useState("");
  const checkoutLocked =
    busy || !!checkoutIntent || checkoutRecovery.phase !== "ready";
  const modifierGroupRefs = useRef(new Map<string, HTMLFieldSetElement>());
  const [modifierError, setModifierError] = useState<string | null>(null);
  const [customizationError, setCustomizationError] = useState("");
  function closeCustomization() {
    setSelected(null);
    setModifierError(null);
    setCustomizationError("");
  }
  const basketRef = useRef<HTMLElement>(null);
  const [basketViewed, setBasketViewed] = useState(false);
  useEffect(() => {
    const basket = basketRef.current;
    if (
      tab !== "menu" ||
      !basket ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => setBasketViewed(entries[0]?.isIntersecting || false),
      { threshold: 0 },
    );
    observer.observe(basket);
    return () => observer.disconnect();
  }, [tab, menu]);
  const basketHeadingRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const reservationKey = useRef(requestId());
  const reservationSessionRef = useRef<string | null>(null);
  const reservationJournalRef = useRef<ReservationJournal | null>(null);
  const [reservationRecovery, setReservationRecovery] = useState<
    "checking" | "ready" | "blocked"
  >("checking");
  const [reservationReview, setReservationReview] = useState<
    ReservationJournal["review"] | null
  >(null);
  const reservationRecoveryGeneration = useRef(0);
  const [confirmStopReservation, setConfirmStopReservation] = useState(false);
  const [stopReservationReason, setStopReservationReason] = useState("");
  const reservationInFlight = useRef(false);
  const [reservationError, setReservationError] = useState("");
  async function load() {
    setError("");
    try {
      setMenu(await customerRequest(prefix + "/menu"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (
      menu &&
      joinTable &&
      !menu.tables?.some((table: any) => table.id === joinTable)
    )
      setJoinTable("");
  }, [menu, joinTable]);
  useEffect(() => {
    let active = true;
    void load();
    customerRequest(
      `/public/organizations/${encodeURIComponent(slug)}/branches`,
    )
      .then((result) => {
        if (active) setBranches(result.branches || []);
      })
      .catch(() => {});
    checkoutGeneration.current++;
    recoveryCheck.current++;
    checkoutJournalRef.current = null;
    checkoutReviewRef.current = null;
    resolvingAttempt.current = false;
    setConfirmStopRequest(false);
    setStopReason("");
    setCheckoutRecovery({
      phase: "checking",
      message: "Checking this tab’s saved orders…",
    });
    checkoutInFlight.current = false;
    setBusy(false);
    setCheckoutError("");
    setCheckoutNotice("");
    setCheckoutNameInvalid(false);
    checkoutIntentRef.current = null;
    setCheckoutIntent(null);
    setCart([]);
    setOrder(null);
    setVisit(null);
    visitReadGeneration.current++;
    visitManualRead.current = false;
    setVisitReadError("");
    setJoinError("");
    setBillRefreshing(false);
    setHasGuest(false);
    setReservation(null);
    setReservationIntent(null);
    setReservationError("");
    reservationSessionRef.current = null;
    reservationJournalRef.current = null;
    reservationRecoveryGeneration.current++;
    setReservationReview(null);
    setReservationRecovery("checking");
    customerRequest(prefix + "/guest")
      .then(async (session) => {
        if (!active) return;
        if (!checkoutIntentRef.current)
          setDisplayName(session.displayName || "");
        setHasGuest(true);
        const upcoming = [...(session.reservations || [])]
          .filter(
            (r) => !["cancelled", "completed", "no-show"].includes(r.status),
          )
          .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
        if (upcoming && !reservationJournalRef.current)
          setReservation(upcoming);
        const joined = session.openVisits?.[0];
        if (joined?.id) {
          const currentVisit = await customerRequest(
            `/public/visits/${joined.id}`,
          );
          if (
            active &&
            (!requestedTable ||
              (
                currentVisit.visit?.tableIds || [currentVisit.visit?.tableId]
              ).includes(requestedTable))
          ) {
            setVisit(currentVisit);
            if (!checkoutIntentRef.current) setFulfillment("table_service");
          }
        }
        const latest = [...(session.orders || [])].sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
        )[0];
        if (latest?.id) {
          const canonical = await customerRequest(
            `/public/orders/${latest.id}`,
          );
          if (active) setOrder(canonical);
        }
      })
      .catch(() => {
        /* Browsing remains anonymous until a guest submits. */
      });
    return () => {
      active = false;
    };
  }, [prefix]);
  async function restoreReservation() {
    const generation = ++reservationRecoveryGeneration.current;
    setReservationRecovery("checking");
    try {
      const scope = reservationScope(
        menu?.organization?.id,
        branch,
        menu?.branch?.id,
      );
      const record =
        readReservationJournal(scope) || reservationJournalRef.current;
      if (!record) {
        if (generation === reservationRecoveryGeneration.current)
          setReservationRecovery("ready");
        return;
      }
      reservationJournalRef.current = record;
      const session = await customerRequest(prefix + "/guest");
      if (generation !== reservationRecoveryGeneration.current) return;
      assertReservationSession(record, session);
      setReservation(null);
      setReservationIntent(record.intent);
      reservationSessionRef.current = record.sessionRef;
      reservationKey.current = record.intent.requestKey;
      setReservationReview(record.review);
      if (!checkoutIntentRef.current) setDisplayName(record.intent.displayName);
      setReservationAcknowledged(!!record.intent.minimumSpendAcknowledged);
      setReservationRecovery("ready");
      setReservationError(
        "A saved reservation still needs checking. No request was sent automatically.",
      );
    } catch {
      if (generation !== reservationRecoveryGeneration.current) return;
      setReservation(null);
      setReservationIntent(null);
      setReservationReview(null);
      setReservationRecovery("blocked");
      setReservationError(
        "This tab’s saved reservation could not be verified in the current guest session. It has not been retried. Keep this tab open and ask staff to check it before booking again.",
      );
    }
  }
  useEffect(() => {
    if (menu?.organization?.id && menu?.branch?.id) void restoreReservation();
  }, [menu?.organization?.id, menu?.branch?.id, branch, prefix]);
  async function restoreCheckout() {
    const check = ++recoveryCheck.current;
    setCheckoutRecovery({
      phase: "checking",
      message: "Checking this tab’s saved orders…",
    });
    try {
      const scope = checkoutScopeFromMenu(
        menu?.organization?.id,
        branch,
        menu?.branch?.id,
      );
      const stored = readCheckoutJournal(scope);
      let record = stored || checkoutJournalRef.current;
      if (!record && !checkoutIntentRef.current) {
        if (check === recoveryCheck.current)
          setCheckoutRecovery({ phase: "ready", message: "" });
        return;
      }
      const session = await customerRequest(prefix + "/guest");
      if (check !== recoveryCheck.current) return;
      if (!record) {
        if (!checkoutReviewRef.current)
          throw new CheckoutRecoveryError(
            "The original review could not be restored safely. No new order was sent.",
          );
        record = buildCheckoutJournal({
          scope,
          sessionRef: currentSessionRef(session),
          intent: checkoutIntentRef.current,
          lines: checkoutReviewRef.current.lines,
          quote: checkoutReviewRef.current.quote,
        });
      }
      assertCheckoutSession(record, session);
      record = saveCheckoutJournal(record);
      if (check !== recoveryCheck.current) return;
      checkoutJournalRef.current = record;
      checkoutReviewRef.current = record.review;
      checkoutIntentRef.current = record.intent;
      setCheckoutIntent(record.intent);
      checkoutKey.current = record.intent.requestKey;
      checkoutUncertain.current = true;
      setCart(record.review.lines);
      setDisplayName(record.intent.displayName);
      setNote(record.intent.note);
      setFulfillment(record.intent.fulfillment);
      setHasGuest(true);
      setQuote(
        record.review.quote
          ? {
              ...record.review.quote,
              cartSignature: JSON.stringify(record.intent.items),
            }
          : null,
      );
      setCheckoutRecovery({
        phase: "ready",
        message:
          "A saved order is still unconfirmed. Review its original details and retry the original request. Nothing was submitted automatically.",
      });
    } catch (e) {
      if (check !== recoveryCheck.current) return;
      setOrder(null);
      setVisit(null);
      setReservation(null);
      setHasGuest(false);
      setDisplayName("");
      setNote("");
      setCart([]);
      setQuote(null);
      setCheckoutRecovery({
        phase: "blocked",
        message:
          e instanceof CheckoutRecoveryError
            ? e.message
            : "The saved order’s session could not be checked. It has not been resubmitted. Check your connection or ask staff to review it before ordering again.",
      });
    }
  }
  useEffect(() => {
    if (menu) void restoreCheckout();
    return () => {
      recoveryCheck.current++;
    };
  }, [menu?.organization?.id, menu?.branch?.id, branch, prefix]);
  useEffect(() => {
    if (!order?.id) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const next = await customerRequest(`/public/orders/${order.id}`);
        if (!stopped) {
          setOrder(next);
          setTrackingError("");
        }
      } catch (e) {
        if (!stopped) {
          if ((e as any).status === 401) {
            clearGuestView(
              "Your guest session expired. Existing orders were not cancelled. Enter your name to start a new session.",
            );
            return;
          }
          setTrackingError((e as Error).message);
          if (
            [401, 403, 404].includes((e as Error & { status: number }).status)
          )
            setOrder(null);
        }
      }
    };
    const timer = setInterval(refresh, 3000);
    window.addEventListener("online", refresh);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
    };
  }, [order?.id]);
  async function refreshVisit(id: string, manual = false) {
    const scope = checkoutGeneration.current;
    const version = ++visitReadGeneration.current;
    if (manual) {
      visitManualRead.current = true;
      setBillRefreshing(true);
    }
    try {
      const next = await customerRequest(`/public/visits/${id}`);
      if (
        scope !== checkoutGeneration.current ||
        version !== visitReadGeneration.current
      )
        return;
      setVisit(next);
      setVisitReadError("");
    } catch (failure) {
      if (
        scope !== checkoutGeneration.current ||
        version !== visitReadGeneration.current
      )
        return;
      if ((failure as any).status === 401) {
        clearGuestView(
          "Your guest session expired. Existing orders and visits remain unchanged.",
        );
        return;
      }
      if ([403, 404].includes((failure as any).status)) {
        setVisit(null);
        if (!checkoutIntentRef.current) setFulfillment("counter_pickup");
        setError(
          "This visit is no longer available. Ask staff for the current joining code.",
        );
      } else
        setVisitReadError(
          "Table updates are interrupted. The last confirmed bill is shown. Check your connection and refresh before relying on this balance.",
        );
    } finally {
      if (
        scope === checkoutGeneration.current &&
        version === visitReadGeneration.current
      ) {
        visitManualRead.current = false;
        setBillRefreshing(false);
      }
    }
  }
  useEffect(() => {
    if (!visit?.visit?.id) return;
    let active = true,
      refreshing = false;
    const refresh = async () => {
      if (!active || refreshing || visitManualRead.current) return;
      refreshing = true;
      try {
        await refreshVisit(visit.visit.id);
      } finally {
        refreshing = false;
      }
    };
    const timer = setInterval(refresh, 3000);
    window.addEventListener("online", refresh);
    return () => {
      active = false;
      visitReadGeneration.current++;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
    };
  }, [visit?.visit?.id]);
  const products: Product[] = menu?.products || [];
  const publishedCategories = menu?.categories || [];
  const categories = [
    { key: "All", label: "All", depth: 0 },
    ...categoryNavigation(publishedCategories, products),
  ];
  const visibleProducts = products.filter(
    (product) =>
      matchesCategory(product, category, publishedCategories) &&
      `${product.name} ${product.description} ${product.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const basketQuantity = cart.reduce((count, line) => count + line.quantity, 0);
  function openBasket() {
    setBasketViewed(true);
    basketRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
    basketHeadingRef.current?.focus({ preventScroll: true });
  }
  function returnToMenu() {
    setBasketViewed(false);
    searchRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
    searchRef.current?.focus({ preventScroll: true });
  }
  const total = cart.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  function clearGuestView(message: string) {
    reservationRecoveryGeneration.current++;
    resolvingAttempt.current = false;
    setConfirmStopRequest(false);
    setStopReason("");
    const unresolved =
      !!checkoutIntentRef.current ||
      !!checkoutJournalRef.current ||
      checkoutRecovery.phase === "blocked";
    setBusy(false);
    checkoutGeneration.current++;
    recoveryCheck.current++;
    checkoutInFlight.current = false;
    if (!unresolved) {
      checkoutIntentRef.current = null;
      setCheckoutIntent(null);
      checkoutReviewRef.current = null;
      checkoutKey.current = requestId();
    } else
      setCheckoutRecovery({
        phase: "blocked",
        message:
          "Guest access ended, but an earlier order still needs review. Its recovery record was not discarded. Ask staff to check it before ordering again.",
      });
    setOrder(null);
    setVisit(null);
    visitReadGeneration.current++;
    visitManualRead.current = false;
    setVisitReadError("");
    setJoinError("");
    setBillRefreshing(false);
    setReservation(null);
    setHasGuest(false);
    setDisplayName("");
    setNote("");
    setCart([]);
    setQuote(null);
    setJoinTerms(null);
    setJoinAcknowledged(false);
    setReservationIntent(null);
    setReservationAcknowledged(false);
    if (reservationJournalRef.current) setReservationRecovery("blocked");
    setReservationError("");
    reservationSessionRef.current = null;
    setFulfillment("counter_pickup");
    setTrackingError("");
    setError("");
    setCheckoutError("");
    setCheckoutNotice("");
    setCheckoutNameInvalid(false);
    setSuccess(message);
    setTab("menu");
    reservationKey.current = requestId();
  }
  async function guest(
    name = displayName.trim() || "Guest",
    generation = checkoutGeneration.current,
  ) {
    if (!name.trim())
      throw new Error("Enter the name we should call for your order.");
    await customerRequest(prefix + "/guests", "POST", {
      displayName: name.trim(),
    });
    if (generation === checkoutGeneration.current) setHasGuest(true);
  }
  function addProduct() {
    if (checkoutIntentRef.current || checkoutInFlight.current) return;
    if (!selected) return;
    const selectedVariant = selected.variants?.find(
      (choice) => choice.id === variant,
    );
    if (
      selected.available === false ||
      (selected.stockMode === "counted" &&
        typeof selected.stock === "number" &&
        selected.stock <= 0) ||
      (selected.variants?.length && !selectedVariant) ||
      (selectedVariant?.stockMode === "counted" &&
        typeof selectedVariant.stock === "number" &&
        selectedVariant.stock <= 0)
    ) {
      setModifierError(null);
      setCustomizationError(
        "This selection is unavailable. Choose another size or ask staff for help.",
      );
      return;
    }
    for (const group of selected.modifierGroups || []) {
      const count = group.options.filter((option) =>
        modifiers.includes(option.id),
      ).length;
      if (count < group.min || count > group.max) {
        setModifierError(group.id);
        setCustomizationError(
          `Choose ${group.min === group.max ? group.min : `${group.min}–${group.max}`} ${group.max === 1 ? "option" : "options"} for ${group.name}.`,
        );
        modifierGroupRefs.current.get(group.id)?.focus();
        return;
      }
    }
    const chosen = selected.variants?.find((v) => v.id === variant);
    const extras = (selected.modifierGroups || [])
      .flatMap((g) => g.options)
      .filter((o) => modifiers.includes(o.id));
    const key = [selected.id, variant, ...[...modifiers].sort()].join(":");
    setCart((old) =>
      old.some((l) => l.key === key)
        ? old.map((l) =>
            l.key === key ? { ...l, quantity: l.quantity + 1 } : l,
          )
        : [
            ...old,
            {
              key,
              productId: selected.id,
              name: selected.name,
              quantity: 1,
              variantId: variant || undefined,
              modifiers: [...modifiers],
              unitPrice:
                (chosen?.price ?? selected.price) +
                extras.reduce((sum, o) => sum + o.price, 0),
              summary: [chosen?.name, ...extras.map((o) => o.name)]
                .filter(Boolean)
                .join(" · "),
            },
          ],
    );
    checkoutKey.current = requestId();
    setSelected(null);
    setError("");
  }
  const cartSignature = JSON.stringify(
    cart.map(({ productId, quantity, variantId, modifiers }) => ({
      productId,
      quantity,
      variantId,
      modifiers,
    })),
  );
  const bookingMinimumPolicy =
    reservationIntent && reservationReview
      ? reservationReview.minimumSpendPolicy
      : minimumPolicy;
  const bookingPolicy =
    reservationIntent && reservationReview
      ? {
          enabled: true,
          depositRequired: !!reservationReview.depositPolicy,
          depositPolicy: reservationReview.depositPolicy,
        }
      : menu?.reservationPolicy;
  const currentQuote = checkoutIntent
    ? quote
    : quote?.cartSignature === cartSignature &&
        quote?.menuVersion === menu?.version
      ? quote
      : null;
  const expiredReview =
    !checkoutIntent && currentQuote && quoteReviewExpired(currentQuote);
  const checkoutWorking =
    busy && (checkoutInFlight.current || resolvingAttempt.current);
  useEffect(() => {
    if (tab === "track" && order?.id) orderHeadingRef.current?.focus();
  }, [tab, order?.id]);
  useEffect(() => {
    if (!checkoutError || tab !== "menu") return;
    if (
      checkoutNameInvalid &&
      checkoutNameRef.current &&
      !checkoutNameRef.current.disabled
    )
      checkoutNameRef.current.focus();
    else {
      checkoutErrorRef.current?.focus();
      checkoutErrorRef.current?.scrollIntoView?.({
        block: "nearest",
        behavior: "auto",
      });
    }
  }, [checkoutError, checkoutNameInvalid, tab, checkoutRecovery.phase]);
  useEffect(() => {
    if (confirmStopRequest) stopRequestHeadingRef.current?.focus();
  }, [confirmStopRequest]);
  useEffect(() => {
    if (tab === "menu" && checkoutNotice) {
      checkoutNoticeRef.current?.focus();
      checkoutNoticeRef.current?.scrollIntoView?.({
        block: "nearest",
        behavior: "auto",
      });
    }
  }, [checkoutNotice, tab]);
  function reviewCheckout() {
    setTab("menu");
    setBasketViewed(true);
  }
  async function submitOrder() {
    if (
      checkoutInFlight.current ||
      resolvingAttempt.current ||
      busy ||
      checkoutRecovery.phase !== "ready"
    )
      return;
    if (!checkoutIntentRef.current) {
      setCheckoutNameInvalid(false);
      if (!cart.length) {
        setCheckoutError(
          "Your basket is empty. Choose something from the menu before submitting.",
        );
        return;
      }
      if (displayName.trim().length > 100) {
        setCheckoutNameInvalid(true);
        setCheckoutError(
          "Enter the name we should call for your order (up to 100 characters).",
        );
        return;
      }
      if (!menu?.orderingAvailable) {
        setCheckoutError(
          "Ordering is paused. You can keep browsing, but no new order can be sent right now.",
        );
        return;
      }
      if (fulfillment === "table_service" && !visit?.visit?.id) {
        setCheckoutError(
          "Join your table before placing a table order, or choose counter pickup or takeaway.",
        );
        return;
      }
    }
    checkoutInFlight.current = true;
    const generation = checkoutGeneration.current;
    setBusy(true);
    setCheckoutError("");
    setCheckoutNotice("");
    let attempt = checkoutIntentRef.current;
    let sessionVerified = false;
    try {
      if (
        !attempt &&
        menu.pricingPolicy?.enabled &&
        (!currentQuote || quoteReviewExpired(currentQuote))
      ) {
        await guest();
        const startedAt = performance.now();
        let serverDate: string | null = null;
        const nextQuote = await customerRequest(
          prefix + "/quote",
          "POST",
          {
            menuVersion: menu.version,
            items: JSON.parse(cartSignature),
          },
          {
            onServerDate: (date) => {
              serverDate = date;
            },
          },
        );
        if (generation === checkoutGeneration.current)
          setQuote({
            ...nextQuote,
            cartSignature,
            reviewDeadline: quoteDeadline(
              nextQuote.expiresAt,
              serverDate,
              startedAt,
              performance.now(),
            ),
          });
        return;
      }
      if (!attempt) {
        checkoutUncertain.current = false;
        attempt = {
          requestKey: checkoutKey.current,
          ...(menu.pricingPolicy?.enabled ? { quoteId: currentQuote.id } : {}),
          menuVersion: menu.version,
          displayName: displayName.trim() || "Guest",
          fulfillment,
          visitId: visit?.visit?.id,
          items: JSON.parse(cartSignature),
          note,
        };
        checkoutIntentRef.current = attempt;
        checkoutReviewRef.current = {
          lines: JSON.parse(JSON.stringify(cart)),
          quote: currentQuote,
        };
        setCheckoutIntent(attempt);
      }
      const scope = checkoutScopeFromMenu(
        menu?.organization?.id,
        branch,
        menu?.branch?.id,
      );
      let record = checkoutJournalRef.current;
      if (!record) await guest(attempt.displayName, generation);
      if (generation !== checkoutGeneration.current) return;
      const session = await customerRequest(prefix + "/guest");
      if (generation !== checkoutGeneration.current) return;
      if (record) assertCheckoutSession(record, session);
      else
        record = buildCheckoutJournal({
          scope,
          sessionRef: currentSessionRef(session),
          intent: attempt,
          lines: checkoutReviewRef.current!.lines,
          quote: checkoutReviewRef.current!.quote,
        });
      sessionVerified = true;
      checkoutJournalRef.current = record;
      record = saveCheckoutJournal(record);
      attempt = record.intent;
      checkoutIntentRef.current = attempt;
      setCheckoutIntent(attempt);
      const next = await customerRequest(prefix + "/orders", "POST", attempt);
      if (generation !== checkoutGeneration.current) return;
      setOrder(next);
      setTab("track");
      clearCheckoutJournal(scope, attempt.requestKey);
      checkoutJournalRef.current = null;
      checkoutReviewRef.current = null;
      checkoutIntentRef.current = null;
      setCheckoutIntent(null);
      setCheckoutRecovery({ phase: "ready", message: "" });
      setQuote(null);
      setCart([]);
      setTab("track");
      checkoutKey.current = requestId();
    } catch (e) {
      if (generation !== checkoutGeneration.current) return;
      const message = (e as Error).message;
      const canCorrectFirstDomainRejection =
        !checkoutUncertain.current &&
        (e as any).status === 409 &&
        ["MENU_CHANGED", "QUOTE_CHANGED", "QUOTE_REQUIRED"].includes(
          (e as any).code,
        );
      if (canCorrectFirstDomainRejection && !attempt) {
        setQuote(null);
      } else if (canCorrectFirstDomainRejection) {
        try {
          const scope = checkoutScopeFromMenu(
            menu?.organization?.id,
            branch,
            menu?.branch?.id,
          );
          clearCheckoutJournal(scope, attempt.requestKey);
          checkoutJournalRef.current = null;
          checkoutReviewRef.current = null;
          checkoutIntentRef.current = null;
          setCheckoutIntent(null);
          setQuote(null);
        } catch (clearError) {
          checkoutUncertain.current = true;
          setCheckoutRecovery({
            phase: "blocked",
            message: (clearError as Error).message,
          });
        }
      } else if (attempt) {
        checkoutUncertain.current = true;
        if (
          e instanceof CheckoutRecoveryError ||
          (!sessionVerified && [401, 403, 404].includes((e as any).status))
        )
          setCheckoutRecovery({
            phase: "blocked",
            message:
              e instanceof CheckoutRecoveryError
                ? e.message
                : "This guest session could not be verified. The original order remains saved and has not been retried. Ask staff to review it before ordering again.",
          });
        else if ([401, 403, 404, 408, 429].includes((e as any).status))
          setCheckoutRecovery({
            phase: "ready",
            message:
              "The original order is still unresolved. This response did not confirm its outcome; its original retry details remain locked.",
          });
      }
      await load().catch(() => {});
      setCheckoutError(message);
    } finally {
      if (generation === checkoutGeneration.current) {
        checkoutInFlight.current = false;
        setBusy(false);
      }
    }
  }
  async function resolveOriginalOrder(stop = false) {
    if (
      checkoutInFlight.current ||
      resolvingAttempt.current ||
      checkoutRecovery.phase !== "ready"
    )
      return;
    resolvingAttempt.current = true;
    const generation = checkoutGeneration.current;
    setBusy(true);
    setCheckoutError("");
    setCheckoutNotice("");
    try {
      const scope = checkoutScopeFromMenu(
        menu?.organization?.id,
        branch,
        menu?.branch?.id,
      );
      const record = checkoutJournalRef.current || readCheckoutJournal(scope);
      if (!record)
        throw new CheckoutRecoveryError(
          "The original order could not be checked safely. Keep this tab open and ask staff to review it.",
        );
      const session = await customerRequest(prefix + "/guest");
      assertCheckoutSession(record, session);
      if (generation !== checkoutGeneration.current) return;
      const result = parseAttemptResolution(
        await customerRequest(
          prefix +
            "/order-attempts/" +
            record.intent.requestKey +
            (stop ? "/abandon" : ""),
          stop ? "POST" : "GET",
          stop ? { reason: stopReason.trim() } : undefined,
        ),
      );
      if (generation !== checkoutGeneration.current) return;
      if (result.status === "not_found") {
        setCheckoutRecovery({ phase: "ready", message: "" });
        setCheckoutNotice(
          "The venue has not recorded this request yet. That does not confirm failure. Keep the original retry details, or explicitly stop this unconfirmed request before starting another.",
        );
        return;
      }
      if (result.status === "recorded") {
        setOrder(result.order);
        setTab("track");
      }
      clearCheckoutJournal(scope, record.intent.requestKey);
      checkoutGeneration.current++;
      recoveryCheck.current++;
      checkoutInFlight.current = false;
      resolvingAttempt.current = false;
      checkoutJournalRef.current = null;
      checkoutReviewRef.current = null;
      checkoutIntentRef.current = null;
      checkoutUncertain.current = false;
      setCheckoutIntent(null);
      setQuote(null);
      setCart([]);
      setNote("");
      setConfirmStopRequest(false);
      setStopReason("");
      setBusy(false);
      checkoutKey.current = requestId();
      setCheckoutRecovery({ phase: "ready", message: "" });
      if (result.status === "recorded") {
        setOrder(result.order);
        setTab("track");
        setSuccess(
          "Your order was already received. It has not been cancelled, and no refund was made.",
        );
      } else {
        setTab("menu");
        setFulfillment(visit?.visit?.id ? "table_service" : "counter_pickup");
        setCheckoutNotice(
          "That unconfirmed request is stopped. No payment or refund was made. You can choose items for a new order.",
        );
        void load();
      }
    } catch (e) {
      if (generation !== checkoutGeneration.current) return;
      checkoutUncertain.current = true;
      setCheckoutError((e as Error).message);
      if (
        e instanceof CheckoutRecoveryError ||
        [401, 403, 404].includes((e as any).status)
      )
        setCheckoutRecovery({
          phase: "blocked",
          message:
            e instanceof CheckoutRecoveryError
              ? e.message
              : "This guest session could not be verified. The original request remains saved; no replacement order was sent.",
        });
    } finally {
      if (generation === checkoutGeneration.current) {
        resolvingAttempt.current = false;
        setBusy(false);
      }
    }
  }
  function finishReservationAttempt(
    record: ReservationJournal,
    result: ReturnType<typeof parseReservationAttempt>,
  ) {
    if (result.status === "not_found") return false;
    if (result.status === "recorded") setReservation(result.reservation);
    clearReservationJournal(record);
    reservationJournalRef.current = null;
    reservationSessionRef.current = null;
    setReservationIntent(null);
    setReservationReview(null);
    setConfirmStopReservation(false);
    setStopReservationReason("");
    reservationKey.current = requestId();
    setReservationError("");
    setReservationRecovery("ready");
    if (result.status === "abandoned")
      setSuccess(
        "The unconfirmed reservation request is stopped. An accepted booking has not been cancelled, and no refund was made.",
      );
    return true;
  }
  async function resolveReservation(stop = false) {
    if (reservationInFlight.current || reservationRecovery !== "ready") return;
    reservationInFlight.current = true;
    setBusy(true);
    setReservationError("");
    const generation = checkoutGeneration.current;
    try {
      const record = reservationJournalRef.current;
      if (!record)
        throw Error(
          "The original reservation could not be checked safely. Ask staff to review it.",
        );
      const checked = parseReservationAttempt(
        await customerRequest(
          prefix + "/reservation-attempts/" + record.intent.requestKey,
        ),
        record,
      );
      if (generation !== checkoutGeneration.current) return;
      if (finishReservationAttempt(record, checked)) return;
      if (!stop) {
        setReservationError(
          "The venue has not recorded this request yet. That does not confirm failure. Keep the original retry details or explicitly stop the unconfirmed request before booking again.",
        );
        return;
      }
      const stopped = parseReservationAttempt(
        await customerRequest(
          prefix +
            "/reservation-attempts/" +
            record.intent.requestKey +
            "/abandon",
          "POST",
          { reason: stopReservationReason.trim() },
        ),
        record,
      );
      if (generation !== checkoutGeneration.current) return;
      if (!finishReservationAttempt(record, stopped))
        throw Error(
          "Stopping this request was not confirmed. Its original details remain saved.",
        );
    } catch (e) {
      if (generation === checkoutGeneration.current) {
        setReservationError((e as Error).message);
        if (
          [401, 403, 404].includes((e as any).status) ||
          (e as Error).message.includes("guest session")
        ) {
          setReservationRecovery("blocked");
          setReservationReview(null);
          setReservationIntent(null);
        }
      }
    } finally {
      reservationInFlight.current = false;
      if (generation === checkoutGeneration.current) setBusy(false);
    }
  }
  async function reserve(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (reservationInFlight.current || reservationRecovery !== "ready") return;
    reservationInFlight.current = true;
    const generation = checkoutGeneration.current;
    setBusy(true);
    setReservationError("");
    try {
      const start = new Date(String(data.get("startsAt")));
      const intent = reservationIntent || {
        requestKey: reservationKey.current,
        displayName: displayName.trim(),
        contact: String(data.get("contact")),
        partySize: Number(data.get("partySize")),
        startsAt: start.toISOString(),
        endsAt: new Date(
          start.getTime() + Number(data.get("duration")) * 60000,
        ).toISOString(),
        notes: String(data.get("notes") || ""),
        ...(data.get("tableId")
          ? { tableId: String(data.get("tableId")) }
          : {}),
        ...(minimumPolicy?.enabled
          ? {
              minimumSpendAcknowledged: reservationAcknowledged,
              minimumSpendPolicyVersion: minimumPolicy.version,
            }
          : {}),
      };
      setReservationIntent(intent);
      if (!reservationIntent) await guest();
      const session = await customerRequest(prefix + "/guest");
      const sessionRef = currentSessionRef(session);
      if (generation !== checkoutGeneration.current) return;
      if (
        reservationIntent &&
        (!reservationSessionRef.current ||
          reservationSessionRef.current !== sessionRef)
      )
        throw new Error(
          "This reservation cannot be retried in a different guest session. Ask staff to check your original request before making another.",
        );
      reservationSessionRef.current = sessionRef;
      const record =
        reservationJournalRef.current ||
        buildReservationJournal(
          reservationScope(menu?.organization?.id, branch, menu?.branch?.id),
          sessionRef,
          intent,
          { ...menu?.reservationPolicy, minimumSpendPolicy: minimumPolicy },
          menu?.branch?.timezone || "Africa/Lagos",
        );
      assertReservationSession(record, session);
      reservationJournalRef.current = saveReservationJournal(record);
      setReservationReview(record.review);
      if (reservationIntent) {
        const checked = parseReservationAttempt(
          await customerRequest(
            prefix + "/reservation-attempts/" + record.intent.requestKey,
          ),
          record,
        );
        if (generation !== checkoutGeneration.current) return;
        if (finishReservationAttempt(record, checked)) return;
      }
      const next = await customerRequest(
        prefix + "/reservations",
        "POST",
        intent,
      );
      if (generation !== checkoutGeneration.current) return;
      setReservation(next);
      clearReservationJournal(record);
      reservationJournalRef.current = null;
      setReservationReview(null);
      setReservationIntent(null);
      reservationSessionRef.current = null;
      reservationKey.current = requestId();
    } catch (e) {
      if (generation === checkoutGeneration.current) {
        setReservationError((e as Error).message);
        if (
          [401, 403, 404].includes((e as any).status) ||
          (e as Error).message.includes("guest session")
        ) {
          setReservationRecovery("blocked");
          setReservationReview(null);
          setReservationIntent(null);
        }
      }
    } finally {
      reservationInFlight.current = false;
      if (generation === checkoutGeneration.current) setBusy(false);
    }
  }
  async function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const generation = checkoutGeneration.current;
    setBusy(true);
    setJoinError("");
    try {
      await guest(displayName.trim(), generation);
      if (generation !== checkoutGeneration.current) return;
      let terms = joinTerms;
      if (!terms) {
        const intent = {
          ...(joinTable
            ? { tableId: joinTable }
            : { visitId: String(data.get("visitId")) }),
          code: String(data.get("code")),
        };
        const checked = await customerRequest(
          prefix + "/visits/terms",
          "POST",
          intent,
        );
        if (generation !== checkoutGeneration.current) return;
        terms = { ...checked, intent };
        setJoinTerms(terms);
        setJoinAcknowledged(false);
        if (terms.minimumSpendPolicy?.enabled) return;
      }
      if (terms.minimumSpendPolicy?.enabled && !joinAcknowledged)
        throw new Error(
          "Acknowledge the exact minimum-spend terms before joining.",
        );
      const result = await customerRequest(prefix + "/visits/join", "POST", {
        visitId: terms.visitId,
        code: terms.intent.code,
        ...(terms.minimumSpendPolicy?.enabled
          ? {
              minimumSpendAcknowledged: true,
              minimumSpendPolicyVersion: terms.minimumSpendPolicy.version,
            }
          : {}),
      });
      if (generation !== checkoutGeneration.current) return;
      const id = result.visit?.id || result.id || terms.visitId;
      const current = await customerRequest(`/public/visits/${id}`);
      if (generation !== checkoutGeneration.current) return;
      visitReadGeneration.current++;
      setVisitReadError("");
      setVisit(current);
      if (!checkoutIntentRef.current) setFulfillment("table_service");
      setJoinTerms(null);
      setJoinAcknowledged(false);
      setTab("menu");
      setSuccess(
        "You have joined this visit. Additional rounds will be linked to this table.",
      );
    } catch (e) {
      if (generation === checkoutGeneration.current)
        setJoinError((e as Error).message);
    } finally {
      if (generation === checkoutGeneration.current) setBusy(false);
    }
  }
  useEffect(() => {
    const header = customerHeaderRef.current;
    if (!header) return;
    const update = () => {
      const height = header.getBoundingClientRect().height;
      if (height > 0)
        header.parentElement?.style.setProperty(
          "--mc-header-height",
          `${height}px`,
        );
    };
    update();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(header);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [menu]);
  if (!menu)
    return (
      <MeraLoading
        retryLabel="Refresh menu"
        title="Opening the menu…"
        description="Finding your venue and its current menu."
        error={error}
        onRetry={() => void load()}
      />
    );
  return (
    <div
      className={"mera-customer" + (tab === "menu" ? " mc-menu-view" : "")}
      style={{
        ...brandingStyle(menu?.organization?.branding),
        ...(!menu?.organization?.branding?.font ||
        menu.organization.branding.font === "system"
          ? {
              fontFamily:
                '"Mera Text", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }
          : {}),
      }}
    >
      <header
        ref={customerHeaderRef}
        className="mc-top"
        inert={!!selected}
        aria-hidden={selected ? true : undefined}
      >
        <div className="mc-wrap">
          <div className="mc-brand">
            {logo || bingChun ? (
              <img
                src={logo || "/brand/brand-logo.png"}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.visibility = "hidden";
                }}
              />
            ) : (
              <span className="mc-initial" aria-hidden="true">
                {(menu?.organization?.name || "Mera").slice(0, 1)}
              </span>
            )}
            <span>
              {menu?.organization?.name || "Mera"}
              <small
                style={{ display: "block", fontWeight: 500, color: "#51647d" }}
              >
                {menu?.branch?.name || "Customer menu"}
              </small>
            </span>
          </div>
          <a href="/mera">Hospitality, made simpler · Mera</a>
          {branches.length > 1 && (
            <div className="mc-branch-selector">
              <Combobox
                label="Choose branch"
                value={branch}
                disabled={checkoutLocked}
                options={branches.map((option: any) => ({
                  value: option.id,
                  label: option.name,
                }))}
                onChange={(value) => {
                  if (!value) return;
                  if (
                    cart.length &&
                    !window.confirm(
                      "Changing branch clears this basket. Continue?",
                    )
                  )
                    return;
                  window.location.assign(
                    `/mera/menu/${encodeURIComponent(slug)}/${encodeURIComponent(value)}`,
                  );
                }}
              />
            </div>
          )}
        </div>
      </header>
      <main
        className="mc-wrap"
        inert={!!selected}
        aria-hidden={selected ? true : undefined}
      >
        <section className="mc-hero" aria-labelledby="mc-menu-title">
          <div>
            <h1 id="mc-menu-title">Menu</h1>
            <p>
              {menu?.organization?.branding?.description ||
                "Choose your favourites and make them your own."}
            </p>
            {menu?.branch?.settings?.address && (
              <p className="mc-note mc-address">
                {menu.branch.settings.address}
              </p>
            )}
          </div>
          {cover && (
            <img
              className="mc-uploaded-cover"
              src={cover}
              alt={`${menu.organization.name} welcome`}
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
              }}
            />
          )}
        </section>
        {requestedTable && menu && (
          <div className="mc-alert" role="status">
            {menu.tables?.some((table: any) => table.id === requestedTable) ? (
              <>
                You scanned{" "}
                {
                  menu.tables.find((table: any) => table.id === requestedTable)
                    .name
                }
                . Ask staff for the current visit’s joining code before opening
                its private bill.{" "}
                <button
                  className="mc-secondary"
                  onClick={() => setTab("visit")}
                >
                  Join table
                </button>
              </>
            ) : (
              <>
                This table context is not available at this branch. Ask staff to
                check the QR code; the counter menu remains available.
              </>
            )}
          </div>
        )}
        <nav className="mc-tabs" aria-label="Customer services">
          {[
            ["menu", "Menu"],
            ["track", "Your order"],
            ["reserve", "Reserve a table"],
            ["visit", visit ? "Your table" : "Join a table"],
            ["help", "Ask for help"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={tab === value}
              onClick={() => {
                setTab(value);
                setError("");
                setSuccess("");
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        {error && (
          <div className="mc-alert" role="alert">
            {error}{" "}
            <button className="mc-secondary" onClick={load}>
              Refresh menu
            </button>
          </div>
        )}
        {tab !== "menu" &&
          (checkoutError || (checkoutNotice && checkoutIntent)) && (
            <div className="mc-alert" role="status">
              <p>
                {checkoutIntent
                  ? "An order request still needs review."
                  : "Your basket needs attention."}
              </p>
              <button
                type="button"
                className="mc-secondary"
                onClick={reviewCheckout}
              >
                Review your order request
              </button>
            </div>
          )}
        {success && (
          <div className="mc-alert mc-success" role="status">
            {success}
          </div>
        )}
        {menu && checkoutRecovery.message && (
          <div className="mc-alert" role="status">
            <p>{checkoutRecovery.message}</p>
            {checkoutRecovery.phase === "blocked" && (
              <button
                className="mc-secondary"
                disabled={busy}
                onClick={() => void restoreCheckout()}
              >
                Check saved order and session
              </button>
            )}
          </div>
        )}
        {!menu && !error && (
          <div className="mc-empty" role="status">
            Opening the menu…
          </div>
        )}
        {menu && tab === "menu" && (
          <div className="mc-columns">
            <section aria-label="Products">
              <div className="mc-menu-toolbar">
                <div className="mc-search-wrap">
                  <input
                    ref={searchRef}
                    className="mc-search"
                    aria-label="Search menu"
                    placeholder="Search the menu"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      className="mc-clear-search"
                      aria-label="Clear menu search"
                      onClick={() => {
                        setSearch("");
                        searchRef.current?.focus();
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {!menu.orderingAvailable && (
                <p className="mc-ordering-status" role="status">
                  Ordering is paused. You can still browse the menu.
                </p>
              )}
              <Chips
                className="mc-category-chips"
                label="Menu categories"
                value={category}
                onChange={setCategory}
                options={categories.map((c) => ({
                  value: c.key,
                  label: c.label,
                }))}
              />
              <div className="mc-products">
                {visibleProducts.map((p) => (
                  <article className="mc-product" key={p.id}>
                    {assetUrl(p.image) || bingChun || p.imageCode ? (
                      <ProductImage
                        product={{
                          ...p,
                          image: assetUrl(p.image),
                          code: p.imageCode || p.code,
                        }}
                        decorative
                      />
                    ) : (
                      <div className="mc-photo-placeholder">
                        Photo coming soon
                      </div>
                    )}
                    <div>
                      <h3>{p.name}</h3>
                      <p>{p.description || p.size}</p>
                      {p.dietary?.length > 0 && (
                        <p>Dietary: {p.dietary.join(", ")}</p>
                      )}
                      {p.allergens?.length > 0 && (
                        <p>Allergens: {p.allergens.join(", ")}</p>
                      )}
                      <span className="mc-price">
                        {p.variants?.length
                          ? "Choose size for price"
                          : money(p.price)}
                      </span>
                      <button
                        aria-label={`${!p.available || (p.stockMode === "counted" && p.stock <= 0) ? "Sold out" : "Choose"}: ${p.name}`}
                        disabled={
                          checkoutLocked ||
                          !p.available ||
                          (p.stockMode === "counted" && p.stock <= 0) ||
                          !menu.orderingAvailable
                        }
                        onClick={() => {
                          setSelected(p);
                          setModifierError(null);
                          setCustomizationError("");
                          setVariant(p.variants?.[0]?.id || "");
                          setModifiers([]);
                          setError("");
                        }}
                      >
                        {!p.available ||
                        (p.stockMode === "counted" && p.stock <= 0)
                          ? "Sold out"
                          : "Choose"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!visibleProducts.length && (
                <div className="mc-empty mc-menu-empty" role="status">
                  <h2>
                    {products.length
                      ? "No items found"
                      : menu.version > 0
                        ? "No menu items available"
                        : "The menu is on its way"}
                  </h2>
                  <p>
                    {products.length
                      ? "Try another search or browse all categories."
                      : menu.version > 0
                        ? "There are no items to browse right now. Please check with the team."
                        : "This venue has not published its menu yet. Please check with the team."}
                  </p>
                  {products.length > 0 && (
                    <button
                      className="mc-secondary"
                      onClick={() => {
                        setSearch("");
                        setCategory("All");
                        searchRef.current?.focus();
                      }}
                    >
                      Clear search and filters
                    </button>
                  )}
                </div>
              )}
            </section>
            <aside
              className="mc-panel mc-cart"
              id="mc-basket"
              ref={basketRef}
              aria-labelledby="mc-basket-title"
            >
              {checkoutNotice && (
                <div
                  className="mc-checkout-notice"
                  role="status"
                  tabIndex={-1}
                  ref={checkoutNoticeRef}
                >
                  {checkoutNotice}
                </div>
              )}
              {checkoutError && (
                <div
                  id="mc-checkout-error"
                  className="mc-checkout-error"
                  role="alert"
                  tabIndex={-1}
                  ref={checkoutErrorRef}
                >
                  <h3>Check your order</h3>
                  <p>{checkoutError}</p>
                </div>
              )}
              {checkoutRecovery.phase !== "ready" ? (
                <div className="mc-recovery">
                  <h2 id="mc-basket-title" ref={basketHeadingRef} tabIndex={-1}>
                    Order recovery
                  </h2>
                  <p>{checkoutRecovery.message}</p>
                  {checkoutRecovery.phase === "blocked" && (
                    <button
                      className="mc-secondary"
                      disabled={busy}
                      onClick={() => void restoreCheckout()}
                    >
                      Check saved order
                    </button>
                  )}
                </div>
              ) : (
                <form
                  className="mc-checkout-form"
                  aria-label="Review your order"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitOrder();
                  }}
                >
                  <div className="mc-basket-heading">
                    <h2
                      id="mc-basket-title"
                      ref={basketHeadingRef}
                      tabIndex={-1}
                    >
                      Your basket
                    </h2>
                    <span key={basketQuantity}>
                      {basketQuantity} {basketQuantity === 1 ? "item" : "items"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mc-mobile-only mc-secondary"
                    onClick={returnToMenu}
                  >
                    Back to menu
                  </button>
                  <section
                    className="mc-checkout-items"
                    aria-labelledby="mc-checkout-items-title"
                  >
                    <h3 id="mc-checkout-items-title">Your items</h3>
                    {cart.length === 0 ? (
                      <p className="mc-basket-empty">
                        Your basket is empty. Choose something from the menu to
                        get started.
                      </p>
                    ) : (
                      cart.map((line) => (
                        <div className="mc-line" key={line.key}>
                          <strong>{line.name}</strong>
                          <small>{line.summary}</small>
                          <div className="mc-line-controls">
                            <Stepper
                              label={`Quantity for ${line.name}${line.summary ? ` (${line.summary})` : ""}`}
                              value={line.quantity}
                              min={0}
                              max={100}
                              disabled={checkoutLocked}
                              decrementLabel={`Remove one ${line.name}${line.summary ? ` (${line.summary})` : ""}`}
                              incrementLabel={`Add one ${line.name}${line.summary ? ` (${line.summary})` : ""}`}
                              onChange={(quantity) => {
                                if (
                                  checkoutIntentRef.current ||
                                  checkoutInFlight.current
                                )
                                  return;
                                setCart((old) =>
                                  old
                                    .map((item) =>
                                      item.key === line.key
                                        ? { ...item, quantity }
                                        : item,
                                    )
                                    .filter((item) => item.quantity > 0),
                                );
                                checkoutKey.current = requestId();
                              }}
                            />
                            <b>{money(line.unitPrice * line.quantity)}</b>
                          </div>
                        </div>
                      ))
                    )}
                  </section>
                  <fieldset
                    className="mc-checkout-details"
                    disabled={checkoutLocked}
                  >
                    <legend>Order details</legend>
                    <label>
                      What should we call you?
                      <input
                        ref={checkoutNameRef}
                        aria-invalid={checkoutNameInvalid || undefined}
                        aria-describedby={`mc-order-name-hint${checkoutNameInvalid ? " mc-checkout-error" : ""}`}
                        onInvalid={(event) => {
                          event.preventDefault();
                          setCheckoutNameInvalid(true);
                          setCheckoutError(
                            "Enter the name we should call for your order (up to 100 characters).",
                          );
                          checkoutNameRef.current?.focus();
                        }}
                        maxLength={100}
                        autoComplete="given-name"
                        value={displayName}
                        disabled={checkoutLocked}
                        onChange={(e) => {
                          if (!checkoutLocked) {
                            setDisplayName(e.target.value);
                            setCheckoutNameInvalid(false);
                            if (checkoutNameInvalid) setCheckoutError("");
                          }
                        }}
                        placeholder="What should we call you?"
                      />
                    </label>
                    <p id="mc-order-name-hint" className="mc-checkout-hint">
                      Optional. We’ll use “Guest” if you leave this blank.
                    </p>
                    <Segmented
                      label="Enjoy it"
                      value={fulfillment}
                      disabled={checkoutLocked}
                      onChange={(value) => {
                        if (!checkoutLocked) setFulfillment(value);
                      }}
                      options={[
                        { value: "counter_pickup", label: "Counter pickup" },
                        { value: "takeaway", label: "Takeaway" },
                        ...(visit ||
                        checkoutIntent?.fulfillment === "table_service"
                          ? [{ value: "table_service", label: "At my table" }]
                          : []),
                      ]}
                    />
                    {fulfillment === "table_service" && (
                      <p className="mc-checkout-hint">
                        {visit?.visit?.tableName
                          ? `For ${visit.visit.tableName}.`
                          : "For your original joined table. Ask staff if you are unsure which table this request belongs to."}
                      </p>
                    )}
                    <div
                      className="mc-note-presets"
                      role="group"
                      aria-label="Quick order notes"
                    >
                      {[
                        "Less ice",
                        "No sugar",
                        "Allergy — please ask me",
                        "Extra napkins",
                      ].map((preset) => (
                        <button
                          type="button"
                          key={preset}
                          aria-pressed={note.split("; ").includes(preset)}
                          disabled={checkoutLocked}
                          onClick={() => {
                            if (checkoutLocked) return;
                            const parts = note ? note.split("; ") : [];
                            const next = (
                              parts.includes(preset)
                                ? parts.filter((part) => part !== preset)
                                : [...parts, preset]
                            ).join("; ");
                            if (next.length <= 500) setNote(next);
                            else
                              setCheckoutError(
                                "Keep order notes within 500 characters.",
                              );
                          }}
                        >
                          {preset.startsWith("Allergy") ? "Allergy" : preset}
                        </button>
                      ))}
                    </div>
                    <label>
                      Anything we should know?
                      <textarea
                        maxLength={500}
                        value={note}
                        disabled={checkoutLocked}
                        onChange={(e) => {
                          if (!checkoutLocked) setNote(e.target.value);
                        }}
                        placeholder="Optional order note"
                      />
                    </label>
                  </fieldset>
                  <section
                    className="mc-checkout-review"
                    aria-labelledby="mc-checkout-review-title"
                  >
                    <h3 id="mc-checkout-review-title">Review & send</h3>
                    {currentQuote && (
                      <div
                        aria-label="Price review"
                        className="mc-checkout-price-review"
                      >
                        <h4>
                          {expiredReview
                            ? "Previous price review"
                            : "Price review"}
                        </h4>
                        <p>Subtotal {money(currentQuote.subtotal)}</p>
                        {currentQuote.lines?.map((line: any, index: number) => (
                          <p key={index}>
                            {line.label}: {money(line.amount)}
                          </p>
                        ))}
                        <p>
                          {checkoutIntent ? (
                            "Your original reviewed charges are kept while this request is checked."
                          ) : (
                            <>
                              Review these charges before submitting. Review
                              expires at{" "}
                              {new Date(
                                currentQuote.expiresAt,
                              ).toLocaleTimeString()}
                              .
                            </>
                          )}
                        </p>
                      </div>
                    )}
                    {expiredReview && (
                      <p className="mc-alert" role="status">
                        This price review has expired or its time could not be
                        verified. Review the latest total before submitting. No
                        order has been sent.
                      </p>
                    )}
                    <div className="mc-total">
                      <span>
                        {checkoutIntent
                          ? "Original order total"
                          : expiredReview
                            ? "Previous reviewed total"
                            : menu.pricingPolicy?.enabled && !currentQuote
                              ? "Items estimate"
                              : "Total"}
                      </span>
                      <span key={String(currentQuote?.total ?? total)}>
                        {money(currentQuote?.total ?? total)}
                      </span>
                    </div>
                    {menu.pricingPolicy?.enabled && !currentQuote && (
                      <p>
                        Review discounts, service charge and tax before
                        submitting your order.
                      </p>
                    )}
                    <p className="mc-note">
                      The venue checks final prices and availability when you
                      submit. Online payment is not available. Please pay at the
                      counter; staff will confirm your payment.
                    </p>
                    {!menu.orderingAvailable && (
                      <div className="mc-alert">
                        Ordering is currently paused. You can still browse the
                        menu.
                      </div>
                    )}
                    {checkoutIntent && (
                      <section
                        className="mc-checkout-pending"
                        aria-label="Original order request"
                      >
                        <h4>Your original request</h4>
                        {checkoutIntent && !checkoutWorking && (
                          <p className="mc-note" role="status">
                            Order confirmation is uncertain. Your original
                            basket and details are preserved. Retry this request
                            or check your original order before starting another
                            order.
                          </p>
                        )}
                        {checkoutIntent && (
                          <div className="mc-actions">
                            <button
                              type="button"
                              className="mc-secondary"
                              disabled={busy}
                              onClick={() => void resolveOriginalOrder()}
                            >
                              Check original order
                            </button>
                            <button
                              type="button"
                              className="mc-secondary"
                              disabled={busy}
                              onClick={() => setConfirmStopRequest(true)}
                            >
                              Stop unconfirmed request…
                            </button>
                          </div>
                        )}
                        {checkoutIntent && confirmStopRequest && (
                          <div className="mc-alert">
                            <h3 tabIndex={-1} ref={stopRequestHeadingRef}>
                              Stop this unconfirmed request?
                            </h3>
                            <p>
                              If the venue already received your order, it will
                              be kept and shown to you. Otherwise this request
                              will be stopped so you can start another. This
                              does not cancel an accepted order, make a payment
                              or confirm a refund.
                            </p>
                            <label>
                              Why stop this request?
                              <textarea
                                minLength={3}
                                maxLength={500}
                                value={stopReason}
                                disabled={busy}
                                onChange={(event) =>
                                  setStopReason(event.target.value)
                                }
                              />
                            </label>
                            <button
                              type="button"
                              className="mc-secondary"
                              disabled={busy}
                              onClick={() => setConfirmStopRequest(false)}
                            >
                              Keep original request
                            </button>
                            <button
                              type="button"
                              className="mc-primary"
                              disabled={busy || stopReason.trim().length < 3}
                              onClick={() => void resolveOriginalOrder(true)}
                            >
                              Stop this request
                            </button>
                          </div>
                        )}
                      </section>
                    )}
                    {checkoutWorking && (
                      <p role="status" className="mc-checkout-hint">
                        {checkoutIntent
                          ? "Checking the original order request…"
                          : "Checking your order details…"}
                      </p>
                    )}
                    <button
                      type={checkoutIntent ? "button" : "submit"}
                      className="mc-primary"
                      disabled={
                        busy ||
                        (!checkoutIntent &&
                          (!cart.length || !menu.orderingAvailable))
                      }
                      onClick={
                        checkoutIntent ? () => void submitOrder() : undefined
                      }
                    >
                      {checkoutWorking
                        ? "Checking…"
                        : checkoutIntent
                          ? "Retry original order"
                          : menu.pricingPolicy?.enabled &&
                              (!currentQuote || expiredReview)
                            ? expiredReview
                              ? "Review latest total"
                              : "Review total"
                            : "Submit order"}
                    </button>
                  </section>
                </form>
              )}
            </aside>
          </div>
        )}
        {tab === "help" && (
          <HelpRequests
            prefix={prefix}
            ensureGuest={() => guest(displayName.trim() || "Guest")}
            hasGuest={hasGuest}
            displayName={displayName}
            onName={(value) => {
              if (!checkoutLocked) setDisplayName(value);
            }}
            nameLocked={checkoutLocked}
            orderId={order?.id}
            visitId={visit?.visit?.id}
          />
        )}
        {tab === "track" && (
          <section className="mc-panel mc-tracking-panel">
            <h2 ref={orderHeadingRef} tabIndex={-1}>
              Your order
            </h2>
            <p className="mc-note">
              Follow orders from this guest session. To check an order from
              another device, please ask staff for help.
            </p>
            {!order && trackingError && (
              <div className="mc-alert" role="alert">
                {trackingError} Your private order is no longer displayed.
              </div>
            )}
            {!order ? (
              <p>
                Submit an order on this device to follow its progress. Private
                order history is never looked up by name or table number.
              </p>
            ) : (
              <>
                <p>
                  Reference <b>{order.reference || "Reference unavailable"}</b>
                </p>
                <span className="mc-state">
                  {orderStateLabel(order.status)}
                </span>
                <span className="mc-state">
                  {paymentStateLabel(order.paymentStatus)}
                </span>
                <p>
                  Total {money(order.total)} · Recorded payments{" "}
                  {money(order.paid || 0)}
                  {order.refunded > 0 && (
                    <> · Recorded refunds {money(order.refunded)}</>
                  )}
                  {order.writtenOff > 0 && (
                    <> · Authorized write-off {money(order.writtenOff)}</>
                  )}
                  {order.settlementOutcome && (
                    <>
                      {" "}
                      · Settlement outcome:{" "}
                      {String(order.settlementOutcome).replaceAll("_", " ")}
                    </>
                  )}
                </p>
                <div className="mc-receipt" aria-label="Order details">
                  <h3>
                    {menu?.organization?.name} · {menu?.branch?.name}
                  </h3>
                  <p>
                    Order reference:{" "}
                    {order.reference || "Reference unavailable"}
                  </p>
                  <p>
                    Order status: {orderStateLabel(order.status)}
                    {" · "}Payment status:{" "}
                    {paymentStateLabel(order.paymentStatus)}
                  </p>
                  {order.createdAt && (
                    <p>
                      Placed{" "}
                      {customerDate(order.createdAt, menu?.branch?.timezone)}
                    </p>
                  )}
                  {(order.items || []).map((line: any, index: number) => (
                    <div className="mc-line" key={index}>
                      <strong>
                        {line.quantity} × {line.name}
                      </strong>
                      <small>
                        {line.size}
                        {line.modifiers?.length
                          ? " · " +
                            line.modifiers
                              .map((modifier: any) => modifier.name)
                              .join(", ")
                          : ""}
                      </small>
                      <p>{money(line.total ?? line.lineTotal ?? 0)}</p>
                    </div>
                  ))}
                  {order.pricing?.lines?.map((line: any, index: number) => (
                    <p key={index}>
                      {line.label}: {money(line.amount)}
                    </p>
                  ))}
                  <p>
                    Order total {money(order.total)} · Outstanding{" "}
                    {money(
                      Math.max(
                        0,
                        order.outstandingBalance ??
                          order.total -
                            (order.effectiveSettlement ??
                              order.effectivePaid ??
                              order.paid ??
                              0),
                      ),
                    )}
                  </p>
                  <p>Recorded payments: {money(order.paid || 0)}</p>
                  {order.refunded > 0 && (
                    <p>Recorded refunds: {money(order.refunded)}</p>
                  )}
                  {order.writtenOff > 0 && (
                    <p>Authorized write-off: {money(order.writtenOff)}</p>
                  )}
                  {order.paymentStatus === "paid" && (
                    <div className="mc-print-control">
                      <p>
                        Opens your device’s print options. This does not send
                        another copy to the venue’s printers.
                      </p>
                      <button
                        className="mc-secondary"
                        onClick={() => window.print()}
                      >
                        Print payment receipt
                      </button>
                    </div>
                  )}
                </div>
                {trackingError && (
                  <div className="mc-alert" role="alert">
                    Updates interrupted. Last confirmed status is shown.{" "}
                    {trackingError}
                  </div>
                )}
                <ul className="mc-history">
                  {(order.history || []).map((entry: any, i: number) => (
                    <li key={entry.id || i}>
                      {activityLabel(entry.action || entry.status)}
                      <small>
                        {customerDate(
                          entry.createdAt || entry.at,
                          menu?.branch?.timezone,
                        )}
                      </small>
                    </li>
                  ))}
                </ul>
                {["completed", "collected"].includes(order.status) && (
                  <Feedback
                    key={order.id}
                    orderId={order.id}
                    onSuccess={() =>
                      setSuccess(
                        "Thank you. Your feedback has been sent privately to the venue.",
                      )
                    }
                  />
                )}
              </>
            )}
          </section>
        )}
        {tab === "reserve" && (
          <section className="mc-panel mc-reservation-panel">
            <h2>A table for your plans</h2>
            <p>
              Request a table, then check the venue’s reply under Your order.
            </p>
            {reservationError && (
              <p className="mc-alert" role="alert">
                {reservationError}
              </p>
            )}
            {reservationRecovery !== "ready" ? (
              <div>
                <p role="status">
                  {reservationRecovery === "checking"
                    ? "Checking this tab’s saved reservations…"
                    : "Booking is paused until the saved request can be checked safely."}
                </p>
                <button
                  className="mc-secondary"
                  disabled={busy || reservationRecovery === "checking"}
                  onClick={() => void restoreReservation()}
                >
                  Check saved reservation
                </button>
              </div>
            ) : reservation && !reservationIntent ? (
              <div>
                <div className="mc-alert mc-success" role="status">
                  <strong>
                    {reservationStatusLabel(reservation.status || "requested")}
                  </strong>
                  <p>
                    {reservation.status === "confirmed"
                      ? "The venue has confirmed this reservation."
                      : !reservation.status ||
                          reservation.status === "requested"
                        ? "Your request has reached the venue. A table is only booked once the venue confirms it."
                        : "Check your activity under Your order for the venue’s latest update."}
                  </p>
                  <p>
                    No money has been collected here. Any deposit policy still
                    applies.
                  </p>
                </div>
                <p className="mc-reservation-reference">
                  Reference: {reservation.reference || reservation.id}
                </p>
                {reservation.startsAt && (
                  <p>
                    {reservationDateLabel(
                      reservation.startsAt,
                      menu?.branch?.timezone,
                    )}{" "}
                    · {reservation.partySize} guests
                  </p>
                )}
                {Number(reservation.depositRequired) > 0 && (
                  <p>
                    Required deposit: {money(reservation.depositRequired)} ·
                    Staff-recorded deposit:{" "}
                    {money(reservation.depositAmount || 0)}. Only confirmed
                    records count toward your bill.
                  </p>
                )}
                {reservation.minimumSpendPolicy?.enabled && (
                  <div className="mc-alert">
                    <p>
                      Booked minimum spend:{" "}
                      {money(reservation.minimumSpendPolicy.amount)}.
                    </p>
                    <p>{reservation.minimumSpendPolicy.disclosure}</p>
                    <p>
                      Your original booked terms apply. No automatic shortfall
                      charge is added.
                    </p>
                  </div>
                )}
                {reservation.visitId && (
                  <p>
                    This reservation is linked to a visit. Ask staff for its
                    joining code to view the private table bill.
                  </p>
                )}
                <button
                  className="mc-secondary"
                  onClick={() => {
                    setReservation(null);
                    reservationKey.current = requestId();
                  }}
                >
                  Request another reservation
                </button>
              </div>
            ) : (
              <form onSubmit={reserve}>
                {reservationIntent && reservationReview && (
                  <div className="mc-note">
                    <h3>Original reservation request</h3>
                    <p>
                      {reservationIntent.partySize} guests ·{" "}
                      {new Date(reservationIntent.startsAt).toLocaleString(
                        "en-GB",
                        { timeZone: reservationReview.timezone },
                      )}{" "}
                      ({reservationReview.timezone})
                    </p>
                    <p>Contact: {reservationIntent.contact}</p>
                    <p>{reservationIntent.notes}</p>
                  </div>
                )}
                <fieldset
                  disabled={busy || !!reservationIntent}
                  style={{ border: 0, padding: 0 }}
                >
                  <div className="mc-form-grid">
                    <label>
                      Your name
                      <input
                        required
                        maxLength={100}
                        value={displayName}
                        disabled={checkoutLocked}
                        onChange={(e) => {
                          if (!checkoutLocked) setDisplayName(e.target.value);
                        }}
                      />
                    </label>
                    <label>
                      Contact email or phone
                      <input
                        name="contact"
                        required
                        maxLength={160}
                        autoComplete="email"
                      />
                    </label>
                    <ReservationOptions
                      tables={menu?.tables}
                      timeZone={menu?.branch?.timezone}
                      disabled={busy || !!reservationIntent}
                    />
                  </div>
                  <label>
                    Notes
                    <textarea name="notes" maxLength={500} />
                  </label>
                  <p>
                    Availability is checked by the venue. A reference confirms
                    receipt of your request; the venue must confirm the booking
                    separately.
                  </p>
                  {bookingPolicy?.enabled === false && (
                    <div className="mc-alert">
                      This branch is not accepting online reservations.
                    </div>
                  )}
                  {bookingPolicy?.depositRequired &&
                  bookingPolicy.depositPolicy?.approved ? (
                    <div className="mc-alert">
                      Required deposit:{" "}
                      {money(bookingPolicy.depositPolicy.amount)}. Ask staff to
                      verify and record it before confirmation. Cancellation
                      cutoff:{" "}
                      {bookingPolicy.depositPolicy.cancellationCutoffHours}{" "}
                      hours. Refund rule:{" "}
                      {bookingPolicy.depositPolicy.refundRule ===
                      "refundable_before_cutoff"
                        ? "Refundable before the cutoff"
                        : "Non-refundable"}
                      . No online payment is collected here.
                    </div>
                  ) : bookingPolicy?.depositRequired ? (
                    <div className="mc-alert">
                      Please contact the venue to arrange the required deposit
                      before booking.
                    </div>
                  ) : null}
                  {bookingMinimumPolicy?.enabled &&
                    bookingMinimumPolicy.approved && (
                      <div className="mc-alert">
                        <p>
                          Minimum spend: {money(bookingMinimumPolicy.amount)} ·
                          based on net paid bill.
                        </p>
                        <p>{bookingMinimumPolicy.disclosure}</p>
                        <p>
                          No shortfall charge is added automatically. Additional
                          orders or an authorized manager waiver resolve a
                          shortfall.
                        </p>
                        <label>
                          <input
                            type="checkbox"
                            checked={reservationAcknowledged}
                            onChange={(event) =>
                              setReservationAcknowledged(event.target.checked)
                            }
                          />
                          I acknowledge this minimum-spend policy
                        </label>
                      </div>
                    )}
                  {minimumBlocked && (
                    <div className="mc-alert">
                      Please contact the venue to confirm minimum-spend terms
                      before booking.
                    </div>
                  )}
                </fieldset>
                {reservationIntent && (
                  <p role="status">
                    Your reservation has not been confirmed here. Its original
                    details stay locked for the same request. The original
                    request is saved in this tab. Check its outcome before
                    making another booking.
                  </p>
                )}
                {reservationIntent && reservationReview && (
                  <div className="mc-reservation-recovery-actions">
                    <button
                      type="button"
                      className="mc-secondary"
                      disabled={busy}
                      onClick={() => void resolveReservation()}
                    >
                      Check original reservation
                    </button>
                    <button
                      type="button"
                      className="mc-secondary"
                      disabled={busy}
                      onClick={() => setConfirmStopReservation(true)}
                    >
                      Stop unconfirmed reservation…
                    </button>
                    {confirmStopReservation && (
                      <fieldset disabled={busy}>
                        <legend>
                          Stop this unconfirmed reservation request?
                        </legend>
                        <p>
                          If the venue already accepted it, the booking will be
                          kept. Stopping an unconfirmed request does not cancel
                          a booking or confirm a refund.
                        </p>
                        <label>
                          Reason for stopping
                          <textarea
                            value={stopReservationReason}
                            onChange={(event) =>
                              setStopReservationReason(event.target.value)
                            }
                            minLength={3}
                            maxLength={500}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setConfirmStopReservation(false)}
                        >
                          Keep original reservation request
                        </button>
                        <button
                          type="button"
                          disabled={
                            busy || stopReservationReason.trim().length < 3
                          }
                          onClick={() => void resolveReservation(true)}
                        >
                          Stop unconfirmed reservation request
                        </button>
                      </fieldset>
                    )}
                  </div>
                )}
                <button
                  className="mc-primary"
                  disabled={
                    busy ||
                    !menu ||
                    (!reservationIntent &&
                      (bookingPolicy?.enabled === false ||
                        (!!bookingPolicy?.depositRequired &&
                          !bookingPolicy?.depositPolicy?.approved) ||
                        minimumBlocked ||
                        (bookingMinimumPolicy?.enabled &&
                          !reservationAcknowledged)))
                  }
                >
                  {busy
                    ? "Checking availability…"
                    : reservationIntent
                      ? "Retry original reservation"
                      : "Request reservation"}
                </button>
              </form>
            )}
          </section>
        )}
        {tab === "track" && hasGuest && (
          <>
            <SessionOrders
              prefix={prefix}
              timeZone={menu?.branch?.timezone}
              onSelect={setOrder}
              onClear={clearGuestView}
              hasUnconfirmedOrder={!!checkoutIntent}
            />
            <GuestActivity prefix={prefix} timeZone={menu?.branch?.timezone} />
            <MarketingPreference prefix={prefix} />
          </>
        )}
        {tab === "visit" && (
          <section className="mc-panel mc-visit-panel">
            <h2>{visit ? "Your table & bill" : "Join your table"}</h2>
            {!visit && joinError && (
              <p className="mc-alert" role="alert">
                {joinError}
              </p>
            )}
            {visit ? (
              <VisitSummary
                data={visit}
                refreshing={billRefreshing}
                refreshError={visitReadError}
                disabled={busy}
                onRefresh={() => void refreshVisit(visit.visit.id, true)}
                onOrderMore={() => setTab("menu")}
              />
            ) : (
              <form onSubmit={join}>
                <fieldset
                  disabled={busy || !!joinTerms}
                  style={{ border: 0, padding: 0 }}
                >
                  <p>
                    Choose your table and ask staff for its joining code. If
                    staff gave you a visit reference, you can use that instead.
                    Your table’s bill stays private until the code is checked.
                  </p>
                  <label>
                    Your name
                    <input
                      required
                      maxLength={100}
                      value={displayName}
                      disabled={checkoutLocked}
                      onChange={(e) => {
                        if (!checkoutLocked) setDisplayName(e.target.value);
                      }}
                    />
                  </label>
                  <Combobox
                    label="Table"
                    value={joinTable}
                    onChange={setJoinTable}
                    options={[
                      { value: "", label: "Use a visit reference instead" },
                      ...(menu?.tables || []).map((table: any) => ({
                        value: table.id,
                        label: table.name,
                      })),
                    ]}
                  />
                  {!joinTable && (
                    <label>
                      Visit reference
                      <input name="visitId" required autoComplete="off" />
                    </label>
                  )}
                  <label>
                    Joining code
                    <input name="code" required autoComplete="off" />
                  </label>
                </fieldset>
                {joinTerms?.minimumSpendPolicy?.enabled && (
                  <div className="mc-alert">
                    <p>
                      Minimum spend:{" "}
                      {money(joinTerms.minimumSpendPolicy.amount)} · based on
                      net paid bill.
                    </p>
                    <p>{joinTerms.minimumSpendPolicy.disclosure}</p>
                    <p>
                      These are this visit’s saved terms. No automatic shortfall
                      charge is added; additional orders or an authorized
                      manager waiver resolve a shortfall.
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={joinAcknowledged}
                        onChange={(event) =>
                          setJoinAcknowledged(event.target.checked)
                        }
                      />
                      I acknowledge this visit’s minimum-spend policy
                    </label>
                  </div>
                )}
                {joinTerms && (
                  <button
                    type="button"
                    className="mc-secondary"
                    disabled={busy}
                    onClick={() => {
                      setJoinTerms(null);
                      setJoinAcknowledged(false);
                    }}
                  >
                    Use another visit
                  </button>
                )}
                <button
                  className="mc-primary"
                  disabled={
                    busy ||
                    !menu ||
                    (joinTerms?.minimumSpendPolicy?.enabled &&
                      !joinAcknowledged)
                  }
                >
                  {busy ? "Checking visit…" : "Join current visit"}
                </button>
              </form>
            )}
          </section>
        )}
      </main>
      {menu &&
        tab === "menu" &&
        !basketViewed &&
        checkoutRecovery.phase === "ready" && (
          <div
            className="mc-mobile-basket"
            inert={!!selected}
            aria-hidden={selected ? true : undefined}
          >
            <button
              type="button"
              aria-controls="mc-basket"
              aria-label={`View basket, ${basketQuantity} ${basketQuantity === 1 ? "item" : "items"}, ${money(currentQuote?.total ?? total)}`}
              onClick={openBasket}
            >
              <span>
                View basket{" "}
                <small>
                  {basketQuantity} {basketQuantity === 1 ? "item" : "items"}
                </small>
              </span>
              <strong key={String(currentQuote?.total ?? total)}>
                {money(currentQuote?.total ?? total)}
              </strong>
            </button>
          </div>
        )}
      <footer
        className="mc-footer"
        inert={!!selected}
        aria-hidden={selected ? true : undefined}
      >
        <div className="mc-wrap">
          {menu?.organization?.name || "Mera"} ·{" "}
          {menu?.branch?.name || "Customer experience"} · Track your order here
          after submitting.
        </div>
      </footer>
      {selected && (
        <CustomizationDialog
          product={selected}
          variantId={variant}
          modifierIds={modifiers}
          estimate={
            (selected.variants?.find((v) => v.id === variant)?.price ??
              selected.price) +
            (selected.modifierGroups || [])
              .flatMap((group) => group.options)
              .filter((option) => modifiers.includes(option.id))
              .reduce((sum, option) => sum + option.price, 0)
          }
          disabled={checkoutLocked}
          error={customizationError}
          errorGroupId={modifierError}
          onVariantChange={(id) => {
            setVariant(id);
            if (!modifierError) setCustomizationError("");
          }}
          onModifierToggle={(id, checked) => {
            setModifiers((old) =>
              checked ? [...old, id] : old.filter((value) => value !== id),
            );
            if (
              selected.modifierGroups
                ?.find((group) => group.id === modifierError)
                ?.options.some((option) => option.id === id)
            ) {
              setModifierError(null);
              setCustomizationError("");
            }
          }}
          onClose={closeCustomization}
          onAdd={addProduct}
          registerGroup={(id, node) => {
            if (node) modifierGroupRefs.current.set(id, node);
            else modifierGroupRefs.current.delete(id);
          }}
          fallbackFocus={() => searchRef.current?.focus()}
        />
      )}
    </div>
  );
}
function Feedback({
  orderId,
  onSuccess,
}: {
  orderId: string;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [rating, setRating] = useState(""),
    [topic, setTopic] = useState("feedback");
  if (done) return <p role="status">Feedback received. Thank you.</p>;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const values = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await customerRequest(`/public/orders/${orderId}/feedback`, "POST", {
            rating: Number(values.get("rating")),
            text: String(values.get("text")),
            category: String(values.get("category")),
          });
          setDone(true);
          onSuccess();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>How was your visit?</h3>
      <fieldset className="mc-feedback-stars" disabled={busy}>
        <legend>Rating</legend>
        <div role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n}>
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === String(n)}
                required
                onChange={() => setRating(String(n))}
              />
              <span aria-hidden="true">{Number(rating) >= n ? "★" : "☆"}</span>
              <span className="mc-sr-only">{n} out of 5 stars</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Segmented
        label="Topic"
        name="category"
        value={topic}
        onChange={setTopic}
        disabled={busy}
        options={[
          { value: "feedback", label: "General feedback" },
          { value: "food", label: "Food or drink" },
          { value: "service", label: "Service" },
          { value: "payment", label: "Payment" },
        ]}
      />
      <label>
        Tell the venue
        <textarea name="text" maxLength={2000} required />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="mc-primary" disabled={busy}>
        {busy ? "Sending…" : "Send private feedback"}
      </button>
    </form>
  );
}

function MarketingPreference({ prefix }: { prefix: string }) {
  const [marketing, setMarketing] = useState(false),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const key = useRef(requestId());
  useEffect(() => {
    let active = true;
    customerRequest(prefix + "/consent")
      .then((value) => {
        if (active) {
          setMarketing(value.marketing === true);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [prefix]);
  return (
    <section className="mc-panel mc-consent">
      <h2>Your communication preference</h2>
      <p>
        This optional preference belongs to your current guest session. It is
        separate from order updates. Verified contact and marketing delivery are
        not connected, so saving it will not send messages or verify a phone or
        email address.
      </p>
      <label className="mc-modifier">
        <input
          type="checkbox"
          checked={marketing}
          disabled={!ready || busy}
          onChange={(e) => {
            setMarketing(e.target.checked);
            key.current = requestId();
            setMessage("");
          }}
        />
        I would like to receive optional marketing updates when contact
        verification and delivery become available.
      </label>
      <button
        className="mc-secondary"
        disabled={!ready || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await customerRequest(prefix + "/consent", "PUT", {
              requestKey: key.current,
              marketing,
            });
            if (result.marketing !== marketing)
              throw new Error("The preference could not be confirmed.");
            setMessage(
              marketing
                ? "Your optional preference was saved for this guest session. No messages have been sent."
                : "Optional marketing updates are turned off for this guest session.",
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : "Save preference"}
      </button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
