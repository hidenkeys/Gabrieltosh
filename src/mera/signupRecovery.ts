export const SIGNUP_RECOVERY_KEY = "mera:signup-recovery:v1";
export type SignupMarker = {
  version: 1;
  phase: "registration" | "verification";
  status: "pending" | "verification_ready";
};
export type SignupRecovery =
  | { state: "clear" }
  | { state: "recorded"; marker: SignupMarker }
  | { state: "unavailable" | "corrupt" };
function validMarker(m: unknown): m is SignupMarker {
  if (!m || typeof m !== "object" || Reflect.ownKeys(m).length !== 3)
    return false;
  const value = m as SignupMarker;
  return (
    Object.keys(m).sort().join(",") === "phase,status,version" &&
    value.version === 1 &&
    ["registration", "verification"].includes(value.phase) &&
    ["pending", "verification_ready"].includes(value.status) &&
    !(value.status === "verification_ready" && value.phase !== "registration")
  );
}
export function readSignupRecovery(): SignupRecovery {
  try {
    const raw = window.sessionStorage.getItem(SIGNUP_RECOVERY_KEY);
    if (raw === null) return { state: "clear" };
    if (raw.length > 512) return { state: "corrupt" };
    const m = JSON.parse(raw);
    if (!validMarker(m)) return { state: "corrupt" };
    return { state: "recorded", marker: m };
  } catch {
    return { state: "unavailable" };
  }
}
const same = (a: SignupMarker, b: SignupMarker) =>
  a.version === b.version && a.phase === b.phase && a.status === b.status;
export function saveSignupRecovery(
  marker: SignupMarker,
  expected: SignupMarker | null,
): boolean {
  try {
    if (!validMarker(marker) || (expected !== null && !validMarker(expected)))
      return false;
    const previous = readSignupRecovery();
    if (
      expected
        ? previous.state !== "recorded" || !same(previous.marker, expected)
        : previous.state !== "clear"
    )
      return false;
    const raw = JSON.stringify({
      version: marker.version,
      phase: marker.phase,
      status: marker.status,
    });
    if (raw.length > 512) return false;
    window.sessionStorage.setItem(SIGNUP_RECOVERY_KEY, raw);
    return window.sessionStorage.getItem(SIGNUP_RECOVERY_KEY) === raw;
  } catch {
    return false;
  }
}
export function clearSignupRecovery(expected: SignupMarker): boolean {
  const current = readSignupRecovery();
  if (current.state !== "recorded" || !same(current.marker, expected))
    return false;
  try {
    window.sessionStorage.removeItem(SIGNUP_RECOVERY_KEY);
    return window.sessionStorage.getItem(SIGNUP_RECOVERY_KEY) === null;
  } catch {
    return false;
  }
}
export function validRegistrationAck(value: any): boolean {
  return (
    value?.status === "verification_required" &&
    value.simulation === true &&
    value.emailSent === false &&
    typeof value.verificationToken === "string" &&
    /^[a-f\d]{64}$/i.test(value.verificationToken) &&
    Number.isSafeInteger(value.expiresInSeconds) &&
    value.expiresInSeconds > 0
  );
}
export function validVerificationAck(value: any): boolean {
  return (
    value?.verifiedInDemo === true &&
    value.realEmailVerified === false &&
    value.simulation === true
  );
}
