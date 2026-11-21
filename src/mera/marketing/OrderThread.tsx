import { useRef, useState } from "react";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";

type Station = "Kitchen" | "Bar";
type Stage = "new" | "preparing" | "ready";
type Item = { id: string; name: string; note: string; station: Station };
type Ticket = {
  station: Station;
  lines: { name: string; quantity: number }[];
  stage: Stage;
};
type Entry = { id: number; text: string };

const menu: Item[] = [
  {
    id: "cooler",
    name: "Citrus cooler",
    note: "Orange, lime and sparkling water",
    station: "Bar",
  },
  {
    id: "sandwich",
    name: "Garden sandwich",
    note: "Roasted vegetables and herb spread",
    station: "Kitchen",
  },
  {
    id: "coffee",
    name: "Iced coffee",
    note: "Cold coffee with your choice of milk",
    station: "Bar",
  },
];
const startQuantities: Record<string, number> = {
  cooler: 1,
  sandwich: 1,
  coffee: 0,
};
const orderRef = "JH-017";
const stageLabel: Record<Stage, string> = {
  new: "Waiting",
  preparing: "Preparing",
  ready: "Ready",
};
const seedFeed: Entry[] = [
  { id: -1, text: "JH-015 is ready at the bar" },
  { id: -2, text: "JH-014 started in the kitchen" },
];
const place = (station: Station) =>
  station === "Kitchen" ? "the kitchen" : "the bar";

/**
 * A self-contained illustration of one order moving between a guest, the
 * preparation stations and the owner. It never makes a request: everything
 * here is local state over fictional data.
 */
