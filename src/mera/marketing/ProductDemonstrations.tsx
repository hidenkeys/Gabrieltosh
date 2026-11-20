import { useId, useState } from "react";
import {
  Check,
  ClipboardList,
  Coffee,
  LayoutGrid,
  QrCode,
  Utensils,
} from "lucide-react";

const examples = [
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
  const [scene, setScene] = useState(
    scenes.some((item) => item.id === initialScene) ? initialScene : "menu",
  );
  const sceneId = useId();
  const current = scenes.find((item) => item.id === scene) || scenes[0];
  return (
    <section
      className={`mt-demo ${compact ? "mt-demo-compact" : ""}`}
      aria-label="Mera QR illustrative product demonstration"
    >
      <div className="mt-demo-label">
        <span>PRODUCT WALKTHROUGH</span>
        <span>Illustrative data</span>
      </div>
      <div
        className="mt-demo-controls"
        role="group"
        aria-label="Choose a product illustration"
      >
        {scenes.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={scene === item.id}
            aria-controls={sceneId}
            onClick={() => setScene(item.id)}
          >
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-demo-window">
        <div className="mt-demo-venue">
          <span className="mt-demo-venue-symbol" aria-hidden="true">
            <Coffee />
          </span>
          <div>
            <strong>Juniper House</strong>
            <span>Fictional demonstration venue</span>
          </div>
          <span className="mt-demo-context">{current.label}</span>
        </div>
        <div
          className="mt-demo-scene"
          id={sceneId}
          key={scene}
          role="region"
          aria-label={`${current.label} illustration`}
        >
          {scene === "menu" && (
            <>
              <div className="mt-demo-menu-title">
                <span>YOUR TABLE, YOUR CHOICE</span>
                <h3>Something good starts here.</h3>
                <p>An example of a venue’s published menu.</p>
              </div>
              <div className="mt-demo-menu-items">
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
                  <article key={item.name}>
                    <span>{item.category}</span>
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.description}</p>
                    </div>
                  </article>
                ))}
              </div>
              <p className="mt-demo-footnote">
                Illustration only. Use the actual demo to browse and order.
              </p>
            </>
          )}
          {scene === "orders" && (
            <>
              <div className="mt-demo-title">
                <h3>Service in progress</h3>
                <span>{examples.length} example orders</span>
              </div>
              <ul className="mt-demo-order-list">
                {examples.map((order) => (
                  <li key={order.reference}>
                    <div>
                      <strong>{order.reference}</strong>
                      <span>{order.table}</span>
                    </div>
                    <p>{order.items.join(" · ")}</p>
                    <span
                      className={`mt-demo-status ${order.status === "Ready" ? "is-ready" : ""}`}
                    >
                      {order.status}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {scene === "tables" && (
            <>
              <div className="mt-demo-title">
                <h3>A room with context</h3>
                <span>Example floor</span>
              </div>
              <div className="mt-demo-floor">
                {[
                  { name: "01", status: "Available", seats: "2 seats" },
                  { name: "02", status: "Occupied", seats: "2 guests" },
                  { name: "03", status: "Available", seats: "4 seats" },
                  { name: "04", status: "Occupied", seats: "3 guests" },
                ].map((table) => (
                  <div
                    className={`mt-demo-table ${table.status === "Occupied" ? "is-occupied" : ""}`}
                    key={table.name}
                  >
                    <span>TABLE</span>
                    <strong>{table.name}</strong>
                    <span>{table.seats}</span>
                    <b>{table.status}</b>
                  </div>
                ))}
              </div>
              <div className="mt-demo-reservation">
                <span>UPCOMING RESERVATION</span>
                <strong>Evening party · 4 guests</strong>
                <p>
                  Future bookings remain separate from current table occupancy.
                </p>
              </div>
            </>
          )}
          {scene === "preparation" && (
            <>
              <div className="mt-demo-title">
                <h3>At the pass</h3>
                <span>Kitchen & bar examples</span>
              </div>
              <div className="mt-demo-tickets">
                {examples.slice(0, 2).map((order) => (
                  <article key={order.reference}>
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
                  </article>
                ))}
              </div>
            </>
          )}
          {scene === "overview" && (
            <>
              <div className="mt-demo-title">
                <h3>The service picture</h3>
                <span>From this sample dataset</span>
              </div>
              <div className="mt-demo-metrics">
                <div>
                  <span>Active orders</span>
                  <strong>{examples.length}</strong>
                </div>
                <div>
                  <span>Preparing</span>
                  <strong>
                    {
                      examples.filter((order) => order.status === "Preparing")
                        .length
                    }
                  </strong>
                </div>
                <div>
                  <span>Ready</span>
                  <strong>
                    {
                      examples.filter((order) => order.status === "Ready")
                        .length
                    }
                  </strong>
                </div>
              </div>
              <h4>Needs the team’s attention</h4>
              <ul className="mt-demo-attention">
                <li>
                  <Check aria-hidden="true" />
                  <div>
                    <strong>JH-015 is ready</strong>
                    <span>Counter pickup · iced coffee</span>
                  </div>
                </li>
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
              <p className="mt-demo-footnote">
                Sales and actual collections are reported separately in Mera QR.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mt-demo-caption" aria-live="polite">
        <strong>{current.title}</strong>
        <p>{current.caption}</p>
      </div>
    </section>
  );
}
export function TravelConcept() {
  return (
    <figure
      className="mt-travel-concept"
      aria-label="Planned MeraTravel product concept"
    >
      <figcaption>
        <span>MERATRAVEL SUITE</span>
        <strong>Planned concept · not an available application</strong>
      </figcaption>
      <div className="mt-travel-concept-body">
        <span className="mt-concept-label">THE DIRECTION WE’RE EXPLORING</span>
        <h3>
          A clearer journey
          <br />
          behind every journey.
        </h3>
        <ol>
          <li>
            <span>01</span>
            <div>
              <strong>Present your offering</strong>
              <p>A place for travel businesses to explain their services.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Organize enquiries</strong>
              <p>Keep customer needs and trip context together.</p>
            </div>
          </li>
          <li>
            <span>03</span>
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
