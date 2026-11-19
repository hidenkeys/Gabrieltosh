import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";

/** Uncontrolled native disclosure: closing never unmounts a draft or pending intent. */
export function Disclosure({
  summary,
  children,
  className,
  defaultOpen = false,
  ...props
}: Omit<ComponentProps<"details">, "open" | "ref"> & {
  summary: ReactNode;
  defaultOpen?: boolean;
}) {
  const element = useRef<HTMLDetailsElement>(null);
  const initialOpen = useRef(defaultOpen);
  useEffect(() => {
    if (element.current) element.current.open = initialOpen.current;
  }, []);
  return (
    <details
      {...props}
      ref={element}
      className={`mera-disclosure ${className || ""}`}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          event.target !== element.current?.querySelector(":scope > summary")
        )
          return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (element.current) element.current.open = !element.current.open;
        }
      }}
    >
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

/** A named keyboard target for bounded records; the caller supplies semantic table/list content. */
export function DataRegion({
  label,
  children,
  className = "",
  ...props
}: Omit<ComponentProps<"div">, "role" | "aria-label" | "tabIndex"> & {
  label: string;
}) {
  return (
    <div
      {...props}
      className={`mera-data-region ${className}`}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

/** Existing action classes, explicit submission semantics and native pending disablement. */
export function Action({
  variant = "secondary",
  pending = false,
  disabled,
  type = "button",
  className = "",
  children,
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary";
  pending?: boolean;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`mera-action ${variant} ${className}`}
    >
      {children}
    </button>
  );
}

/** Read outcomes stay explicit; this component never decides whether absent data means empty. */
export function ReadState({
  kind,
  title,
  children,
  retry,
  retryLabel = "Try again",
  pending = false,
  className = "",
}: {
  kind: "loading" | "error" | "empty" | "unavailable";
  title: string;
  children?: ReactNode;
  retry?: () => void;
  retryLabel?: string;
  pending?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`mera-read-state ${className}`}
      role={
        kind === "error" ? "alert" : kind === "loading" ? "status" : undefined
      }
    >
      <p>{title}</p>
      {children}
      {retry && (
        <Action pending={pending} onClick={retry}>
          {retryLabel}
        </Action>
      )}
    </div>
  );
}
