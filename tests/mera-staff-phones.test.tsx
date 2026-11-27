import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/mera/workspace",
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "FormData",
  "sessionStorage",
])
  Object.defineProperty(globalThis, key, {
    value: (dom.window as any)[key],
    configurable: true,
  });
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
window.matchMedia = ((query: string) => ({
  matches: query.includes("767") || query.includes("999"),
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as any;
const React = await import("react");
const { render, screen, fireEvent, waitFor, cleanup, within, act } =
  await import("@testing-library/react");
const { default: Navigation } =
  await import("../src/mera/workspace/WorkspaceNavigation");
const { default: PrimaryAction } =
  await import("../src/mera/workspace/OrderPrimaryAction");
const { default: MenuQuickActions } =
  await import("../src/mera/workspace/MenuQuickActions");
const { default: TableQr } = await import("../src/mera/workspace/TableQr");
const { default: WorkspaceSound } =
  await import("../src/mera/workspace/WorkspaceSound");
const { default: Tickets } = await import("../src/mera/workspace/Tickets");
const { default: Workspace } =
  await import("../src/mera/workspace/OrganizationWorkspace");
const allSections = [
  ["overview", "Your branch"],
  ["orders", "Orders"],
  ["tables", "Tables"],
  ["counter", "Point of sale"],
  ["help", "Help requests"],
  ["preparation", "Preparation"],
  ["menu", "Menu"],
  ["onboarding", "Settings"],
];
for (const [role, expected] of [
  ["waiter", ["Orders", "Tables", "New order", "Help requests", "More"]],
  ["kitchen", ["Tickets", "Sold out", "More"]],
  ["bar", ["Tickets", "Sold out", "More"]],
  ["owner", ["Overview", "Orders", "Menu", "More"]],
  ["manager", ["Overview", "Orders", "Menu", "More"]],
] as const)
  test(`phone bottom navigation for ${role}`, () => {
    try {
      render(
        <Navigation
          role={role}
          sections={allSections}
          active="orders"
          onSelect={() => {}}
          organization="Juniper"
          branch="Main"
        />,
      );
      assert.deepEqual(
        within(
          screen.getByRole("navigation", { name: "Quick workspace pages" }),
        )
          .getAllByRole("button")
          .map((b) => b.textContent),
        [...expected],
      );
    } finally {
      cleanup();
    }
  });
test("phone More exposes full filtered section list, selects a destination and restores focus on Escape", () => {
  try {
    let selected = "";
    render(
      <Navigation
        role="waiter"
        sections={allSections.filter((s) => s[0] !== "menu")}
        turnedOffSections={["tables"]}
        active="orders"
        onSelect={(id) => {
          selected = id;
        }}
        organization="Juniper"
        branch="Main"
      />,
    );
    const quick = within(
      screen.getByRole("navigation", { name: "Quick workspace pages" }),
    );
    assert.equal(quick.queryByRole("button", { name: "Tables" }), null);
    fireEvent.click(quick.getByRole("button", { name: "More" }));
    const full = screen.getByRole("navigation", {
      name: "Organization workspace",
    });
    assert.ok(full.classList.contains("is-open"), "sheet opened");
    assert.equal(
      within(full).queryByRole("tab", { name: "Menu", exact: true }),
      null,
    );
    fireEvent.click(
      within(full).getByRole("tab", { name: "Settings", exact: true }),
    );
    assert.equal(selected, "onboarding");
    assert.equal(full.classList.contains("is-open"), false);
    fireEvent.click(quick.getByRole("button", { name: "More" }));
    fireEvent.keyDown(full, { key: "Escape" });
    assert.equal(
      document.activeElement,
      quick.getByRole("button", { name: "More" }),
    );
  } finally {
    cleanup();
  }
});
test("order primary action sends once on double tap, progresses and rolls back rejected writes", async () => {
  try {
    let finish: () => void = () => {},
      count = 0;
    const view = render(
      <PrimaryAction
        order={{ status: "submitted", version: 1 }}
        disabled={false}
        advance={async (status) => {
          assert.equal(status, "accepted");
          count++;
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
        }}
      />,
    );
    const accept = screen.getByRole("button", { name: "Accept" });
    fireEvent.click(accept);
    fireEvent.click(accept);
    assert.equal(count, 1);
    await act(async () => finish());
    assert.ok(
      screen.getByRole("button", { name: "Start preparing" }),
      "optimistic state advanced",
    );
    view.rerender(
      <PrimaryAction
        order={{ status: "accepted", version: 2 }}
        disabled={false}
        advance={async () => {
          throw Error("Station unavailable");
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start preparing" }));
    await screen.findByRole("alert");
    assert.ok(
      screen.getByRole("button", { name: "Start preparing" }),
      "failed state rolled back",
    );
    view.rerender(
      <PrimaryAction
        order={{ status: "ready", version: 3, fulfillment: "table_service" }}
        disabled={false}
        advance={async () => {}}
      />,
    );
    assert.ok(
      screen.getByRole("button", { name: "Served" }),
      "table handoff named Served",
    );
  } finally {
    cleanup();
  }
});
const products = [
  {
    id: "tea",
    name: "Tea",
    available: true,
    category: "Drinks",
    station: "bar",
  },
  {
    id: "rice",
    name: "Rice",
    available: true,
    category: "Food",
    station: "kitchen",
  },
];
test("one-tap sold out is optimistic, double-tap safe and undo restores availability", async () => {
  try {
    const calls: any[] = [];
    render(
      <MenuQuickActions
        products={products}
        update={async (p, patch) => {
          calls.push([p.id, patch]);
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark sold out: Tea" }));
    assert.ok(
      screen.getByRole("button", { name: "Mark available: Tea" }),
      "optimistic availability",
    );
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => assert.equal(calls.length, 2));
    assert.deepEqual(calls, [
      ["tea", { available: false }],
      ["tea", { available: true }],
    ]);
  } finally {
    cleanup();
  }
});
test("bulk sold out reports partial failure and retains only failed selections", async () => {
  try {
    const calls: string[] = [];
    render(
      <MenuQuickActions
        products={products}
        update={async (p) => {
          calls.push(p.id);
          if (p.id === "rice") throw Error("Rejected");
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select shown items" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Mark selected sold out" }),
    );
    await screen.findByText(/1 updated. 1 failed: Rice/);
    assert.deepEqual(calls, ["tea", "rice"]);
    assert.equal(
      (
        screen.getByRole("checkbox", {
          name: "Select Rice",
        }) as HTMLInputElement
      ).checked,
      true,
    );
    assert.equal(
      (screen.getByRole("checkbox", { name: "Select Tea" }) as HTMLInputElement)
        .checked,
      false,
    );
  } finally {
    cleanup();
  }
});
test("bulk availability uses the audited bulk operation when supplied", async () => {
  try {
    const calls: any[] = [];
    render(
      <MenuQuickActions
        products={products}
        update={async () => {
          throw Error("Must use bulk");
        }}
        bulkAvailability={async (ids, available) => {
          calls.push({ ids, available });
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select shown items" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Mark selected sold out" }),
    );
    await screen.findByText("2 updated.");
    assert.deepEqual(calls, [{ ids: ["tea", "rice"], available: false }]);
  } finally {
    cleanup();
  }
});
test("table QR creates once then reuses its verified code for showing, printing and downloading", async () => {
  const original = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = (async (_url, init) => {
      calls++;
      assert.deepEqual(JSON.parse(String(init?.body)), {
        kind: "table",
        tableId: "t1",
      });
      return Response.json({ id: "qr1", kind: "table", tableId: "t1" });
    }) as typeof fetch;
    render(
      <TableQr
        base="/organizations/o/branches/b"
        table={{ id: "t1", name: "Window" }}
        disabled={false}
      />,
    );
    const show = screen.getByRole("button", { name: "Show QR" });
    fireEvent.click(show);
    fireEvent.click(show);
    await screen.findByRole("img", { name: "QR for Window" });
    assert.equal(calls, 1);
    assert.ok(screen.getByRole("button", { name: "Print QR" }), "print action");
    assert.equal(
      screen.getByRole("link", { name: "Download" }).getAttribute("href"),
      "/api/mera/v1/organizations/o/branches/b/qr-codes/qr1/image.png",
    );
    fireEvent.click(show);
    fireEvent.click(show);
    assert.equal(calls, 1);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("sound preference survives remount and offers a gesture to unlock browser audio", async () => {
  try {
    window.localStorage.clear();
    const view = render(<WorkspaceSound orders={[]} />);
    fireEvent.click(
      screen.getByRole("button", { name: "New order sound off" }),
    );
    await screen.findByRole("button", { name: "Tap to enable sound" });
    assert.equal(window.localStorage.getItem("mera-ticket-sound"), "on");
    view.unmount();
    render(<WorkspaceSound orders={[]} />);
    assert.ok(
      screen.getByRole("button", { name: "Tap to enable sound" }),
      "persisted preference prompts gesture",
    );
  } finally {
    cleanup();
    window.localStorage.clear();
  }
});
test("station ticket sound preference is restored after reload", () => {
  try {
    window.localStorage.setItem("mera-ticket-sound", "on");
    render(
      <Tickets
        base="/organizations/o/branches/b"
        tickets={[]}
        orders={[]}
        save={async () => {}}
      />,
    );
    assert.equal(
      screen
        .getByRole("button", { name: "Tap to enable sound" })
        .getAttribute("aria-pressed"),
      "true",
    );
  } finally {
    cleanup();
    window.localStorage.clear();
  }
});
function installWorkspace(
  capabilities = ["table_service"],
  permissions = [
    "orders.view",
    "orders.create",
    "orders.fulfill",
    "tables.manage",
  ],
) {
  const calls: { path: string; method: string; body: any }[] = [];
  const settings = { capabilities };
  const context = {
    user: { id: "u", name: "Waiter" },
    organizations: [
      {
        id: "o",
        name: "Juniper",
        role: "waiter",
        permissions,
        branches: [{ id: "b", name: "Main", settings }],
      },
    ],
  };
  const snapshot = {
    branch: { id: "b", name: "Main", settings },
    menuVersion: 1,
    orders: [],
    products,
    counterProducts: [
      {
        id: "tea",
        name: "Tea",
        available: true,
        price: 10000,
        code: "T",
        category: "Drinks",
      },
    ],
    tables: capabilities.includes("table_service")
      ? [{ id: "t1", name: "Window", status: "occupied", capacity: 2 }]
      : [],
    visits: capabilities.includes("table_service")
      ? [
          {
            id: "v1",
            tableId: "t1",
            displayName: "Window party",
            status: "open",
          },
        ]
      : [],
    reservations: [],
    payments: [],
    bills: [],
    shifts: [],
    tickets: [],
  };
  globalThis.fetch = (async (input, init = {}) => {
    const path = String(input),
      method = init.method || "GET";
    calls.push({
      path,
      method,
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
    if (path.endsWith("/context")) return Response.json(context);
    if (path.endsWith("/workspace")) return Response.json(snapshot);
    if (path.endsWith("/orders") && method === "POST")
      return Response.json({ id: "sent" });
    if (path.endsWith("/help-requests")) return Response.json({ requests: [] });
    if (path.endsWith("/readiness"))
      return Response.json({ checks: [], canPublish: false });
    return Response.json({});
  }) as typeof fetch;
  return calls;
}
test("returning visible and coming online immediately refresh workspace and show updated indicator", async () => {
  const original = globalThis.fetch;
  try {
    const calls = installWorkspace();
    render(<Workspace user={{ id: "u", name: "Waiter" }} notify={() => {}} />);
    await screen.findByRole("navigation", { name: "Quick workspace pages" });
    await screen.findByText("Updated just now", {
      selector: ".mw-update-indicator",
    });
    const count = () =>
      calls.filter((c) => c.path.endsWith("/workspace")).length;
    const before = count();
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() =>
      assert.ok(count() > before, "visible triggered refresh"),
    );
    const visibleCount = count();
    fireEvent(window, new Event("online"));
    await waitFor(() =>
      assert.ok(count() > visibleCount, "online triggered refresh"),
    );
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    const hiddenCount = count();
    fireEvent(document, new Event("visibilitychange"));
    assert.equal(count(), hiddenCount);
  } finally {
    cleanup();
    globalThis.fetch = original;
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
  }
});
test("capability-off branches hide reservations, guest list and tables from full navigation", async () => {
  const original = globalThis.fetch;
  try {
    installWorkspace(
      [],
      [
        "orders.view",
        "tables.manage",
        "reservations.manage",
        "door.manage",
        "organization.manage",
      ],
    );
    render(<Workspace user={{ id: "u", name: "Waiter" }} notify={() => {}} />);
    const quick = await screen.findByRole("navigation", {
      name: "Quick workspace pages",
    });
    fireEvent.click(within(quick).getByRole("button", { name: "More" }));
    const full = within(
      screen.getByRole("navigation", { name: "Organization workspace" }),
    );
    assert.equal(full.queryByRole("tab", { name: "Reservations" }), null);
    assert.equal(full.queryByRole("tab", { name: "Door & guest list" }), null);
    assert.equal(full.queryByRole("tab", { name: "Tables & visits" }), null);
    assert.equal(full.queryByRole("tab", { name: "Getting started" }), null);
    assert.ok(
      full.getByRole("tab", { name: "Settings" }),
      "settings separate from setup label",
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("waiter takes table order from phone quick navigation through send without side menu", async () => {
  const original = globalThis.fetch;
  try {
    const calls = installWorkspace();
    render(<Workspace user={{ id: "u", name: "Waiter" }} notify={() => {}} />);
    const quick = await screen.findByRole("navigation", {
      name: "Quick workspace pages",
    });
    fireEvent.click(
      within(quick).getByRole("button", { name: "Tables", exact: true }),
    );
    const tableCard = (
      await screen.findByRole("heading", { name: "Window", exact: true })
    ).closest("article")!;
    fireEvent.click(
      within(tableCard).getByRole("button", { name: "New order", exact: true }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Add Tea to order" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Current order \(1\)/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
    await waitFor(() =>
      assert.equal(
        calls.filter((c) => c.path.endsWith("/orders") && c.method === "POST")
          .length,
        1,
      ),
    );
    const sent = calls.find(
      (c) => c.path.endsWith("/orders") && c.method === "POST",
    )!.body;
    assert.equal(sent.visitId, "v1");
    assert.equal(sent.fulfillment, "table_service");
    assert.equal(sent.items[0].productId, "tea");
    assert.equal(document.querySelector(".mw-side-nav.is-open"), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("station primary status action is double-tap safe and progresses after acknowledgement", async () => {
  try {
    let release: (value: any) => void = () => {},
      count = 0;
    const ticket = {
      id: "t",
      orderId: "o",
      station: "kitchen",
      status: "queued",
      version: 1,
      items: [
        { orderLineId: "l", name: "Rice", quantity: 1, preparedQuantity: 0 },
      ],
    };
    render(
      <Tickets
        base="/organizations/o/branches/b"
        tickets={[ticket]}
        orders={[{ id: "o", status: "accepted", paymentStatus: "paid" }]}
        save={async () => {
          count++;
          return new Promise((resolve) => {
            release = resolve;
          });
        }}
      />,
    );
    const start = screen.getByRole("button", { name: "Start preparing" });
    fireEvent.click(start);
    fireEvent.click(start);
    assert.equal(count, 1);
    assert.ok(
      screen.getByText("Preparing", { selector: ".mw-preparation-status" }),
      "optimistic ticket status",
    );
    await act(async () =>
      release({ ticket: { ...ticket, status: "preparing", version: 2 } }),
    );
    assert.ok(
      screen.getByRole("button", { name: "Mark ready" }),
      "confirmed ticket progresses",
    );
  } finally {
    cleanup();
  }
});
test("default kitchen has Tickets and read-only Sold out without receiving menu edit permission", async () => {
  const original = globalThis.fetch;
  try {
    const originalInstall = installWorkspace(
      ["table_service"],
      ["orders.view", "orders.prepare"],
    );
    const source = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const response = await source(input, init);
      if (String(input).endsWith("/context")) {
        const data = await response.json();
        data.organizations[0].role = "kitchen";
        return Response.json(data);
      }
      return response;
    }) as typeof fetch;
    render(<Workspace user={{ id: "u", name: "Kitchen" }} notify={() => {}} />);
    const quick = within(
      await screen.findByRole("navigation", { name: "Quick workspace pages" }),
    );
    assert.deepEqual(
      quick.getAllByRole("button").map((b) => b.textContent),
      ["Tickets", "Sold out", "More"],
    );
    fireEvent.click(quick.getByRole("button", { name: "Sold out" }));
    await screen.findByText(
      "Ask a manager with menu access to change availability.",
    );
    assert.equal(
      screen.queryByRole("button", { name: /Mark sold out:/ }),
      null,
    );
    assert.equal(
      originalInstall.some((c) => c.path.endsWith("/products/availability")),
      false,
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test('waiter accepts and serves on phone with versioned single writes while preparation stays permission-gated',async()=>{const original=globalThis.fetch;try{
  installWorkspace();const source=globalThis.fetch;
  let status='submitted', version=1;const writes:any[]=[];
  globalThis.fetch=(async(input,init={})=>{
    if(String(input).endsWith('/status') && init.method==='POST'){
      const body=JSON.parse(String(init.body));writes.push(body);status=body.status;version++;return Response.json({id:'order',status,version});
    }
    const response=await source(input,init);
    if(String(input).endsWith('/workspace')){const data=await response.json();data.orders=[{id:'order',reference:'A1',displayName:'Window party',status,version,total:10000,paymentStatus:'paid',fulfillment:'table_service',items:[]}];return Response.json(data);}
    return response;
  }) as typeof fetch;
  render(<Workspace user={{id:'u',name:'Waiter'}} notify={()=>{}}/>);
  const quick=within(await screen.findByRole('navigation',{name:'Quick workspace pages'}));
  fireEvent.click(quick.getByRole('button',{name:'Orders',exact:true}));
  const accept=await screen.findByRole('button',{name:'Accept',exact:true});fireEvent.click(accept);fireEvent.click(accept);
  await waitFor(()=>assert.deepEqual(writes,[{status:'accepted',version:1}]));
  await waitFor(()=>assert.equal(screen.queryByRole('button',{name:'Saving…'}),null));
  assert.equal(screen.queryByRole('button',{name:'Start preparing'}),null);
  status='ready';version=3;fireEvent(window,new Event('online'));
  const served=await screen.findByRole('button',{name:'Served'});fireEvent.click(served);fireEvent.click(served);
  await waitFor(()=>assert.deepEqual(writes,[{status:'accepted',version:1},{status:'collected',version:3}]));
}finally{cleanup();globalThis.fetch=original;}});
test('reservation capacity controls and wizard step stay hidden while the capability is off',async()=>{try{
  const {default:BranchSettings}=await import('../src/mera/workspace/BranchSettings');
  render(<BranchSettings branch={{settings:{capabilities:[],serviceModes:[]},timezone:'Africa/Lagos'}} organization={{id:'o'}} base="/organizations/o/branches/b" disabled={false} save={async()=>{}}/>);
  assert.equal(screen.queryByRole('button',{name:/\d\. Reservations/}),null);
  assert.equal(screen.queryByLabelText('Accept reservations'),null);
  assert.ok(screen.getByRole('button',{name:'5. Review'}),'wizard skips capability-off step');
}finally{cleanup();}});
