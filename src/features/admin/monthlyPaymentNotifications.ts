import { apiRequest } from "./api";

export type MonthlyPaymentStatus = "due" | "partial" | "paid";
export type MonthlyPaymentNotification = {
  id: string;
  type: "monthly_payment";
  month: string;
  mijoz_id: number;
  customerName: string;
  phoneNumber: string | null;
  regionId: string | null;
  assignedTo: string | null;
  dueDate: string;
  monthlyAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: MonthlyPaymentStatus;
  message: string;
};

export type MonthlyPaymentNotificationsResponse = {
  month: string;
  notifications: MonthlyPaymentNotification[];
  total: number;
  counts: Record<MonthlyPaymentStatus, number>;
  page: number;
  limit: number;
};

export function getMonthlyPaymentNotifications(token: string, filters: {
  month?: string;
  status?: MonthlyPaymentStatus | "all";
  assignedTo?: string;
  page?: number;
  limit?: number;
  q?: string;
}) {
  const { q, ...rest } = filters;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  if (q?.trim()) params.set("q", q.trim());
  const endpoint = q?.trim() ? "/notifications/monthly-payments/search" : "/notifications/monthly-payments";
  return apiRequest<MonthlyPaymentNotificationsResponse>(`${endpoint}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
