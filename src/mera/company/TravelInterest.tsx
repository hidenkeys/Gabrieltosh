import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { travelInterestSchema } from "../../../shared/mera-company-contracts.js";
import {
  CompanyPrivacyNotice,
  CompanySubmissionState,
  useCompanySubmission,
} from "./CompanySubmission";
export default function TravelInterest() {
  const state = useCompanySubmission("travel_interest");
  const [details, setDetails] = useState({
    name: "",
    email: "",
    company: "",
    role: "",
    interest: "",
    privacyAcknowledged: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const merged = { ...state.fieldErrors, ...errors };
  if (state.pending || state.receipt || state.blocked)
    return (
      <div className="mera-company-form mera-identity">
        <CompanySubmissionState state={state} kind="travel_interest" />
      </div>
    );
  return (
    <div className="mera-company-form mera-company-travel mera-identity">
      <aside className="mera-company-guide">
        <p className="mera-company-eyebrow">STAY CLOSE TO WHAT’S NEXT</p>
        <h2>Help shape the next journey.</h2>
        <p>
          MeraTravel Suite is planned. Tell us what matters to your travel
          business and register your interest.
        </p>
        <p className="mera-company-guide-note">
          This is an interest list, not a product account. There is no confirmed
          launch date or automatic email subscription.
        </p>
      </aside>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const result = travelInterestSchema.safeParse({
            ...details,
            requestKey: crypto.randomUUID(),
          });
          if (!result.success) {
            const next: Record<string, string> = {};
            for (const issue of result.error.issues)
              next[String(issue.path[0])] = issue.message;
            setErrors(next);
            e.currentTarget
              .querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)
              ?.focus();
            return;
          }
          setErrors({});
          void state.send(result.data);
        }}
      >
        <header>
          <p className="mera-company-eyebrow">MERATRAVEL SUITE · PLANNED</p>
          <h3>Register your interest</h3>
          <p>Leave a contact and, if you like, a little context.</p>
        </header>
        {state.error && (
          <p role="alert" className="mera-company-error">
            {state.error}
          </p>
        )}
        <div className="mera-company-fields">
          {(
            [
              ["name", "Your name"],
              ["email", "Email address"],
              ["company", "Company or organization"],
              ["role", "Your role"],
            ] as const
          ).map(([key, label]) => (
            <div className="mera-company-field" key={key}>
              <label htmlFor={`travel-${key}`}>
                {label}
                {["company", "role"].includes(key) && <span>Optional</span>}
              </label>
              <input
                id={`travel-${key}`}
                name={key}
                type={key === "email" ? "email" : "text"}
                autoComplete={
                  key === "name"
                    ? "name"
                    : key === "email"
                      ? "email"
                      : key === "company"
                        ? "organization"
                        : "organization-title"
                }
                value={details[key]}
                maxLength={
                  key === "email" ? 254 : key === "company" ? 120 : 100
                }
                aria-invalid={!!merged[key]}
                aria-describedby={
                  merged[key] ? `travel-${key}-error` : undefined
                }
                onChange={(e) =>
                  setDetails({ ...details, [key]: e.target.value })
                }
              />
              {merged[key] && (
                <small
                  id={`travel-${key}-error`}
                  className="mera-company-error"
                >
                  {merged[key]}
                </small>
              )}
            </div>
          ))}
          <div className="mera-company-field wide">
            <label htmlFor="travel-interest-field">
              What would be useful for your team?<span>Optional</span>
            </label>
            <textarea
              id="travel-interest-field"
              name="interest"
              rows={4}
              maxLength={2000}
              value={details.interest}
              onChange={(e) =>
                setDetails({ ...details, interest: e.target.value })
              }
            />
          </div>
          <label className="mera-company-consent wide">
            <input
              type="checkbox"
              name="privacyAcknowledged"
              checked={details.privacyAcknowledged}
              aria-invalid={!!merged.privacyAcknowledged}
              aria-describedby="travel-consent-error"
              onChange={(e) =>
                setDetails({
                  ...details,
                  privacyAcknowledged: e.target.checked,
                })
              }
            />
            <span>
              I agree that MeraTech may keep these details to review my interest
              and contact me about MeraTravel Suite.{" "}
              <a href="/mera/legal#privacy" target="_blank" rel="noopener noreferrer">Privacy information (opens in a new tab)</a>
            </span>
          </label>
          {merged.privacyAcknowledged && (
            <small
              id="travel-consent-error"
              className="mera-company-error wide"
            >
              Please acknowledge how your details will be used.
            </small>
          )}
          <div className="wide">
            <CompanyPrivacyNotice />
          </div>
        </div>
        <footer>
          <button type="submit" className="primary" disabled={state.busy}>
            Register interest
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </footer>
      </form>
    </div>
  );
}
