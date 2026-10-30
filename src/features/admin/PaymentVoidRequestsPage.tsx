import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import { formatDate } from "./customers";
import { type VoidRequest } from "./dailyPlans";
import { deleteStoredToken, getStoredToken } from "./session";

type Status = VoidRequest["status"];
const statuses: { value: Status; label: string }[] = [
  { value: "pending", label: "Kutilmoqda" },
  { value: "approved", label: "Tasdiqlangan" },
  { value: "rejected", label: "Rad etilgan" },
];

export default function PaymentVoidRequestsPage() {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("pending");
  const [requests, setRequests] = useState<VoidRequest[]>([]);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [approveId, setApproveId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const access = await getStoredToken();
      if (!access) { router.replace("/"); return; }
      const headers = { Authorization: `Bearer ${access}` };
      const session = await apiRequest<{ user: User }>("/auth/me", { headers });
      if (session.user.role !== "super_admin") { router.replace("/"); return; }
      const result = await apiRequest<{ requests: VoidRequest[] }>(`/payment-void-requests?status=${status}`, { headers });
      setToken(access); setRequests(result.requests);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { await deleteStoredToken(); router.replace("/"); }
      else setError(cause instanceof Error ? cause.message : "So‘rovlar yuklanmadi.");
    } finally { setLoading(false); }
  }, [status]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function review(item: VoidRequest, action: "approve" | "reject") {
    if (!token || busyId) return;
    if (action === "reject" && (!reason.trim() || reason.trim().length > 500)) {
      setError("Rad etish sababini 1–500 belgida kiriting."); return;
    }
    setBusyId(item.id); setError("");
    try {
      await apiRequest(`/payment-void-requests/${item.id}/${action}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
        ...(action === "reject" ? { body: JSON.stringify({ reason: reason.trim() }) } : {}),
      });
      setRequests((current) => current.filter((request) => request.id !== item.id));
      setRejectId(null); setApproveId(null); setReason("");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { await deleteStoredToken(); router.replace("/"); }
      else setError(cause instanceof Error ? cause.message : "So‘rov ko‘rib chiqilmadi.");
    } finally { setBusyId(null); }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
    <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>‹ Bosh sahifa</Text></Pressable>
    <Text style={styles.title}>To‘lovni bekor qilish so‘rovlari</Text>
    <View style={styles.row}>{statuses.map((item) => <Pressable key={item.value} style={[styles.filter, status === item.value && styles.selected]} onPress={() => { setStatus(item.value); setRejectId(null); setApproveId(null); }} accessibilityRole="radio" accessibilityState={{ selected: status === item.value }}><Text style={styles.filterText}>{item.label}</Text></Pressable>)}</View>
    {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    {loading && <Text style={styles.muted}>Yuklanmoqda...</Text>}
    {!loading && requests.length === 0 && <Text style={styles.muted}>Bu holatda so‘rov yo‘q.</Text>}
    {requests.map((item) => <View key={item.id} style={styles.card}>
      <Text style={styles.heading}>Mijoz #{item.mijoz_id}</Text>
      <Text style={styles.muted}>To‘lov: {item.paymentId}</Text>
      <Text style={styles.muted}>Reja: {item.dailyPlanId}</Text>
      <Text style={styles.muted}>Yuborgan xodim: {item.requestedBy}</Text>
      <Text style={styles.body}>Sabab: {item.reason}</Text>
      <Text style={styles.muted}>{formatDate(item.createdAt)}</Text>
      {!!item.reviewReason && <Text style={styles.body}>Ko‘rib chiqish sababi: {item.reviewReason}</Text>}
      <Pressable onPress={() => router.push({ pathname: "/customers/payments", params: { mijoz_id: String(item.mijoz_id) } })} accessibilityRole="button"><Text style={styles.link}>Mijoz to‘lovlarini ko‘rish ›</Text></Pressable>
      {status === "pending" && <>
        <View style={styles.row}>
          <Pressable style={styles.approve} disabled={!!busyId} onPress={() => { setApproveId(approveId === item.id ? null : item.id); setRejectId(null); }} accessibilityRole="button"><Text style={styles.actionText}>Tasdiqlash</Text></Pressable>
          <Pressable style={styles.reject} disabled={!!busyId} onPress={() => { setRejectId(rejectId === item.id ? null : item.id); setApproveId(null); setReason(""); }} accessibilityRole="button"><Text style={styles.actionText}>Rad etish</Text></Pressable>
        </View>
        {approveId === item.id && <View style={styles.rejectForm}>
          <Text style={styles.body}>Tasdiqlansa, to‘lov bekor qilinadi va mijoz qarzi qayta oshadi.</Text>
          <Pressable style={styles.approve} disabled={!!busyId} onPress={() => void review(item, "approve")} accessibilityRole="button"><Text style={styles.actionText}>{busyId === item.id ? "Saqlanmoqda..." : "To‘lovni bekor qilishni tasdiqlash"}</Text></Pressable>
        </View>}
        {rejectId === item.id && <View style={styles.rejectForm}>
          <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Rad etish sababi" multiline maxLength={500} accessibilityLabel="Rad etish sababi" />
          <Pressable style={styles.reject} disabled={!!busyId} onPress={() => void review(item, "reject")} accessibilityRole="button"><Text style={styles.actionText}>Rad etishni tasdiqlash</Text></Pressable>
        </View>}
      </>}
    </View>)}
    {!!error && <Pressable onPress={() => void load()} accessibilityRole="button"><Text style={styles.link}>Qayta yuklash</Text></Pressable>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 20, gap: 14, maxWidth: 620, width: "100%", alignSelf: "center" },
  title: { color: "#172536", fontSize: 24, fontWeight: "800" },
  heading: { color: "#172536", fontSize: 17, fontWeight: "700" },
  body: { color: "#172536", fontSize: 14 },
  muted: { color: "#627184", fontSize: 13 },
  link: { color: "#1677D2", fontWeight: "700" }, error: { color: "#C3333D" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filter: { borderWidth: 1, borderColor: "#D7DFE8", backgroundColor: "#FFFFFF", borderRadius: 10, padding: 10 },
  selected: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  filterText: { color: "#172536", fontWeight: "700" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, gap: 9, borderWidth: 1, borderColor: "#E2E8F0" },
  approve: { backgroundColor: "#167A4A", padding: 12, borderRadius: 10 },
  reject: { backgroundColor: "#C3333D", padding: 12, borderRadius: 10 },
  actionText: { color: "#FFFFFF", fontWeight: "700" },
  rejectForm: { gap: 8 },
  input: { minHeight: 54, borderColor: "#D7DFE8", borderWidth: 1, borderRadius: 10, padding: 10 },
});
