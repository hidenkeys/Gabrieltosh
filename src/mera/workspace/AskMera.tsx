import { assistantCatalogPermissions } from "../../../shared/mera-assistant.js";
export { canAskMera } from "../../../shared/mera-assistant.js";
import React, { useEffect, useRef, useState } from "react";
import { workspaceApi, formatMoney } from "./api";
type Card = {
  actionId: string;
  label: string;
  expiresAt: string;
  status?: string;
};
type Summary = {
  revenue: number;
  orders: number;
  averageOrder: number;
  currency: string;
  range: { from: string; to: string };
  previous: { revenue: number; orders: number };
  topItems: { name: string; quantity: number }[];
  slowItems: { name: string; quantity: number }[];
  busiestHours: { hour: string; orders: number }[];
  soldOutEvents: number;
  basis: string;
};
type Message = {
  role: "user" | "assistant";
  text: string;
  cards?: Card[];
  summary?: Summary;
};

export default function AskMera({
  base,
  permissions,
  onChanged,
  onClose,
  actorId,
}: {
  actorId?: string;
  base: string;
  permissions: string[];
  onChanged: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const conversation = useRef<string | undefined>(undefined),
    dialog = useRef<HTMLElement>(null),
    field = useRef<HTMLInputElement>(null),
    active = useRef(true),
    inFlight = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    active.current = true;
    const previous = document.activeElement as HTMLElement | null;
    const siblings = Array.from(
      dialog.current?.parentElement?.parentElement?.children || [],
    ).filter((el) => !el.contains(dialog.current));
    const old = siblings.map((el) => ({ el, inert: el.hasAttribute("inert") }));
    old.forEach(({ el }) => el.setAttribute("inert", ""));
    field.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab") {
        const nodes = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),[tabindex="0"]',
          ) || [],
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      active.current = false;
      document.removeEventListener("keydown", key);
      old.forEach(({ el, inert }) => {
        if (!inert) el.removeAttribute("inert");
      });
      previous?.focus();
    };
  }, []);
  async function send(message: string, deterministic = false) {
    if (!message.trim() || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setInput("");
    setMessages((m) => [...m, { role: "user", text: message }]);
    try {
      if (deterministic) {
        const summary = await workspaceApi<Summary>(
          base + "/assistant/weekly-summary",
          "GET",
          undefined,
          undefined,
          { expectedActorId: actorId },
        );
        if (active.current)
          setMessages((m) => [
            ...m,
            { role: "assistant", text: "Weekly summary", summary },
          ]);
      } else {
        const data = await workspaceApi<{
          conversationId: string;
          message: string;
          cards: Card[];
          results: { tool: string; data: any }[];
        }>(
          base + "/assistant/messages",
          "POST",
          { conversationId: conversation.current, message },
          undefined,
          { timeoutMs: 90000, expectedActorId: actorId },
        );
        if (active.current) {
          conversation.current = data.conversationId;
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              text: data.message,
              cards: data.cards,
              summary: data.results?.find(
                (r) =>
                  r.tool === "weekly_summary" || r.tool === "sales_summary",
              )?.data,
            },
          ]);
        }
      }
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (active.current) {
        setBusy(false);
        field.current?.focus();
      }
    }
  }
  async function action(card: Card, cancel = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await workspaceApi<{ status: string }>(
        base + "/assistant/" + (cancel ? "cancel" : "confirm"),
        "POST",
        { actionId: card.actionId },
        undefined,
        { expectedActorId: actorId },
      );
      if (active.current) {
        setMessages((m) =>
          m.map((v) => ({
            ...v,
            cards: v.cards?.map((c) =>
              c.actionId === card.actionId
                ? { ...c, status: result.status }
                : c,
            ),
          })),
        );
        if (!cancel) await onChanged();
      }
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <div className="ma-backdrop">
      <section
        className="ma-drawer"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ma-title"
      >
        <header>
          <div>
            <h2 id="ma-title">Ask Mera</h2>
            <p>Help with this branch</p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={onClose}
            aria-label="Close Ask Mera"
          >
            Close
          </button>
        </header>
        <div className="ma-quick" aria-label="Quick actions">
          {permissions.includes("reports.view") && (
            <button
              disabled={busy}
              onClick={() => void send("Weekly summary", true)}
            >
              Weekly summary
            </button>
          )}
          {assistantCatalogPermissions.some((p) => permissions.includes(p)) && (
            <button
              disabled={busy}
              onClick={() => void send("What's sold out?")}
            >
              What's sold out?
            </button>
          )}
          {permissions.includes("orders.view") && (
            <button disabled={busy} onClick={() => void send("Open orders")}>
              Open orders
            </button>
          )}
        </div>
        <div
          className="ma-messages"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-busy={busy}
        >
          {!messages.length && (
            <p>
              Ask about service, or prepare a menu availability change for
              confirmation.
            </p>
          )}
          {messages.map((m, i) => (
            <article key={i} className={"ma-message ma-" + m.role}>
              <strong>{m.role === "user" ? "You" : "Mera"}</strong>
              <p>{m.text}</p>
              {m.summary && (
                <div className="ma-summary">
                  <p>
                    {m.summary.range.from} – {m.summary.range.to}
                  </p>
                  <dl>
                    <dt>Revenue</dt>
                    <dd>
                      {formatMoney(m.summary.revenue, m.summary.currency)}
                    </dd>
                    <dt>Orders</dt>
                    <dd>{m.summary.orders}</dd>
                    <dt>Average order</dt>
                    <dd>
                      {formatMoney(m.summary.averageOrder, m.summary.currency)}
                    </dd>
                    <dt>Previous week revenue</dt>
                    <dd>
                      {formatMoney(
                        m.summary.previous.revenue,
                        m.summary.currency,
                      )}
                    </dd>
                    <dt>Previous week orders</dt>
                    <dd>{m.summary.previous.orders}</dd>
                    <dt>Sold-out events</dt>
                    <dd>{m.summary.soldOutEvents}</dd>
                  </dl>
                  <h3>Top items</h3>
                  <ul>
                    {m.summary.topItems.map((v, n) => (
                      <li key={n}>
                        {v.name} · {v.quantity}
                      </li>
                    ))}
                  </ul>
                  <h3>Busiest hours</h3>
                  <ul>
                    {m.summary.busiestHours.map((v) => (
                      <li key={v.hour}>
                        {v.hour}:00 · {v.orders} orders
                      </li>
                    ))}
                  </ul>
                  <h3>Slow items</h3>
                  <ul>
                    {m.summary.slowItems.map((v, n) => (
                      <li key={n}>
                        {v.name} · {v.quantity}
                      </li>
                    ))}
                  </ul>
                  <small>{m.summary.basis}</small>
                </div>
              )}
              {m.cards?.map((card) => (
                <section
                  className="ma-confirm"
                  key={card.actionId}
                  aria-label="Confirm change"
                >
                  <h3>{card.label}</h3>
                  {card.status ? (
                    <p role="status">
                      {card.status === "executed"
                        ? "Change confirmed"
                        : "Change cancelled"}
                    </p>
                  ) : (
                    <>
                      <p>
                        Confirm within 10 minutes. This change affects this
                        branch.
                      </p>
                      <button disabled={busy} onClick={() => void action(card)}>
                        Confirm
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void action(card, true)}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </section>
              ))}
            </article>
          ))}
          {busy && <p role="status">Mera is working…</p>}
        </div>
        {error && (
          <p className="ma-error" role="alert">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <label htmlFor="ma-input">Message Mera</label>
          <div>
            <input
              id="ma-input"
              ref={field}
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              autoComplete="off"
            />
            <button disabled={busy || !input.trim()}>Send</button>
          </div>
        </form>
      </section>
    </div>
  );
}
