import { useEffect, useId, useRef } from "react";
export type StepperProps = {
  label: string;
  describedBy?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  incrementLabel?: string;
  decrementLabel?: string;
};
export function Stepper({
  label,
  describedBy,
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  name,
  id,
  disabled,
  required,
  className = "",
  incrementLabel,
  decrementLabel,
}: StepperProps) {
  const generated = useId(),
    current = useRef(value),
    callback = useRef(onChange),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    interval = useRef<ReturnType<typeof setInterval> | null>(null),
    repeated = useRef(false);
  current.current = value;
  callback.current = onChange;
  function stop() {
    if (timer.current) clearTimeout(timer.current);
    if (interval.current) clearInterval(interval.current);
    timer.current = null;
    interval.current = null;
  }
  useEffect(() => stop, []);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);
  function change(delta: number) {
    const next = Math.min(max, Math.max(min, current.current + delta));
    if (next !== current.current) {
      current.current = next;
      callback.current(next);
    }
  }
  function start(delta: number) {
    repeated.current = false;
    timer.current = setTimeout(() => {
      repeated.current = true;
      change(delta);
      interval.current = setInterval(() => change(delta), 130);
    }, 450);
  }
  const button = (delta: number, text: string) => (
    <button
      type="button"
      aria-label={
        (delta < 0 ? decrementLabel : incrementLabel) ||
        `${delta < 0 ? "Decrease" : "Increase"} ${label}`
      }
      disabled={disabled || (delta < 0 ? value <= min : value >= max)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        start(delta);
      }}
      onPointerUp={stop}
      onPointerCancel={() => {
        stop();
        repeated.current = true;
      }}
      onBlur={stop}
      onClick={() => {
        if (!repeated.current) change(delta);
        repeated.current = false;
      }}
    >
      {text}
    </button>
  );
  return (
    <div className={`mi-control mi-stepper ${className}`}>
      <label htmlFor={id || generated}>{label}</label>
      <div className="mi-stepper-row">
        {button(-step, "−")}
        <input
          id={id || generated}
          name={name}
          aria-describedby={describedBy}
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          required={required}
          onChange={(event) => {
            if (
              event.target.value !== "" &&
              Number.isFinite(event.target.valueAsNumber)
            )
              onChange(event.target.valueAsNumber);
          }}
        />
        {button(step, "+")}
      </div>
      <output className="mi-sr-only" aria-live="polite">
        {value}
      </output>
    </div>
  );
}
export default Stepper;
