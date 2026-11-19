import { z } from "zod";
import { customerRequest } from "./client";
const bodySchema = z
  .object({
    requestKey: z.string().uuid(),
    category: z.enum(["service", "payment", "reservation", "other"]),
    message: z.string().min(1).max(500),
    orderId: z.string().uuid().optional(),
    visitId: z.string().uuid().optional(),
  })
  .strict()
  .refine((value) => !(value.orderId && value.visitId));
const journalSchema = z
  .object({
    version: z.literal(1),
    prefix: z.string().max(250),
    sessionRef: z.string().uuid(),
    body: bodySchema,
  })
  .strict();
const markerSchema = z
  .object({
    version: z.literal(1),
    prefix: z.string().max(250),
    sessionRef: z.string().uuid(),
    requestKey: z.string().uuid(),
    referenceOnly: z.literal(true),
  })
  .strict();
export type HelpJournal = z.infer<typeof journalSchema>;
export type HelpRecord = HelpJournal | z.infer<typeof markerSchema>;
const key = (prefix: string) => {
  if (!/^\/public\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*\/[0-9a-f-]{36}$/i.test(prefix))
    throw Error("The help request branch could not be verified.");
  return "mera:customer-help:v1:" + prefix;
};
export function readHelpJournal(prefix: string): HelpRecord | null {
  const raw = window.sessionStorage.getItem(key(prefix));
  if (raw === null) return null;
  if (new TextEncoder().encode(raw).length > 8192)
    throw Error("Saved help request is too large.");
  const value = z.union([journalSchema, markerSchema]).parse(JSON.parse(raw));
  if (value.prefix !== prefix)
    throw Error("Saved request belongs to another branch.");
  return value;
}
export function saveHelpJournal(value: HelpJournal) {
  const parsed = journalSchema.parse(value),
    raw = JSON.stringify(parsed),
    previous = readHelpJournal(value.prefix);
  if (previous && JSON.stringify(previous) !== raw)
    throw Error("The original help request still needs checking.");
  if (new TextEncoder().encode(raw).length > 8192)
    throw Error("Help request is too large.");
  window.sessionStorage.setItem(key(value.prefix), raw);
  if (window.sessionStorage.getItem(key(value.prefix)) !== raw)
    throw Error("Help request could not be saved safely.");
  return parsed;
}
export function clearHelpJournal(prefix: string, requestKey: string) {
  const previous = readHelpJournal(prefix);
  if (
    previous &&
    ("body" in previous ? previous.body.requestKey : previous.requestKey) !==
      requestKey
  )
    throw Error("A different help request still needs checking.");
  window.sessionStorage.removeItem(key(prefix));
  if (window.sessionStorage.getItem(key(prefix)) !== null)
    throw Error("The received request could not be cleared from this tab.");
}

/** Explicit session-ending privacy action. Never cancels or resolves a request. */
export async function prepareHelpSessionEnd(prefix: string) {
  const storage = window.sessionStorage,
    keys = Array.from({ length: storage.length }, (_, i) =>
      storage.key(i),
    ).filter(
      (item): item is string =>
        !!item && item.startsWith("mera:customer-help:v1:"),
    );
  if (!keys.length) return;
  const current = z
    .object({ sessionRef: z.string().uuid() })
    .parse(await customerRequest(prefix + "/guest"));
  for (const storageKey of keys) {
    const record = readHelpJournal(
      storageKey.slice("mera:customer-help:v1:".length),
    );
    if (!record || record.sessionRef !== current.sessionRef) continue;
    const marker = markerSchema.parse({
        version: 1,
        prefix: record.prefix,
        sessionRef: record.sessionRef,
        requestKey:
          "body" in record ? record.body.requestKey : record.requestKey,
        referenceOnly: true,
      }),
      raw = JSON.stringify(marker);
    storage.setItem(storageKey, raw);
    if (storage.getItem(storageKey) !== raw)
      throw Error(
        "Private help request details could not be cleared safely. This guest session has not been ended.",
      );
  }
}
