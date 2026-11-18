import React, { useEffect, useState } from "react";
import { workspaceApi } from "./api";
export function categoryPath(category: any, categories: any[]) {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = category;
  while (current && !seen.has(current.id) && names.length < 6) {
    seen.add(current.id);
    names.unshift(current.name);
    current = categories.find((row) => row.id === current.parentId);
  }
  return names.join(" / ");
}
export default function Categories({
  base,
  disabled,
  save,
  onCategories,
}: {
  base: string;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
  onCategories: (categories: any[]) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState<any>({
    name: "",
    parentId: null,
    sortOrder: 0,
    active: true,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    workspaceApi(base + "/categories", "GET", undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(result.categories))
          throw new Error("Category response is invalid.");
        setRows(result.categories);
        onCategories(result.categories);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base]);
  const isDescendant = (row: any) => {
    const seen = new Set();
    let current = row;
    while (current && !seen.has(current.id)) {
      if (current.id === draft.id) return true;
      seen.add(current.id);
      current = rows.find((parent) => parent.id === current.parentId);
    }
    return false;
  };
  return (
    <section className="mw-card">
      <h2>Menu categories</h2>
      <p>
        Organize categories and subcategories up to six levels. Changes stay in
        the working catalog until the menu is published. Move child categories
        and products before retiring a category.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setWorking(true);
          setError("");
          try {
            const { id, version, ...fields } = draft;
            await save(
              base + "/categories" + (id ? "/" + id : ""),
              id ? "PATCH" : "POST",
              { ...fields, ...(id ? { version } : {}) },
              id ? "Category updated." : "Category created.",
            );
            const result = await workspaceApi(base + "/categories");
            if (!Array.isArray(result.categories))
              throw new Error("Category response is invalid.");
            setRows(result.categories);
            onCategories(result.categories);
            setDraft({ name: "", parentId: null, sortOrder: 0, active: true });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setWorking(false);
          }
        }}
      >
        <fieldset
          disabled={disabled || working || loading}
          style={{ border: 0, padding: 0 }}
        >
          <legend>{draft.id ? "Edit category" : "Create category"}</legend>
          <div className="mw-form">
            <label>
              Category name
              <input
                required
                maxLength={100}
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </label>
            <label>
              Parent category
              <select
                value={draft.parentId || ""}
                onChange={(event) =>
                  setDraft({ ...draft, parentId: event.target.value || null })
                }
              >
                <option value="">Top-level category</option>
                {rows
                  .filter((row) => row.active && !isDescendant(row))
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {categoryPath(row, rows)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Category sort order
              <input
                type="number"
                min={-100000}
                max={100000}
                step={1}
                required
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft({ ...draft, sortOrder: Number(event.target.value) })
                }
              />
            </label>
            <label className="mw-row">
              <span>Category active</span>
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) =>
                  setDraft({ ...draft, active: event.target.checked })
                }
              />
            </label>
          </div>
          <div className="mw-actions">
            <button className="secondary">
              {draft.id ? "Save category changes" : "Create category"}
            </button>
            {draft.id && (
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    name: "",
                    parentId: null,
                    sortOrder: 0,
                    active: true,
                  })
                }
              >
                Cancel category edit
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {loading ? (
        <p role="status">Loading categories…</p>
      ) : !rows.length ? (
        <p>
          No structured categories yet. Existing text categories remain in the
          catalog.
        </p>
      ) : (
        rows.map((row) => (
          <div className="mw-row" key={row.id}>
            <div>
              <b>{categoryPath(row, rows)}</b>
              <p>
                {row.active ? "Active" : "Retired"} · Sort order {row.sortOrder}
              </p>
            </div>
            <button
              type="button"
              disabled={disabled || working}
              onClick={() =>
                setDraft({
                  id: row.id,
                  name: row.name,
                  parentId: row.parentId,
                  sortOrder: row.sortOrder,
                  active: row.active,
                  version: row.version,
                })
              }
            >
              Edit {row.name}
            </button>
          </div>
        ))
      )}
    </section>
  );
}
