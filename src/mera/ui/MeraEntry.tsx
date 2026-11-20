import { useEffect, useState, type ReactNode } from "react";
import { MeraBrand } from "./MeraBrand";

const introductionKey = "meratech.introduction.seen.v1";

/** Content is always present; only the real header mark gets an entrance. */
export function MeraSiteEntry({ children }: { children: ReactNode }) {
  const [first] = useState(() => {
    try {
      return sessionStorage.getItem(introductionKey) !== "seen";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(introductionKey, "seen");
    } catch {
      /* Optional polish never gates access. */
    }
  }, []);
  return (
    <div
      className={
        first ? "mera-site-entry mera-site-entry--first" : "mera-site-entry"
      }
    >
      {children}
    </div>
  );
}

export function MeraLoading({
  title = "Opening MeraTech…",
  description = "Preparing this page.",
  error,
  onRetry,
  retryLabel = "Try again",
}: {
  title?: string;
  description?: string;
  error?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="mera-entry mera-identity">
      <div className="mera-entry-content">
        <MeraBrand />
        <div role={error ? "alert" : "status"} aria-live="polite">
          <h1>{error ? "Let’s try that again." : title}</h1>
          <p>
            {error ||
              (slow
                ? "This is taking longer than expected. Check your connection, then try again."
                : description)}
          </p>
        </div>
        {!error && <span className="mera-entry-progress" aria-hidden="true" />}
        {(error || slow) && onRetry && (
          <button type="button" onClick={onRetry}>
            {retryLabel}
          </button>
        )}
        <a href="/mera">MeraTech home</a>
      </div>
    </main>
  );
}
