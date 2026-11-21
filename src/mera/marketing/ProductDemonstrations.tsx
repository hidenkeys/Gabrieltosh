import { useId, useState } from "react";
import {
  Check,
  ClipboardList,
  Coffee,
  LayoutGrid,
  QrCode,
  Utensils,
} from "lucide-react";

type Order = {
  reference: string;
  table: string;
  items: string[];
  station: "Kitchen" | "Bar";
  status: "Preparing" | "Ready";
};
const startingOrders: Order[] = [
  {
    reference: "JH-014",
    table: "Table 04",
    items: ["1 × Garden sandwich"],
    station: "Kitchen",
    status: "Preparing",
  },
  {
    reference: "JH-015",
    table: "Counter pickup",
    items: ["2 × Citrus cooler", "1 × Iced coffee"],
    station: "Bar",
    status: "Ready",
  },
  {
    reference: "JH-016",
    table: "Table 02",
    items: ["2 × Garden sandwich"],
    station: "Kitchen",
    status: "Preparing",
  },
];
const scenes = [
  {
    id: "menu",
    label: "Guest menu",
    icon: QrCode,
    title: "A clear place to begin.",
    caption:
      "Published categories and item choices help guests find what they want.",
  },
  {
    id: "orders",
    label: "Orders",
    icon: ClipboardList,
    title: "Every order has a place.",
    caption: "Keep the reference, service context and progress together.",
  },
  {
    id: "tables",
    label: "Tables",
    icon: LayoutGrid,
    title: "Make room for good service.",
    caption:
      "Distinguish available tables, current visits and upcoming reservations.",
  },
  {
    id: "preparation",
    label: "Preparation",
    icon: Utensils,
    title: "The right work, in the right hands.",
    caption:
      "Kitchen and bar teams follow the items assigned to their station.",
  },
  {
    id: "overview",
    label: "Owner overview",
    icon: Check,
    title: "See the work that needs you.",
    caption:
      "A role-aware view brings service activity and exceptions into focus.",
  },
];
export function ProductDemonstration({
  initialScene = "menu",
  compact = false,
}: {
  initialScene?: string;
  compact?: boolean;
}) {
  const first = scenes.some((item) => item.id === initialScene)
    ? initialScene
    : "menu";
  const [view, setView] = useState({ scene: first, direction: "forward" });
  const [orders, setOrders] = useState(startingOrders);
  const sceneId = useId();
  const scene = view.scene;
  const current = scenes.find((item) => item.id === scene) || scenes[0];
  const choose = (id: string) =>
    setView((previous) => ({
      scene: id,
      direction:
        scenes.findIndex((item) => item.id === id) >=
        scenes.findIndex((item) => item.id === previous.scene)
          ? "forward"
          : "back",
    }));
  const toggle = (reference: string) =>
    setOrders((list) =>
      list.map((order) =>
        order.reference === reference
          ? {
              ...order,
              status: order.status === "Ready" ? "Preparing" : "Ready",
            }
          : order,
      ),
    );
  const ready = orders.filter((order) => order.status === "Ready");
  const preparing = orders.filter((order) => order.status === "Preparing");
  return (
    <section
      className={`mx-demo ${compact ? "mx-demo-compact" : ""}`}
      aria-label="Mera QR illustrative product demonstration"
    >
      <div className="mx-demo-bar">
        <span>Product walkthrough</span>
        <span>Illustrative data</span>
      </div>
      <div
        className="mx-demo-tabs"
        role="group"
        aria-label="Choose a product illustration"
      >
        {scenes.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={scene === item.id}
            aria-controls={sceneId}
            onClick={() => choose(item.id)}
          >
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="mx-demo-frame">
        <div className="mx-demo-venue">
          <span className="mx-demo-mark" aria-hidden="true">
            <Coffee />
          </span>
          <div>
            <strong>Juniper House</strong>
            <span>Fictional demonstration venue</span>
          </div>
          <span className="mx-demo-context">{current.label}</span>
        </div>
        <div
          className="mx-demo-scene"
          id={sceneId}
          key={scene}
          data-direction={view.direction}
          role="region"
          aria-label={`${current.label} illustration`}
        >
          {scene === "menu" && (
            <>
              <div className="mx-demo-heading">
                <h3>Something good starts here.</h3>
                <p>An example of a venue’s published menu.</p>
              </div>
              <ul className="mx-demo-menu">
                {[
                  {
                    name: "Citrus cooler",
                    description: "Orange, lime & sparkling water",
                    category: "Drinks",
                  },
                  {
                    name: "Garden sandwich",
                    description: "Roasted vegetables & herb spread",
                    category: "Kitchen",
                  },
                  {
                    name: "Iced coffee",
                    description: "Cold coffee, with your choice of milk",
                    category: "Drinks",
                  },
                ].map((item) => (
                  <li key={item.name}>
                    <span>{item.category}</span>
                    <strong>{item.name}</strong>
                    <p>{item.description}</p>
                  </li>
                ))}
              </ul>
              <p className="mx-demo-footnote">
                Illustration only. Use the actual demo to browse and order.
              </p>
            </>
          )}
          {scene === "orders" && (
            <>
              <div className="mx-demo-heading">
                <h3>Service in progress</h3>
                <p>{orders.length} example orders</p>
              </div>
              <ul className="mx-demo-orders">
                {orders.map((order) => (
                  <li key={order.reference}>
                    <div>
                      <strong>{order.reference}</strong>
                      <span>{order.table}</span>
                    </div>
                    <p>{order.items.join(", ")}</p>
                    <span
                      className={`mx-demo-status ${order.status === "Ready" ? "is-ready" : ""}`}
                    >
                      {order.status}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mx-demo-footnote">
                Open Preparation to move an order along.
              </p>
            </>
          )}
          {scene === "tables" && (
            <>
              <div className="mx-demo-heading">
                <h3>A room with context</h3>
                <p>Example floor</p>
              </div>
              <div className="mx-demo-floor">
                {[
                  { name: "01", status: "Available", seats: "2 seats" },
                  { name: "02", status: "Occupied", seats: "2 guests" },
                  { name: "03", status: "Available", seats: "4 seats" },
                  { name: "04", status: "Occupied", seats: "3 guests" },
                ].map((table) => (
                  <div
                    className={`mx-demo-table ${table.status === "Occupied" ? "is-occupied" : ""}`}
                    key={table.name}
                  >
                    <span>Table</span>
                    <strong>{table.name}</strong>
                    <span>{table.seats}</span>
                    <b>{table.status}</b>
                  </div>
                ))}
              </div>
              <div className="mx-demo-reservation">
                <span>Upcoming reservation</span>
                <strong>Evening party · 4 guests</strong>
                <p>
                  Future bookings remain separate from current table occupancy.
                </p>
              </div>
            </>
          )}
          {scene === "preparation" && (
            <>
              <div className="mx-demo-heading">
                <h3>At the pass</h3>
                <p>Kitchen & bar examples</p>
              </div>
              <div className="mx-demo-tickets">
                {orders.slice(0, 2).map((order) => (
                  <article key={order.reference} data-ready={order.status === "Ready"}>
                    <header>
                      <span>{order.station}</span>
                      <b>{order.status}</b>
                    </header>
                    <strong>{order.reference}</strong>
                    <span>{order.table}</span>
                    <ul>
                      {order.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <p>
                      {order.status === "Ready"
                        ? "Ready for the service team"
                        : "Assigned to preparation"}
                    </p>
                    <button
                      type="button"
                      onClick={() => toggle(order.reference)}
                    >
                      {order.status === "Ready"
                        ? `Move ${order.reference} back`
                        : `Mark ${order.reference} ready`}
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
          {scene === "overview" && (
            <>
              <div className="mx-demo-heading">
                <h3>The service picture</h3>
                <p>From this sample dataset</p>
              </div>
              <div className="mx-demo-metrics">
                <div>
                  <span>Active orders</span>
                  <strong>{orders.length}</strong>
                </div>
                <div>
                  <span>Preparing</span>
                  <strong>{preparing.length}</strong>
                </div>
                <div>
                  <span>Ready</span>
                  <strong>{ready.length}</strong>
                </div>
              </div>
              <h4>Needs the team’s attention</h4>
              <ul className="mx-demo-attention">
                {ready.length ? (
                  ready.map((order) => (
                    <li key={order.reference}>
                      <Check aria-hidden="true" />
                      <div>
                        <strong>{order.reference} is ready</strong>
                        <span>
                          {order.table} · {order.items.join(", ")}
                        </span>
                      </div>
                    </li>
                  ))
                ) : (
                  <li>
                    <Check aria-hidden="true" />
                    <div>
                      <strong>No orders waiting for service</strong>
                      <span>Ready orders appear here for the team.</span>
                    </div>
                  </li>
                )}
                <li>
                  <LayoutGrid aria-hidden="true" />
                  <div>
                    <strong>Evening arrival</strong>
                    <span>
                      Review the next reservation and table availability
                    </span>
                  </div>
                </li>
              </ul>
              <p className="mx-demo-footnote">
                Sales and actual collections are reported separately in Mera QR.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mx-demo-caption" aria-live="polite">
        <strong>{current.title}</strong>
        <p>{current.caption}</p>
      </div>
    </section>
  );
}
export function TravelConcept() {
  return (
    <figure
      className="mx-concept"
      aria-label="Planned MeraTravel product concept"
    >
      <figcaption>
        <span>MeraTravel Suite</span>
        <strong>Planned concept, not an available application</strong>
      </figcaption>
      <div className="mx-concept-body">
        <h3>
          A clearer journey
          <br />
          behind every journey.
        </h3>
        <p>The direction we’re exploring</p>
        <ol>
          <li>
            <span>1</span>
            <div>
              <strong>Present your offering</strong>
              <p>A place for travel businesses to explain their services.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Organize enquiries</strong>
              <p>Keep customer needs and trip context together.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Follow the relationship</strong>
              <p>A more connected view of the work around each customer.</p>
            </div>
          </li>
        </ol>
      </div>
    </figure>
  );
}
