import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Segmented, { type ChoiceOption } from "./Segmented";
import Chips from "./Chips";
import Combobox from "./Combobox";
export type ChoiceFieldProps = {
  label: ReactNode;
  children: ReactNode;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (value: string) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  searchable?: boolean;
  "aria-describedby"?: string;
};
function text(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? text(child.props.children)
          : "",
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
function choices(nodes: ReactNode, inheritedDisabled = false): ChoiceOption[] {
  return Children.toArray(nodes).flatMap((node) => {
    if (
      !isValidElement<{
        value?: string | number;
        children?: ReactNode;
        disabled?: boolean;
      }>(node)
    )
      return [];
    if (node.type === "option")
      return [
        {
          value: String(node.props.value ?? text(node.props.children)),
          label: text(node.props.children),
          disabled: inheritedDisabled || node.props.disabled,
        },
      ];
    if (node.type === Fragment || node.type === "optgroup")
      return choices(
        node.props.children,
        inheritedDisabled || !!node.props.disabled,
      );
    return [];
  });
}
/** Reuses existing option definitions while rendering native radio choices or a searchable list. */
export function ChoiceField({
  label,
  children,
  value,
  defaultValue,
  onChange,
  name,
  id,
  disabled,
  required,
  className = "",
  searchable,
  "aria-describedby": describedBy,
}: ChoiceFieldProps) {
  const allOptions = choices(children),
    options = required
      ? allOptions.filter((option) => option.value !== "")
      : allOptions,
    [local, setLocal] = useState(() =>
      String(defaultValue ?? allOptions[0]?.value ?? ""),
    ),
    ref = useRef<HTMLDivElement>(null);
  const selected = value === undefined ? local : String(value);
  useEffect(() => {
    const form = ref.current?.closest("form");
    const reset = () => {
      if (value === undefined)
        setLocal(String(defaultValue ?? allOptions[0]?.value ?? ""));
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [value, defaultValue, allOptions[0]?.value]);
  const props = {
    label: text(label),
    options,
    value: selected,
    onChange: (next: string) => {
      setLocal(next);
      onChange?.(next);
    },
    name,
    disabled,
    required,
  };
  return (
    <div
      ref={ref}
      className={`mi-choice-field ${className}`}
      aria-describedby={describedBy}
    >
      {searchable || options.length > 12 ? (
        <Combobox {...props} id={id} />
      ) : options.length > 4 ? (
        <Chips {...props} />
      ) : (
        <Segmented {...props} />
      )}
    </div>
  );
}
export default ChoiceField;
