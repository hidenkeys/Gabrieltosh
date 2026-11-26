import ItemContents from "../customer/ItemContents";
import { useDialogFocus } from "../ui/useDialogFocus";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { uuid } from "../../api";
import { workspaceApi } from "./api";
const id = z.string().uuid();
const identity = z.object({ actorId: id, organizationId: id, branchId: id });
const outcomeSchema = z.intersection(
  identity,
  z.discriminatedUnion("status", [
    z.object({
      status: z.literal("recorded"),
      version: z.number().int().positive(),
    }),
    z.object({ status: z.literal("not_found") }),
    z.object({ status: z.literal("abandoned"), resolutionId: id }),
  ]),
);
const bodySchema = z
  .object({
    requestKey: id,
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
// Public menu fields mirror shared/mera-contracts.js; no stock ledger, actor,
// provider or other private draft fields are retained in the tab review.
const amount = z.number().int().safe().min(0).max(100000000000);
const choice = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  price: amount,
});
const variant = choice.extend({
  stockMode: z.enum(["unlimited", "counted"]).optional(),
  stock: z.number().int().min(0).max(1000000).optional(),
});
const modifierGroup = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  min: z.number().int().min(0),
  max: z.number().int().min(1).max(30),
  options: z.array(choice).min(1),
});
const previewSchema = identity.extend({
  publishedVersion: z.number().int().nonnegative(),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  products: z
    .array(
      z.object({
        id,
        kind: z.enum(["single", "package", "combo"]).optional(),
        serves: z.number().int().nullable().optional(),
        requiresTable: z.boolean().optional(),
        components: z
          .array(
            z.object({
              productId: id,
              variantId: z.string().nullable().optional(),
              quantity: z.number().int(),
            }),
          )
          .optional(),
        choiceGroups: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              min: z.number().int(),
              max: z.number().int(),
              options: z.array(
                z.object({
                  productId: id,
                  variantId: z.string().nullable().optional(),
                  priceDelta: amount,
                }),
              ),
            }),
          )
          .optional(),
        name: z.string().max(120),
        price: amount,
        category: z.string().max(120).optional(),
        size: z.string().max(40).optional(),
        variants: z.array(variant).max(30).optional(),
        modifierGroups: z.array(modifierGroup).max(10).optional(),
      }),
    )
    .max(5000),
  categories: z.array(z.object({ id, name: z.string().max(120) })).max(5000),
});
const journalSchema = identity
  .extend({ body: bodySchema, preview: previewSchema })
  .strict();
