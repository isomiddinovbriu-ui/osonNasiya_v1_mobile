import { apiRequest } from "./api";

export type PaymentEditNotification = {
  id: string;
  type: "payment.updated";
  paymentId: string;
  customerId: string;
  mijoz_id: number;
  customerName: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  createdAt: string;
  auditId: string;
  is_read: boolean;
  readAt: string | null;
};

export type PaymentEditNotificationsResponse = {
  notifications: PaymentEditNotification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
};

export function getPaymentEditNotifications(token: string, page = 1, isRead?: boolean) {
  const query = new URLSearchParams({ page: String(page), limit: "20" });
  if (isRead !== undefined) query.set("is_read", String(isRead));
  return apiRequest<PaymentEditNotificationsResponse>(`/notifications/payment-edits?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function markPaymentEditRead(token: string, id: string) {
  return apiRequest<{ notification: PaymentEditNotification }>(`/notifications/payment-edits/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function markAllPaymentEditsRead(token: string) {
  return apiRequest<{ markedCount: number }>("/notifications/payment-edits/read-all", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
}
