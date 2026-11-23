import Stepper from "../ui/Stepper";
import MinorMoneyInput from "../ui/MinorMoneyInput";
import { uuid } from "../../api";
type Option = { id: string; name: string; price: number };
type Group = {
  id: string;
  name: string;
  min: number;
  max: number;
  options: Option[];
};
export default function ModifierGroupsEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: Group[];
  onChange: (groups: Group[]) => void;
  disabled?: boolean;
}) {
  const update = (id: string, patch: Partial<Group>) =>
    onChange(
      value.map((group) => (group.id === id ? { ...group, ...patch } : group)),
    );
  const move = (index: number, direction: number) => {
    const next = [...value];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    onChange(next);
  };
  return (
    <fieldset className="mw-wide" disabled={disabled}>
      <legend>Customization groups & add-ons</legend>
      <p className="mw-note">
        Set which choices customers may select and each option’s extra price in
        naira. A minimum of zero makes a group optional. Removing options
        adjusts limits to the remaining choices.
      </p>
      {value.map((group, index) => (
        <fieldset className="mw-card" key={group.id}>
          <legend>{group.name || `Customization group ${index + 1}`}</legend>
          <div className="mw-form">
            <label>
              Group name
              <input
                required
                maxLength={100}
                value={group.name}
                onChange={(event) =>
                  update(group.id, { name: event.target.value })
                }
              />
            </label>
            <Stepper
              label="Minimum choices"
              required
              min={0}
              max={Math.min(group.max, group.options.length)}
              value={group.min}
              onChange={(value) => update(group.id, { min: value })}
            />
            <Stepper
              label="Maximum choices"
              required
              min={Math.max(1, group.min)}
              max={30}
              value={group.max}
              onChange={(value) => update(group.id, { max: value })}
            />
          </div>
          {(group.min > group.max || group.min > group.options.length) && (
            <p role="alert">Choice limits must fit the number of options.</p>
          )}
          {group.options.map((option, optionIndex) => (
            <fieldset className="mw-form" key={option.id}>
              <legend>Choice {optionIndex + 1}</legend>
              <label>
                Option name
                <input
                  required
                  maxLength={100}
                  value={option.name}
                  onChange={(event) =>
                    update(group.id, {
                      options: group.options.map((row) =>
                        row.id === option.id
                          ? { ...row, name: event.target.value }
                          : row,
                      ),
                    })
                  }
                />
              </label>
              <MinorMoneyInput
                label="Option extra price (naira)"
                min={0}
                max={1000000000}
                required
                value={option.price}
                onChange={(value) =>
                  update(group.id, {
                    options: group.options.map((row) =>
                      row.id === option.id
                        ? {
                            ...row,
                            price: value,
                          }
                        : row,
                    ),
                  })
                }
              />
              <button
                type="button"
                disabled={group.options.length === 1}
                onClick={() => {
                  const options = group.options.filter(
                    (row) => row.id !== option.id,
                  );
                  const max = Math.min(group.max, options.length);
                  update(group.id, {
                    options,
                    max,
                    min: Math.min(group.min, max),
                  });
                }}
              >
                Remove choice {optionIndex + 1}
              </button>
            </fieldset>
          ))}
          <div className="mw-actions">
            <button
              type="button"
              onClick={() =>
                update(group.id, {
                  options: [
                    ...group.options,
                    { id: uuid(), name: "", price: 0 },
                  ],
                })
              }
            >
              Add option to {group.name || `group ${index + 1}`}
            </button>
            <button
              type="button"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              Move group up
            </button>
            <button
              type="button"
              disabled={index === value.length - 1}
              onClick={() => move(index, 1)}
            >
              Move group down
            </button>
            <button
              type="button"
              onClick={() =>
                onChange(value.filter((row) => row.id !== group.id))
              }
            >
              Remove {group.name || `group ${index + 1}`}
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="secondary"
        disabled={value.length >= 10}
        onClick={() =>
          onChange([
            ...value,
            {
              id: uuid(),
              name: "",
              min: 0,
              max: 1,
              options: [{ id: uuid(), name: "", price: 0 }],
            },
          ])
        }
      >
        Add customization group
      </button>
    </fieldset>
  );
}
