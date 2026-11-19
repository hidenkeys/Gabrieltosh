import { z } from "zod";
import { customerRequest } from "./client";
const scope = z.object({
  version: z.literal(1),
  prefix: z.string().max(250),
  sessionRef: z.string().uuid(),
  reservationId: z.string().uuid(),
});
const journalSchema = scope
  .extend({
    body: z
      .object({
        requestKey: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .strict(),
  })
  .strict();
const markerSchema = scope
  .extend({ requestKey: z.string().uuid(), referenceOnly: z.literal(true) })
  .strict();
export type CancellationJournal = z.infer<typeof journalSchema>;
const storagePrefix = "mera:customer-cancellation:v1:";
const key = (prefix: string) => {
  if (!/^\/public\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*\/[0-9a-f-]{36}$/i.test(prefix))
    throw Error("Reservation branch could not be verified.");
  return storagePrefix + prefix;
};
export function readCancellationJournal(prefix: string) {
  const raw = window.sessionStorage.getItem(key(prefix));
  if (raw === null) return null;
  if (new TextEncoder().encode(raw).length > 8192)
    throw Error("Saved cancellation is too large.");
  const value = z.union([journalSchema, markerSchema]).parse(JSON.parse(raw));
  if (value.prefix !== prefix)
    throw Error("Saved cancellation belongs to another branch.");
  return value;
}
export function saveCancellationJournal(value: CancellationJournal) {
  const parsed = journalSchema.parse(value),
    raw = JSON.stringify(parsed),
    previous = readCancellationJournal(value.prefix);
  if (previous && JSON.stringify(previous) !== raw)
    throw Error("Check the original cancellation before requesting another.");
  if (new TextEncoder().encode(raw).length > 8192)
    throw Error("Cancellation could not be saved.");
  window.sessionStorage.setItem(key(value.prefix), raw);
  if (window.sessionStorage.getItem(key(value.prefix)) !== raw)
    throw Error("Cancellation could not be safely saved. No request was sent.");
  return parsed;
}
export function clearCancellationJournal(prefix: string, requestKey: string) {
  const old = readCancellationJournal(prefix);
  if (
    old &&
    ("body" in old ? old.body.requestKey : old.requestKey) !== requestKey
  )
    throw Error("A different cancellation still needs checking.");
  window.sessionStorage.removeItem(key(prefix));
  if (window.sessionStorage.getItem(key(prefix)) !== null)
    throw Error(
      "The received cancellation could not be cleared from this tab.",
    );
}
export async function proveCancellationSession(
  prefix: string,
  record: CancellationJournal | null,
) {
  const raw = await customerRequest(prefix + "/guest");
  const parsed = z.object({ sessionRef: z.string().uuid() }).safeParse(raw);
  if (!parsed.success)
    throw Object.assign(
      Error(
        "This guest session could not be verified. No cancellation was sent or retried. Ask staff to check it.",
      ),
      { status: 401 },
    );
  const { sessionRef } = parsed.data;
  if (record && record.sessionRef !== sessionRef)
    throw Object.assign(
      Error(
        "Your guest session changed. The original cancellation was not retried. Ask staff to check it.",
      ),
      { status: 401 },
    );
  return sessionRef;
}
export async function prepareCancellationSessionEnd(prefix: string) {
  const storage = window.sessionStorage,
    keys = Array.from({ length: storage.length }, (_, i) =>
      storage.key(i),
    ).filter(
      (item): item is string => !!item && item.startsWith(storagePrefix),
    );
  if (!keys.length) return;
  const sessionRef = await proveCancellationSession(prefix, null);
  for (const storageKey of keys) {
    const record = readCancellationJournal(
      storageKey.slice(storagePrefix.length),
    );
    if (!record || record.sessionRef !== sessionRef) continue;
    const marker = markerSchema.parse({
        version: 1,
        prefix: record.prefix,
        sessionRef,
        reservationId: record.reservationId,
        requestKey:
          "body" in record ? record.body.requestKey : record.requestKey,
        referenceOnly: true,
      }),
      raw = JSON.stringify(marker);
    storage.setItem(storageKey, raw);
    if (storage.getItem(storageKey) !== raw)
      throw Error(
        "Private cancellation details could not be cleared safely. This guest session has not been ended.",
      );
  }
}
