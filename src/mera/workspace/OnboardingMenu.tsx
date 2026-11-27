import { useState } from "react";
import MenuImport from "./MenuImport";
import { workspaceApi } from "./api";
import { MoneyInput } from "../ui/MoneyInput";
import { quickItem } from "./setup/onboardingDefaults";
export default function OnboardingMenu({
  base,
  currency,
  save,
  items,
  onItems,
  disabled,
}: {
  base: string;
  currency: string;
  save: any;
  items: any[];
  onItems: (items: any[]) => void;
  disabled: boolean;
}) {
  const [name, setName] = useState(""),
    [price, setPrice] = useState(""),
    [category, setCategory] = useState(""),
    [importing, setImporting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    const data = await workspaceApi(base + "/workspace");
    if (!Array.isArray(data.products))
      throw Error("Could not load menu items.");
    onItems(data.products);
  }
  return (
    <section aria-label="Menu items">
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => setImporting(true)}
      >
        Import a menu file
      </button>
      {importing && (
        <MenuImport
          base={base}
          products={items}
          onClose={() => setImporting(false)}
          onImported={async () => {
            await load();
            setImporting(false);
          }}
        />
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (disabled || busy) return;
          setBusy(true);
          setError("");
          try {
            const item = await save(
              base + "/products",
              "POST",
              quickItem(name, price, category),
              "Item added.",
            );
            if (!item?.id)
              throw Error(
                "Item creation could not be confirmed. Check your menu before retrying.",
              );
            onItems([...items, item]);
            setName("");
            setPrice("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={disabled || busy}>
          <legend>Quick-add an item</legend>
          <label>
            Item name
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <MoneyInput
            label="Price"
            currency={currency}
            required
            value={price}
            onChange={setPrice}
          />
          <label>
            Category
            <input
              value={category}
              maxLength={100}
              placeholder="Food or drinks"
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <button type="submit">{busy ? "Adding…" : "Add item"}</button>
        </fieldset>
      </form>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
      {!items.length && <p>Add at least one item to continue.</p>}
    </section>
  );
}
