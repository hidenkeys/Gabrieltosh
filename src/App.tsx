import React, { useEffect, useState, useCallback } from "react";
import {
  LayoutGrid,
  ClipboardList,
  ChefHat,
  ChartNoAxesCombined,
  Users,
  Settings2,
  Printer,
  LogOut,
  Search,
  Plus,
  Minus,
  X,
  ArrowRight,
  Check,
  ChevronRight,
  ArrowUpRight,
  IceCreamBowl,
  CupSoda,
  Coffee,
  Cherry,
  Sparkles,
  ReceiptText,
  ShieldCheck,
  RefreshCw,
  Download,
  LockKeyhole,
  Menu,
  SlidersHorizontal,
  TriangleAlert,
  CheckCircle2,
  Clock3,
  Wifi,
  Activity,
  Save,
  Trash2,
  Package,
  Monitor,
  Cloud,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  api,
  uuid,
  money,
  time,
  today,
  type User,
  type Product,
  type Line,
  type Order,
  type Template,
} from "./api";
const icons: any = {
  "Fruit milk tea": CupSoda,
  "Fresh fruit tea": Cherry,
  "Ice cream series": IceCreamBowl,
  "Smoothie series": Coffee,
  Toppings: Sparkles,
};
const tones: any = {
  "Fruit milk tea": "rose",
  "Fresh fruit tea": "citrus",
  "Ice cream series": "lavender",
  "Smoothie series": "mint",
  Toppings: "sand",
};
const labels: any = {
  pending: "Awaiting payment",
  paid: "Paid · printing",
  preparing: "Preparing",
  ready: "Ready for pickup",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};
