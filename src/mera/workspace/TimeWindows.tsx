const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export default function TimeWindows({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: any[];
  onChange: (value: any[]) => void;
  disabled?: boolean;
}) {
  const update = (index: number, patch: any) =>
    onChange(
      value.map((window, position) =>
        position === index ? { ...window, ...patch } : window,
      ),
    );
  return (
    <fieldset className="mw-wide" disabled={disabled}>
      <legend>{label}</legend>
      <p className="mw-note">
        No hours set means always available. Times use the branch timezone.
        Split overnight service into two windows, one for each calendar day.
      </p>
      {value.map((window, index) => (
        <div className="mw-card" key={index}>
          <fieldset>
            <legend>Days for window {index + 1}</legend>
            <div className="mw-actions">
              <button
                type="button"
                onClick={() => update(index, { days: [0, 1, 2, 3, 4, 5, 6] })}
              >
                Same every day
              </button>
              <button
                type="button"
                onClick={() => update(index, { days: [1, 2, 3, 4, 5] })}
              >
                Weekdays
              </button>
              <button
                type="button"
                onClick={() => update(index, { days: [0, 6] })}
              >
                Weekends
              </button>
            </div>
            <div className="mw-window-days">
              {days.map((day, number) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={window.days.includes(number)}
                    onChange={(event) =>
                      update(index, {
                        days: event.target.checked
                          ? [...window.days, number].sort()
                          : window.days.filter(
                              (value: number) => value !== number,
                            ),
                      })
                    }
                  />
                  {day.slice(0, 3)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mw-form">
            <label>
              Window {index + 1} starts
              <input
                required
                type="time"
                value={window.start}
                onChange={(event) =>
                  update(index, { start: event.target.value })
                }
              />
            </label>
            <label>
              Window {index + 1} ends
              <input
                required
                type="time"
                value={window.end}
                onChange={(event) => update(index, { end: event.target.value })}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                onChange(value.filter((_, position) => position !== index))
              }
            >
              Remove window {index + 1}
            </button>
          </div>
          {(!window.days.length || window.end <= window.start) && (
            <p role="alert">
              Choose at least one day and an end after the start.
            </p>
          )}
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        onClick={() =>
          onChange([
            ...value,
            { days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" },
          ])
        }
      >
        Add availability window
      </button>
    </fieldset>
  );
}
