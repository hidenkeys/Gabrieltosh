import { useEffect, useRef, useState } from "react";
import { ProductImage } from "../../ProductImage";
import { money } from "../../api";
import { customerRequest, requestId } from "./client";

type Product = {
  id: string;
  name: string;
  code: string;
  imageCode?: string;
  category: string;
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
  const checkoutKey = useRef(requestId());
  const modalRef = useRef<HTMLDivElement>(null);
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
    let active = true;
    void load();
    customerRequest(
      `/public/organizations/${encodeURIComponent(slug)}/branches`,
    )
      .then((result) => {
        if (active) setBranches(result.branches || []);
      })
      .catch(() => {});
    setCart([]);
    setOrder(null);
    setVisit(null);
    setHasGuest(false);
    setReservation(null);
    customerRequest(prefix + "/guest")
      .then(async (session) => {
        if (!active) return;
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
            (!requestedTable || currentVisit.visit?.tableId === requestedTable)
          ) {
            setVisit(currentVisit);
            setFulfillment("table_service");
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
  useEffect(() => {
    if (!selected) return;
    const prior = document.activeElement as HTMLElement;
    modalRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
      if (event.key === "Tab" && modalRef.current) {
        const controls = modalRef.current.querySelectorAll<HTMLElement>(
          'button,input,select,[tabindex="0"]',
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prior?.focus();
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
          if (
            [401, 403, 404].includes((e as Error & { status: number }).status)
          ) {
            setVisit(null);
            setFulfillment("counter_pickup");
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
  const categories = ["All", ...new Set(products.map((p) => p.category))];
  const total = cart.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  async function guest() {
    if (!displayName.trim())
      throw new Error("Enter the name we should call for your order.");
    await customerRequest(prefix + "/guests", "POST", {
      displayName: displayName.trim(),
    });
    setHasGuest(true);
  }
  function addProduct() {
    if (!selected) return;
    for (const group of selected.modifierGroups || []) {
      const count = group.options.filter((option) =>
        modifiers.includes(option.id),
      ).length;
      if (count < group.min || count > group.max) {
        setError(`Choose ${group.min}–${group.max} options for ${group.name}.`);
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
  async function submitOrder() {
    setBusy(true);
    setError("");
    try {
      await guest();
      const next = await customerRequest(prefix + "/orders", "POST", {
        requestKey: checkoutKey.current,
        menuVersion: menu.version,
        displayName: displayName.trim(),
        fulfillment,
        visitId: visit?.visit?.id,
        items: cart.map(({ productId, quantity, variantId, modifiers }) => ({
          productId,
          quantity,
          variantId,
          modifiers,
        })),
        note,
      });
      setOrder(next);
      setCart([]);
      setTab("track");
      checkoutKey.current = requestId();
    } catch (e) {
      const message = (e as Error).message;
      await load().catch(() => {});
      setError(message);
    } finally {
      setBusy(false);
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
      const next = await customerRequest(prefix + "/reservations", "POST", {
        requestKey: reservationKey.current,
        displayName: displayName.trim(),
        contact: String(data.get("contact")),
        partySize: Number(data.get("partySize")),
        startsAt: start.toISOString(),
        endsAt: new Date(
          start.getTime() + Number(data.get("duration")) * 60000,
        ).toISOString(),
        notes: String(data.get("notes") || ""),
      });
      setReservation(next);
      reservationKey.current = requestId();
    } catch (e) {
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
      const result = await customerRequest(prefix + "/visits/join", "POST", {
        visitId: String(data.get("visitId")),
        code: String(data.get("code")),
      });
      const id = result.visit?.id || result.id || String(data.get("visitId"));
      setVisit(await customerRequest(`/public/visits/${id}`));
      setFulfillment("table_service");
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
    <div className="mera-customer">
      <header className="mc-top">
        <div className="mc-wrap">
          <div className="mc-brand">
            {bingChun ? (
              <img src="/brand/brand-logo.png" alt="" />
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
                disabled={busy}
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
      <main className="mc-wrap">
        <section className="mc-hero">
          <div>
            <div className="mc-eyebrow">
              {menu?.branch?.name || "Welcome"} / YOUR NEXT LITTLE JOY
            </div>
            <h1>
              Something lovely,
              <br />
              made for you.
            </h1>
            <p>
              {menu?.organization?.branding?.description ||
                "Browse the menu, make it yours, and follow your order from the first tap to the final handoff."}
            </p>
            {menu?.branch?.settings?.address && (
              <p className="mc-note">{menu.branch.settings.address}</p>
            )}
          </div>
          {bingChun && (
            <img src="/brand/brand-logo.png" alt="Bing Chun mascot" />
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
        {!menu && !error && (
          <div className="mc-empty" role="status">
            Opening the menu…
          </div>
        )}
        {menu && tab === "menu" && (
          <div className="mc-columns">
            <section aria-label="Products">
              <input
                className="mc-search"
                aria-label="Search menu"
                placeholder="Find your favourite…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="mc-tabs" aria-label="Menu categories">
                {categories.map((c) => (
                  <button
                    key={c}
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="mc-products">
                {products
                  .filter(
                    (p) =>
                      (category === "All" || p.category === category) &&
                      `${p.name} ${p.description} ${p.category}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((p) => (
                    <article className="mc-product" key={p.id}>
                      {bingChun || p.imageCode ? (
                        <ProductImage
                          product={{ ...p, code: p.imageCode || p.code }}
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
                        {p.allergens?.length > 0 && (
                          <p>Allergens: {p.allergens.join(", ")}</p>
                        )}
                        <span className="mc-price">{money(p.price)}</span>
                        <button
                          disabled={
                            !p.available ||
                            (p.stockMode === "counted" && p.stock <= 0) ||
                            !menu.orderingAvailable
                          }
                          onClick={() => {
                            setSelected(p);
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
              {!products.length && (
                <div className="mc-empty">
                  The venue has not published its menu yet.
                </div>
              )}
            </section>
            <aside className="mc-panel mc-cart">
              <h2>Your little collection</h2>
              {cart.length === 0 ? (
                <p>Choose something delicious to begin.</p>
              ) : (
                cart.map((line) => (
                  <div className="mc-line" key={line.key}>
                    <strong>{line.name}</strong>
                    <small>{line.summary}</small>
                    <div className="mc-line-controls">
                      <button
                        aria-label={`Remove one ${line.name}`}
                        onClick={() => {
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
                        aria-label={`Add one ${line.name}`}
                        disabled={line.quantity >= 100}
                        onClick={() => {
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
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="What should we call you?"
                />
              </label>
              <label>
                Enjoy it
                <select
                  value={fulfillment}
                  onChange={(e) => setFulfillment(e.target.value)}
                >
                  <option value="counter_pickup">Counter pickup</option>
                  <option value="takeaway">Takeaway</option>
                  {visit && <option value="table_service">At my table</option>}
                </select>
              </label>
              <label>
                Anything we should know?
                <textarea
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional order note"
                />
              </label>
              <div className="mc-total">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
              <p className="mc-note">
                The venue checks final prices and availability when you submit.
                Online payment is unavailable until the provider and charging
                policy are approved. Staff must verify any payment.
              </p>
              {!menu.orderingAvailable && (
                <div className="mc-alert">
                  Ordering is currently paused. You can still browse the menu.
                </div>
              )}
              <button
                className="mc-primary"
                disabled={
                  busy ||
                  !cart.length ||
                  !displayName.trim() ||
                  !menu.orderingAvailable
                }
                onClick={submitOrder}
              >
                {busy ? "Submitting…" : "Submit order"}
              </button>
            </aside>
          </div>
        )}
        {tab === "track" && (
          <section className="mc-panel">
            <h2>Your order</h2>
            <p className="mc-note">
              This is your current guest session. Verified phone/email sign-in
              and cross-device history are not connected in this preview.
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
                </p>
                <div className="mc-receipt" aria-label="Order details">
                  <h3>
                    {menu?.organization?.name} · {menu?.branch?.name}
                  </h3>
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
                  <p>
                    Order total {money(order.total)} · Outstanding{" "}
                    {money(Math.max(0, order.total - (order.paid || 0)))}
                  </p>
                  {order.paymentStatus === "paid" && (
                    <button
                      className="mc-secondary mc-print-control"
                      onClick={() => window.print()}
                    >
                      Print payment receipt
                    </button>
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
                <div className="mc-form-grid">
                  <label>
                    Your name
                    <input
                      required
                      maxLength={100}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
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
                  Availability is checked by the venue. A request is only
                  confirmed when the server returns a reservation reference.
                </p>
                {menu?.reservationPolicy?.enabled === false && (
                  <div className="mc-alert">
                    This branch is not accepting online reservations.
                  </div>
                )}
                {(menu?.reservationPolicy?.depositRequired ||
                  !!menu?.reservationPolicy?.minimumSpend) && (
                  <div className="mc-alert">
                    This venue requires a deposit or minimum-spend agreement.
                    Online booking is unavailable until the payment and service
                    policies are approved; please contact the venue.
                  </div>
                )}
                <button
                  className="mc-primary"
                  disabled={
                    busy ||
                    !menu ||
                    menu.reservationPolicy?.enabled === false ||
                    !!menu.reservationPolicy?.depositRequired ||
                    !!menu.reservationPolicy?.minimumSpend
                  }
                >
                  {busy ? "Checking availability…" : "Request reservation"}
                </button>
              </form>
            )}
          </section>
        )}
        {tab === "track" && hasGuest && <MarketingPreference prefix={prefix} />}
        {tab === "visit" && (
          <section className="mc-panel">
            <h2>Join your table</h2>
            {visit ? (
              <>
                <p>
                  You have access to this visit only. A new visit cannot view
                  this bill.
                </p>
                <p>
                  Outstanding balance: <b>{money(visit.balance || 0)}</b>
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
                <p>
                  Ask staff to split this bill or verify a payment. Online
                  collection is unavailable until the payment provider and
                  policies are approved. Joining a visit does not itself confirm
                  any payment.
                </p>
                <button
                  className="mc-secondary"
                  onClick={async () => {
                    try {
                      setVisit(
                        await customerRequest(
                          `/public/visits/${visit.visit.id}`,
                        ),
                      );
                    } catch (e) {
                      setError((e as Error).message);
                      if (
                        [401, 403, 404].includes(
                          (e as Error & { status: number }).status,
                        )
                      ) {
                        setVisit(null);
                        setFulfillment("counter_pickup");
                      }
                    }
                  }}
                >
                  Refresh bill
                </button>
              </>
            ) : (
              <form onSubmit={join}>
                <p>
                  Ask a member of staff for your current visit reference and
                  joining code. Scanning a table QR alone does not unlock a
                  private bill.
                </p>
                <label>
                  Your name
                  <input
                    required
                    maxLength={100}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </label>
                <label>
                  Visit reference
                  <input name="visitId" required autoComplete="off" />
                </label>
                <label>
                  Joining code
                  <input name="code" required autoComplete="off" />
                </label>
                <button className="mc-primary" disabled={busy || !menu}>
                  {busy ? "Joining…" : "Join current visit"}
                </button>
              </form>
            )}
          </section>
        )}
      </main>
      <footer className="mc-footer">
        <div className="mc-wrap">
          {menu?.organization?.name || "Mera"} ·{" "}
          {menu?.branch?.name || "Customer experience"} · Your order is
          submitted only after the venue confirms it.
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
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>
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
              <fieldset key={group.id}>
                <legend>
                  {group.name} · choose {group.min}–{group.max}
                </legend>
                {group.options.map((option) => (
                  <label className="mc-modifier" key={option.id}>
                    <input
                      type="checkbox"
                      checked={modifiers.includes(option.id)}
                      onChange={(e) =>
                        setModifiers((old) =>
                          e.target.checked
                            ? [...old, option.id]
                            : old.filter((v) => v !== option.id),
                        )
                      }
                    />
                    {option.name}{" "}
                    {option.price > 0 && `+${money(option.price)}`}
                  </label>
                ))}
              </fieldset>
            ))}
            {selected.allergens?.length > 0 && (
              <p>
                Allergens: {selected.allergens.join(", ")}. Please ask staff
                about dietary requirements.
              </p>
            )}
            {error && (
              <div className="mc-alert" role="alert">
                {error}
              </div>
            )}
            <button className="mc-primary" onClick={addProduct}>
              Add to collection
            </button>
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
        <select name="rating" defaultValue="5">
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
    <section className="mc-panel">
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
