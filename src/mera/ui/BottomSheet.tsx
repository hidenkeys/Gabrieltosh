import { useId, useRef, type ReactNode } from "react";
import { useDialogFocus } from "./useDialogFocus";
export type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  busy?: boolean;
};
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  busy = false,
}: BottomSheetProps) {
  const id = useId(),
    ref = useRef<HTMLDivElement>(null);
  useDialogFocus({ dialogRef: ref, open, onClose, closeDisabled: busy });
  if (!open) return null;
  return (
    <div
      className="mi-sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        className="mi-control mi-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <header>
          <h2 id={id}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={`Close ${title}`}
          >
            Close
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export default BottomSheet;
