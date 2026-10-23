import type { Customer } from "./customers";

type Balance = Pick<Customer, "totalPrice" | "totalPaid" | "remainingBalance">;

const tones = {
  empty: { background: "#FFECEE", track: "#F5C8CD", fill: "#C3333D", value: "#9D2630" },
  low: { background: "#FFF2F0", track: "#F2D5D0", fill: "#DE7770", value: "#9C4C47" },
  medium: { background: "#FFF8E6", track: "#F0E1B7", fill: "#D5A02B", value: "#846210" },
  high: { background: "#EFF6FF", track: "#C9DFF7", fill: "#3489DB", value: "#1767AC" },
  near: { background: "#ECF8F7", track: "#C9E6E4", fill: "#318F97", value: "#176772" },
  paid: { background: "#E6F5EB", track: "#BFE3CD", fill: "#126B42", value: "#145C3A" },
} as const;

export function getCustomerProgress(customer: Balance) {
  const percent = customer.remainingBalance <= 0
    ? 100
    : customer.totalPrice > 0
      ? Math.min(99, Math.max(0, Math.floor(customer.totalPaid / customer.totalPrice * 100)))
      : 0;
  const tone = customer.remainingBalance <= 0
    ? tones.paid
    : percent === 0
      ? tones.empty
      : percent < 30
        ? tones.low
        : percent < 50
          ? tones.medium
          : percent < 80
            ? tones.high
            : tones.near;
  return { percent, tone };
}
