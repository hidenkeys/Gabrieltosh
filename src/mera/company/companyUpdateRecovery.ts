import { companyLeadUpdateSchema } from "../../../shared/mera-company-contracts.js";
export type CompanyUpdate = {
  id: string;
  actorId: string;
  kind: string;
  body: any;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readCompanyUpdate(
  key: string,
  actorId: string,
  kind: string,
): CompanyUpdate | null {
  const raw = sessionStorage.getItem(key);
  if (raw === null) return null;
  if (raw.length > 20000)
    throw new Error("Saved update is too large to recover safely.");
  const value = JSON.parse(raw);
  if (
    !value ||
    !uuid.test(value.id) ||
    value.actorId !== actorId ||
    value.kind !== kind ||
    !companyLeadUpdateSchema.safeParse(value.body).success
  )
    throw new Error("Saved update could not be verified.");
  return value;
}
export function persistCompanyUpdate(key: string, value: CompanyUpdate) {
  const raw = JSON.stringify(value);
  sessionStorage.setItem(key, raw);
  if (sessionStorage.getItem(key) !== raw)
    throw new Error("The update could not be preserved for recovery.");
}
export function clearCompanyUpdate(key: string, value: CompanyUpdate) {
  if (sessionStorage.getItem(key) !== JSON.stringify(value))
    throw new Error("The saved update changed. Refresh before continuing.");
  sessionStorage.removeItem(key);
  if (sessionStorage.getItem(key) !== null)
    throw new Error("The saved update could not be cleared.");
}
export function confirmedCompanyUpdate(result: any, value: CompanyUpdate) {
  return (
    !!result &&
    result.id === value.id &&
    result.version === value.body.expectedVersion + 1 &&
    result.status === value.body.status &&
    result.assignedHandlerId === value.body.assignedHandlerId &&
    result.externalDelivery === false &&
    result.followUp?.stage === value.body.followUp.stage &&
    result.followUp?.dueAt === value.body.followUp.dueAt &&
    result.followUp?.summary === value.body.followUp.summary
  );
}
