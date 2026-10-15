export type CustomerPayment = {
  id: string;
  type: "initial" | "installment";
  amount: number;
  method: PaymentMethod;
  receivedBy: string;
  paidAt: string;
};

export type PaymentMethod = "cash" | "transfer";

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
  return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so‘m`;
}

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("uz-UZ");
}
