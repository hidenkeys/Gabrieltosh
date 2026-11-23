import { useEffect, useId, useRef, useState } from "react";
import Chips from "./Chips";
export type DateTimePickerProps = {
  label: string;
  ariaDescribedBy?: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  slots?: string[];
  unavailableSlots?: string[];
};
const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function DateTimePicker({
  label,
  ariaDescribedBy,
  value,
  onChange,
  name,
  id,
  required,
  disabled,
  min,
  max,
  slots,
  unavailableSlots = [],
}: DateTimePickerProps) {
  const generated = useId(),
    [later, setLater] = useState(false),
    [more, setMore] = useState(false),
    day = value.split("T")[0] || "",
    time = value.split("T")[1]?.slice(0, 5) || "";
  const timeInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const valid =
      !value ||
      (!!day &&
        !!time &&
        (!min || value >= min) &&
        (!max || value <= max) &&
        (!slots || slots.includes(time)) &&
        !unavailableSlots.includes(time) &&
        !unavailableSlots.includes(value));
    timeInput.current?.setCustomValidity(
      valid ? "" : "Choose a permitted date and time.",
    );
  }, [value, day, time, min, max, slots, unavailableSlots]);
  const today = new Date(),
    days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + index,
      );
      return {
        value: localDate(date),
        label: date.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
        }),
      };
    });
  const times =
    slots ||
    Array.from(
      { length: 48 },
      (_, index) =>
        `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
    );
  const chosenDay = day || localDate(today),
    update = (date: string, clock: string) =>
      onChange(date && clock ? `${date}T${clock}` : date ? `${date}T` : "");
  const options = times.map((clock) => ({
    value: clock,
    label: clock,
    disabled:
      unavailableSlots.includes(`${chosenDay}T${clock}`) ||
      unavailableSlots.includes(clock) ||
      !!(min && `${chosenDay}T${clock}` < min) ||
      !!(max && `${chosenDay}T${clock}` > max),
  }));
  return (
    <fieldset
      className="mi-control mi-datetime"
      disabled={disabled}
      aria-describedby={ariaDescribedBy}
    >
      <legend>{label}</legend>
      <Chips
        label={`${label} day`}
        value={day}
        onChange={(date) => update(date, time)}
        options={days.map((date) => ({
          ...date,
          disabled:
            !!(min && date.value < min.slice(0, 10)) ||
            !!(max && date.value > max.slice(0, 10)),
        }))}
      />
      <button
        type="button"
        aria-expanded={later}
        onClick={() => setLater(!later)}
      >
        Choose another date
      </button>
      {(later || (day && !days.some((date) => date.value === day))) && (
        <label htmlFor={id || generated}>
          Date
          <input
            id={id || generated}
            type="date"
            value={day}
            required={required}
            min={min?.slice(0, 10)}
            max={max?.slice(0, 10)}
            onChange={(event) => update(event.target.value, time)}
          />
        </label>
      )}
      <Chips
        label={`${label} time`}
        value={time}
        onChange={(clock) => update(chosenDay, clock)}
        options={
          more
            ? options
            : options.filter(
                (option, index) =>
                  (slots ? index < 12 : index >= 16 && index < 28) ||
                  option.value === time,
              )
        }
      />
      {options.length > 12 && (
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore(!more)}
        >
          {more ? "Show fewer times" : "More times"}
        </button>
      )}
      <label className="mi-time-exact" htmlFor={`${generated}-time`}>
        Preferred time
        <input
          ref={timeInput}
          aria-describedby={ariaDescribedBy}
          id={`${generated}-time`}
          type="time"
          value={time}
          required={required}
          step="60"
          onChange={(event) => update(chosenDay, event.target.value)}
          min={day === min?.slice(0, 10) ? min.slice(11, 16) : undefined}
          max={day === max?.slice(0, 10) ? max.slice(11, 16) : undefined}
        />
      </label>
      {!slots && (
        <small>
          Choose a preferred time. The venue will confirm availability.
        </small>
      )}
      {name && <input type="hidden" name={name} value={value} />}
    </fieldset>
  );
}
export default DateTimePicker;
