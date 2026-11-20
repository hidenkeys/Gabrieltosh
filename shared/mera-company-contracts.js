import { z } from "zod";

export const companyDocumentLimit = 524288;
export const companyDocumentCount = 3;
export const companyDocumentMimes = [
  "application/pdf",
  "text/plain",
  "image/png",
  "image/jpeg",
];
export const companyLeadStatuses = [
  "received",
  "reviewing",
  "discovery",
  "proposal",
  "closed",
];
export const companyBudgetRanges = [
  "not_sure",
  "under_1m",
  "1m_5m",
  "5m_15m",
  "over_15m",
];
export const companyBudgetLabels = {
  not_sure: "Not sure yet",
  under_1m: "Under NGN 1 million",
  "1m_5m": "NGN 1–5 million",
  "5m_15m": "NGN 5–15 million",
  over_15m: "Over NGN 15 million",
};
const textField = (message) =>
  z.string({ required_error: message, invalid_type_error: message });

export const companyDocumentSchema = z
  .object({
    filename: textField("Choose a document with a filename.")
      .trim()
      .min(1, "Choose a document with a filename.")
      .max(100, "Keep the filename to 100 characters or fewer.")
      .regex(
        /^[\p{L}\p{N} ._()-]+$/u,
        "Use a filename containing letters, numbers, spaces, dots, brackets or dashes.",
      ),
    mime: z.enum(companyDocumentMimes, {
      errorMap: () => ({ message: "Choose a PDF, TXT, PNG or JPEG document." }),
    }),
    data: textField("The document could not be read. Select it again.")
      .min(4, "The document could not be read. Select it again.")
      .max(699052, "Choose a smaller document, up to 512 KB.")
      .regex(
        /^[A-Za-z0-9+/]+={0,2}$/,
        "The document could not be read. Select it again.",
      ),
  })
  .strict();
const contact = {
  requestKey: z.string().uuid(),
  name: textField("Enter your name.")
    .trim()
    .min(1, "Enter your name.")
    .max(100, "Keep your name to 100 characters or fewer."),
  email: textField("Enter a valid email address, such as name@example.com.")
    .trim()
    .email("Enter a valid email address, such as name@example.com.")
    .max(254, "Keep your email address to 254 characters or fewer.")
    .transform((v) => v.toLowerCase()),
  privacyAcknowledged: z.literal(true, {
    errorMap: () => ({
      message:
        "Please acknowledge how your details will be used before submitting.",
    }),
  }),
};
export const consultancyEnquirySchema = z
  .object({
    ...contact,
    company: textField("Enter your company or business name.")
      .trim()
      .min(1, "Enter your company or business name.")
      .max(120, "Keep the company name to 120 characters or fewer."),
    phone: textField("Enter a phone number or leave this field blank.")
      .trim()
      .max(40, "Keep the phone number to 40 characters or fewer.")
      .optional()
      .default(""),
    problem: textField("Briefly describe the problem you want to solve.")
      .trim()
      .min(20, "Briefly describe the problem in at least 20 characters.")
      .max(4000, "Keep the problem description to 4,000 characters or fewer."),
    intendedUsers: textField("Tell us who will use the software.")
      .trim()
      .min(3, "Tell us who will use the software, using at least 3 characters.")
      .max(
        1500,
        "Keep the intended users description to 1,500 characters or fewer.",
      ),
    capabilities: textField("Describe the capabilities you need.")
      .trim()
      .min(10, "Describe the capabilities you need in at least 10 characters.")
      .max(
        4000,
        "Keep the capabilities description to 4,000 characters or fewer.",
      ),
    projectType: z.enum(["new_build", "existing_system"], {
      errorMap: () => ({
        message: "Choose a new build or work on an existing system.",
      }),
    }),
    budgetRange: z.enum(companyBudgetRanges, {
      errorMap: () => ({
        message: "Choose a budget range, or select Not sure yet.",
      }),
    }),
    timeline: textField(
      "Tell us your preferred timeline, or enter Not sure yet.",
    )
      .trim()
      .min(3, "Tell us your preferred timeline, or enter Not sure yet.")
      .max(200, "Keep the timeline to 200 characters or fewer."),
    documents: z
      .array(companyDocumentSchema)
      .max(companyDocumentCount, "Choose up to 3 supporting documents.")
      .default([]),
  })
  .strict();
export const travelInterestSchema = z
  .object({
    ...contact,
    company: textField("Enter a company name or leave this field blank.")
      .trim()
      .max(120, "Keep the company name to 120 characters or fewer.")
      .optional()
      .default(""),
    role: textField("Enter your role or leave this field blank.")
      .trim()
      .max(100, "Keep your role to 100 characters or fewer.")
      .optional()
      .default(""),
    interest: textField("Describe your interest or leave this field blank.")
      .trim()
      .max(2000, "Keep your interest description to 2,000 characters or fewer.")
      .optional()
      .default(""),
  })
  .strict();
export const companyAcknowledgementSchema = z
  .object({
    kind: z.enum(["consultancy", "travel_interest"]),
    reference: z.string().regex(/^(ENQ|TRV)-[A-F0-9]{12}$/),
    status: z.literal("received"),
    externalDelivery: z.literal(false),
    emailDelivery: z.literal("not_sent"),
    receivedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((v, c) => {
    if (!v.reference.startsWith(v.kind === "consultancy" ? "ENQ-" : "TRV-"))
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reference"],
        message: "Reference does not match this submission.",
      });
  });
export const companyLeadUpdateSchema = z
  .object({
    requestKey: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    status: z.enum(companyLeadStatuses),
    assignedHandlerId: z.string().uuid().nullable(),
    internalNote: z.string().trim().max(2000).default(""),
    followUp: z
      .object({
        stage: z.enum(["none", "discovery", "proposal"]),
        dueAt: z.string().datetime().nullable(),
        summary: z.string().trim().max(1000),
      })
      .strict(),
  })
  .strict();
