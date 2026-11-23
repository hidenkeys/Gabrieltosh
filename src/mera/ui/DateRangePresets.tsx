import Chips from "./Chips";
export type DateRangePresetsProps = {
  onChange: (range: { from: string; to: string }) => void;
  value?: string;
  onPresetChange?: (value: string) => void;
  label?: string;
  disabled?: boolean;
};
const local = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function DateRangePresets({
  onChange,
  value = "",
  onPresetChange,
  label = "Date range",
  disabled,
}: DateRangePresetsProps) {
  return (
    <Chips
      label={label}
      value={value}
      disabled={disabled}
      options={[
        { value: "today", label: "Today" },
        { value: "yesterday", label: "Yesterday" },
        { value: "week", label: "This week" },
        { value: "month", label: "This month" },
        { value: "custom", label: "Custom" },
      ]}
      onChange={(key) => {
        onPresetChange?.(key);
        if (key === "custom") return;
        const to = new Date(),
          from = new Date(to);
        if (key === "yesterday") {
          from.setDate(from.getDate() - 1);
          to.setDate(to.getDate() - 1);
        }
        if (key === "week")
          from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
        if (key === "month") from.setDate(1);
        onChange({ from: local(from), to: local(to) });
      }}
    />
  );
}
export default DateRangePresets;
