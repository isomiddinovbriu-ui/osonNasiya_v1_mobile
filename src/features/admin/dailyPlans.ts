import { apiRequest } from "./api";

export type DailyPlanPayment = {
  paymentId: string;
  customerId: string;
  mijoz_id: number;
  amount: number;
  receivedBy: string;
  paidAt: string;
  status: "active" | "voided";
};

export type DailyPlan = {
  id: string;
  regionId: string;
  ownerId: string;
  date: string;
  status: "open" | "closed";
  createdAt: string;
  closedAt: string | null;
  paymentCount: number;
  totalAmount: number;
  payments: DailyPlanPayment[];
};

export type PlanCustomer = {
  mijoz_id: number;
  name: string;
  phoneNumber: string;
  address: string | null;
  remainingBalance: number;
  assignedTo: string | null;
};

export type VoidRequest = {
  id: string;
  paymentId: string;
  customerId: string;
  mijoz_id: number;
  dailyPlanId: string;
  requestedBy: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewReason: string | null;
};

export function tashkentToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function validPlanDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isObjectId(value: string) {
  return /^[a-f\d]{24}$/i.test(value);
}

export function getDailyPlans(token: string, query = "") {
  return apiRequest<{ plans: DailyPlan[] }>(`/daily-plans${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
