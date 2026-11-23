import ChoiceField from "../ui/ChoiceField";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Paperclip, X } from "lucide-react";
import {
  consultancyEnquirySchema,
  companyBudgetLabels,
  companyBudgetRanges,
  companyDocumentLimit,
  companyDocumentMimes,
} from "../../../shared/mera-company-contracts.js";
import {
  CompanyPrivacyNotice,
  CompanySubmissionState,
  useCompanySubmission,
} from "./CompanySubmission";
import { decodedSize, type CompanyDocument } from "./submissionRecovery";
const groups = [
  ["name", "company", "email", "phone"],
  [
    "problem",
    "intendedUsers",
    "capabilities",
    "projectType",
    "budgetRange",
    "timeline",
  ],
  ["privacyAcknowledged", "documents"],
];
const titles = [
  "A little about you",
  "What should we build?",
  "Review your brief",
];
export default function ProjectBrief() {
  const state = useCompanySubmission("consultancy");
  const [step, setStep] = useState(0),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [reading, setReading] = useState(false);
  const [details, setDetails] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    problem: "",
    intendedUsers: "",
    capabilities: "",
    projectType: "new_build",
    budgetRange: "not_sure",
    timeline: "",
    privacyAcknowledged: false,
  });
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const form = useRef<HTMLFormElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const merged = { ...state.fieldErrors, ...errors };
  function move(next: number) {
    setStep(next);
    setErrors({});
    requestAnimationFrame(() => heading.current?.focus());
  }
  function validate(all = false) {
    const result = consultancyEnquirySchema.safeParse({
      ...details,
      documents,
      requestKey: crypto.randomUUID(),
    });
    const next: Record<string, string> = {};
    if (!result.success)
      for (const issue of result.error.issues) {
        const key = String(issue.path[0]);
        if (all || groups[step].includes(key)) next[key] = issue.message;
      }
    setErrors(next);
    if (Object.keys(next).length) {
      const first = Object.keys(next)[0];
      if (all) setStep(groups.findIndex((group) => group.includes(first)));
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(),
      );
      return null;
    }
    return result.success ? result.data : {};
  }
  function field(
    name: keyof typeof details,
    label: string,
    multiline = false,
    optional = false,
  ) {
    const id = `brief-${name}`,
      error = merged[name];
    return (
      <div className={`mera-company-field ${multiline ? "wide" : ""}`}>
        <label htmlFor={id}>
          {label}
          {optional && <span>Optional</span>}
        </label>
        {multiline ? (
          <textarea
            id={id}
            name={name}
            rows={name === "intendedUsers" ? 2 : 3}
            value={String(details[name])}
            maxLength={name === "intendedUsers" ? 1500 : 4000}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => setDetails({ ...details, [name]: e.target.value })}
          />
        ) : (
          <input
            id={id}
            name={name}
            inputMode={name === "phone" ? "tel" : undefined}
            type={
              name === "email" ? "email" : name === "phone" ? "tel" : "text"
            }
            autoComplete={
              name === "name"
                ? "name"
                : name === "company"
                  ? "organization"
                  : name === "email"
                    ? "email"
                    : name === "phone"
                      ? "tel"
                      : "off"
            }
            maxLength={
              name === "email"
                ? 254
                : name === "phone"
                  ? 40
                  : name === "timeline"
                    ? 200
                    : 120
            }
            value={String(details[name])}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => setDetails({ ...details, [name]: e.target.value })}
          />
        )}{" "}
        {error && (
          <small id={`${id}-error`} className="mera-company-error">
            {error}
          </small>
        )}
      </div>
    );
  }
  async function attach(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (
      selected.length + documents.length > 3 ||
      selected.reduce((n, f) => n + f.size, 0) +
        documents.reduce((n, f) => n + decodedSize(f), 0) >
        companyDocumentLimit
    ) {
      setErrors({
        ...errors,
        documents: "Choose up to 3 documents, no more than 512 KB in total.",
      });
      return;
    }
    if (selected.some((f) => !companyDocumentMimes.includes(f.type))) {
      setErrors({
        ...errors,
        documents: "Use PDF, plain text, PNG or JPEG files.",
      });
      return;
    }
    setReading(true);
    try {
      const additions = await Promise.all(
        selected.map(async (file) => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          return { filename: file.name, mime: file.type, data: btoa(binary) };
        }),
      );
      setDocuments((current) => [...current, ...additions]);
      setErrors({ ...errors, documents: "" });
    } catch {
      setErrors({
        ...errors,
        documents: "This file could not be read. Please select it again.",
      });
    } finally {
      setReading(false);
    }
  }
  if (state.pending || state.receipt || state.blocked)
    return (
      <div className="mera-company-form mera-identity">
        <CompanySubmissionState state={state} kind="consultancy" />
      </div>
    );
  return (
    <div className="mera-company-form mera-identity">
      <aside className="mera-company-guide">
        <p className="mera-company-eyebrow">START A CONVERSATION</p>
        <h2>
          A clear brief.
          <br />A considered next step.
        </h2>
        <p>
          Tell us what your business needs. We’ll keep the details together for
          the team to review.
        </p>
        <ol aria-label="Project brief progress">
          {titles.map((title, index) => (
            <li key={title} aria-current={index === step ? "step" : undefined}>
              <span>
                {index < step ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </span>
              <div>
                {title}
                <small>
                  {
                    [
                      "Contact details",
                      "Goals, scope and timing",
                      "Documents and consent",
                    ][index]
                  }
                </small>
              </div>
            </li>
          ))}
        </ol>
        <p className="mera-company-guide-note">
          Submitting a brief starts an enquiry. Scope, price and delivery are
          agreed separately.
        </p>
      </aside>
      <form
        ref={form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 2) {
            if (validate()) move(step + 1);
          } else {
            const body = validate(true);
            if (body) void state.send(body);
          }
        }}
      >
        <header>
          <p className="mera-company-eyebrow">Step {step + 1} of 3</p>
          <h3 ref={heading} tabIndex={-1}>
            {titles[step]}
          </h3>
          <p>
            {
              [
                "Who should we speak with about this project?",
                "A few specifics help us understand the work. Estimates are welcome.",
                "Check the details, then add any useful context.",
              ][step]
            }
          </p>
        </header>
        {state.error && (
          <p role="alert" className="mera-company-error">
            {state.error}
          </p>
        )}
        <div key={step} className="mera-company-fields">
          {step === 0 && (
            <>
              {field("name", "Your name")}
              {field("company", "Company or organization")}
              {field("email", "Work email")}
              {field("phone", "Phone number", false, true)}
            </>
          )}
          {step === 1 && (
            <>
              {field("problem", "What problem are you trying to solve?", true)}
              {field("intendedUsers", "Who will use it?", true)}
              {field(
                "capabilities",
                "What should the system be able to do?",
                true,
              )}
              <div className="mera-company-field">
                <ChoiceField
                  label={<>Starting point</>}
                  id="brief-projectType"
                  name="projectType"
                  value={details.projectType}
                  onChange={(nextValue) =>
                    setDetails({ ...details, projectType: nextValue })
                  }
                >
                  <option value="new_build">A new system</option>
                  <option value="existing_system">
                    Improve an existing system
                  </option>
                </ChoiceField>
              </div>
              <div className="mera-company-field">
                <ChoiceField
                  label={<>Indicative budget</>}
                  id="brief-budgetRange"
                  name="budgetRange"
                  value={details.budgetRange}
                  onChange={(nextValue) =>
                    setDetails({ ...details, budgetRange: nextValue })
                  }
                >
                  {companyBudgetRanges.map((value) => (
                    <option value={value} key={value}>
                      {companyBudgetLabels[value]}
                    </option>
                  ))}
                </ChoiceField>
                <small>A planning range, not a quoted price.</small>
              </div>
              {field("timeline", "Your preferred timeline")}
            </>
          )}
          {step === 2 && (
            <>
              <dl className="mera-company-review wide">
                <div>
                  <dt>Contact</dt>
                  <dd>
                    {details.name} · {details.company}
                    <br />
                    {details.email}
                    {details.phone && (
                      <>
                        <br />
                        {details.phone}
                      </>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>The problem</dt>
                  <dd>{details.problem}</dd>
                </div>
                <div>
                  <dt>People and capabilities</dt>
                  <dd>
                    {details.intendedUsers}
                    <br />
                    {details.capabilities}
                  </dd>
                </div>
                <div>
                  <dt>Scope and timing</dt>
                  <dd>
                    {details.projectType === "new_build"
                      ? "New system"
                      : "Existing system"}{" "}
                    · {companyBudgetLabels[details.budgetRange]}
                    <br />
                    {details.timeline}
                  </dd>
                </div>
              </dl>
              <div className="mera-company-field wide">
                <label htmlFor="brief-documents">
                  <Paperclip size={16} aria-hidden="true" />
                  Supporting documents<span>Optional</span>
                </label>
                <p id="brief-documents-help">
                  Up to 3 files, 512 KB combined. PDF, TXT, PNG or JPEG.
                  Documents are private to authorized MeraTech reviewers.
                </p>
                <input
                  id="brief-documents"
                  name="documents"
                  type="file"
                  multiple
                  accept=".pdf,.txt,.png,.jpg,.jpeg"
                  disabled={reading}
                  aria-describedby="brief-documents-help brief-documents-error"
                  aria-invalid={!!merged.documents}
                  onChange={(e) => {
                    void attach(e.target.files);
                    e.target.value = "";
                  }}
                />
                {reading && (
                  <small role="status">Reading selected files…</small>
                )}
                <small
                  id="brief-documents-error"
                  className="mera-company-error"
                >
                  {merged.documents}
                </small>
                <ul className="mera-company-files">
                  {documents.map((file, index) => (
                    <li key={`${file.filename}-${index}`}>
                      <span>{file.filename}</span>
                      <button
                        type="button"
                        disabled={reading}
                        aria-label={`Remove ${file.filename}`}
                        onClick={() =>
                          setDocuments(documents.filter((_, i) => i !== index))
                        }
                      >
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <label className="mera-company-consent wide">
                <input
                  name="privacyAcknowledged"
                  type="checkbox"
                  checked={details.privacyAcknowledged}
                  aria-invalid={!!merged.privacyAcknowledged}
                  aria-describedby="brief-consent-error"
                  onChange={(e) =>
                    setDetails({
                      ...details,
                      privacyAcknowledged: e.target.checked,
                    })
                  }
                />
                <span>
                  I agree that MeraTech may use these details and documents to
                  review my enquiry and contact me about it.{" "}
                  <a
                    href="/mera/legal#privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Privacy information (opens in a new tab)
                  </a>
                </span>
              </label>
              {merged.privacyAcknowledged && (
                <small
                  id="brief-consent-error"
                  className="mera-company-error wide"
                >
                  Please acknowledge how your details will be used.
                </small>
              )}
              <div className="wide">
                <CompanyPrivacyNotice />
              </div>
            </>
          )}
        </div>
        <footer>
          {step > 0 && (
            <button
              type="button"
              className="secondary"
              onClick={() => move(step - 1)}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back
            </button>
          )}
          <button
            type="submit"
            className="primary"
            disabled={reading || state.busy}
          >
            {step === 2 ? "Send project brief" : "Continue"}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </footer>
      </form>
    </div>
  );
}
