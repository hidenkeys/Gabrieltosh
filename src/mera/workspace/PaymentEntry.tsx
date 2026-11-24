import MoneyInput from "../ui/MoneyInput";
import Chips from "../ui/Chips";
import { formatMoney } from "./api";
export default function PaymentEntry({
  order,
  method,
  amount,
  tender,
  onChange,
}: {
  order: any;
  method: string;
  amount: string;
  tender: string;
  onChange: (patch: { amount?: string; cashTender?: string }) => void;
}) {
  const due = order
    ? Math.max(
        0,
        order.outstandingBalance ??
          order.total - (order.effectivePaid ?? order.paid ?? 0),
      )
    : 0;
  const cash = method === "cash",
    received = Math.round(Number(amount || 0) * 100),
    handed = Math.round(Number(tender || 0) * 100);
  return (
    <div className="mi-control mw-payment-entry">
      <MoneyInput
        label="Amount received (naira)"
        value={amount}
        onChange={(value) => onChange({ amount: value })}
        required
        min={0.01}
        max={order ? due / 100 : undefined}
      />
      {order && (
        <>
          <Chips
            label="Quick amount"
            value={
              received !== due
                ? ""
                : cash
                  ? String(handed || due)
                  : String(due)
            }
            onChange={(value) => {
              const selected = Number(value);
              onChange({
                amount: String(due / 100),
                cashTender: cash ? String(selected / 100) : "",
              });
            }}
            options={[
              { value: String(due), label: "Exact amount" },
              ...(cash
                ? [
                    {
                      value: String((Math.floor(due / 50000) + 1) * 50000),
                      label: `Next ₦500 · ${formatMoney((Math.floor(due / 50000) + 1) * 50000)}`,
                    },
                    {
                      value: String((Math.floor(due / 100000) + 1) * 100000),
                      label: `Next ₦1,000 · ${formatMoney((Math.floor(due / 100000) + 1) * 100000)}`,
                    },
                  ]
                : []),
            ].filter(
              // Two rounding chips can land on the same note (₦6,500 → ₦7,000); show it once.
              (option, index, all) =>
                all.findIndex((other) => other.value === option.value) === index,
            )}
          />
          <p>
            Outstanding {formatMoney(due)}. Only the amount received against
            this order is recorded.
          </p>
        </>
      )}
      {cash && (
        <>
          <MoneyInput
            label="Cash handed over (naira, optional)"
            value={tender}
            onChange={(value) => onChange({ cashTender: value })}
            min={Number(amount || 0)}
          />
          <p aria-live="polite">
            Change due{" "}
            <strong>{formatMoney(Math.max(0, handed - received))}</strong>
          </p>
          {tender && handed < received && (
            <p role="alert">
              Cash handed over is less than the amount being recorded.
            </p>
          )}
        </>
      )}
    </div>
  );
}