const initialTemplate: Template = {
  businessName: "BING CHUN",
  subtitle: "A little joy in every cup.",
  address: "Your store address",
  phone: "",
  footer: "Thank you. Come back for something lovely.",
  showStaff: true,
  showOptions: true,
  showPayment: true,
  showCode: true,
  headingSize: "large",
  align: "center",
  paperWidth: 58,
  labelWidth: 50,
  labelHeight: 30,
  labelShowStaff: false,
};
function Badge({ status }: { status: string }) {
  return (
    <span className={"badge " + status}>
      <i />
      {labels[status] || status}
    </span>
  );
}
function Empty({
  title,
  detail,
  icon: Icon = ReceiptText,
}: {
  title: string;
  detail: string;
  icon?: any;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={29} />
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    const prev = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    dialog?.focus();
    return () => {
      document.removeEventListener("keydown", h);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={"modal " + (wide ? "wide" : "")}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            const els = e.currentTarget.querySelectorAll<HTMLElement>(
              'button,input,select,textarea,[tabindex="0"]',
            );
            const first = els[0],
              last = els[els.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState("counter"),
    [toast, setToast] = useState(""),
    [connected, setConnected] = useState(true),
    [mobileNav, setMobileNav] = useState(false);
  const [products, setProducts] = useState<Product[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [template, setTemplate] = useState<Template>(initialTemplate),
    [printing, setPrinting] = useState<any>({ jobs: [], worker: null });
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);
  const notify = useCallback((s: string) => setToast(s), []);
  const refresh = useCallback(async () => {
    try {
      const [p, o, s, j] = await Promise.all([
        api("/products"),
        api("/orders"),
        api("/settings"),
        api("/printing"),
      ]);
      setProducts(p);
      setOrders(o);
      setTemplate(s.receipt);
      setPrinting(j);
      setConnected(true);
    } catch (e) {
      setConnected(false);
    }
  }, []);
  useEffect(() => {
    api<User>("/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
    const h = () => setUser(null);
    window.addEventListener("pos-session-expired", h);
    return () => window.removeEventListener("pos-session-expired", h);
  }, []);
  useEffect(() => {
    if (!user) return;
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [user, refresh]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  if (loading)
    return (
      <div className="loading">
        <span className="brand-mark">b.</span>
        <p>Opening your workspace…</p>
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;
  const admin = user.role === "admin",
    manager = user.role !== "cashier";
  const nav = [
    { id: "counter", label: "Counter", icon: LayoutGrid },
    {
      id: "orders",
      label: "Orders",
      icon: ClipboardList,
      count: orders.filter((o) => o.status === "pending").length,
    },
    { id: "preparation", label: "Preparation", icon: ChefHat },
    { id: "printing", label: "Print queue", icon: Printer },
    ...(manager
      ? [{ id: "reports", label: "Overview & EOD", icon: ChartNoAxesCombined }]
      : []),
    ...(admin
      ? [
          { id: "menu", label: "Menu library", icon: Package },
          { id: "receipts", label: "Receipt studio", icon: ReceiptText },
          { id: "team", label: "Team & access", icon: Users },
          { id: "audit", label: "Activity log", icon: Activity },
          { id: "system", label: "Store settings", icon: Settings2 },
        ]
      : []),
  ];
  const titles: any = {
    counter: ["The counter", "Good things, made to order."],
    orders: ["Orders", "Every order, from first tap to final handoff."],
    preparation: ["Preparation", "A clear view of what’s next."],
    printing: ["Print queue", "Receipts and labels, in the right order."],
    reports: ["Store overview", "The numbers behind a good day."],
    menu: ["Menu library", "A thoughtfully organised menu."],
    receipts: ["Receipt studio", "Make every little detail yours."],
    team: ["Team & access", "The people behind the counter."],
    audit: ["Activity log", "A clear record of every important action."],
    system: ["Store settings", "Your local store, connected."],
  };
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobileNav ? "open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("counter");
          }}
        >
          <span className="brand-mark">b.</span>
          <span>
            Bing Chun<small>STORE WORKSPACE</small>
          </span>
        </a>
        <div className="store-label">
          <span className="store-dot" />
          <div>
            Main store<small>Single-store workspace</small>
          </div>
          <Monitor size={16} />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {nav.map((n, i) => (
            <React.Fragment key={n.id}>
              {i === 4 && <p className="nav-label nav-divider">MANAGEMENT</p>}
              <button
                className={"nav-item " + (page === n.id ? "active" : "")}
                onClick={() => {
                  setPage(n.id);
                  setMobileNav(false);
                }}
              >
                <n.icon size={19} />
                <span>{n.label}</span>
                {!!n.count && <b>{n.count}</b>}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span className={connected ? "online-dot" : "offline-dot"} />
            {connected ? "Local server connected" : "Connection interrupted"}
          </div>
          <div className="profile">
            <div className="avatar">
              {user.name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div>
              <strong>{user.name}</strong>
              <small>{user.role}</small>
            </div>
            <button
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  await api("/logout", "POST");
                  setUser(null);
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <div className="nav-scrim" onClick={() => setMobileNav(false)} />
      )}
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobileNav(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{titles[page][0]}</strong>
          </div>
          <div className="topbar-right">
            <span className="date-display">
              {new Date().toLocaleDateString("en-GB", {
                timeZone: "Africa/Lagos",
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <span className="local-pill">
              <Wifi size={13} /> LOCAL STORE
            </span>
          </div>
        </header>
        {!connected && (
          <div className="connection-banner">
            <TriangleAlert size={16} /> Cannot reach the store server. Your
            basket stays on this device; payments require a connection.
          </div>
        )}
        <div className={"page " + (page === "counter" ? "counter-page" : "")}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">BING CHUN / MAIN STORE</div>
              <h1>
                {titles[page][0]}
                <span className="heading-dot">.</span>
              </h1>
              <p>{titles[page][1]}</p>
            </div>
            <div className="heading-meta">
              <span className="live-dot" />{" "}
              {page === "counter"
                ? "Ready for a lovely shift"
                : "Live store workspace"}
            </div>
          </div>
          {page === "counter" && (
            <Counter
              user={user}
              products={products}
              template={template}
              connected={connected}
              refresh={refresh}
              notify={notify}
              onOrders={() => setPage("orders")}
            />
          )}
          {(page === "orders" || page === "preparation") && (
            <Orders
              products={products}
              preparation={page === "preparation"}
              user={user}
              orders={orders}
              template={template}
              refresh={refresh}
              notify={notify}
            />
          )}
          {page === "printing" && (
            <Printing
              data={printing}
              manager={manager}
              refresh={refresh}
              notify={notify}
            />
          )}
          {page === "reports" && <Reports user={user} notify={notify} />}
          {page === "menu" && (
            <MenuLibrary
              products={products}
              refresh={refresh}
              notify={notify}
            />
          )}
          {page === "receipts" && (
            <ReceiptStudio
              template={template}
              refresh={refresh}
              notify={notify}
            />
          )}
          {page === "team" && <Team notify={notify} />}
          {page === "audit" && <Audit />}
          {page === "system" && <System printing={printing} />}
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button onClick={() => setToast("")} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);
  return (
    <div className="login-page">
      <section className="login-art">
        <div className="brand light">
          <span className="brand-mark">b.</span>
          <span>
            Bing Chun<small>STORE WORKSPACE</small>
          </span>
        </div>
        <div className="login-copy">
          <span className="eyebrow">SMALL MOMENTS. BEAUTIFUL SERVICE.</span>
          <h1>
            A little joy.
            <br />A smoother day.
          </h1>
          <p>
            Your menu, your people, your whole store.
            <br />
            All brought together, beautifully.
          </p>
          <div className="abstract-cup">
            <div className="straw" />
            <div className="cup">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="cup-label">
              冰醇
              <br />
              <small>BING CHUN</small>
            </div>
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="spark">✳</div>
          </div>
        </div>
        <footer>CRAFTED FOR THE WAY YOU SERVE.</footer>
      </section>
      <section className="login-form">
        <div className="login-card">
          <span className="pill">
            <span className="online-dot" /> YOUR LOCAL STORE
          </span>
          <h2>Welcome to your shift.</h2>
          <p>Sign in with the account your administrator created.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                onLogin(await api("/login", "POST", { username, password }));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Username
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your username"
                required
                autoFocus
              />
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  required
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? "Signing in…" : "Open workspace"}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="login-footnote">
            <ShieldCheck size={17} />
            <span>
              Staff access on handhelds.
              <br />
              Administration on the store computer.
            </span>
          </div>
        </div>
        <small className="login-version">
          BING CHUN POS · LOCAL-FIRST WORKSPACE
        </small>
      </section>
    </div>
  );
}
function Counter({
  user,
  products,
  template,
  connected,
  refresh,
  notify,
  onOrders,
}: any) {
  const [category, setCategory] = useState("All items"),
    [search, setSearch] = useState(""),
    [lines, setLines] = useState<Line[]>(() => {
      try {
        return JSON.parse(localStorage.getItem("basket:" + user.id) || "[]");
      } catch {
        return [];
      }
    }),
    [note, setNote] = useState(""),
    [selected, setSelected] = useState<Product | null>(null),
    [checkout, setCheckout] = useState(false),
    [discount, setDiscount] = useState({
      type: "percent",
      value: 0,
      reason: "",
    }),
    [showDiscount, setShowDiscount] = useState(false),
    [busy, setBusy] = useState(false),
    [requestKey, setRequestKey] = useState(
      () => localStorage.getItem("request:" + user.id) || uuid(),
    );
  useEffect(() => {
    localStorage.setItem("request:" + user.id, requestKey);
  }, [requestKey, user.id]);
  useEffect(() => {
    localStorage.setItem("basket:" + user.id, JSON.stringify(lines));
  }, [lines, user.id]);
  const categories = [
    "All items",
    ...new Set<string>(products.map((p: Product) => p.category)),
  ];
  const shown = products.filter(
    (p: Product) =>
      (category === "All items" || p.category === category) &&
      `${p.name} ${p.code}`.toLowerCase().includes(search.toLowerCase()),
  );
  const product = (id: string) => products.find((p: Product) => p.id === id);
  const unit = (l: Line) => {
    const p = product(l.productId);
    return (
      (p?.price || 0) +
      l.toppings.reduce((s, id) => s + (product(id)?.price || 0), 0)
    );
  };
  const subtotal = lines.reduce((s, l) => s + unit(l) * l.quantity, 0),
    deduction =
      discount.type === "percent"
        ? Math.round((subtotal * discount.value) / 100)
        : Math.round(discount.value * 100),
    total = subtotal - deduction;
  const add = (p: Product, options?: Partial<Line>) => {
    setLines((old) => [
      ...old,
      {
        key: uuid(),
        productId: p.id,
        quantity: 1,
        sweetness: "Normal sweet",
        ice: "Normal ice",
        toppings: [],
        ...options,
      },
    ]);
    setRequestKey(uuid());
    setSelected(null);
  };
  const clear = () => {
    setLines([]);
    setNote("");
    setDiscount({ type: "percent", value: 0, reason: "" });
    setRequestKey(uuid());
  };
  const save = async () => {
    setBusy(true);
    try {
      const o = await api("/orders", "POST", {
        requestKey,
        items: lines,
        note,
        discount,
      });
      clear();
      notify(`Order #${o.number} saved. You can take payment from Orders.`);
      onOrders();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="counter-layout">
      <section className="menu-panel">
        <div className="counter-toolbar">
          <div className="search-field">
            <Search size={18} />
            <input
              aria-label="Search the menu"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find something lovely…"
            />
            <kbd>⌕</kbd>
          </div>
          <span className="item-count">
            {products.filter((p: Product) => p.available).length} items on the
            menu
          </span>
        </div>
        <div className="categories">
          {categories.map((c) => {
            const Icon = icons[c] || LayoutGrid;
            return (
              <button
                key={c}
                className={category === c ? "selected" : ""}
                onClick={() => setCategory(c)}
              >
                <Icon size={17} />
                {c === "Ice cream series"
                  ? "Ice cream"
                  : c === "Smoothie series"
                    ? "Smoothies"
                    : c}
              </button>
            );
          })}
        </div>
        <div className="section-title">
          <div>
            <h2>
              {category === "All items" ? "The whole collection" : category}
            </h2>
            <span>{shown.length} items · tap to add to order</span>
          </div>
          <SlidersHorizontal size={17} />
        </div>
        <div className="product-grid">
          {shown.map((p: Product) => {
            const Icon = icons[p.category] || CupSoda;
            return (
              <button
                disabled={!p.available || p.needs_review}
                className={"product-card " + (tones[p.category] || "rose")}
                key={p.id}
                onClick={() => (p.options ? setSelected(p) : add(p))}
              >
                <div className="product-art">
                  <span className="product-code">{p.code}</span>
                  <div className="product-halo" />
                  <Icon strokeWidth={1.1} size={62} />
                  <span className="art-spark">✳</span>
                  {!p.available && (
                    <span className="unavailable">Unavailable</span>
                  )}
                </div>
                <div className="product-info">
                  <small>{p.category.replace(" series", "")}</small>
                  <h3>{p.name}</h3>
                  <div className="product-bottom">
                    <strong>{money(p.price)}</strong>
                    <span>{p.size}</span>
                    <i>
                      <Plus size={15} />
                    </i>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {!shown.length && (
          <Empty
            title="No matches on the menu"
            detail="Try another name, code or category."
            icon={Search}
          />
        )}
        <div className="menu-footer">
          <span>
            <ShieldCheck size={14} /> Prices confirmed by the store server
          </span>
          <span>Made fresh. Served with care.</span>
        </div>
      </section>
      <aside className="basket">
        <header>
          <div>
            <span className="eyebrow">LET’S MAKE IT LOVELY</span>
            <h2>
              Current order{" "}
              <span>{lines.reduce((s, l) => s + l.quantity, 0)}</span>
            </h2>
          </div>
          <button
            disabled={!lines.length}
            className="icon-button"
            title="Clear order"
            aria-label="Clear order"
            onClick={() => {
              if (confirm("Clear the current basket?")) clear();
            }}
          >
            <Trash2 size={17} />
          </button>
        </header>
        <div className="basket-staff">
          <span className="online-dot" /> Served by {user.name}
          <span>NEW</span>
        </div>
        <div className="basket-lines">
          {!lines.length ? (
            <Empty
              title="Something good starts here"
              detail="Choose an item from the menu to begin an order."
              icon={CupSoda}
            />
          ) : (
            lines.map((l) => {
              const p = product(l.productId);
              return (
                <div className="basket-line" key={l.key}>
                  <div
                    className={"line-icon " + (tones[p?.category] || "rose")}
                  >
                    {React.createElement(icons[p?.category] || CupSoda, {
                      size: 23,
                      strokeWidth: 1.4,
                    })}
                  </div>
                  <div className="line-details">
                    <h4>{p?.name || "Unavailable item"}</h4>
                    <p>
                      {p?.size}
                      {p?.options ? " · " + l.sweetness + " · " + l.ice : ""}
                    </p>
                    {l.toppings.length > 0 && (
                      <p>
                        + {l.toppings.map((id) => product(id)?.name).join(", ")}
                      </p>
                    )}
                    <div className="quantity">
                      <button
                        aria-label="Decrease quantity"
                        onClick={() => {
                          setLines((old) =>
                            old.flatMap((x) =>
                              x.key !== l.key
                                ? [x]
                                : x.quantity > 1
                                  ? [{ ...x, quantity: x.quantity - 1 }]
                                  : [],
                            ),
                          );
                          setRequestKey(uuid());
                        }}
                      >
                        <Minus size={12} />
                      </button>
                      <span>{l.quantity}</span>
                      <button
                        aria-label="Increase quantity"
                        disabled={l.quantity >= 99}
                        onClick={() => {
                          setLines((old) =>
                            old.map((x) =>
                              x.key === l.key
                                ? { ...x, quantity: x.quantity + 1 }
                                : x,
                            ),
                          );
                          setRequestKey(uuid());
                        }}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                  <strong>{money(unit(l) * l.quantity)}</strong>
                </div>
              );
            })
          )}
        </div>
        <div className="basket-summary">
          <label className="note-input">
            <ClipboardList size={15} />
            <input
              placeholder="Add an order note…"
              aria-label="Order note"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {user.role !== "cashier" && (
            <button
              className="discount-toggle"
              onClick={() => setShowDiscount(!showDiscount)}
            >
              <Plus size={14} />
              {deduction ? "Edit discount" : "Add a discount"}
              <span>Supervisor access</span>
            </button>
          )}
          {showDiscount && (
            <div className="discount-form">
              <select
                aria-label="Discount type"
                value={discount.type}
                onChange={(e) =>
                  setDiscount({ ...discount, type: e.target.value })
                }
              >
                <option value="percent">Percent %</option>
                <option value="fixed">Amount ₦</option>
              </select>
              <input
                aria-label="Discount value"
                type="number"
                min="0"
                max={discount.type === "percent" ? 100 : undefined}
                value={discount.value}
                onChange={(e) =>
                  setDiscount({ ...discount, value: Number(e.target.value) })
                }
              />
              <input
                aria-label="Discount reason"
                placeholder="Reason for discount"
                value={discount.reason}
                onChange={(e) =>
                  setDiscount({ ...discount, reason: e.target.value })
                }
              />
            </div>
          )}
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          {deduction > 0 && (
            <div className="summary-row">
              <span>Discount</span>
              <span>−{money(deduction)}</span>
            </div>
          )}
          <div className="summary-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <button
            className="primary full"
            disabled={!lines.length || !connected || total < 0 || busy}
            onClick={() => setCheckout(true)}
          >
            Review & take payment
            <ArrowRight size={18} />
          </button>
          <button
            className="text-button full"
            disabled={!lines.length || !connected || busy}
            onClick={save}
          >
            <Clock3 size={15} />
            {busy ? "Saving…" : "Hold order for later"}
          </button>
          <div className="basket-hint">
            <LockKeyhole size={12} /> Payment is confirmed manually by staff
          </div>
        </div>
      </aside>
      {selected && (
        <ProductOptions
          product={selected}
          products={products}
          onClose={() => setSelected(null)}
          onAdd={(o: any) => add(selected, o)}
        />
      )}
      {checkout && (
        <Checkout
          lines={lines}
          products={products}
          note={note}
          discount={discount}
          requestKey={requestKey}
          total={total}
          template={template}
          onClose={() => setCheckout(false)}
          onDone={(o: Order) => {
            clear();
            setCheckout(false);
            refresh();
            notify(`Order #${o.number} paid. Receipt and stickers queued.`);
            onOrders();
          }}
        />
      )}
    </div>
  );
}
function ProductOptions({ product, products, onClose, onAdd }: any) {
  const [sweetness, setSweetness] = useState("Normal sweet"),
    [ice, setIce] = useState("Normal ice"),
    [toppings, setToppings] = useState<string[]>([]);
  return (
    <Modal
      title={product.name}
      subtitle={`${product.size} · ${money(product.price)}`}
      onClose={onClose}
    >
      <div className="modal-body">
        <p className="field-heading">Make it your way</p>
        <label>
          Sweetness
          <div className="segmented">
            {["Normal sweet", "Less sweet", "No sugar"].map((v) => (
              <button
                key={v}
                aria-label={v}
                className={sweetness === v ? "active" : ""}
                onClick={() => setSweetness(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </label>
        <label>
          Ice level
          <div className="segmented">
            {["Normal ice", "Less ice", "No ice"].map((v) => (
              <button
                key={v}
                aria-label={v}
                className={ice === v ? "active" : ""}
                onClick={() => setIce(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </label>
        <label>
          Something extra <small>Optional · price per drink</small>
        </label>
        <div className="topping-options">
          {products
            .filter((p: Product) => p.category === "Toppings" && p.available)
            .map((p: Product) => (
              <button
                className={toppings.includes(p.id) ? "chosen" : ""}
                key={p.id}
                onClick={() =>
                  setToppings((t) =>
                    t.includes(p.id)
                      ? t.filter((x) => x !== p.id)
                      : [...t, p.id],
                  )
                }
              >
                <span>
                  {p.name}
                  <small>{p.size}</small>
                </span>
                <strong>+{money(p.price)}</strong>
                {toppings.includes(p.id) ? (
                  <Check size={17} />
                ) : (
                  <Plus size={17} />
                )}
              </button>
            ))}
        </div>
      </div>
      <footer className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary"
          onClick={() => onAdd({ sweetness, ice, toppings })}
        >
          Add to order <Plus size={17} />
        </button>
      </footer>
    </Modal>
  );
}
function Checkout({
  lines,
  products,
  note,
  discount,
  requestKey,
  total,
  onClose,
  onDone,
  existing,
}: any) {
  const [method, setMethod] = useState("card"),
    [cash, setCash] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState<Order | null>(existing || null);
  const cashMinor = Math.round(Number(cash) * 100);
  return (
    <Modal
      title={
        saved ? `Payment for #${saved.number}` : "Review & confirm payment"
      }
      subtitle="Confirm the money has been received before continuing."
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="checkout-total">
          <span>Amount to collect</span>
          <strong>{money(saved?.total ?? total)}</strong>
          <small>
            {saved
              ? saved.items.reduce((s: number, i: any) => s + i.quantity, 0)
              : lines.reduce((s: number, i: Line) => s + i.quantity, 0)}{" "}
            items in this order
          </small>
        </div>
        <label>Payment method</label>
        <div className="payment-methods">
          {["card", "transfer", "cash"].map((m) => (
            <button
              key={m}
              className={method === m ? "active" : ""}
              onClick={() => {
                setMethod(m);
                setConfirmed(false);
              }}
            >
              {m === "card"
                ? "Card / POS"
                : m === "transfer"
                  ? "Bank transfer"
                  : "Cash"}
              {method === m && <Check size={15} />}
            </button>
          ))}
        </div>
        {method === "cash" && (
          <>
            <label>
              Cash received (₦)
              <input
                type="number"
                min="0"
                step="0.01"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <div className="summary-row">
              <span>Change due</span>
              <strong>
                {money(Math.max(0, cashMinor - (saved?.total ?? total)))}
              </strong>
            </div>
          </>
        )}
        <label className="check-label">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>I have verified that payment has been received.</span>
        </label>
        <div className="info-box">
          <Printer size={18} />
          <span>
            After payment, the receipt prints first, followed by product
            stickers. The order then moves to preparing.
          </span>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {saved && error && (
          <p className="muted">
            Order #{saved.number} is saved. Retry payment here or open it from
            Orders.
          </p>
        )}
      </div>
      <footer className="modal-actions">
        <button className="secondary" disabled={busy} onClick={onClose}>
          Back
        </button>
        <button
          className="primary"
          disabled={
            busy ||
            !confirmed ||
            (method === "cash" && cashMinor < (saved?.total ?? total))
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const o: Order =
                saved ||
                (await api<Order>("/orders", "POST", {
                  requestKey,
                  items: lines,
                  note,
                  discount,
                }));
              setSaved(o);
              const paid = await api("/orders/" + o.id + "/pay", "POST", {
                method,
                cashTendered: cashMinor || 0,
              });
              onDone(paid);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Confirming…" : "Confirm payment"}
          <Check size={17} />
        </button>
      </footer>
    </Modal>
  );
}
function Orders({
  products,
  preparation,
  user,
  orders,
  template,
  refresh,
  notify,
}: any) {
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Order | null>(null),
    [pay, setPay] = useState<Order | null>(null),
    [editOrder, setEditOrder] = useState<Order | null>(null),
    [date, setDate] = useState(today()),
    [historical, setHistorical] = useState<Order[]>([]);
  useEffect(() => {
    if (date !== today())
      api("/orders?date=" + date)
        .then(setHistorical)
        .catch((e: Error) => notify(e.message));
  }, [date]);
  const source = date === today() ? orders : historical;
  const visible = source.filter(
    (o: Order) =>
      (preparation
        ? ["preparing", "ready", "paid"].includes(o.status)
        : filter === "all" || o.status === filter) &&
      `${o.number} ${o.staff_name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const change = async (o: Order, status: string) => {
    const reason =
      status === "cancelled"
        ? prompt("Why is this order being cancelled?")
        : "";
    if (status === "cancelled" && !reason) return;
    try {
      await api("/orders/" + o.id + "/status", "POST", {
        status,
        reason: reason || "",
      });
      refresh();
      setSelected(null);
      notify("Order updated.");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <>
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Find order"
            placeholder="Search order number or staff…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!preparation && (
          <input
            aria-label="Order date"
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
        <button className="secondary" onClick={refresh}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      {!preparation && (
        <div className="filter-tabs">
          {[
            "all",
            "pending",
            "paid",
            "preparing",
            "ready",
            "fulfilled",
            "cancelled",
          ].map((s) => (
            <button
              className={filter === s ? "active" : ""}
              key={s}
              onClick={() => setFilter(s)}
            >
              {s === "all" ? "All orders" : labels[s]}
              <span>
                {
                  source.filter((o: Order) => s === "all" || o.status === s)
                    .length
                }
              </span>
            </button>
          ))}
        </div>
      )}
      {preparation ? (
        <div className="prep-grid">
          {visible.map((o: Order) => (
            <article className="prep-card" key={o.id}>
              <header>
                <div>
                  <span className="eyebrow">ORDER</span>
                  <h2>#{String(o.number).padStart(3, "0")}</h2>
                </div>
                <Badge status={o.status} />
              </header>
              <small>
                {time(o.created_at)} · {o.staff_name}
              </small>
              <div className="prep-items">
                {o.items.map((i: any, index: number) => (
                  <div key={index}>
                    <b>{i.quantity}×</b>
                    <span>
                      <strong>{i.name}</strong>
                      <small>
                        {i.size} · {Object.values(i.options || {}).join(" · ")}
                        {i.toppings.length
                          ? " + " +
                            i.toppings.map((t: any) => t.name).join(", ")
                          : ""}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
              {o.note && <div className="order-note">{o.note}</div>}
              {o.status === "preparing" ? (
                <button
                  className="primary full"
                  onClick={() => change(o, "ready")}
                >
                  Mark ready
                  <Check size={16} />
                </button>
              ) : o.status === "ready" ? (
                <button
                  className="primary full"
                  onClick={() => change(o, "fulfilled")}
                >
                  Handed to customer
                  <ArrowUpRight size={16} />
                </button>
              ) : (
                <div className="info-box">
                  <Printer size={16} /> Waiting for receipt and stickers
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Placed by</th>
                <th>Items</th>
                <th>Time</th>
                <th>Payment</th>
                <th>Status</th>
                <th className="right">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((o: Order) => (
                <tr
                  key={o.id}
                  onClick={() => setSelected(o)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSelected(o);
                  }}
                >
                  <td>
                    <b>#{String(o.number).padStart(3, "0")}</b>
                  </td>
                  <td>{o.staff_name}</td>
                  <td>
                    {o.items.reduce((s: number, i: any) => s + i.quantity, 0)}{" "}
                    items
                  </td>
                  <td>{time(o.created_at)}</td>
                  <td>
                    <span className="capitalize">
                      {o.payment_method || "Unpaid"}
                    </span>
                  </td>
                  <td>
                    <Badge status={o.status} />
                  </td>
                  <td className="right">
                    <b>{money(o.total)}</b>
                  </td>
                  <td>
                    <ChevronRight size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!visible.length && (
        <Empty
          title={
            preparation
              ? "A clear counter, a fresh start"
              : "No orders here yet"
          }
          detail={
            preparation
              ? "Paid orders will appear here once printing is complete."
              : "Orders matching your filters will appear here."
          }
          icon={preparation ? ChefHat : ClipboardList}
        />
      )}
      {selected && (
        <Modal
          title={`Order #${String(selected.number).padStart(3, "0")}`}
          subtitle={`${selected.staff_name} · ${time(selected.created_at)}`}
          onClose={() => setSelected(null)}
        >
          <div className="modal-body">
            <div className="detail-status">
              <Badge status={selected.status} />
              <strong>{money(selected.total)}</strong>
            </div>
            <ReceiptPreview template={template} order={selected} />
            {selected.paid_by_name && (
              <p className="muted">
                Payment confirmed by {selected.paid_by_name} ·{" "}
                {selected.paid_at && time(selected.paid_at)}
              </p>
            )}
            {selected.note && <div className="order-note">{selected.note}</div>}
            <div className="detail-actions">
              {selected.status === "pending" && (
                <>
                  <button
                    className="secondary"
                    onClick={() => {
                      setEditOrder(selected);
                      setSelected(null);
                    }}
                  >
                    Edit items
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      setPay(selected);
                      setSelected(null);
                    }}
                  >
                    Take payment
                    <ArrowRight size={15} />
                  </button>
                  <button
                    className="danger secondary"
                    onClick={() => change(selected, "cancelled")}
                  >
                    Cancel order
                  </button>
                </>
              )}
              {selected.status === "preparing" && (
                <button
                  className="primary"
                  onClick={() => change(selected, "ready")}
                >
                  Mark ready
                </button>
              )}
              {selected.status === "ready" && (
                <button
                  className="primary"
                  onClick={() => change(selected, "fulfilled")}
                >
                  Mark fulfilled
                </button>
              )}
              {user.role !== "cashier" &&
                selected.payment_status === "paid" && (
                  <>
                    <button
                      className="secondary"
                      onClick={async () => {
                        const reason = prompt(
                          "Reason for reprinting this receipt:",
                        );
                        if (!reason) return;
                        try {
                          await api(
                            "/orders/" + selected.id + "/reprint",
                            "POST",
                            { reason },
                          );
                          notify("Duplicate receipt queued.");
                          refresh();
                        } catch (e) {
                          notify((e as Error).message);
                        }
                      }}
                    >
                      <Printer size={15} /> Reprint receipt
                    </button>
                    <button
                      className="danger secondary"
                      onClick={async () => {
                        const reason = prompt(
                          "Confirm a full refund has been issued. Enter the reason:",
                        );
                        if (!reason) return;
                        const method = prompt(
                          "Refund method: cash, card, or transfer",
                          selected.payment_method,
                        );
                        if (!method) return;
                        try {
                          await api(
                            "/orders/" + selected.id + "/refund",
                            "POST",
                            { reason, method },
                          );
                          refresh();
                          setSelected(null);
                          notify("Refund recorded.");
                        } catch (e) {
                          notify((e as Error).message);
                        }
                      }}
                    >
                      Record full refund
                    </button>
                  </>
                )}
            </div>
          </div>
        </Modal>
      )}
      {editOrder && (
        <EditHeldOrder
          order={editOrder}
          products={products}
          onClose={() => setEditOrder(null)}
          onSaved={() => {
            setEditOrder(null);
            refresh();
            notify("Order updated.");
          }}
        />
      )}
      {pay && (
        <Checkout
          existing={pay}
          total={pay.total}
          onClose={() => setPay(null)}
          onDone={() => {
            setPay(null);
            refresh();
            notify("Payment confirmed. Printing queued.");
          }}
        />
      )}
    </>
  );
}
function EditHeldOrder({ order, products, onClose, onSaved }: any) {
  const [lines, setLines] = useState<any[]>(
    order.items.map((i: any) => ({
      productId: i.productId,
      quantity: i.quantity,
      sweetness: i.options?.sweetness || "Normal sweet",
      ice: i.options?.ice || "Normal ice",
      toppings: i.toppings.map((t: any) => t.id),
    })),
  );
  const [note, setNote] = useState(order.note),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [addId, setAddId] = useState("");
  return (
    <Modal
      title={`Edit order #${order.number}`}
      subtitle="Changes are allowed before payment and recorded in the audit trail."
      onClose={onClose}
    >
      <div className="modal-body">
        {lines.map((l, i) => (
          <div className="held-edit-line" key={i}>
            <span>
              {products.find((p: Product) => p.id === l.productId)?.name ||
                "Unavailable product"}
              <small>
                {l.sweetness} · {l.ice}
              </small>
            </span>
            <input
              aria-label={`Quantity for item ${i + 1}`}
              type="number"
              min="1"
              max="99"
              value={l.quantity}
              onChange={(e) =>
                setLines((old) =>
                  old.map((x, k) =>
                    k === i ? { ...x, quantity: Number(e.target.value) } : x,
                  ),
                )
              }
            />
            <button
              className="icon-button"
              aria-label={`Remove item ${i + 1}`}
              onClick={() => setLines((old) => old.filter((_, k) => k !== i))}
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <label>
          Add a product
          <select value={addId} onChange={(e) => setAddId(e.target.value)}>
            <option value="">Choose a product</option>
            {products
              .filter((p: Product) => p.available)
              .map((p: Product) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.price)}
                </option>
              ))}
          </select>
        </label>
        <button
          className="secondary"
          disabled={!addId}
          onClick={() => {
            setLines((old) => [
              ...old,
              {
                productId: addId,
                quantity: 1,
                sweetness: "Normal sweet",
                ice: "Normal ice",
                toppings: [],
              },
            ]);
            setAddId("");
          }}
        >
          <Plus size={15} /> Add item
        </button>
        <label className="field-heading">
          Order note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
        </label>
        <p className="muted">
          New items use normal sweetness/ice. Existing drink options are
          preserved. Existing discounts remain a fixed amount; a supervisor must
          edit discounted orders.
        </p>
        {error && <div className="form-error">{error}</div>}
      </div>
      <footer className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={!lines.length || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/orders/" + order.id, "PUT", {
                version: order.version,
                items: lines,
                note,
              });
              onSaved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Save size={16} />
          {busy ? "Saving…" : "Save changes"}
        </button>
      </footer>
    </Modal>
  );
}
function ReceiptPreview({
  template: t,
  order,
  sticker = false,
}: {
  template: Template;
  order?: Order;
  sticker?: boolean;
}) {
  const demo: any = {
    number: 151,
    staff_name: "Amina Yusuf",
    created_at: new Date().toISOString(),
    subtotal: 750000,
    discount: 0,
    total: 750000,
    payment_method: "card",
    items: [
      {
        code: "C2",
        name: "Brown Sugar Boba Milk Tea",
        quantity: 1,
        size: "700 ml",
        unitPrice: 430000,
        lineTotal: 430000,
        options: { sweetness: "Normal sweet", ice: "Less ice" },
        toppings: [{ name: "Boba" }],
      },
      {
        code: "A5",
        name: "Strawberry Sundae",
        quantity: 1,
        size: "12 oz",
        unitPrice: 320000,
        lineTotal: 320000,
        options: null,
        toppings: [],
      },
    ],
  };
  const o = order || demo;
  return (
    <div
      className={"receipt-paper " + (sticker ? "sticker-paper" : "")}
      style={{
        width: sticker ? `${t.labelWidth * 4.4}px` : undefined,
        minHeight: sticker ? `${t.labelHeight * 4.4}px` : undefined,
      }}
    >
      {sticker ? (
        <>
          <div className="sticker-top">
            <b>{t.businessName}</b>
            <span>#{o.number} · 1/2</span>
          </div>
          <h3>{o.items[0].name}</h3>
          <p>
            {o.items[0].size} ·{" "}
            {Object.values(o.items[0].options || {}).join(" · ")}
          </p>
          <p>+ {o.items[0].toppings.map((x: any) => x.name).join(", ")}</p>
          {t.labelShowStaff && <p>By {o.staff_name}</p>}
        </>
      ) : (
        <>
          <div className={"receipt-header " + t.align}>
            <h2 style={{ fontSize: t.headingSize === "large" ? 24 : 17 }}>
              {t.businessName}
            </h2>
            <p>{t.subtitle}</p>
            <p>{t.address}</p>
            {t.phone && <p>{t.phone}</p>}
          </div>
          <div className="receipt-rule" />
          <div className="receipt-order">
            ORDER #{String(o.number).padStart(3, "0")}
          </div>
          <p>
            {new Date(o.created_at).toLocaleDateString("en-GB", {
              timeZone: "Africa/Lagos",
            })}{" "}
            · {time(o.created_at)}
          </p>
          {t.showStaff && <p>Served by {o.staff_name}</p>}
          <div className="receipt-rule" />
          {o.items.map((i: any, n: number) => (
            <div className="receipt-item" key={n}>
              <div>
                <b>
                  {i.quantity} × {t.showCode ? i.code + " " : ""}
                  {i.name}
                </b>
                <strong>{money(i.lineTotal)}</strong>
              </div>
              <p>
                {i.size} · Unit {money(i.unitPrice)}
              </p>
              {t.showOptions && (
                <>
                  <p>{Object.values(i.options || {}).join(" · ")}</p>
                  {i.toppings.length > 0 && (
                    <p>+ {i.toppings.map((x: any) => x.name).join(", ")}</p>
                  )}
                </>
              )}
            </div>
          ))}
          <div className="receipt-rule" />
          <div className="receipt-row">
            <span>Subtotal</span>
            <span>{money(o.subtotal)}</span>
          </div>
          {o.discount > 0 && (
            <div className="receipt-row">
              <span>Discount</span>
              <span>−{money(o.discount)}</span>
            </div>
          )}
          <div className="receipt-row receipt-total">
            <b>TOTAL</b>
            <b>{money(o.total)}</b>
          </div>
          {t.showPayment && (
            <div className="receipt-row">
              <span>Payment</span>
              <span className="capitalize">
                {o.payment_method || "Awaiting payment"}
              </span>
            </div>
          )}
          <div className="receipt-rule" />
          <footer>{t.footer}</footer>
        </>
      )}
    </div>
  );
}
function ReceiptStudio({ template, refresh, notify }: any) {
  const [draft, setDraft] = useState<Template>(template),
    [tab, setTab] = useState("receipt"),
    [busy, setBusy] = useState(false);
  const change = (k: keyof Template, v: any) =>
    setDraft((t) => ({ ...t, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(template);
  return (
    <>
      <div className="studio-banner">
        <div className="studio-banner-icon">
          <Sparkles size={24} />
        </div>
        <div>
          <h3>Your brand, down to the last detail.</h3>
          <p>
            Design your customer receipt and product stickers. Saved templates
            apply to future print jobs.
          </p>
        </div>
        <span className="pill">XP-58IIH + XP-235B</span>
      </div>
      <div className="studio-layout">
        <section className="panel">
          <div className="panel-heading">
            <h2>Template settings</h2>
            <span className={"badge " + (dirty ? "pending" : "fulfilled")}>
              {dirty ? "Unsaved changes" : "Saved template"}
            </span>
          </div>
          <div className="panel-body">
            <div className="segmented">
              <button
                className={tab === "receipt" ? "active" : ""}
                onClick={() => setTab("receipt")}
              >
                Customer receipt
              </button>
              <button
                className={tab === "label" ? "active" : ""}
                onClick={() => setTab("label")}
              >
                Product sticker
              </button>
            </div>
            <p className="field-heading">Business details</p>
            <label>
              Business name
              <input
                value={draft.businessName}
                onChange={(e) => change("businessName", e.target.value)}
                maxLength={80}
              />
            </label>
            <label>
              Tagline
              <input
                value={draft.subtitle}
                onChange={(e) => change("subtitle", e.target.value)}
                maxLength={120}
              />
            </label>
            <label>
              Store address
              <textarea
                value={draft.address}
                onChange={(e) => change("address", e.target.value)}
                maxLength={180}
              />
            </label>
            <label>
              Phone number
              <input
                value={draft.phone}
                onChange={(e) => change("phone", e.target.value)}
                maxLength={40}
              />
            </label>
            {tab === "receipt" ? (
              <>
                <p className="field-heading">Layout & content</p>
                <div className="form-grid">
                  <label>
                    Header alignment
                    <select
                      value={draft.align}
                      onChange={(e) => change("align", e.target.value)}
                    >
                      <option value="center">Centred</option>
                      <option value="left">Left aligned</option>
                    </select>
                  </label>
                  <label>
                    Heading size
                    <select
                      value={draft.headingSize}
                      onChange={(e) => change("headingSize", e.target.value)}
                    >
                      <option value="large">Statement</option>
                      <option value="small">Compact</option>
                    </select>
                  </label>
                </div>
                {[
                  ["showStaff", "Show staff name"],
                  ["showOptions", "Show drink options & toppings"],
                  ["showPayment", "Show payment method"],
                  ["showCode", "Show product codes"],
                ].map(([key, label]) => (
                  <label className="toggle-row" key={key}>
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={!!draft[key as keyof Template]}
                      onChange={(e) =>
                        change(key as keyof Template, e.target.checked)
                      }
                    />
                  </label>
                ))}
                <label>
                  Footer message
                  <textarea
                    value={draft.footer}
                    onChange={(e) => change("footer", e.target.value)}
                    maxLength={200}
                  />
                </label>
                <p className="muted">58 mm paper · XP-58IIH receipt printer</p>
              </>
            ) : (
              <>
                <p className="field-heading">Label stock</p>
                <div className="form-grid">
                  <label>
                    Width (mm)
                    <input
                      type="number"
                      min="20"
                      max="60"
                      value={draft.labelWidth}
                      onChange={(e) =>
                        change("labelWidth", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Height (mm)
                    <input
                      type="number"
                      min="15"
                      max="150"
                      value={draft.labelHeight}
                      onChange={(e) =>
                        change("labelHeight", Number(e.target.value))
                      }
                    />
                  </label>
                </div>
                <label className="toggle-row">
                  <span>Show staff name on sticker</span>
                  <input
                    type="checkbox"
                    checked={draft.labelShowStaff}
                    onChange={(e) => change("labelShowStaff", e.target.checked)}
                  />
                </label>
                <div className="info-box">
                  <ReceiptText size={18} />
                  <span>
                    Each labelled unit gets its own sticker with its drink
                    options and position in the order.
                  </span>
                </div>
              </>
            )}
            <button
              className="primary full"
              disabled={!dirty || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/settings/receipt", "PUT", draft);
                  await refresh();
                  notify("Receipt and sticker templates saved.");
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Save size={17} />
              {busy ? "Saving…" : "Save template"}
            </button>
          </div>
        </section>
        <section className="studio-preview">
          <header>
            <div>
              <span className="eyebrow">LIVE PREVIEW</span>
              <h2>
                {tab === "receipt"
                  ? "The finishing touch."
                  : "A little label. A clear order."}
              </h2>
            </div>
            <span className="pill">
              {tab === "receipt"
                ? "58 mm"
                : `${draft.labelWidth} × ${draft.labelHeight} mm`}
            </span>
          </header>
          <div className="preview-surface">
            <ReceiptPreview template={draft} sticker={tab === "label"} />
          </div>
          <p>
            <Eye size={15} /> Illustrative preview · final alignment requires a
            physical test
          </p>
        </section>
      </div>
    </>
  );
}
function MenuLibrary({ products, refresh, notify }: any) {
  const [search, setSearch] = useState(""),
    [edit, setEdit] = useState<any>(null),
    [busy, setBusy] = useState(false);
  const categories = [
    ...new Set<string>(products.map((p: Product) => p.category)),
  ];
  return (
    <>
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            placeholder="Search products or categories…"
            aria-label="Search products"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="muted">
          {products.length} products · {categories.length} categories
        </span>
        <button
          className="primary"
          onClick={() =>
            setEdit({
              code: "",
              name: "",
              category: categories[0] || "Drinks",
              price: 0,
              size: "",
              available: true,
              label_required: true,
              options: true,
              needs_review: false,
            })
          }
        >
          <Plus size={17} /> New product
        </button>
      </div>
      <div className="info-box menu-import">
        <ShieldCheck size={18} />
        <span>
          Menu transcribed from your photographs. Confirm prices before trading.
          Three obscured ice-cream entries are documented in the setup notes and
          have not been guessed.
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Size</th>
              <th>Price</th>
              <th>Availability</th>
              <th>Output</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products
              .filter((p: Product) =>
                `${p.name} ${p.code} ${p.category}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((p: Product) => (
                <tr key={p.id}>
                  <td>
                    <div className="table-product">
                      <span
                        className={
                          "mini-product " + (tones[p.category] || "rose")
                        }
                      >
                        {React.createElement(icons[p.category] || CupSoda, {
                          size: 20,
                        })}
                      </span>
                      <div>
                        <b>{p.name}</b>
                        <small>{p.code}</small>
                      </div>
                    </div>
                  </td>
                  <td>{p.category}</td>
                  <td>{p.size || "—"}</td>
                  <td>
                    <b>{money(p.price)}</b>
                  </td>
                  <td>
                    <span
                      className={
                        "badge " + (p.available ? "fulfilled" : "cancelled")
                      }
                    >
                      {p.available ? "Available" : "Unavailable"}
                    </span>
                  </td>
                  <td>{p.label_required ? "Receipt + sticker" : "Receipt"}</td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setEdit({ ...p })}
                    >
                      Edit
                      <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal
          title={edit.id ? "Edit product" : "Add to the collection"}
          subtitle="Prices are stored in naira and preserved on every sale."
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api(
                  "/products" + (edit.id ? "/" + edit.id : ""),
                  edit.id ? "PUT" : "POST",
                  edit,
                );
                setEdit(null);
                refresh();
                notify("Product saved.");
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="modal-body">
              <label>
                Product name
                <input
                  required
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </label>
              <div className="form-grid">
                <label>
                  Display code
                  <input
                    required
                    value={edit.code}
                    onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                  />
                </label>
                <label>
                  Price (₦)
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={edit.price / 100}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        price: Math.round(Number(e.target.value) * 100),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Category
                <input
                  list="categories"
                  required
                  value={edit.category}
                  onChange={(e) =>
                    setEdit({ ...edit, category: e.target.value })
                  }
                />
                <datalist id="categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <label>
                Serving size
                <input
                  placeholder="e.g. 700 ml or 12 oz"
                  value={edit.size}
                  onChange={(e) => setEdit({ ...edit, size: e.target.value })}
                />
              </label>
              {[
                ["available", "Available to order"],
                ["options", "Allow sweetness & ice options"],
                ["label_required", "Print a sticker for each unit"],
              ].map(([k, l]) => (
                <label className="toggle-row" key={k}>
                  <span>{l}</span>
                  <input
                    type="checkbox"
                    checked={edit[k]}
                    onChange={(e) =>
                      setEdit({ ...edit, [k]: e.target.checked })
                    }
                  />
                </label>
              ))}
            </div>
            <footer className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEdit(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                <Save size={16} />
                {busy ? "Saving…" : "Save product"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
function Printing({ data, manager, refresh, notify }: any) {
  const jobs = data.jobs || [],
    worker = data.worker,
    online =
      worker?.lastSeen && Date.now() - Date.parse(worker.lastSeen) < 15000;
  return (
    <>
      <div className="metric-grid three">
        <Metric
          label="Waiting to print"
          value={jobs.filter((j: any) => j.status === "queued").length}
          icon={Clock3}
          detail="Durably saved in the local queue"
        />
        <Metric
          label="Submitted"
          value={jobs.filter((j: any) => j.status === "submitted").length}
          icon={CheckCircle2}
          detail="Recent jobs · includes simulated output"
        />
        <Metric
          label="Needs attention"
          value={
            jobs.filter((j: any) => ["failed", "uncertain"].includes(j.status))
              .length
          }
          icon={TriangleAlert}
          detail="Check physical output before retrying"
        />
      </div>
      <div className="worker-banner">
        <div>
          <span className={online ? "online-dot" : "offline-dot"} />
          <b>
            {online ? "Print worker connected" : "Print worker is not running"}
          </b>
          <span>
            {worker?.mode === "simulation"
              ? "Simulation mode · no physical output"
              : "Windows driver mode"}
          </span>
        </div>
        <button className="secondary" onClick={refresh}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      <div className="printer-pair">
        <div className="panel printer-card">
          <Printer size={24} />
          <div>
            <h3>Customer receipt</h3>
            <p>Xprinter XP-58IIH · USB · 58 mm</p>
          </div>
          <span className="pill">FIRST</span>
        </div>
        <div className="panel printer-card">
          <ReceiptText size={24} />
          <div>
            <h3>Product stickers</h3>
            <p>Xprinter XP-235B · USB · 203 dpi</p>
          </div>
          <span className="pill">THEN</span>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Destination</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Created</th>
              <th>Details</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {jobs.map((j: any) => (
              <tr key={j.id}>
                <td>
                  <b>{j.id.slice(0, 8)}</b>
                  {j.reprint && (
                    <small className="block">Duplicate receipt</small>
                  )}
                </td>
                <td>
                  {j.kind === "receipt"
                    ? "Customer receipt"
                    : `Sticker ${j.sequence}`}
                </td>
                <td>
                  <Badge status={j.status} />
                  {j.simulated && <small className="block">Simulated</small>}
                </td>
                <td>{j.attempts}</td>
                <td>{time(j.created_at)}</td>
                <td className="error-cell">{j.error || "—"}</td>
                <td>
                  {manager && ["failed", "uncertain"].includes(j.status) && (
                    <button
                      className="secondary"
                      onClick={async () => {
                        const reason = prompt(
                          "Check the printer first to avoid duplicates. Reason for retry:",
                        );
                        if (!reason) return;
                        try {
                          await api("/printing/" + j.id + "/retry", "POST", {
                            reason,
                          });
                          refresh();
                          notify("Job queued for retry.");
                        } catch (e) {
                          notify((e as Error).message);
                        }
                      }}
                    >
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!jobs.length && (
          <Empty
            title="Ready when you are"
            detail="Paid orders create a receipt job followed by individual sticker jobs."
            icon={Printer}
          />
        )}
      </div>
    </>
  );
}
function Metric({ label, value, detail, icon: Icon }: any) {
  return (
    <div className="metric">
      <div>
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
function Reports({ user, notify }: any) {
  const [date, setDate] = useState(today()),
    [report, setReport] = useState<any>(null),
    [closures, setClosures] = useState<any[]>([]),
    [counted, setCounted] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => {
    api("/report?date=" + date)
      .then(setReport)
      .catch((e: Error) => notify(e.message));
    if (user.role === "admin")
      api("/closures")
        .then(setClosures)
        .catch((e: Error) => notify(e.message));
  };
  useEffect(load, [date]);
  const closed = closures.find((c) => c.business_date === date);
  const exportCsv = () => {
    const quote = (v: any) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const rows = [
      [
        "Order",
        "Created",
        "Staff",
        "Payment confirmed by",
        "Status",
        "Payment",
        "Gross NGN",
        "Discount NGN",
        "Total NGN",
        "Payment status",
      ],
      ...report.transactions.map((o: Order) => [
        o.number,
        o.created_at,
        o.staff_name,
        o.paid_by_name,
        o.status,
        o.payment_method,
        o.subtotal / 100,
        o.discount / 100,
        o.total / 100,
        o.payment_status,
      ]),
    ];
    const blob = new Blob(
      [
        "\uFEFF" +
          rows
            .map((r) =>
              r
                .map((v: any) =>
                  quote(/^[=+\-@]/.test(String(v)) ? "'" + v : v),
                )
                .join(","),
            )
            .join("\r\n"),
      ],
      { type: "text/csv" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bing-chun-" + date + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <div className="toolbar">
        <div>
          <input
            aria-label="Report date"
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <span className="muted">Africa/Lagos · calendar business day</span>
        <button className="secondary" onClick={load}>
          <RefreshCw size={15} /> Refresh
        </button>
        <button className="secondary" disabled={!report} onClick={exportCsv}>
          <Download size={15} /> Export transactions
        </button>
        <button
          className="primary"
          disabled={!report}
          onClick={() => window.print()}
        >
          <Printer size={16} /> Print EOD
        </button>
      </div>
      {report && (
        <>
          <div className="metric-grid">
            <Metric
              label="Net sales"
              value={money(report.net)}
              detail="Paid sales less discounts and refunds"
              icon={ChartNoAxesCombined}
            />
            <Metric
              label="Orders placed"
              value={report.orders}
              detail={`${report.paidOrders} orders have received payment`}
              icon={ClipboardList}
            />
            <Metric
              label="Average paid order"
              value={money(report.average)}
              detail="Before refunds · after discounts"
              icon={ReceiptText}
            />
            <Metric
              label="Discounts & refunds"
              value={money(report.discounts + report.refunds)}
              detail={`${money(report.discounts)} discounts · ${money(report.refunds)} refunds`}
              icon={SlidersHorizontal}
            />
          </div>
          <div className="report-grid">
            <section className="panel">
              <div className="panel-heading">
                <h2>What the store served</h2>
                <span className="pill">{date}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="right">Quantity</th>
                    <th className="right">Gross value</th>
                  </tr>
                </thead>
                <tbody>
                  {report.products
                    .sort((a: any, b: any) => b.quantity - a.quantity)
                    .map((p: any) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td className="right">{p.quantity}</td>
                        <td className="right">{money(p.revenue)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!report.products.length && (
                <Empty
                  title="A fresh page"
                  detail="Paid orders will build your product breakdown."
                />
              )}
              <p className="panel-footnote">
                Gross item values before discounts/refunds. Add-on quantities
                are shown separately; their revenue is included in the parent
                drink.
              </p>
            </section>
            <div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Payment breakdown</h2>
                </div>
                <div className="panel-body">
                  {Object.entries(report.payments).map(([k, v]) => (
                    <div className="payment-report" key={k}>
                      <span className="capitalize">
                        {k === "card" ? "Card / POS" : k}
                      </span>
                      <b>{money(v as number)}</b>
                    </div>
                  ))}
                  <div className="summary-total">
                    <span>Net collections</span>
                    <strong>
                      {money(
                        Object.values(report.payments).reduce(
                          (s: number, v) => s + (v as number),
                          0,
                        ),
                      )}
                    </strong>
                  </div>
                </div>
              </section>
              <section className="panel status-summary">
                <div className="panel-heading">
                  <h2>Order progress</h2>
                </div>
                <div className="panel-body">
                  {Object.entries(report.statuses).map(([k, v]) => (
                    <div className="payment-report" key={k}>
                      <Badge status={k} />
                      <b>{v as number}</b>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
          <section className="panel" style={{ marginTop: 24 }}>
            <div className="panel-heading">
              <h2>Staff sales</h2>
              <span className="muted">
                Attributed to the person who placed the order
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Paid orders</th>
                  <th>Sales after discounts</th>
                  <th>Discounts</th>
                </tr>
              </thead>
              <tbody>
                {(report.staff || []).map((s: any) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td>{s.orders}</td>
                    <td>{money(s.sales)}</td>
                    <td>{money(s.discounts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {user.role === "admin" && (
            <section className="panel eod-panel">
              <div>
                <span className="eyebrow">END OF DAY</span>
                <h2>
                  {closed ? "This day is closed." : "Bring the day to a close."}
                </h2>
                <p>
                  {closed
                    ? `Closed by ${closed.closed_by}. Cash variance: ${money(closed.variance)}.`
                    : "Resolve unfulfilled orders, count cash, then save a fixed daily snapshot."}
                </p>
                <small>
                  Expected cash: {money(report.payments.cash)} · excludes
                  opening float and cash expenses.
                </small>
              </div>
              {closed ? (
                <button
                  className="secondary"
                  onClick={async () => {
                    const reason = prompt("Reason for reopening this day:");
                    if (!reason) return;
                    try {
                      await api("/closures/" + date + "/reopen", "POST", {
                        reason,
                      });
                      load();
                      notify(
                        "Day reopened; previous closure preserved in audit.",
                      );
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  Reopen day
                </button>
              ) : (
                <div>
                  <label>
                    Counted sales cash (₦)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={counted}
                      onChange={(e) => setCounted(e.target.value)}
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={!counted || busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api("/closures", "POST", {
                          date,
                          countedCash: Math.round(Number(counted) * 100),
                        });
                        load();
                        notify("Daily closure saved.");
                      } catch (e) {
                        notify((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <LockKeyhole size={16} /> Close business day
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
function Team({ notify }: any) {
  const [users, setUsers] = useState<User[]>([]),
    [create, setCreate] = useState(false),
    [busy, setBusy] = useState(false);
  const load = () =>
    api<User[]>("/users")
      .then(setUsers)
      .catch((e: Error) => notify(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <div className="toolbar">
        <div className="info-inline">
          <ShieldCheck size={18} />
          <span>Admin accounts are restricted to the store computer.</span>
        </div>
        <button className="primary" onClick={() => setCreate(true)}>
          <Plus size={17} /> Add team member
        </button>
      </div>
      <div className="team-grid">
        {users.map((u) => (
          <article className="panel team-card" key={u.id}>
            <div className="team-top">
              <div className="avatar">
                {u.name
                  .split(" ")
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <span
                className={"badge " + (u.active ? "fulfilled" : "cancelled")}
              >
                {u.active ? "Active" : "Inactive"}
              </span>
            </div>
            <h3>{u.name}</h3>
            <p>@{u.username}</p>
            <span className="role-pill">
              <ShieldCheck size={14} />
              {u.role}
            </span>
            <div className="team-actions">
              <button
                className="text-button"
                onClick={async () => {
                  const password = prompt(
                    "New password (at least 10 characters). This will sign the user out:",
                  );
                  if (!password) return;
                  try {
                    await api("/users/" + u.id, "PATCH", { password });
                    notify("Password reset.");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Reset password
              </button>
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await api("/users/" + u.id, "PATCH", { active: !u.active });
                    load();
                    notify("User access updated.");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                {u.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {create && (
        <Modal
          title="A new face at the counter"
          subtitle="Create credentials for staff to sign in on their handheld."
          onClose={() => setCreate(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              try {
                await api("/users", "POST", Object.fromEntries(f));
                setCreate(false);
                load();
                notify(
                  "Team member created. Share their credentials directly.",
                );
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="modal-body">
              <label>
                Full name
                <input name="name" required minLength={2} autoComplete="off" />
              </label>
              <label>
                Username
                <input
                  name="username"
                  required
                  minLength={3}
                  pattern="[a-zA-Z0-9._-]+"
                  autoComplete="off"
                />
              </label>
              <label>
                Initial password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Role
                <select name="role">
                  <option value="cashier">Cashier · orders and payments</option>
                  <option value="supervisor">
                    Supervisor · discounts, refunds and reports
                  </option>
                  <option value="admin">
                    Administrator · store computer only
                  </option>
                </select>
              </label>
              <div className="info-box">
                <Monitor size={18} />
                <span>
                  Cashiers and supervisors can sign in from tablets on the store
                  network.
                </span>
              </div>
            </div>
            <footer className="modal-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setCreate(false)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Creating…" : "Create account"}
                <ArrowRight size={16} />
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
function Audit() {
  const [rows, setRows] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<any>(null);
  const load = () =>
    api("/audit")
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search activity"
            placeholder="Search action or team member…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="muted">Most recent 300 events</span>
        <button className="secondary" onClick={load}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Team member</th>
              <th>Order reference</th>
              <th>Recorded</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) =>
                `${r.action} ${r.user_name}`.includes(search.toLowerCase()),
              )
              .map((r) => (
                <tr key={r.id}>
                  <td>
                    <b className="capitalize">
                      {r.action.replaceAll("_", " ")}
                    </b>
                  </td>
                  <td>{r.user_name}</td>
                  <td>{r.order_id?.slice(0, 8) || "—"}</td>
                  <td>
                    {new Date(r.created_at).toLocaleString("en-GB", {
                      timeZone: "Africa/Lagos",
                    })}
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setSelected(r)}
                    >
                      Details
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <Modal
          title={selected.action.replaceAll("_", " ")}
          subtitle={selected.user_name}
          onClose={() => setSelected(null)}
        >
          <div className="modal-body">
            <pre className="audit-json">
              {JSON.stringify(selected.details, null, 2)}
            </pre>
          </div>
        </Modal>
      )}
    </>
  );
}
function System({ printing }: any) {
  const [backups, setBackups] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api("/backups")
      .then(setBackups)
      .catch((e: Error) => setError(e.message));
  }, []);
  return (
    <>
      <div className="system-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Local store server</h2>
            <Monitor size={20} />
          </div>
          <div className="panel-body">
            <dl className="settings-list">
              <div>
                <dt>Workspace</dt>
                <dd>Bing Chun · Main store</dd>
              </div>
              <div>
                <dt>Server address</dt>
                <dd>{window.location.origin}</dd>
              </div>
              <div>
                <dt>Business timezone</dt>
                <dd>Africa/Lagos</dd>
              </div>
              <div>
                <dt>Currency</dt>
                <dd>Nigerian naira · NGN</dd>
              </div>
              <div>
                <dt>Administration</dt>
                <dd>Windows server only</dd>
              </div>
              <div>
                <dt>Data storage</dt>
                <dd>Local PostgreSQL database</dd>
              </div>
            </dl>
            <div className="info-box">
              <Wifi size={18} />
              <span>
                Staff should open the server’s reserved network address.
                Internet is not required for local sales.
              </span>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Printer configuration</h2>
            <Printer size={20} />
          </div>
          <div className="panel-body">
            <dl className="settings-list">
              <div>
                <dt>Receipt</dt>
                <dd>XP-58IIH · 58 mm · USB</dd>
              </div>
              <div>
                <dt>Sticker</dt>
                <dd>XP-235B · USB</dd>
              </div>
              <div>
                <dt>Worker mode</dt>
                <dd>{printing.worker?.mode || "Not connected"}</dd>
              </div>
              <div>
                <dt>Hardware validation</dt>
                <dd>Pending physical tests</dd>
              </div>
            </dl>
            <div className="info-box">
              <TriangleAlert size={18} />
              <span>
                Installed Windows queue names are configured in the station’s
                environment file. Receipt and label layouts are edited in
                Receipt studio.
              </span>
            </div>
          </div>
        </section>
      </div>
      <section className="panel backup-panel">
        <div className="panel-heading">
          <div>
            <h2>Backups & recovery</h2>
            <p>Local snapshots with optional encrypted cloud upload.</p>
          </div>
          <Cloud size={22} />
        </div>
        {error && <div className="form-error">{error}</div>}
        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>Local backup</th>
              <th>Cloud upload</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.id}>
                <td>
                  {new Date(b.created_at).toLocaleString("en-GB", {
                    timeZone: "Africa/Lagos",
                  })}
                </td>
                <td>
                  <Badge status={b.status} />
                </td>
                <td>
                  <Badge status={b.cloud_status} />
                </td>
                <td>{b.error || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!backups.length && (
          <Empty
            title="Your recovery history starts here"
            detail="Configure backup storage on the Windows server. The background worker records each scheduled run."
            icon={Cloud}
          />
        )}
      </section>
    </>
  );
}
