import React, { useEffect, useState } from "react";
import { workspaceApi } from "./api";
import { categoryPath } from "./Categories";
export default function SharedMenus({
  organizationId,
  categories = [],
  base,
  products,
  disabled,
  canPublish,
  save,
}: {
  categories?: any[];
  organizationId: string;
  base: string;
  products: any[];
  disabled: boolean;
  canPublish: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const path =
    "/organizations/" + encodeURIComponent(organizationId) + "/menus";
  const [menus, setMenus] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    const result = await workspaceApi(path);
    setMenus(Array.isArray(result) ? result : result.menus || []);
  };
  useEffect(() => {
    const controller = new AbortController();
    workspaceApi(path, "GET", undefined, controller.signal)
      .then((result) =>
        setMenus(Array.isArray(result) ? result : result.menus || []),
      )
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path]);
  const template = menus.find((row) => row.id === selected);
  const run = async (callback: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await callback();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mw-card">
      <h2>Shared menu library</h2>
      <p>
        Reuse a curated catalog across branches while preserving each branch’s
        stock. Applying a template publishes a new branch menu version. Branch
        price, availability and category overrides are explicit.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await save(
              path,
              "POST",
              { name, items: products },
              "Shared menu template saved.",
            );
            await load();
            setName("");
          });
        }}
      >
        <div className="mw-form">
          <label>
            New shared menu name
            <input
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            className="secondary"
            disabled={disabled || busy || loading || !products.length}
          >
            Save current branch catalog as template
          </button>
        </div>
      </form>
      {loading ? (
        <p role="status">Loading shared menus…</p>
      ) : (
        <>
          <label>
            Shared template
            <select
              value={selected}
              onChange={(event) => {
                setSelected(event.target.value);
                setOverrides({});
              }}
            >
              <option value="">Choose a shared menu</option>
              {menus.map((menu) => (
                <option key={menu.id} value={menu.id}>
                  {menu.name} · version {menu.version}
                </option>
              ))}
            </select>
          </label>
          {template && (
            <>
              <p>
                {template.items.length} catalog items. Stock balances are never
                copied from the template.
              </p>
              <button
                className="secondary"
                disabled={disabled || busy || !products.length}
                onClick={() =>
                  void run(async () => {
                    await save(
                      path + "/" + template.id,
                      "PATCH",
                      {
                        name: template.name,
                        items: products,
                        version: template.version,
                      },
                      "Shared template updated from this branch catalog.",
                    );
                    await load();
                  })
                }
              >
                Replace selected template with current branch catalog
              </button>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    const values = Object.entries(overrides).map(
                      ([code, fields]) => ({
                        code,
                        ...fields,
                        ...(fields.price !== undefined
                          ? { price: Math.round(Number(fields.price) * 100) }
                          : {}),
                      }),
                    );
                    await save(
                      base + "/menu/shared-use",
                      "POST",
                      {
                        menuId: template.id,
                        version: template.version,
                        overrides: values,
                      },
                      "Shared menu applied and published to this branch.",
                    );
                    setOverrides({});
                  });
                }}
              >
                <h3>Optional branch overrides</h3>
                {template.items.map((item: any) => (
                  <div className="mw-form mw-card" key={item.code}>
                    <b>
                      {item.name} · {item.code}
                    </b>
                    <label>
                      Override price for {item.name} (naira)
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder={String(item.price / 100)}
                        value={overrides[item.code]?.price ?? ""}
                        onChange={(event) => {
                          const current = { ...(overrides[item.code] || {}) };
                          if (event.target.value === "") delete current.price;
                          else current.price = event.target.value;
                          setOverrides({ ...overrides, [item.code]: current });
                        }}
                      />
                    </label>
                    <label>
                      Availability for {item.name}
                      <select
                        value={
                          overrides[item.code]?.available === undefined
                            ? "inherit"
                            : String(overrides[item.code].available)
                        }
                        onChange={(event) => {
                          const current = { ...(overrides[item.code] || {}) };
                          if (event.target.value === "inherit")
                            delete current.available;
                          else
                            current.available = event.target.value === "true";
                          setOverrides({ ...overrides, [item.code]: current });
                        }}
                      >
                        <option value="inherit">Use template</option>
                        <option value="true">Available</option>
                        <option value="false">Unavailable</option>
                      </select>
                    </label>
                    <label>
                      Destination category for {item.name}
                      <select
                        value={overrides[item.code]?.categoryId || "inherit"}
                        onChange={(event) => {
                          const current = { ...(overrides[item.code] || {}) };
                          if (event.target.value === "inherit")
                            delete current.categoryId;
                          else {
                            current.categoryId = event.target.value;
                            delete current.category;
                          }
                          setOverrides({ ...overrides, [item.code]: current });
                        }}
                      >
                        <option value="inherit">
                          Use template text category
                        </option>
                        {categories
                          .filter((category) => category.active)
                          .map((category) => (
                            <option key={category.id} value={category.id}>
                              {categoryPath(category, categories)}
                            </option>
                          ))}
                      </select>
                    </label>
                    {!overrides[item.code]?.categoryId && (
                      <label>
                        Override category for {item.name}
                        <input
                          placeholder={item.category}
                          value={overrides[item.code]?.category || ""}
                          onChange={(event) => {
                            const current = { ...(overrides[item.code] || {}) };
                            if (event.target.value.trim())
                              current.category = event.target.value;
                            else delete current.category;
                            setOverrides({
                              ...overrides,
                              [item.code]: current,
                            });
                          }}
                        />
                      </label>
                    )}
                  </div>
                ))}
                <button
                  className="primary"
                  disabled={disabled || busy || !canPublish}
                >
                  Apply & publish to this branch
                </button>
                {!canPublish && (
                  <p>
                    Menu publication permission is required to apply a shared
                    template.
                  </p>
                )}
              </form>
            </>
          )}
        </>
      )}
    </section>
  );
}
