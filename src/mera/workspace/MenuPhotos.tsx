import React, { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./api";
type Product = { id: string; name: string; image?: string };
type Photo = { mime: string; data: string };
type State = {
  photo?: Photo;
  error?: string;
  status?: "generating" | "saving" | "kept" | "skipped";
};
export async function prepareMenuPhoto(photo: Photo) {
  const bytes = Uint8Array.from(atob(photo.data), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(
    new Blob([bytes], { type: photo.mime }),
  );
  try {
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Could not prepare this photo.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return {
      mime: "image/jpeg",
      data: canvas.toDataURL("image/jpeg", 0.82).split(",")[1],
    };
  } finally {
    bitmap.close();
  }
}
export default function MenuPhotos({
  base,
  products,
  onImported,
  onClose,
}: {
  base: string;
  products: Product[];
  onImported: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [items] = useState(() => products.filter((p) => !p.image));
  const [selected, setSelected] = useState(
    () => new Set(items.map((p) => p.id)),
  );
  const [states, setStates] = useState<Record<string, State>>({});
  const [busy, setBusy] = useState(false);
  const running = useRef(false),
    alive = useRef(true),
    controller = useRef(new AbortController());
  useEffect(() => {
    alive.current = true;
    controller.current = new AbortController();
    return () => {
      alive.current = false;
      controller.current.abort();
    };
  }, []);
  const patch = (id: string, value: State) => {
    if (alive.current)
      setStates((s) => ({ ...s, [id]: { ...s[id], ...value } }));
  };
  const error = (e: any) =>
    e.status === 503
      ? "AI photos aren't set up yet."
      : e.status === 429
        ? "Your AI photo limit has been reached. Try again later."
        : e.message || "Could not generate this photo. Try again.";
  const generate = async (ids: string[]) => {
    if (running.current || saving.current.size) return;
    running.current = true;
    setBusy(true);
    let index = 0;
    const worker = async () => {
      while (index < ids.length && !controller.current.signal.aborted) {
        const id = ids[index++];
        patch(id, { status: "generating", error: undefined });
        try {
          const photo = await workspaceApi(
            base + "/menu-photos/generate",
            "POST",
            { productId: id },
            controller.current.signal,
            { timeoutMs: 100000 },
          );
          patch(id, { photo, status: undefined });
        } catch (e) {
          patch(id, { error: error(e), status: undefined });
        }
      }
    };
    try {
      await Promise.all([worker(), worker()]);
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const saving = useRef(new Set<string>());
  const keep = async (id: string) => {
    if (saving.current.has(id) || !states[id]?.photo) return;
    saving.current.add(id);
    patch(id, { status: "saving", error: undefined });
    try {
      const photo = await prepareMenuPhoto(states[id].photo!);
      await workspaceApi(
        base + "/menu-photos/apply",
        "POST",
        { productId: id, ...photo },
        controller.current.signal,
      );
      patch(id, { status: "kept" });
      try {
        await onImported();
      } catch {
        patch(id, {
          error: "Photo kept. Reopen the menu to refresh the product list.",
        });
      }
    } catch (e) {
      patch(id, { status: undefined, error: error(e) });
    } finally {
      saving.current.delete(id);
    }
  };
  return (
    <section className="mmi mmp" aria-label="Generate menu photos">
      <header>
        <h2>Generate photos</h2>
        <button className="secondary" onClick={onClose}>
          Back to menu
        </button>
      </header>
      <p>
        AI generated photos should represent what you serve. Review each photo
        before keeping it.
      </p>
      <p>
        ~$0.04 per photo · {selected.size} photos ≈ $
        {(selected.size * 0.04).toFixed(2)}
      </p>
      <button
        className="primary"
        disabled={
          busy ||
          Object.values(states).some((s) => s.status === "saving") ||
          !selected.size
        }
        onClick={() =>
          generate([...selected].filter((id) => states[id]?.status !== "kept"))
        }
      >
        {busy ? "Generating…" : "Generate"}
      </button>{" "}
      <button
        className="secondary"
        disabled={
          busy ||
          Object.values(states).some((s) => s.status === "saving") ||
          !Object.values(states).some((s) => s.photo && !s.status)
        }
        onClick={async () => {
          for (const p of items)
            if (states[p.id]?.photo && !states[p.id]?.status) await keep(p.id);
        }}
      >
        Keep all
      </button>
      <div className="mmp-grid">
        {items.map((p) => {
          const s = states[p.id] || {};
          return (
            <article key={p.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  disabled={busy || s.status === "kept"}
                  onChange={(e) =>
                    setSelected((old) => {
                      const next = new Set(old);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                />
                {p.name}
              </label>
              {s.photo && (
                <img
                  src={`data:${s.photo.mime};base64,${s.photo.data}`}
                  alt={`Generated ${p.name}`}
                />
              )}
              <p role="status">
                {s.status === "generating"
                  ? "Generating…"
                  : s.status === "saving"
                    ? "Saving…"
                    : s.status === "kept"
                      ? "Photo kept"
                      : s.status === "skipped"
                        ? "Skipped"
                        : ""}
              </p>
              {s.error && <p role="alert">{s.error}</p>}
              {s.status !== "kept" && s.status !== "saving" && (
                <div className="mw-actions">
                  {s.photo && (
                    <button disabled={busy} onClick={() => keep(p.id)}>
                      Keep
                    </button>
                  )}
                  {(s.photo || s.error) && (
                    <button disabled={busy} onClick={() => generate([p.id])}>
                      Try again
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      patch(p.id, {
                        status: "skipped",
                        photo: undefined,
                        error: undefined,
                      })
                    }
                  >
                    Skip
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
