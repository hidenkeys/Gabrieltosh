import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

type Entry = { node: HTMLElement };
const documents = new WeakMap<
  Document,
  { entries: Entry[]; overflow: string }
>();

function visibleControl(
  node: HTMLElement,
  boundary: HTMLElement = node.ownerDocument.body,
) {
  if (node.matches(':disabled,input[type="hidden"]')) return false;
  for (
    let parent: HTMLElement | null = node;
    parent && parent !== boundary.parentElement;
    parent = parent.parentElement
  ) {
    if (
      parent.hidden ||
      parent.hasAttribute("inert") ||
      parent.getAttribute("aria-hidden") === "true"
    )
      return false;
    const style = parent.ownerDocument.defaultView?.getComputedStyle(parent);
    if (
      style?.display === "none" ||
      style?.visibility === "hidden" ||
      style?.visibility === "collapse"
    )
      return false;
    if (parent.tagName === "DETAILS" && !parent.hasAttribute("open")) {
      const summary = Array.from(parent.children).find(
        (child) => child.tagName === "SUMMARY",
      );
      if (!summary?.contains(node)) return false;
    }
  }
  return true;
}

/** DOM order plus native enabled/visibility rules; never count hidden draft controls. */
export function dialogTabStops(dialog: HTMLElement): HTMLElement[] {
  const candidates = Array.from(
    dialog.querySelectorAll<HTMLElement>("*"),
  ).filter((node) => {
    if (
      !node.matches(
        'button,input,select,textarea,a[href],area[href],summary,[tabindex],[contenteditable="true"]',
      )
    )
      return false;
    if (node.tabIndex < 0 || node.matches(':disabled,input[type="hidden"]'))
      return false;
    return visibleControl(node, dialog);
  });
  return candidates
    .filter((node) => {
      if (
        !(node instanceof node.ownerDocument.defaultView!.HTMLInputElement) ||
        node.type !== "radio" ||
        !node.name
      )
        return true;
      const group = candidates.filter(
        (other) =>
          other instanceof node.ownerDocument.defaultView!.HTMLInputElement &&
          other.type === "radio" &&
          other.name === node.name &&
          other.form === node.form,
      ) as HTMLInputElement[];
      return node === (group.find((other) => other.checked) || group[0]);
    })
    .sort(
      (a, b) =>
        (a.tabIndex > 0 ? a.tabIndex : Infinity) -
        (b.tabIndex > 0 ? b.tabIndex : Infinity),
    );
}

