import React, { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./api";
import { MoneyInput } from "../ui/MoneyInput";
import ChoiceField from "../ui/ChoiceField";
export type MenuDraft = {
  currency: string;
  categories: { name: string; items: MenuItem[] }[];
  warnings: string[];
};
type MenuItem = {
  name: string;
  description: string;
  price: number | null;
  sizes: { name: string; price: number }[];
  addOns: { name: string; price: number }[];
  dietary: string[];
  station: "kitchen" | "bar";
  confidence: "high" | "low";
  note: string;
  include?: boolean;
};
type Result = {
  created: number;
  skipped: { name: string; reason: string }[];
  categoriesCreated: number;
};
type Props = {
  base: string;
  onClose: () => void;
  onImported: () => void | Promise<void>;
  initialDraft?: MenuDraft;
};
const accept = ".jpg,.jpeg,.png,.webp,.pdf,.xlsx,.csv,.docx";
const readData = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Could not read that file. Try again."));
    r.readAsDataURL(file);
  });
async function prepare(file: File) {
  let blob: Blob = file;
  // createImageBitmap avoids blob: image URLs, which the site's CSP (img-src 'self' data:) blocks.
  // If the browser cannot decode the photo here, upload the original and let the server check it.
  if (/^image\/(jpeg|png|webp)$/.test(file.type) && typeof createImageBitmap === "function") {
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      bitmap = null;
    }
    if (bitmap) {
      try {
        const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
        const ctx = scale < 1 ? document.createElement("canvas").getContext("2d") : null;
        if (ctx) {
          ctx.canvas.width = Math.round(bitmap.width * scale);
          ctx.canvas.height = Math.round(bitmap.height * scale);
          ctx.drawImage(bitmap, 0, 0, ctx.canvas.width, ctx.canvas.height);
          blob =
            (await new Promise<Blob | null>((resolve) =>
              ctx.canvas.toBlob(resolve, "image/jpeg", 0.85),
            )) || file;
        }
      } finally {
        bitmap.close();
      }
    }
  }
  return { name: file.name, mime: blob.type, data: await readData(blob) };
}
// Retain decimal and blank drafts while the shared money control formats them.
function DraftMoney({
  value,
  onChange,
  ...props
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  currency: string;
}) {
  const [raw, setRaw] = useState(
    value === null || !Number.isFinite(value) ? "" : String(value),
  );
  useEffect(() => {
    setRaw((previous) =>
      (previous === "" ? null : Number(previous)) === value
        ? previous
        : value === null || !Number.isFinite(value)
          ? ""
          : String(value),
    );
  }, [value]);
  return (
    <MoneyInput
      {...props}
      value={raw}
      onChange={(next) => {
        setRaw(next);
        onChange(next === "" ? null : Number(next));
      }}
    />
  );
}
export default function MenuImport({
  base,
  onClose,
  onImported,
  initialDraft,
}: Props) {
  const [draft, setDraft] = useState<MenuDraft | undefined>(initialDraft),
    [files, setFiles] = useState<File[]>([]),
    [step, setStep] = useState(initialDraft ? "review" : "upload"),
    [error, setError] = useState(""),
    [importId, setImportId] = useState<string>(),
    [result, setResult] = useState<Result>(),
    [busy, setBusy] = useState(false);
  const applying = useRef(false);
  const controller = useRef<AbortController | null>(null),
    root = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    root.current?.focus();
    return () => {
      controller.current?.abort();
      previous?.focus();
    };
  }, []);
  const add = (incoming: File[]) => {
    const next = [...files, ...incoming];
    if (
      next.length > 5 ||
      next.reduce((n, f) => n + f.size, 0) > 10 * 1024 * 1024
    ) {
      setError("Choose up to five files, 10 MB total.");
      return;
    }
    if (
      next.some((f) => !/\.(jpe?g|png|webp|pdf|xlsx|csv|docx)$/i.test(f.name))
    ) {
      setError("Choose a photo, PDF, spreadsheet or Word document.");
      return;
    }
    setFiles(next);
    setError("");
  };
  const close = () => {
    controller.current?.abort();
    onClose();
  };
  const report = (e: any) =>
    setError(
      e.status === 503
        ? "AI menu import isn't set up yet. You can still add items by hand."
        : e.status === 429
          ? "Your menu import limit has been reached. Try again later or contact your administrator."
          : e.message || "Could not import this menu. Try again.",
    );
  const extract = async () => {
    const abort = new AbortController();
    controller.current = abort;
    setStep("reading");
    setError("");
    try {
      const prepared = await Promise.all(files.map(prepare));
      if (abort.signal.aborted) return;
      const value = await workspaceApi(
        base + "/menu-import/extract",
        "POST",
        { files: prepared },
        abort.signal,
        { timeoutMs: 200000 },
      );
      if (abort.signal.aborted) return;
      setDraft(value.draft);
      setImportId(value.importId);
      setStep("review");
    } catch (e: any) {
      if (!abort.signal.aborted) {
        report(e);
        setStep("upload");
      }
    }
  };
  const edit = (g: number, i: number, change: Partial<MenuItem>) =>
    setDraft(
      (d) =>
        d && {
          ...d,
          categories: d.categories.map((c, ci) =>
            ci === g
              ? {
                  ...c,
                  items: c.items.map((item, ii) =>
                    ii === i ? { ...item, ...change } : item,
                  ),
                }
              : c,
          ),
        },
    );
  const included =
      draft?.categories
        .flatMap((c) => c.items)
        .filter((i) => i.include !== false) || [],
    missing = included.some(
      (i) =>
        (i.price === null && !i.sizes.length) ||
        (i.price !== null && (!Number.isFinite(i.price) || i.price < 0)) ||
        [...i.sizes, ...i.addOns].some(
          (o) => !Number.isFinite(o.price) || o.price < 0,
        ),
    ),
    checks = included.filter(
      (i) => i.confidence === "low" || i.price === null,
    ).length;
  const apply = async () => {
    if (applying.current) return;
    applying.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await workspaceApi<Result>(
        base + "/menu-import/apply",
        "POST",
        { ...draft, importId },
      );
      setResult(value);
      setStep("done");
      try {
        await onImported();
      } catch {
        setError(
          "Items were added. Close this panel and refresh the menu list.",
        );
      }
    } catch (e) {
      report(e);
    } finally {
      applying.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      ref={root}
      tabIndex={-1}
      className="mw-card mmi"
      aria-label="Import a menu"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) close();
      }}
    >
      <header>
        <h2>Import a menu</h2>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={close}
        >
          Close import
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {step === "upload" && (
        <>
          <p>
            Upload your current menu — a photo, PDF, spreadsheet or Word
            document. We'll turn it into your Mera menu for you to check.
          </p>
          <div
            className="mmi-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              add(Array.from(e.dataTransfer.files));
            }}
          >
            <label>
              Choose menu files
              <input
                type="file"
                accept={accept}
                multiple
                onChange={(e) => {
                  add(Array.from(e.target.files || []));
                  e.target.value = "";
                }}
              />
            </label>
            <p>Drop files here · Up to 5 files, 10 MB total</p>
          </div>
          <ul>
            {files.map((f, i) => (
              <li key={i}>
                {f.name} · {(f.size / 1024).toFixed(0)} KB{" "}
                <button
                  type="button"
                  className="secondary"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles(files.filter((_, n) => n !== i))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button
            className="primary"
            disabled={!files.length}
            onClick={extract}
          >
            Read menu
          </button>
        </>
      )}
      {step === "reading" && (
        <div role="status">
          <h3>Reading your menu…</h3>
          <p>This can take 30–60 seconds.</p>
          <button
            className="secondary"
            onClick={() => {
              controller.current?.abort();
              setStep("upload");
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {step === "review" && draft && (
        <>
          <p>Check the names, prices and options before adding these items.</p>
          {draft.warnings.map((w, i) => (
            <p role="note" key={i}>
              {w}
            </p>
          ))}
          <p role="status">
            {included.length} items in {draft.categories.length} categories ·{" "}
            {checks} need a check
          </p>
          {draft.categories.map((group, g) => (
            <section className="mmi-category" key={g}>
              <header>
                <label>
                  Category name
                  <input
                    value={group.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        categories: draft.categories.map((c, n) =>
                          n === g ? { ...c, name: e.target.value } : c,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={group.items.every((i) => i.include !== false)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        categories: draft.categories.map((c, n) =>
                          n === g
                            ? {
                                ...c,
                                items: c.items.map((i) => ({
                                  ...i,
                                  include: e.target.checked,
                                })),
                              }
                            : c,
                        ),
                      })
                    }
                  />
                  Select category
                </label>
              </header>
              <table>
                <caption className="mi-sr-only">{group.name} items</caption>
                <thead>
                  <tr>
                    <th>Include</th>
                    <th>Item</th>
                    <th>Price</th>
                    <th>Options</th>
                    <th>Station</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((i, n) => (
                    <tr
                      key={n}
                      className={
                        i.confidence === "low" || i.price === null
                          ? "mmi-check"
                          : ""
                      }
                    >
                      <td>
                        <input
                          aria-label={`Include ${i.name}`}
                          type="checkbox"
                          checked={i.include !== false}
                          onChange={(e) =>
                            edit(g, n, { include: e.target.checked })
                          }
                        />
                      </td>
                      <td>
                        <label>
                          Item name
                          <input
                            value={i.name}
                            onChange={(e) =>
                              edit(g, n, { name: e.target.value })
                            }
                          />
                        </label>
                        {(i.confidence === "low" || i.price === null) && (
                          <p className="mmi-reason">
                            {i.note || "Check the price"}
                          </p>
                        )}
                        <details>
                          <summary>Description</summary>
                          <textarea
                            aria-label={`Description for ${i.name}`}
                            value={i.description}
                            onChange={(e) =>
                              edit(g, n, { description: e.target.value })
                            }
                          />
                        </details>
                      </td>
                      <td>
                        <DraftMoney
                          label={`Price for ${i.name}`}
                          currency={draft.currency}
                          value={i.price}
                          onChange={(v) => edit(g, n, { price: v })}
                        />
                      </td>
                      <td>
                        {(["sizes", "addOns"] as const).map((kind) => (
                          <details key={kind} open={i[kind].length > 0}>
                            <summary>
                              {kind === "sizes" ? "Sizes" : "Add-ons"} (
                              {i[kind].length})
                            </summary>
                            {i[kind].map((o, oi) => (
                              <div className="mmi-chip" key={oi}>
                                <label>
                                  {kind === "sizes" ? "Size" : "Add-on"} name
                                  <input
                                    value={o.name}
                                    onChange={(e) =>
                                      edit(g, n, {
                                        [kind]: i[kind].map((v, j) =>
                                          j === oi
                                            ? { ...v, name: e.target.value }
                                            : v,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <DraftMoney
                                  label={`${o.name} price`}
                                  currency={draft.currency}
                                  value={o.price}
                                  onChange={(v) =>
                                    edit(g, n, {
                                      [kind]: i[kind].map((o, j) =>
                                        j === oi
                                          ? { ...o, price: v ?? NaN }
                                          : o,
                                      ),
                                    })
                                  }
                                />
                                <button
                                  type="button"
                                  className="secondary"
                                  aria-label={`Remove ${o.name}`}
                                  onClick={() =>
                                    edit(g, n, {
                                      [kind]: i[kind].filter(
                                        (_, j) => j !== oi,
                                      ),
                                    })
                                  }
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              className="secondary"
                              disabled={i[kind].length >= 30}
                              onClick={() =>
                                edit(g, n, {
                                  [kind]: [
                                    ...i[kind],
                                    {
                                      name: kind === "sizes" ? "Size" : "Extra",
                                      price: 0,
                                    },
                                  ],
                                })
                              }
                            >
                              Add {kind === "sizes" ? "size" : "extra"}
                            </button>
                          </details>
                        ))}
                      </td>
                      <td>
                        <ChoiceField
                          label={`Station for ${i.name}`}
                          value={i.station}
                          onChange={(v) =>
                            edit(g, n, { station: v as MenuItem["station"] })
                          }
                        >
                          <option value="kitchen">Kitchen</option>
                          <option value="bar">Bar</option>
                        </ChoiceField>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          {missing && (
            <p role="note">
              Check the price for included items before importing.
            </p>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              missing ||
              !included.length ||
              draft.categories.some(
                (c) =>
                  !c.name.trim() ||
                  c.items.some(
                    (i) =>
                      i.include !== false &&
                      (!i.name.trim() ||
                        i.sizes.some((o) => !o.name.trim()) ||
                        i.addOns.some((o) => !o.name.trim())),
                  ),
              )
            }
            onClick={apply}
          >
            {busy ? "Importing…" : `Import ${included.length} items`}
          </button>
        </>
      )}
      {step === "done" && result && (
        <>
          <h3>
            Added {result.created} items. {result.skipped.length} skipped
          </h3>
          <ul>
            {result.skipped.map((s, i) => (
              <li key={i}>
                {s.name}: {s.reason}
              </li>
            ))}
          </ul>
          <p>
            Items are in your draft menu. Publish the menu when you're ready.
          </p>
          <button className="primary" onClick={close}>
            Back to menu
          </button>
        </>
      )}
    </section>
  );
}
