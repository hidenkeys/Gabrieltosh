import { useEffect, useRef, useState } from "react";
import { brandingStyle } from "../branding";
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
import SessionOrders from "./SessionOrders";
import HelpRequests from "./HelpRequests";
import GuestActivity from "./GuestActivity";
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
  variants: { id: string; name: string; price: number }[];
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
  const modalRef = useRef<HTMLDivElement>(null);
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
    checkoutIntentRef.current = null;
    setCheckoutIntent(null);
    setCart([]);
    setOrder(null);
    setVisit(null);
    setHasGuest(false);
    setReservation(null);
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
        if (upcoming) setReservation(upcoming);
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
    if (!selected) return;
    const prior = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCustomization();
      if (event.key === "Tab" && modalRef.current) {
        const controls = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === modalRef.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        } else if (!modalRef.current.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (prior?.isConnected) prior.focus();
      else searchRef.current?.focus();
    };
  }, [selected]);
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
  useEffect(() => {
    if (!visit?.visit?.id) return;
    let active = true,
      refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const current = await customerRequest(
          `/public/visits/${visit.visit.id}`,
        );
        if (active) setVisit(current);
      } catch (e) {
        if (active) {
          if ((e as any).status === 401) {
            clearGuestView(
              "Your guest session expired. Existing orders and visits remain unchanged.",
            );
            return;
          }
          if (
            [401, 403, 404].includes((e as Error & { status: number }).status)
          ) {
            setVisit(null);
            if (!checkoutIntentRef.current) setFulfillment("counter_pickup");
            setError(
              "This visit is no longer available. Ask staff for the current joining code.",
            );
          } else
            setError(
              "Table updates are interrupted. The last confirmed bill is shown; check the connection before making another request.",
            );
        }
      } finally {
        refreshing = false;
      }
    };
    const timer = setInterval(refresh, 3000);
    window.addEventListener("online", refresh);
    return () => {
      active = false;
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
    setFulfillment("counter_pickup");
    setTrackingError("");
    setError("");
    setSuccess(message);
    setTab("menu");
    reservationKey.current = requestId();
  }
  async function guest(
    name = displayName.trim(),
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
  const currentQuote = checkoutIntent
    ? quote
    : quote?.cartSignature === cartSignature &&
        quote?.menuVersion === menu?.version
      ? quote
      : null;
  const expiredReview =
    !checkoutIntent && currentQuote && quoteReviewExpired(currentQuote);
  async function submitOrder() {
    if (checkoutInFlight.current || checkoutRecovery.phase !== "ready") return;
    checkoutInFlight.current = true;
    const generation = checkoutGeneration.current;
    setBusy(true);
    setError("");
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
          displayName: displayName.trim(),
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
      setError(message);
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
    setError("");
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
        setCheckoutRecovery({
          phase: "ready",
          message:
            "The venue has not recorded this request yet. That does not confirm failure. Keep the original retry details, or explicitly stop this unconfirmed request before starting another.",
        });
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
        setSuccess(
          "That unconfirmed request is stopped. No payment or refund was made. You can choose items for a new order.",
        );
        void load();
      }
    } catch (e) {
      if (generation !== checkoutGeneration.current) return;
      checkoutUncertain.current = true;
      setError((e as Error).message);
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
  async function reserve(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await guest();
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
      const next = await customerRequest(
        prefix + "/reservations",
        "POST",
        intent,
      );
      setReservationIntent(null);
      setReservation(next);
      reservationKey.current = requestId();
    } catch (e) {
      if ((e as any).status && (e as any).status < 500)
        setReservationIntent(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await guest();
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
      const id = result.visit?.id || result.id || terms.visitId;
      setVisit(await customerRequest(`/public/visits/${id}`));
      if (!checkoutIntentRef.current) setFulfillment("table_service");
      setJoinTerms(null);
      setJoinAcknowledged(false);
      setTab("menu");
      setSuccess(
        "You have joined this visit. Additional rounds will be linked to this table.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={"mera-customer" + (tab === "menu" ? " mc-menu-view" : "")}
      style={{
        ...brandingStyle(menu?.organization?.branding),
        ...(!menu?.organization?.branding?.font ||
        menu.organization.branding.font === "system"
          ? {
              fontFamily:
                'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }
          : {}),
      }}
    >
      <header
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
            <label className="mc-branch-selector">
              Branch
              <select
                aria-label="Choose branch"
                value={branch}
                disabled={checkoutLocked}
                onChange={(event) => {
                  if (
                    cart.length &&
                    !window.confirm(
                      "Changing branch clears this basket. Continue?",
                    )
                  )
                    return;
                  window.location.assign(
                    `/mera/menu/${encodeURIComponent(slug)}/${encodeURIComponent(event.target.value)}`,
                  );
                }}
              >
                {branches.map((option: any) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
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
            ["visit", "Join a table"],
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
                <label className="mc-category-select">
                  Category
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                  >
                    {categories.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!menu.orderingAvailable && (
                <p className="mc-ordering-status" role="status">
                  Ordering is paused. You can still browse the menu.
                </p>
              )}
              <div
                className="mc-tabs mc-categories"
                aria-label="Menu categories"
              >
                {categories.map((c) => (
                  <button
                    key={c.key}
                    aria-pressed={category === c.key}
                    onClick={() => setCategory(c.key)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
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
                      <span className="mc-price">{money(p.price)}</span>
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
                      : "The menu is on its way"}
                  </h2>
                  <p>
                    {products.length
                      ? "Try another search or browse all categories."
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
                <>
                  <div className="mc-basket-heading">
                    <h2
                      id="mc-basket-title"
                      ref={basketHeadingRef}
                      tabIndex={-1}
                    >
                      Your basket
                    </h2>
                    <span>
                      {basketQuantity} {basketQuantity === 1 ? "item" : "items"}
                    </span>
                  </div>
                  <button
                    className="mc-mobile-only mc-secondary"
                    onClick={returnToMenu}
                  >
                    Back to menu
                  </button>
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
                          <button
                            aria-label={`Remove one ${line.name}${line.summary ? ` (${line.summary})` : ""}`}
                            disabled={checkoutLocked}
                            onClick={() => {
                              if (
                                checkoutIntentRef.current ||
                                checkoutInFlight.current
                              )
                                return;
                              setCart((old) =>
                                old
                                  .map((l) =>
                                    l.key === line.key
                                      ? { ...l, quantity: l.quantity - 1 }
                                      : l,
                                  )
                                  .filter((l) => l.quantity > 0),
                              );
                              checkoutKey.current = requestId();
                            }}
                          >
                            −
                          </button>
                          <span>{line.quantity}</span>
                          <button
                            aria-label={`Add one ${line.name}${line.summary ? ` (${line.summary})` : ""}`}
                            disabled={checkoutLocked || line.quantity >= 100}
                            onClick={() => {
                              if (
                                checkoutIntentRef.current ||
                                checkoutInFlight.current
                              )
                                return;
                              setCart((old) =>
                                old.map((l) =>
                                  l.key === line.key
                                    ? { ...l, quantity: l.quantity + 1 }
                                    : l,
                                ),
                              );
                              checkoutKey.current = requestId();
                            }}
                          >
                            +
                          </button>
                          <b>{money(line.unitPrice * line.quantity)}</b>
                        </div>
                      </div>
                    ))
                  )}
                  <label>
                    Your name
                    <input
                      maxLength={100}
                      autoComplete="given-name"
                      value={displayName}
                      disabled={checkoutLocked}
                      onChange={(e) => {
                        if (!checkoutLocked) setDisplayName(e.target.value);
                      }}
                      placeholder="What should we call you?"
                    />
                  </label>
                  <label>
                    Enjoy it
                    <select
                      value={fulfillment}
                      disabled={checkoutLocked}
                      onChange={(e) => {
                        if (!checkoutLocked) setFulfillment(e.target.value);
                      }}
                    >
                      <option value="counter_pickup">Counter pickup</option>
                      <option value="takeaway">Takeaway</option>
                      {(visit ||
                        checkoutIntent?.fulfillment === "table_service") && (
                        <option value="table_service">At my table</option>
                      )}
                    </select>
                  </label>
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
                  {currentQuote && (
                    <div aria-label="Server price review" role="status">
                      <p>Subtotal {money(currentQuote.subtotal)}</p>
                      {currentQuote.lines?.map((line: any, index: number) => (
                        <p key={index}>
                          {line.label}: {money(line.amount)}
                        </p>
                      ))}
                      <p>
                        Review these charges before submitting. Quote expires{" "}
                        {new Date(currentQuote.expiresAt).toLocaleTimeString()}.
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
                      {menu.pricingPolicy?.enabled && !currentQuote
                        ? "Items estimate"
                        : "Total"}
                    </span>
                    <span>{money(currentQuote?.total ?? total)}</span>
                  </div>
                  {menu.pricingPolicy?.enabled && !currentQuote && (
                    <p>
                      Review the server’s discount, service charge and tax
                      before submitting your order.
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
                  {checkoutIntent && !busy && (
                    <p className="mc-note" role="status">
                      Order confirmation is uncertain. Your original basket and
                      details are preserved. Retry this request or check your
                      session orders before starting another order.
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
                      <h3>Stop this unconfirmed request?</h3>
                      <p>
                        If the venue already received your order, it will be
                        kept and shown to you. Otherwise this request will be
                        stopped so you can start another. This does not cancel
                        an accepted order, make a payment or confirm a refund.
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
                  <button
                    className="mc-primary"
                    disabled={
                      busy ||
                      (!checkoutIntent &&
                        (!cart.length ||
                          !displayName.trim() ||
                          !menu.orderingAvailable))
                    }
                    onClick={submitOrder}
                  >
                    {busy
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
                </>
              )}
            </aside>
          </div>
        )}
        {tab === "help" && (
          <HelpRequests
            prefix={prefix}
            ensureGuest={guest}
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
            <h2>Your order</h2>
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
                  Reference <b>{order.reference || order.id}</b>
                </p>
                <span className="mc-state">{order.status}</span>
                <span className="mc-state">{order.paymentStatus}</span>
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
                  <p>Order reference: {order.reference || order.id}</p>
                  <p>
                    Order status: {String(order.status).replaceAll("_", " ")}
                    {" · "}Payment status:{" "}
                    {String(order.paymentStatus).replaceAll("_", " ")}
                  </p>
                  {order.createdAt && (
                    <p>
                      {new Date(order.createdAt).toLocaleString("en-GB", {
                        timeZone: menu?.branch?.timezone || "Africa/Lagos",
                      })}
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
                      {entry.action || entry.status}
                      <small>
                        {entry.createdAt || entry.at
                          ? new Date(
                              entry.createdAt || entry.at,
                            ).toLocaleString()
                          : ""}
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
          <section className="mc-panel">
            <h2>A table for your plans</h2>
            {reservation ? (
              <div>
                <div className="mc-alert mc-success" role="status">
                  Reservation {reservation.reference || reservation.id} ·{" "}
                  {reservation.status || "requested"}. The venue’s confirmation
                  and any deposit policy apply. No money has been collected
                  here.
                </div>
                {reservation.startsAt && (
                  <p>
                    {new Date(reservation.startsAt).toLocaleString("en-GB", {
                      timeZone: menu?.branch?.timezone || "Africa/Lagos",
                    })}{" "}
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
                    <label>
                      Party size
                      <input
                        name="partySize"
                        type="number"
                        min={1}
                        max={100}
                        defaultValue={2}
                        required
                      />
                    </label>
                    {!!menu?.tables?.length && (
                      <label>
                        Preferred table (optional)
                        <select name="tableId">
                          <option value="">Any suitable table</option>
                          {menu.tables.map((table: any) => (
                            <option key={table.id} value={table.id}>
                              {table.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      Date & time <small>Shown in this device’s timezone</small>
                      <input name="startsAt" type="datetime-local" required />
                    </label>
                    <label>
                      Duration
                      <select name="duration">
                        <option value="60">1 hour</option>
                        <option value="90">1½ hours</option>
                        <option value="120">2 hours</option>
                      </select>
                    </label>
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
                  {menu?.reservationPolicy?.enabled === false && (
                    <div className="mc-alert">
                      This branch is not accepting online reservations.
                    </div>
                  )}
                  {menu?.reservationPolicy?.depositRequired &&
                  menu.reservationPolicy.depositPolicy?.approved ? (
                    <div className="mc-alert">
                      Required deposit:{" "}
                      {money(menu.reservationPolicy.depositPolicy.amount)}. Ask
                      staff to verify and record it before confirmation.
                      Cancellation cutoff:{" "}
                      {
                        menu.reservationPolicy.depositPolicy
                          .cancellationCutoffHours
                      }{" "}
                      hours. Refund rule:{" "}
                      {menu.reservationPolicy.depositPolicy.refundRule ===
                      "refundable_before_cutoff"
                        ? "Refundable before the cutoff"
                        : "Non-refundable"}
                      . No online payment is collected here.
                    </div>
                  ) : menu?.reservationPolicy?.depositRequired ? (
                    <div className="mc-alert">
                      Deposit policy approval is pending. Contact the venue
                      before booking.
                    </div>
                  ) : null}
                  {minimumPolicy?.enabled && minimumPolicy.approved && (
                    <div className="mc-alert">
                      <p>
                        Minimum spend: {money(minimumPolicy.amount)} · based on
                        net paid bill.
                      </p>
                      <p>{minimumPolicy.disclosure}</p>
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
                      Minimum-spend terms require approval before online booking
                      is available.
                    </div>
                  )}
                </fieldset>
                {reservationIntent && (
                  <p role="status">
                    The reservation outcome is uncertain. Its original details
                    and policy acknowledgement are preserved for this retry.
                  </p>
                )}
                <button
                  className="mc-primary"
                  disabled={
                    busy ||
                    !menu ||
                    menu.reservationPolicy?.enabled === false ||
                    (!!menu.reservationPolicy?.depositRequired &&
                      !menu.reservationPolicy?.depositPolicy?.approved) ||
                    minimumBlocked ||
                    (minimumPolicy?.enabled &&
                      !reservationAcknowledged &&
                      !reservationIntent)
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
              onSelect={setOrder}
              onClear={clearGuestView}
              hasUnconfirmedOrder={!!checkoutIntent}
            />
            <GuestActivity prefix={prefix} />
            <MarketingPreference prefix={prefix} />
          </>
        )}
        {tab === "visit" && (
          <section className="mc-panel mc-visit-panel">
            <h2>{visit ? "Your table & bill" : "Join your table"}</h2>
            {visit ? (
              <>
                <p>
                  You have access to this visit only. A new visit cannot view
                  this bill.
                </p>
                <p>
                  {Number(visit.balance) < 0
                    ? "Unused deposit credit: "
                    : "Outstanding balance: "}
                  <b>{money(Math.abs(visit.balance || 0))}</b>
                </p>
                <h3>{visit.visit?.tableName || "Your table"} · shared bill</h3>
                {(visit.bills || []).length > 0 && (
                  <div
                    className="mc-bill-splits"
                    aria-label="Staff-managed bills"
                  >
                    <h3>Bill allocation</h3>
                    {visit.bills.map((bill: any) => (
                      <div className="mc-line" key={bill.id}>
                        <strong>{bill.name || "Table bill"}</strong>
                        <ul className="mc-history">
                          {(bill.charges || []).map((charge: any) => (
                            <li key={charge.id}>
                              {charge.quantity ? `${charge.quantity} × ` : ""}
                              {charge.name}
                              <b> · {money(charge.amount)}</b>
                            </li>
                          ))}
                        </ul>
                        <p>
                          Total {money(bill.total)} · Recorded payments{" "}
                          {money(bill.paid)} ·{" "}
                          {bill.balance < 0
                            ? `Unused deposit credit ${money(-bill.balance)}`
                            : `Outstanding ${money(bill.balance)}`}
                        </p>
                        {bill.balance < 0 && (
                          <p>
                            Unused credit is not available for withdrawal. Ask
                            staff about the approved deposit or refund policy.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {(visit.orders || []).length === 0 ? (
                  <p>No orders have been linked to this visit yet.</p>
                ) : (
                  (visit.orders || []).map((billOrder: any) => (
                    <div className="mc-line" key={billOrder.id}>
                      <strong>
                        {billOrder.reference} · {billOrder.displayName}
                      </strong>
                      <small>{billOrder.status}</small>
                      <ul className="mc-history">
                        {(billOrder.items || []).map(
                          (line: any, index: number) => (
                            <li key={index}>
                              {line.quantity} × {line.name}
                              <small>
                                {line.size}
                                {line.modifiers?.length
                                  ? " · " +
                                    line.modifiers
                                      .map((m: any) => m.name)
                                      .join(", ")
                                  : ""}
                              </small>
                              <b>{money(line.total ?? line.lineTotal ?? 0)}</b>
                            </li>
                          ),
                        )}
                      </ul>
                      <p>
                        Total {money(billOrder.total)} · Recorded payments{" "}
                        {money(billOrder.paid || 0)}
                      </p>
                    </div>
                  ))
                )}
                {visit.minimumSpend?.policy?.enabled && (
                  <div className="mc-alert">
                    <p>
                      Visit minimum spend:{" "}
                      {money(visit.minimumSpend.policy.amount)} · net paid bill.
                    </p>
                    <p>{visit.minimumSpend.policy.disclosure}</p>
                    {visit.minimumSpend.summary ? (
                      <p>
                        Qualifying paid:{" "}
                        {money(visit.minimumSpend.summary.netPaid)} · manager
                        waiver: {money(visit.minimumSpend.summary.waived)} ·
                        remaining shortfall:{" "}
                        {money(visit.minimumSpend.summary.shortfall)}.
                      </p>
                    ) : (
                      <p>
                        The qualifying-spend summary is unavailable. Ask staff
                        to confirm it.
                      </p>
                    )}
                    <p>
                      No shortfall charge is added automatically. Additional
                      orders or an authorized manager waiver resolve it.
                    </p>
                  </div>
                )}
                <p>
                  Please ask staff to split your bill or confirm a payment.
                  Online payment is not available. Joining your table does not
                  make a payment.
                </p>
                <button
                  className="mc-secondary"
                  disabled={billRefreshing}
                  onClick={async () => {
                    const generation = checkoutGeneration.current;
                    setBillRefreshing(true);
                    try {
                      const nextVisit = await customerRequest(
                        `/public/visits/${visit.visit.id}`,
                      );
                      if (generation !== checkoutGeneration.current) return;
                      setVisit(nextVisit);
                    } catch (e) {
                      if (generation !== checkoutGeneration.current) return;
                      setError((e as Error).message);
                      if (
                        [401, 403, 404].includes(
                          (e as Error & { status: number }).status,
                        )
                      ) {
                        setVisit(null);
                        if (!checkoutIntentRef.current)
                          setFulfillment("counter_pickup");
                      }
                    } finally {
                      setBillRefreshing(false);
                    }
                  }}
                >
                  {billRefreshing ? "Checking your bill…" : "Refresh bill"}
                </button>
              </>
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
                  <label>
                    Table
                    <select
                      value={joinTable}
                      onChange={(event) => setJoinTable(event.target.value)}
                    >
                      <option value="">Use a visit reference instead</option>
                      {(menu?.tables || []).map((table: any) => (
                        <option key={table.id} value={table.id}>
                          {table.name}
                        </option>
                      ))}
                    </select>
                  </label>
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
              <strong>{money(currentQuote?.total ?? total)}</strong>
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
        <div className="mc-modal-backdrop">
          <div
            className="mc-panel mc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mc-customize-title"
            tabIndex={-1}
            ref={modalRef}
          >
            <div className="mc-modal-header">
              <h2 id="mc-customize-title">{selected.name}</h2>
              <button
                className="mc-close"
                aria-label="Close customization"
                onClick={closeCustomization}
              >
                ×
              </button>
            </div>
            <div className="mc-modal-content">
              <p>{selected.description}</p>
              {selected.variants?.length > 0 && (
                <label>
                  Choose a size
                  <select
                    value={variant}
                    onChange={(e) => setVariant(e.target.value)}
                  >
                    {selected.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {money(v.price)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected.modifierGroups?.map((group) => (
                <fieldset
                  key={group.id}
                  className="mc-option-group"
                  tabIndex={-1}
                  aria-invalid={modifierError === group.id || undefined}
                  aria-describedby={`mc-option-hint-${group.id}${modifierError === group.id ? " mc-modifier-error" : ""}`}
                  ref={(node) => {
                    if (node) modifierGroupRefs.current.set(group.id, node);
                    else modifierGroupRefs.current.delete(group.id);
                  }}
                >
                  <legend>
                    {group.name} ·{" "}
                    {group.min === group.max
                      ? `choose ${group.min}`
                      : group.min === 0
                        ? `choose up to ${group.max}`
                        : `choose ${group.min}–${group.max}`}
                  </legend>
                  <p
                    className="mc-option-hint"
                    id={`mc-option-hint-${group.id}`}
                  >
                    {group.min > 0 ? "Required" : "Optional"} ·{" "}
                    {
                      group.options.filter((option) =>
                        modifiers.includes(option.id),
                      ).length
                    }{" "}
                    selected
                  </p>
                  {modifierError === group.id && customizationError && (
                    <p
                      className="mc-option-error"
                      role="alert"
                      id="mc-modifier-error"
                    >
                      {customizationError}
                    </p>
                  )}
                  {group.options.map((option) => (
                    <label className="mc-modifier" key={option.id}>
                      <input
                        type="checkbox"
                        checked={modifiers.includes(option.id)}
                        onChange={(e) => {
                          setModifiers((old) =>
                            e.target.checked
                              ? [...old, option.id]
                              : old.filter((value) => value !== option.id),
                          );
                          if (modifierError === group.id) {
                            setModifierError(null);
                            setCustomizationError("");
                          }
                        }}
                      />
                      <span>
                        {option.name}{" "}
                        {option.price > 0 && `+${money(option.price)}`}
                      </span>
                    </label>
                  ))}
                </fieldset>
              ))}
              {selected.dietary?.length > 0 && (
                <p>Dietary: {selected.dietary.join(", ")}</p>
              )}
              {selected.allergens?.length > 0 && (
                <p>
                  Allergens: {selected.allergens.join(", ")}. Please ask staff
                  about dietary requirements.
                </p>
              )}
              {customizationError && !modifierError && (
                <div className="mc-alert" role="alert" id="mc-modifier-error">
                  {customizationError}
                </div>
              )}
            </div>
            <div className="mc-modal-actions">
              <p>
                Item estimate{" "}
                {money(
                  (selected.variants?.find((v) => v.id === variant)?.price ??
                    selected.price) +
                    (selected.modifierGroups || [])
                      .flatMap((group) => group.options)
                      .filter((option) => modifiers.includes(option.id))
                      .reduce((sum, option) => sum + option.price, 0),
                )}
                . Any order-level charges are reviewed at checkout.
              </p>
              <button
                className="mc-primary"
                disabled={checkoutLocked}
                onClick={addProduct}
              >
                Add to basket
              </button>
            </div>
          </div>
        </div>
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
    [done, setDone] = useState(false);
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
      <label>
        Rating
        <select name="rating" defaultValue="" required>
          <option value="" disabled>
            Choose your rating
          </option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} / 5
            </option>
          ))}
        </select>
      </label>
      <label>
        Topic
        <select name="category">
          <option value="feedback">General feedback</option>
          <option value="food">Food or drink</option>
          <option value="service">Service</option>
          <option value="payment">Payment</option>
        </select>
      </label>
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
