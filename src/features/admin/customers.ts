export type CustomerPayment = {
  id: string;
  paymentId: string;
  type: "initial" | "installment";
  amount: number;
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
  voidReason: string | null;
};

export type PaymentMethod = "cash" | "transfer" | "card" | "payment_app";

export type Customer = {
  mijoz_id: number;
  name: string;
  phoneNumber: string;
  addPhoneNumber: string | null;
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

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("uz-UZ");
}

export function validPaymentMonth(value: string) {
  return /^(?!0000)\d{4}-(?:0[1-9]|1[0-2])$/.test(value);
}
