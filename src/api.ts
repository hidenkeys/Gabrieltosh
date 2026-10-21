export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-POS-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401)
      window.dispatchEvent(new Event("pos-session-expired"));
    throw new Error(data.error || "Unable to complete the request.");
  }
  return data;
}
export const money = (n: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n / 100);
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const time = (s: string) =>
  new Date(s).toLocaleTimeString("en-GB", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    minute: "2-digit",
  });
export type User = {
  id: string;
  name: string;
  username: string;
  role: "admin" | "supervisor" | "cashier";
  active: boolean;
  local?: boolean;
};
export type Product = {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  size: string;
  available: boolean;
  label_required: boolean;
  options: boolean;
  needs_review: boolean;
};
export type Line = {
  key: string;
  productId: string;
  quantity: number;
  sweetness: string;
  ice: string;
  toppings: string[];
};
export type Order = {
  version: number;
  id: string;
  number: number;
  status: string;
  payment_status: string;
  staff_name: string;
  staff_id: string;
  subtotal: number;
  discount: number;
  discount_reason: string;
  total: number;
  payment_method: string;
  cash_tendered: number;
  paid_by_name: string;
  paid_at: string;
  created_at: string;
  note: string;
  items: any[];
};
export type Template = {
  businessName: string;
  subtitle: string;
  address: string;
  phone: string;
  footer: string;
  showStaff: boolean;
  showOptions: boolean;
  showPayment: boolean;
  showCode: boolean;
  headingSize: "small" | "large";
  align: "left" | "center";
  paperWidth: 58;
  labelWidth: number;
  labelHeight: number;
  labelShowStaff: boolean;
};

export function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
