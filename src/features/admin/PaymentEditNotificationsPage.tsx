import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import AuditChangeList from "./AuditChangeList";
import { formatDate } from "./customers";
import LoadingMark from "./LoadingMark";
import {
  getPaymentEditNotifications, markAllPaymentEditsRead, markPaymentEditRead,
  type PaymentEditNotification, type PaymentEditNotificationsResponse,
} from "./paymentEditNotifications";
import { deleteStoredToken, getStoredToken } from "./session";

type Filter = "all" | "unread" | "read";
type AuditEntry = { id: string; before: unknown; after: unknown };
type AuditResponse = { entries: AuditEntry[]; total: number; limit: number };
const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "Barchasi" },
  { value: "unread", label: "O‘qilmagan" },
  { value: "read", label: "O‘qilgan" },
];

export default function PaymentEditNotificationsPage() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PaymentEditNotificationsResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [auditId, setAuditId] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditEntry | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const access = await getStoredToken();
      if (!access) { router.replace("/"); return; }
      const headers = { Authorization: `Bearer ${access}` };
      const session = await apiRequest<{ user: User }>("/auth/me", { headers });
      if (session.user.role !== "super_admin") { router.replace("/"); return; }
      const data = await getPaymentEditNotifications(access, page, filter === "all" ? undefined : filter === "read");
      const lastPage = Math.max(1, Math.ceil(data.total / data.limit));
      if (page > lastPage) { setPage(lastPage); return; }
      setToken(access);
      setResult(data);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { await deleteStoredToken(); router.replace("/"); }
      else setError(cause instanceof Error ? cause.message : "Bildirishnomalar yuklanmadi.");
    } finally { setLoading(false); }
  }, [page, filter]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function markRead(item: PaymentEditNotification) {
    if (!token || busy || item.is_read) return;
    setBusy(true); setError("");
    try {
      await markPaymentEditRead(token, item.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "O‘qilgan deb belgilab bo‘lmadi.");
    } finally { setBusy(false); }
  }

  async function markAllRead() {
    if (!token || busy || !result?.unreadCount) return;
    setBusy(true); setError("");
    try {
      await markAllPaymentEditsRead(token);
      if (filter === "unread" && page !== 1) setPage(1);
      else await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Barchasini o‘qilgan deb belgilab bo‘lmadi.");
    } finally { setBusy(false); }
  }

  async function showAudit(item: PaymentEditNotification) {
    if (!token || auditLoading) return;
    if (auditId === item.auditId) { setAuditId(null); setAudit(null); return; }
    setAuditId(item.auditId); setAudit(null); setAuditError(""); setAuditLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      for (let auditPage = 1; ; auditPage++) {
        const data = await apiRequest<AuditResponse>(`/customers/${item.mijoz_id}/audit?page=${auditPage}&limit=100`, { headers });
        const match = data.entries.find((entry) => entry.id === item.auditId);
        if (match) { setAudit(match); break; }
        if (!data.entries.length || auditPage * data.limit >= data.total) {
          setAuditError("Bu audit yozuvi topilmadi."); break;
        }
      }
    } catch (cause) {
      setAuditError(cause instanceof Error ? cause.message : "Audit yozuvi yuklanmadi.");
    } finally { setAuditLoading(false); }
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;
  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 40 }]}>
    <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>‹ Bosh sahifa</Text></Pressable>
    <Text style={styles.title}>To‘lov tahriri bildirishnomalari</Text>
    <Text style={styles.muted}>O‘qilmagan: {result?.unreadCount ?? "—"}</Text>
    <View style={styles.row}>{filters.map((option) => <Pressable key={option.value} style={[styles.filter, filter === option.value && styles.selected]} onPress={() => { setFilter(option.value); setPage(1); setAuditId(null); }} accessibilityRole="radio" accessibilityState={{ selected: filter === option.value }}><Text style={styles.filterText}>{option.label}</Text></Pressable>)}</View>
    {!!result?.unreadCount && <Pressable style={[styles.action, busy && styles.disabled]} disabled={busy} onPress={() => void markAllRead()} accessibilityRole="button"><Text style={styles.actionText}>Barchasini o‘qilgan qilish</Text></Pressable>}
    {!!error && <View style={styles.card}><Text style={styles.error} accessibilityRole="alert">{error}</Text><Pressable onPress={() => void load()} accessibilityRole="button"><Text style={styles.link}>Qayta yuklash</Text></Pressable></View>}
    {loading && <View style={styles.loading}><LoadingMark size={60} /><Text style={styles.muted}>Yuklanmoqda...</Text></View>}
    {!loading && !error && result && <>
      <Text style={styles.muted}>Filtr bo‘yicha jami: {result.total}</Text>
      {result.notifications.length === 0 && <View style={styles.card}><Text style={styles.muted}>Bildirishnoma yo‘q.</Text></View>}
      {result.notifications.map((item) => <View key={item.id} style={[styles.card, !item.is_read && styles.unread]}>
        <Text style={styles.heading}>{item.customerName || `Mijoz #${item.mijoz_id}`}</Text>
        <Text style={styles.body}>To‘lov tahrirlandi · Mijoz #{item.mijoz_id}</Text>
        <Text style={styles.muted}>Kim: {item.actorName || item.actorId} · {item.actorRole}</Text>
        <Text style={styles.muted}>Qachon: {formatDate(item.createdAt)}</Text>
        <Text style={styles.muted}>Holat: {item.is_read ? "O‘qilgan" : "O‘qilmagan"}</Text>
        <View style={styles.links}>
          <Pressable onPress={() => void showAudit(item)} accessibilityRole="button"><Text style={styles.link}>{auditId === item.auditId ? "O‘zgarishni yashirish" : "Nima o‘zgarganini ko‘rish"}</Text></Pressable>
          <Pressable onPress={() => router.push({ pathname: "/customers/payments", params: { mijoz_id: String(item.mijoz_id) } })} accessibilityRole="button"><Text style={styles.link}>Mijoz to‘lovlari ›</Text></Pressable>
          {!item.is_read && <Pressable disabled={busy} onPress={() => void markRead(item)} accessibilityRole="button"><Text style={styles.link}>O‘qilgan qilish</Text></Pressable>}
        </View>
        {auditId === item.auditId && <View style={styles.audit}>
          {auditLoading && <Text style={styles.muted}>Audit yuklanmoqda...</Text>}
          {!!auditError && <Text style={styles.error}>{auditError}</Text>}
          {audit && <AuditChangeList before={audit.before} after={audit.after} />}
        </View>}
      </View>)}
      {totalPages > 1 && <View style={styles.pagination}>
        <Pressable disabled={page <= 1 || loading} onPress={() => setPage(page - 1)} accessibilityRole="button"><Text style={[styles.link, page <= 1 && styles.disabled]}>‹ Oldingi</Text></Pressable>
        <Text style={styles.muted}>{page} / {totalPages}</Text>
        <Pressable disabled={page >= totalPages || loading} onPress={() => setPage(page + 1)} accessibilityRole="button"><Text style={[styles.link, page >= totalPages && styles.disabled]}>Keyingi ›</Text></Pressable>
      </View>}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 18, gap: 13, maxWidth: 620, width: "100%", alignSelf: "center" },
  title: { color: "#172536", fontSize: 24, fontWeight: "800" },
  heading: { color: "#172536", fontSize: 17, fontWeight: "800" },
  body: { color: "#34445A", fontSize: 14 },
  muted: { color: "#627184", fontSize: 13 },
  link: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  error: { color: "#C3333D", fontSize: 14 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filter: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D7DFE8" },
  selected: { backgroundColor: "#EAF4FF", borderColor: "#1677D2" },
  filterText: { color: "#172536", fontWeight: "700" },
  action: { alignSelf: "flex-start", backgroundColor: "#1677D2", padding: 12, borderRadius: 10 },
  actionText: { color: "#FFFFFF", fontWeight: "700" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: "#E2E8F0" },
  unread: { borderColor: "#9DCAFB", backgroundColor: "#F8FBFF" },
  links: { gap: 12, paddingTop: 6 },
  audit: { gap: 6, paddingTop: 8 },
  auditLabel: { color: "#172536", fontSize: 13, fontWeight: "800" },
  snapshot: { color: "#34445A", fontSize: 12, lineHeight: 18, backgroundColor: "#F0F4F8", borderRadius: 8, padding: 10 },
  pagination: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  loading: { alignItems: "center", paddingVertical: 32 },
  disabled: { opacity: 0.4 },
});
