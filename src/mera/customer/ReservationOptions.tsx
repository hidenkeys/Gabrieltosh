import { serviceHourSuggestions } from "./serviceHourSuggestions";
import { useState } from "react";
import { Chips } from "../ui/Chips";
import { Stepper } from "../ui/Stepper";
import { DateTimePicker } from "../ui/DateTimePicker";
export default function ReservationOptions({
  tables = [],
  disabled = false,
  timeZone,
  serviceHours,
}: {
  tables?: { id: string; name: string }[];
  disabled?: boolean;
  timeZone?: string;
  serviceHours?: unknown;
}) {
  const [party, setParty] = useState(2),
    [duration, setDuration] = useState("60"),
    [table, setTable] = useState(""),
    [startsAt, setStartsAt] = useState("");
  const now = new Date(),
    selectedDay =
      startsAt.split("T")[0] ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const guidance = serviceHourSuggestions(selectedDay, serviceHours, timeZone);
  return (
    <div className="mc-reservation-options">
      <Stepper
        label="Party size"
        name="partySize"
        value={party}
        onChange={setParty}
        min={1}
        max={100}
        required
        disabled={disabled}
      />
      <Chips
        label="Quick party size"
        value={party >= 9 ? "9+" : String(party)}
        onChange={(value) => setParty(value === "9+" ? 9 : Number(value))}
        disabled={disabled}
        options={[1, 2, 3, 4, 5, 6, 7, 8]
          .map((value) => ({ value: String(value), label: String(value) }))
          .concat([{ value: "9+", label: "9+" }])}
      />
      {!!tables.length && (
        <Chips
          label="Preferred table (optional)"
          name="tableId"
          value={table}
          onChange={setTable}
          disabled={disabled}
          options={[
            { value: "", label: "Any suitable table" },
            ...tables.map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
      )}
      {!!tables.length && (
        <p className="mc-note">
          This is a seating preference. The venue confirms your table.
        </p>
      )}
      <div>
        <DateTimePicker
          id="mc-reservation-start"
          label="Date & time"
          suggestedSlots={guidance.configured ? guidance.times : undefined}
          availabilityHint={
            guidance.configured
              ? "Suggested starts follow the branch’s service hours. They do not confirm a table is free; you can enter another preferred time for the team to review."
              : undefined
          }
          ariaDescribedBy="mc-reservation-timezone"
          name="startsAt"
          value={startsAt}
          onChange={setStartsAt}
          disabled={disabled}
          required
        />
        {guidance.configured && !guidance.times.length && (
          <p role="status">
            There are no starts within the branch’s service hours on this device
            date. Enter a preferred time or ask the team.
          </p>
        )}
        <small id="mc-reservation-timezone">
          Choose your device’s local time (
          {Intl.DateTimeFormat().resolvedOptions().timeZone}). The venue is in{" "}
          {timeZone || "Africa/Lagos"}. Times are requests, not confirmed
          availability.
        </small>
      </div>
      <Chips
        label="Duration"
        name="duration"
        value={duration}
        onChange={setDuration}
        disabled={disabled}
        options={[
          { value: "60", label: "1 hour" },
          { value: "90", label: "1½ hours" },
          { value: "120", label: "2 hours" },
          { value: "180", label: "3 hours" },
        ]}
      />
    </div>
  );
}