/** One lifecycle for native and ARIA dialogs; business actions and styling stay with consumers. */
export function useDialogFocus({
  dialogRef,
  open,
  onClose,
  closeDisabled = false,
  initialFocus = "first",
  initialFocusRef,
  returnFocusRef,
  fallbackFocus,
}: {
  dialogRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  closeDisabled?: boolean;
  initialFocus?: "first" | "dialog";
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocus?: () => void;
}) {
  const latest = useRef({
    onClose,
    closeDisabled,
    initialFocus,
    initialFocusRef,
    returnFocusRef,
    fallbackFocus,
  });
  latest.current = {
    onClose,
    closeDisabled,
    initialFocus,
    initialFocusRef,
    returnFocusRef,
    fallbackFocus,
  };
  const prior = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open || !dialogRef.current) return;
    const node = dialogRef.current,
      doc = node.ownerDocument;
    prior.current =
      latest.current.returnFocusRef?.current ||
      (doc.activeElement as HTMLElement | null);
    let state = documents.get(doc);
    if (!state) {
      state = { entries: [], overflow: doc.body.style.overflow };
      documents.set(doc, state);
    }
    const changed: Array<{
      node: HTMLElement;
      inert: boolean;
      aria: string | null;
    }> = [];
    for (
      let parent: HTMLElement | null = node;
      parent?.parentElement;
      parent = parent.parentElement
    ) {
      for (const sibling of Array.from(parent.parentElement.children)) {
        if (
          sibling === parent ||
          !(sibling instanceof doc.defaultView!.HTMLElement) ||
          ["SCRIPT", "STYLE", "LINK"].includes(sibling.tagName)
        )
          continue;
        if (sibling.hasAttribute("inert")) continue; // Parent-owned isolation must not be reintroduced on unmount.
        changed.push({
          node: sibling,
          inert: false,
          aria: sibling.getAttribute("aria-hidden"),
        });
        sibling.setAttribute("inert", "");
        sibling.setAttribute("aria-hidden", "true");
      }
      if (parent.parentElement === doc.body) break;
    }
    doc.body.style.overflow = "hidden";
    const hadModal = node.hasAttribute("aria-modal");
    if (!hadModal) node.setAttribute("aria-modal", "true");
    const hadTabIndex = node.hasAttribute("tabindex");
    if (!hadTabIndex) node.tabIndex = -1;
    const native =
      node.tagName === "DIALOG" ? (node as HTMLDialogElement) : null;
    let opening = false;
    if (native && !native.open) {
      opening = true;
      try {
        native.showModal();
      } catch {
        native.setAttribute("open", "");
      }
    }
    const entry: Entry = { node };
    state.entries.push(entry);
    const top = () => state!.entries.at(-1) === entry;
    const focus = () => {
      const requested = latest.current.initialFocusRef?.current;
      const target =
        requested && node.contains(requested) && visibleControl(requested, node)
          ? requested
          : latest.current.initialFocus === "dialog"
            ? node
            : dialogTabStops(node)[0] || node;
      target.focus({ preventScroll: true });
    };
    focus();
    const close = (event: Event) => {
      if (!top()) return;
      event.preventDefault();
      event.stopPropagation();
      if (!latest.current.closeDisabled) latest.current.onClose();
    };
    const keydown = (event: KeyboardEvent) => {
      if (!top()) return;
      if (event.key === "Escape") {
        close(event);
        return;
      }
      if (event.key !== "Tab") return;
      const stops = dialogTabStops(node),
        first = stops[0],
        last = stops.at(-1),
        active = doc.activeElement;
      if (!first) {
        event.preventDefault();
        node.focus();
      } else if (
        !node.contains(active) ||
        active === node ||
        (event.shiftKey && active === first) ||
        (!event.shiftKey && active === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    const focusin = () => {
      if (top() && !node.contains(doc.activeElement)) focus();
    };
    doc.addEventListener("keydown", keydown, true);
    doc.addEventListener("focusin", focusin);
    native?.addEventListener("cancel", close);
    return () => {
      doc.removeEventListener("keydown", keydown, true);
      doc.removeEventListener("focusin", focusin);
      native?.removeEventListener("cancel", close);
      const index = state!.entries.indexOf(entry);
      if (index >= 0) state!.entries.splice(index, 1);
      for (const item of changed) {
        item.node.removeAttribute("inert");
        if (item.aria === null) item.node.removeAttribute("aria-hidden");
        else item.node.setAttribute("aria-hidden", item.aria);
      }
      if (opening && native?.open) {
        try {
          native.close();
        } catch {
          native.removeAttribute("open");
        }
      }
      if (!hadTabIndex) node.removeAttribute("tabindex");
      if (!hadModal) node.removeAttribute("aria-modal");
      if (!state!.entries.length) {
        doc.body.style.overflow = state!.overflow;
        documents.delete(doc);
      }
    };
  }, [open, dialogRef]);
  // Passive cleanup follows parent-owned inert/aria-hidden updates and content removal.
  useEffect(() => {
    if (!open) return;
    return () => {
      const target = latest.current.returnFocusRef?.current || prior.current;
      if (
        target?.isConnected &&
        target !== target.ownerDocument.body &&
        visibleControl(target)
      )
        target.focus({ preventScroll: true });
      else latest.current.fallbackFocus?.();
    };
  }, [open]);
}
