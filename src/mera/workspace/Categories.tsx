import Stepper from "../ui/Stepper";
import ChoiceField from "../ui/ChoiceField";
import React, { useEffect, useRef, useState } from "react";
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
type Props = {
  base: string;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
  onCategories: (categories: any[]) => void;
};
export default function Categories(props: Props) {
  return <ScopedCategories key={props.base} {...props} />;
}
function ScopedCategories({ base, disabled, save, onCategories }: Props) {
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
  const [loadError, setLoadError] = useState("");
  const active = useRef(true),
    generation = useRef(0),
    onRows = useRef(onCategories);
  onRows.current = onCategories;
  const read = async (signal?: AbortSignal) => {
    const version = ++generation.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await workspaceApi(
        base + "/categories",
        "GET",
        undefined,
        signal,
      );
      if (!active.current || signal?.aborted || version !== generation.current)
        return false;
      if (!Array.isArray(result.categories))
        throw new Error(
          "Category groups could not be loaded. Please try again.",
        );
      setRows(result.categories);
      onRows.current(result.categories);
      return true;
    } catch (failure: any) {
      if (
        active.current &&
        !signal?.aborted &&
        version === generation.current &&
        failure.name !== "AbortError"
      )
        setLoadError("Category groups could not be loaded. Please try again.");
      return false;
    } finally {
      if (active.current && !signal?.aborted && version === generation.current)
        setLoading(false);
    }
  };
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void read(controller.signal);
    return () => {
      active.current = false;
      generation.current++;
      controller.abort();
    };
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
      {loadError && (
        <div role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="secondary"
            disabled={disabled || working || loading}
            onClick={() => void read()}
          >
            Retry loading categories
          </button>
        </div>
      )}
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
            if (!active.current) return;
            if (await read())
              setDraft({
                name: "",
                parentId: null,
                sortOrder: 0,
                active: true,
              });
          } catch (e) {
            if (active.current) setError((e as Error).message);
          } finally {
            if (active.current) setWorking(false);
          }
        }}
      >
        <fieldset
          disabled={disabled || working || loading || !!loadError}
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
            <ChoiceField
              label={<>Parent category</>}
              searchable
              value={draft.parentId || ""}
              onChange={(nextValue) =>
                setDraft({ ...draft, parentId: nextValue || null })
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
            </ChoiceField>
            <Stepper
              label="Category sort order"
              min={-100000}
              max={100000}
              required
              value={draft.sortOrder}
              onChange={(value) => setDraft({ ...draft, sortOrder: value })}
            />
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
      ) : loadError ? null : !rows.length ? (
        <p>
          No category groups yet. Your existing category names are still used.
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