export function OrderThread() {
  const [quantities, setQuantities] = useState(startQuantities);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [feed, setFeed] = useState<Entry[]>(seedFeed);
  const [touched, setTouched] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const nextId = useRef(1);

  const total = menu.reduce((sum, item) => sum + (quantities[item.id] || 0), 0);
  const mine: Stage | null = !tickets
    ? null
    : tickets.every((ticket) => ticket.stage === "ready")
      ? "ready"
      : tickets.some((ticket) => ticket.stage !== "new")
        ? "preparing"
        : "new";
  const tally: Record<Stage, number> = {
    new: mine === "new" ? 1 : 0,
    preparing: 1 + (mine === "preparing" ? 1 : 0),
    ready: 1 + (mine === "ready" ? 1 : 0),
  };

  const record = (text: string) => {
    setTouched(true);
    setAnnouncement(text);
    setFeed((items) => [{ id: nextId.current++, text }, ...items].slice(0, 4));
  };
  const change = (id: string, delta: number) =>
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(9, (current[id] || 0) + delta)),
    }));
  const send = () => {
    if (!total) return;
    const stations: Station[] = ["Kitchen", "Bar"];
    const built: Ticket[] = stations
      .map((station) => ({
        station,
        stage: "new" as Stage,
        lines: menu
          .filter((item) => item.station === station && quantities[item.id])
          .map((item) => ({ name: item.name, quantity: quantities[item.id] })),
      }))
      .filter((ticket) => ticket.lines.length);
    setTickets(built);
    record(
      `${orderRef} sent from Table 06 to ${built.map((ticket) => place(ticket.station)).join(" and ")}`,
    );
  };
  const advance = (station: Station) => {
    const ticket = tickets?.find((entry) => entry.station === station);
    if (!ticket || ticket.stage === "ready") return;
    const stage: Stage = ticket.stage === "new" ? "preparing" : "ready";
    setTickets((current) =>
      (current || []).map((entry) =>
        entry.station === station ? { ...entry, stage } : entry,
      ),
    );
    const subject = place(station);
    record(
      stage === "preparing"
        ? `${subject[0].toUpperCase()}${subject.slice(1)} started ${orderRef}`
        : `${subject[0].toUpperCase()}${subject.slice(1)} marked ${orderRef} ready`,
    );
  };
  const reset = () => {
    setQuantities(startQuantities);
    setTickets(null);
    setFeed(seedFeed);
    setAnnouncement("");
    setTouched(false);
  };
  const phoneStatus =
    mine === "ready"
      ? "Ready to serve at your table."
      : mine === "preparing"
        ? "Being prepared."
        : "Sent. Waiting for the team to start.";

  return (
    <section
      className="mx-stage"
      aria-labelledby="mx-stage-title"
      data-live={touched ? "" : undefined}
    >
      <div className="mx-stage-head">
        <h2 id="mx-stage-title" className="mx-sr">
          One order, from table to team
        </h2>
        <p>
          Send the order, then move its tickets along. Nothing here is real:
          Juniper House is a fictional venue.
        </p>
        <span>Illustrative data</span>
      </div>
      <div className="mx-stage-grid">
        <div className="mx-column">
          <h3 className="mx-role">Guest</h3>
          <div className="mx-phone">
            <div className="mx-phone-screen">
              <div className="mx-venue">
                <strong>Juniper House</strong>
                <span>Fictional demonstration venue</span>
              </div>
              <ul className="mx-menu">
                {menu.map((item) => {
                  const quantity = quantities[item.id] || 0;
                  return (
                    <li key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.note}</span>
                      </div>
                      {tickets ? (
                        <b className="mx-quantity">
                          {quantity ? `× ${quantity}` : ""}
                        </b>
                      ) : quantity ? (
                        <div className="mx-stepper">
                          <button
                            type="button"
                            aria-label={`Remove one ${item.name}`}
                            onClick={() => change(item.id, -1)}
                          >
                            <Minus aria-hidden="true" />
                          </button>
                          <output aria-label={`${item.name} quantity`}>
                            {quantity}
                          </output>
                          <button
                            type="button"
                            aria-label={`Add one more ${item.name}`}
                            onClick={() => change(item.id, 1)}
                          >
                            <Plus aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="mx-add"
                          aria-label={`Add ${item.name}`}
                          onClick={() => change(item.id, 1)}
                        >
                          Add
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {tickets ? (
                <div className="mx-phone-status" data-stage={mine}>
                  <div>
                    <strong>Order {orderRef}</strong>
                    <span>Table 06</span>
                  </div>
                  <p>{phoneStatus}</p>
                  <button type="button" className="mx-reset" onClick={reset}>
                    <RotateCcw aria-hidden="true" />
                    Start again
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="mx-send"
                  disabled={!total}
                  onClick={send}
                >
                  {total
                    ? `Send order · ${total} ${total === 1 ? "item" : "items"}`
                    : "Add an item to send"}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="mx-column">
          <h3 className="mx-role">Kitchen and bar</h3>
          <div className="mx-pass">
            {tickets ? (
              tickets.map((ticket) => (
                <article
                  key={ticket.station}
                  className="mx-ticket"
                  data-stage={ticket.stage}
                >
                  <header>
                    <strong>{ticket.station}</strong>
                    <span>{orderRef}</span>
                  </header>
                  <p>Table 06</p>
                  <ul>
                    {ticket.lines.map((line) => (
                      <li key={line.name}>
                        {line.quantity} × {line.name}
                      </li>
                    ))}
                  </ul>
                  <footer>
                    <span className="mx-chip" data-stage={ticket.stage}>
                      {ticket.stage === "ready" && (
                        <Check aria-hidden="true" />
                      )}
                      {stageLabel[ticket.stage]}
                    </span>
                    {ticket.stage !== "ready" && (
                      <button type="button" onClick={() => advance(ticket.station)}>
                        {ticket.stage === "new"
                          ? "Start preparing"
                          : "Mark ready"}
                      </button>
                    )}
                  </footer>
                </article>
              ))
            ) : (
              <div className="mx-slot">
                <span>Your order’s tickets print here.</span>
              </div>
            )}
            <article className="mx-ticket mx-ticket--seed" data-stage="preparing">
              <header>
                <strong>Kitchen</strong>
                <span>JH-014</span>
              </header>
              <p>Table 04 · 1 × Garden sandwich</p>
              <footer>
                <span className="mx-chip" data-stage="preparing">
                  Preparing
                </span>
              </footer>
            </article>
            <article className="mx-ticket mx-ticket--seed" data-stage="ready">
              <header>
                <strong>Bar</strong>
                <span>JH-015</span>
              </header>
              <p>Counter pickup · 2 × Citrus cooler, 1 × Iced coffee</p>
              <footer>
                <span className="mx-chip" data-stage="ready">
                  <Check aria-hidden="true" />
                  Ready
                </span>
              </footer>
            </article>
          </div>
        </div>
        <div className="mx-column">
          <h3 className="mx-role">Owner</h3>
          <div className="mx-owner">
            <dl className="mx-tally">
              {(["new", "preparing", "ready"] as Stage[]).map((stage) => (
                <div key={stage}>
                  <dt>{stageLabel[stage]}</dt>
                  <dd key={tally[stage]}>{tally[stage]}</dd>
                </div>
              ))}
            </dl>
            <h4>Activity</h4>
            <ol className="mx-feed">
              {feed.map((entry) => (
                <li key={entry.id}>{entry.text}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      <p className="mx-sr" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
