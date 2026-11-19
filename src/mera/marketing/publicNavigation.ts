import { useCallback, useEffect, type MouseEvent } from "react";

/** Only known page sections are navigation targets; arbitrary fragments never select DOM. */
export function focusPublicSection(hash: string, allowed: readonly string[]) {
  let id: string;
  try {
    id = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return false;
  }
  if (!allowed.includes(id)) return false;
  const section = document.getElementById(id);
  if (!section) return false;
  const target = section.querySelector<HTMLElement>("h1,h2,h3") || section;
  if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
  target.focus({ preventScroll: true });
  section.scrollIntoView?.({ block: "start" });
  return true;
}

/** Works after lazy mount and on back/forward/hash changes without rerender focus jumps. */
export function usePublicNavigation(allowed: readonly string[]) {
  useEffect(() => {
    const follow = () => {
      focusPublicSection(window.location.hash, allowed);
    };
    follow();
    window.addEventListener("hashchange", follow);
    window.addEventListener("popstate", follow);
    return () => {
      window.removeEventListener("hashchange", follow);
      window.removeEventListener("popstate", follow);
    };
  }, [allowed]);
  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return false;
      const url = new URL(event.currentTarget.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname !== window.location.pathname ||
        url.search !== window.location.search
      )
        return false;
      if (!focusPublicSection(url.hash, allowed)) return false;
      event.preventDefault();
      if (window.location.hash !== url.hash)
        window.history.pushState(
          null,
          "",
          url.pathname + url.search + url.hash,
        );
      return true;
    },
    [allowed],
  );
}
