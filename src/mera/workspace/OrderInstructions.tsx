import { useState } from "react";
export default function OrderInstructions({
  order,
  item,
  compactNote = false,
}: {
  order?: any;
  item?: any;
  compactNote?: boolean;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const snapshot = item || order;
  const strings = (value: any) =>
    Array.isArray(value)
      ? value.filter((entry: any) => typeof entry === "string" && entry.trim())
      : [];
  const modifiers = Array.isArray(item?.modifiers)
    ? item.modifiers
        .map((modifier: any) =>
          typeof modifier === "string" ? modifier : modifier?.name,
        )
        .filter((name: any) => typeof name === "string" && name.trim())
    : [];
  const allergens = strings(snapshot?.allergens);
  const dietary = strings(snapshot?.dietary);
  const note =
    typeof order?.note === "string" && order.note.trim() ? order.note : null;
  if (!note && !modifiers.length && !allergens.length && !dietary.length)
    return null;
  return (
    <div className="mw-order-instructions">
      {note &&
        (compactNote ? (
          <details
            className="mw-ticket-note"
            onToggle={(event) => setNoteOpen(event.currentTarget.open)}
          >
            <summary aria-label="Preparation note">
              <strong>Preparation note</strong>
              {!noteOpen && <span aria-hidden="true">{note}</span>}
            </summary>
            {noteOpen && <p style={{ whiteSpace: "pre-wrap" }}>{note}</p>}
          </details>
        ) : (
          <p className="mw-note">
            <strong>Preparation note</strong>
            <br />
            <span style={{ whiteSpace: "pre-wrap" }}>{note}</span>
          </p>
        ))}
      {!!modifiers.length && (
        <p>
          <strong>Selected add-ons:</strong> {modifiers.join(", ")}
        </p>
      )}
      {!!allergens.length && (
        <p>
          <strong>Recorded allergens:</strong> {allergens.join(", ")}
        </p>
      )}
      {!!dietary.length && (
        <p>
          <strong>Recorded dietary labels:</strong> {dietary.join(", ")}
        </p>
      )}
    </div>
  );
}
