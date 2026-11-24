import React from "react";
import Segmented from "../../ui/Segmented";
export function ItemKindsIntro() {
  return (
    <p>
      Your menu can include single items, packages like bottle service, and
      meals or combos with choices.
    </p>
  );
}
export default function MenuStockStep({
  menuMode,
  inventoryMode,
  onChange,
}: {
  menuMode: string;
  inventoryMode: string;
  onChange: (patch: any) => void;
}) {
  return (
    <>
      <ItemKindsIntro />
      <Segmented
        className="mera-setup-radio-cards"
        label="How do you manage your menus?"
        value={menuMode}
        onChange={(menuMode) => onChange({ menuMode })}
        options={[
          {
            value: "shared",
            label: "Same menu everywhere (prices can differ)",
          },
          { value: "per_location", label: "Each location writes its own menu" },
        ]}
      />
      <p>
        {menuMode === "shared"
          ? "Reports compare the same items across locations, with each location’s prices."
          : "Reports keep each location’s menu items separate."}
      </p>
      <Segmented
        className="mera-setup-radio-cards"
        label="How do you count stock?"
        value={inventoryMode}
        onChange={(inventoryMode) => onChange({ inventoryMode })}
        options={[
          {
            value: "per_location",
            label: "Each location counts its own stock",
          },
          { value: "central", label: "A central store supplies the locations" },
        ]}
      />
      <p>
        {inventoryMode === "central"
          ? "Reports show the central store, location stock and transfers in transit."
          : "Reports show stock per location and a total across locations."}
      </p>
    </>
  );
}