type Journal = z.infer<typeof journalSchema>;
type Props = {
  base: string;
  actorId: string;
  organizationName?: string;
  branchName?: string;
  disabled?: boolean;
  onSuccess: () => void | Promise<void>;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(
    value / 100,
  );
export default function MenuPublication(props: Props) {
  return <ScopedPublication key={props.base + props.actorId} {...props} />;
}
function ScopedPublication({
  base,
  actorId,
  organizationName,
  branchName,
  disabled = false,
  onSuccess,
}: Props) {
  const match = /^\/organizations\/([^/]+)\/branches\/([^/]+)$/.exec(base);
  const scope = { actorId, organizationId: match?.[1], branchId: match?.[2] };
  const key = `mera:publication:tab:v1:${scope.organizationId}:${scope.branchId}:${actorId}`;
  const [preview, setPreview] = useState<z.infer<typeof previewSchema> | null>(
    null,
  );
  const [pending, setPending] = useState<Journal | null>(null);
  const pendingRef = useRef<Journal | null>(null);
  const [blocked, setBlocked] = useState(false),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [open, setOpen] = useState(false),
    [confirmStop, setConfirmStop] = useState(false),
    [reason, setReason] = useState("");
  const alive = useRef(true),
    inflight = useRef(false),
    dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    abort = useRef(new AbortController());
  function assertIdentity(value: unknown) {
    const proof = identity.parse(value);
    if (
      proof.actorId !== actorId ||
      proof.organizationId !== scope.organizationId ||
      proof.branchId !== scope.branchId
    )
      throw Error(
        "Your account or branch changed. This publication remains saved; sign back in to the original account before continuing.",
      );
  }
  function read(): Journal | null {
    identity.parse(scope);
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    if (new TextEncoder().encode(raw).length > 512 * 1024)
      throw Error(
        "Saved publication is too large to recover safely. Ask an administrator to review it; no new publication was sent.",
      );
    const record = journalSchema.parse(JSON.parse(raw));
    assertIdentity(record);
    assertIdentity(record.preview);
    if (
      record.body.previewHash !== record.preview.previewHash ||
      record.body.expectedVersion !== record.preview.publishedVersion
    )
      throw Error("Saved publication review does not match its request.");
    return record;
  }
  function save(record: Journal) {
    const old = read();
    if (old && JSON.stringify(old.body) !== JSON.stringify(record.body))
      throw Error("An earlier publication still needs checking.");
    const raw = JSON.stringify(journalSchema.parse(record));
    if (new TextEncoder().encode(raw).length > 512 * 1024)
      throw Error(
        "The review is too large to save safely. Nothing was published.",
      );
    window.sessionStorage.setItem(key, raw);
    if (window.sessionStorage.getItem(key) !== raw)
      throw Error(
        "This tab could not save the publication request. Nothing was published.",
      );
  }
  function clear(record: Journal) {
    const current = read();
    if (current && current.body.requestKey !== record.body.requestKey)
      throw Error("Another saved publication needs review.");
    window.sessionStorage.removeItem(key);
    if (window.sessionStorage.getItem(key))
      throw Error(
        "The result is known, but this tab could not clear its saved request. Check the original result before publishing again.",
      );
    pendingRef.current = null;
    setPending(null);
  }
  useEffect(() => {
    alive.current = true;
    abort.current = new AbortController();
    try {
      const record = read();
      pendingRef.current = record;
      setPending(record);
    } catch {
      setBlocked(true);
      setError(
        "This tab’s saved publication cannot be verified. Ask an administrator to review it before publishing again.",
      );
    }
    return () => {
      alive.current = false;
      abort.current.abort();
    };
  }, []);
  useDialogFocus({
    dialogRef: dialog,
    open,
    onClose: close,
    returnFocusRef: trigger,
  });
  function close() {
    setOpen(false);
    setConfirmStop(false);
  }
  async function request(path: string, method = "GET", body?: unknown) {
    return workspaceApi<any>(base + path, method, body, abort.current.signal);
  }
  async function finish(result: any, record: Journal) {
    if (!alive.current) return;
    if (!Number.isInteger(result.version) || result.version < 1)
      throw Error(
        "The publication result could not be verified. Check the original request.",
      );
    clear(record);
    setPreview(null);
    setNotice(`Menu version ${result.version} is published.`);
    close();
    if (alive.current) await onSuccess();
  }
  async function perform(
    action: "preview" | "publish" | "retry" | "check" | "stop",
  ) {
    if (disabled || blocked || inflight.current) return;
    inflight.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const record = pendingRef.current;
      if (action === "preview") {
        if (record)
          throw Error(
            "Check the saved publication before starting another review.",
          );
        const next = previewSchema.parse(
          await request("/menu/publication-preview"),
        );
        if (!alive.current) return;
        assertIdentity(next);
        setPreview(next);
        setOpen(true);
        return;
      }
      if (record) {
        const outcome = outcomeSchema.parse(
          await request(`/menu/publication-attempts/${record.body.requestKey}`),
        );
        if (!alive.current) return;
        assertIdentity(outcome);
        if (outcome.status === "recorded") {
          await finish(outcome, record);
          return;
        }
        if (outcome.status === "abandoned") {
          clear(record);
          setPreview(null);
          setConfirmStop(false);
          setNotice(
            "The unconfirmed request is stopped. You can review the current menu before publishing again.",
          );
          return;
        }
        if (outcome.status !== "not_found")
          throw Error(
            "The original publication outcome is unavailable. Its saved request is unchanged.",
          );
        if (action === "check") {
          setNotice(
            "No publication is recorded yet. This does not confirm failure. Retry the original request or explicitly stop it before making a new review.",
          );
          return;
        }
        if (action === "stop") {
          const stopped = outcomeSchema.parse(
            await request(
              `/menu/publication-attempts/${record.body.requestKey}/abandon`,
              "POST",
              { reason: reason.trim() },
            ),
          );
          if (!alive.current) return;
          assertIdentity(stopped);
          if (stopped.status === "recorded") {
            await finish(stopped, record);
            return;
          }
          if (stopped.status !== "abandoned")
            throw Error(
              "Stopping the request was not confirmed. Keep the original saved request.",
            );
          clear(record);
          setPreview(null);
          setConfirmStop(false);
          setNotice(
            "The unconfirmed request is stopped. An already published menu has not been removed.",
          );
          return;
        }
        if (action !== "retry") return;
        await finish(
          await request("/menu/publish", "POST", record.body),
          record,
        );
        return;
      }
      if (action !== "publish" || !preview) return;
      assertIdentity(preview);
      const next = journalSchema.parse({
        ...scope,
        body: {
          requestKey: uuid(),
          previewHash: preview.previewHash,
          expectedVersion: preview.publishedVersion,
        },
        preview,
      });
      save(next);
      pendingRef.current = next;
      setPending(next);
      const result = await request("/menu/publish", "POST", next.body);
      if (!alive.current) return;
      await finish(result, next);
    } catch (e) {
      if (alive.current)
        setError(
          (e as any)?.code === "MENU_PUBLICATION_CHANGED"
            ? "The menu changed after this review. Check or stop the original request before starting a new review."
            : (e as Error).message,
        );
    } finally {
      inflight.current = false;
      if (alive.current) setWorking(false);
    }
  }
  const review = pending?.preview || preview;
  // Categories keep the order they were created in; items follow their category, then name.
  const sortedCategories = review ? review.categories : [];
  const categoryRank = new Map(sortedCategories.map((c, i) => [c.name, i]));
  const sortedProducts = review
    ? [...review.products].sort(
        (a: any, b: any) =>
          (categoryRank.get(a.category) ?? 999) - (categoryRank.get(b.category) ?? 999) ||
          String(a.name).localeCompare(String(b.name)),
      )
    : [];
  return (
    <section className="mw-publication" aria-label="Menu publication">
      <button
        ref={trigger}
        disabled={disabled || working || blocked}
        onClick={() => (pending ? setOpen(true) : void perform("preview"))}
      >
        {working
          ? "Checking menu…"
          : pending
            ? "Recover publication"
            : "Review & publish"}
      </button>
      {notice && !open && <p role="status">{notice}</p>}
      {error && !open && <p role="alert">{error}</p>}
      <dialog
        ref={dialog}
        className="mw-publication-dialog"
        aria-labelledby="mw-publication-title"
      >
        <header>
          <div>
            <p className="mw-publication-eyebrow">
              {organizationName || "Organization"} /{" "}
              {branchName || "Current branch"} · Customer menu
            </p>
            <h2 id="mw-publication-title">
              {pending ? "Check your publication" : "Review before publishing"}
            </h2>
          </div>
          <button aria-label="Close publication review" onClick={close}>
            Close
          </button>
        </header>
        <div className="mw-publication-content">
          {pending ? (
            <p role="status">
              This request may already have published. Its original review stays
              saved in this tab. Closing this window does not stop the request.
            </p>
          ) : (
            <p>
              Publishing makes this reviewed menu available to customers. Draft
              edits made after this review require another review.
            </p>
          )}
          {error && open && <p role="alert">{error}</p>}
          {notice && open && <p role="status">{notice}</p>}
          {review && (
            <>
              {/* Show the menu in its own order: categories by position, then items by name. */}
              <p>
                Current published version: <b>{review.publishedVersion}</b>
              </p>
              <h3>Category groups ({review.categories.length})</h3>
              {review.categories.length ? (
                <ul>
                  {sortedCategories.map((category) => (
                    <li key={category.id}>{category.name}</li>
                  ))}
                </ul>
              ) : (
                <p>
                  No category groups. Products keep the category names shown
                  below.
                </p>
              )}
              <h3>Included products ({review.products.length})</h3>
              {review.products.length ? (
                <ul className="mw-publication-products">
                  {sortedProducts.map((product) => (
                    <li key={product.id}>
                      <span>
                        <strong>{product.name}</strong>
                        <ItemContents
                          item={product}
                          products={review?.products || []}
                        />
                        {product.category && <small>{product.category}</small>}
                        {product.size && <small>Size: {product.size}</small>}
                        {(!!product.variants?.length ||
                          !!product.modifierGroups?.length) && (
                          <details>
                            <summary>
                              Variants & customization for {product.name}
                            </summary>
                            {!!product.variants?.length && (
                              <>
                                <h4>Variant prices</h4>
                                <ul>
                                  {product.variants.map((item) => (
                                    <li key={item.id}>
                                      {item.name}: {money(item.price)}
                                      {item.stockMode === "counted" &&
                                      item.stock === 0
                                        ? " · Out of stock"
                                        : ""}
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                            {product.modifierGroups?.map((group) => (
                              <div key={group.id}>
                                <h4>{group.name}</h4>
                                <p>
                                  Choose {group.min}–{group.max} options
                                </p>
                                <ul>
                                  {group.options.map((option) => (
                                    <li key={option.id}>
                                      {option.name}: +{money(option.price)}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </details>
                        )}
                      </span>
                      <span>
                        {product.variants?.length ? (
                          <>
                            Base price {money(product.price)}
                            <small>See variant prices</small>
                          </>
                        ) : (
                          money(product.price)
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  This review contains no available products. Publishing it will
                  show an empty customer menu.
                </p>
              )}
            </>
          )}
          {confirmStop && (
            <fieldset disabled={working}>
              <legend>Stop this unconfirmed request?</legend>
              <p>
                If it already published, that published menu will be kept.
                Otherwise this request will be stopped before a new review is
                allowed.
              </p>
              <label>
                Reason
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  minLength={3}
                  maxLength={500}
                />
              </label>
              <button onClick={() => setConfirmStop(false)}>
                Keep original request
              </button>
              <button
                disabled={disabled || reason.trim().length < 3}
                onClick={() => void perform("stop")}
              >
                Stop unconfirmed publication
              </button>
            </fieldset>
          )}
        </div>
        <footer>
          {pending ? (
            <>
              <button
                disabled={disabled || working}
                onClick={() => void perform("check")}
              >
                Check original publication
              </button>
              <button
                disabled={disabled || working}
                onClick={() => void perform("retry")}
              >
                Retry original publication
              </button>
              <button
                disabled={disabled || working}
                onClick={() => setConfirmStop(true)}
              >
                Stop unconfirmed request…
              </button>
            </>
          ) : !review ? (
            <button
              disabled={disabled || working}
              onClick={() => void perform("preview")}
            >
              Review current menu
            </button>
          ) : (
            <button
              disabled={disabled || working || !review}
              onClick={() => void perform("publish")}
            >
              Publish reviewed menu
            </button>
          )}
        </footer>
      </dialog>
    </section>
  );
}
