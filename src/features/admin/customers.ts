export type CustomerPayment = {
  id: string;
  paymentId: string;
  dailyPlanId?: string | null;
  allocations?: unknown[];
  type: "initial" | "installment";
  amount: number;
  remainingBalanceAfter: number | null;
  method: PaymentMethod;
  receivedBy: string;
  paidAt: string;
  forMonth: string | null;
  cardLast4: string | null;
  provider: string | null;
  providerName: string | null;
  status: "active" | "voided";
  voidedAt: string | null;
  voidedBy: string | null;
  voidedByName?: string | null;
  voidReason: string | null;
};

export type PaymentMethod = "cash" | "transfer" | "card" | "payment_app";

export type Customer = {
  mijoz_id: number;
  name: string;
  phoneNumber: string;
  addPhoneNumber: string | null;
  address: string | null;
  assignedTo: string | null;
  productName: string;
  groupId: string | null;
  sectionId: string | null;
  productId: string | null;
  regionId: string;
  lat: number | null;
  long: number | null;
  totalPrice: number;
  downPayment: number;
  termMonths: number;
  totalPaid: number;
  remainingBalance: number;
  description?: string;
  payments: CustomerPayment[];
  createdBy: string;
  createdByRole: "super_admin" | "sotuvchi" | "yiguvchi";
  createdAt: string;
};

export type CustomerListResponse = {
  customers: Customer[];
  total: number;
  page: number;
  limit: number;
};

export function formatMoney(value: number) {
  return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
}

const monthNames = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  // Use Uzbekistan's fixed UTC+5 time, regardless of the device time zone.
  const tashkent = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  const time = `${String(tashkent.getUTCHours()).padStart(2, "0")}:${String(tashkent.getUTCMinutes()).padStart(2, "0")}`;
  return `${tashkent.getUTCDate()}-${monthNames[tashkent.getUTCMonth()]}, ${tashkent.getUTCFullYear()} yil, ${time}`;
}

export function validPaymentMonth(value: string) {
  return /^(?!0000)\d{4}-(?:0[1-9]|1[0-2])$/.test(value);
}
