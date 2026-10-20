import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import { formatMoney } from "./customers";
import { deleteStoredToken, getStoredToken } from "./session";
import StaffFilterPicker from "./StaffFilterPicker";

type Bucket = "today_due" | "overdue_1_7" | "overdue_8_30" | "overdue_31_plus" | "never_paid";
type WorkItem = {
  mijoz_id: number;
  name: string;
  phoneNumber: string;
  addPhoneNumber: string | null;
  address: string | null;
  assignedTo: string | null;
  remainingBalance: number;
  dueDate: string;
  daysOverdue: number;
  dueAmount: number;
  noInstallmentPaid: boolean;
};
type WorklistResponse = {
  asOfDate: string;
  bucket: Bucket;
  customers: WorkItem[];
  total: number;
  page: number;
  limit: number;
};

const buckets: { id: Bucket; title: string }[] = [
  { id: "today_due", title: "Bugun muddati" },
  { id: "overdue_1_7", title: "1–7 kun kechikkan" },
  { id: "overdue_8_30", title: "8–30 kun kechikkan" },
  { id: "overdue_31_plus", title: "31+ kun kechikkan" },
  { id: "never_paid", title: "Hali to‘lamagan" },
];
const pageSize = 20;

export default function CollectionsWorklistPage() {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<User["role"] | null>(null);
  const [bucket, setBucket] = useState<Bucket>("today_due");
  const [assignedTo, setAssignedTo] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<WorklistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const expire = useCallback(async () => {
    await deleteStoredToken();
    router.replace("/");
  }, []);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const stored = await getStoredToken();
        if (!stored) { router.replace("/"); return; }
        const session = await apiRequest<{ user: User }>("/auth/me", { headers: { Authorization: `Bearer ${stored}` } });
        if (session.user.role !== "super_admin" && session.user.role !== "yiguvchi") { router.replace("/"); return; }
        if (active) { setToken(stored); setRole(session.user.role); }
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) await expire();
        else if (active) setError(cause instanceof Error ? cause.message : "Ish ro‘yxati ochilmadi.");
      } finally { if (active) setLoading(false); }
    }
    void checkSession();
    return () => { active = false; };
  }, [expire]);

  const load = useCallback(async () => {
    if (!token) return;
    const current = ++requestId.current;
    setLoading(true); setError("");
    try {
      const query = `bucket=${bucket}&page=${page}&limit=${pageSize}${role === "super_admin" && assignedTo ? `&assignedTo=${encodeURIComponent(assignedTo)}` : ""}`;
      const data = await apiRequest<WorklistResponse>(`/collections/worklist?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (current === requestId.current) setResult(data);
    } catch (cause) {
      if (current !== requestId.current) return;
      if (cause instanceof ApiError && cause.status === 401) await expire();
      else setError(cause instanceof Error ? cause.message : "Ish ro‘yxati yuklanmadi.");
    } finally { if (current === requestId.current) setLoading(false); }
  }, [token, role, bucket, assignedTo, page, expire]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]));

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;

  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}>
    <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>‹ Bosh sahifa</Text></Pressable>
    <Text style={styles.title}>Undiruv ish ro‘yxati</Text>
    <Text style={styles.muted}>Muddati kelgan mijozlarni ko‘ring va aloqani qayd eting.</Text>
    <View style={styles.buckets}>
      {buckets.map((option) => <Pressable key={option.id} style={[styles.bucket, bucket === option.id && styles.bucketSelected]}
        onPress={() => { setBucket(option.id); setPage(1); }} accessibilityRole="radio" accessibilityState={{ selected: bucket === option.id }}>
        <Text style={[styles.bucketText, bucket === option.id && styles.bucketTextSelected]}>{option.title}</Text>
      </Pressable>)}
    </View>
    {role === "super_admin" && token && <StaffFilterPicker token={token} value={assignedTo}
      onChange={(value) => { setAssignedTo(value); setPage(1); }} onSessionExpired={expire}
      label="Mas’ul xodim" allowedRoles={["sotuvchi", "yiguvchi"]} />}
    {!!error && <View style={styles.errorBox}>
      <Text style={styles.error} accessibilityRole="alert">{error}</Text>
      {!!token && <Pressable onPress={() => void load()} accessibilityRole="button"><Text style={styles.link}>Qayta yuklash</Text></Pressable>}
    </View>}
    {loading && <Text style={styles.muted}>Yuklanmoqda...</Text>}
    {!loading && !error && result && <>
      <Text style={styles.muted}>{result.asOfDate} holatiga · {result.total} ta mijoz</Text>
      {result.customers.length === 0 && <Text style={styles.muted}>Bu toifada mijoz yo‘q.</Text>}
      {result.customers.map((item) => <View key={item.mijoz_id} style={styles.card}>
        <Pressable onPress={() => router.push({ pathname: "/customers/detail", params: { mijoz_id: String(item.mijoz_id) } })} accessibilityRole="button">
          <View style={styles.row}><Text style={styles.name}>{item.name}</Text><Text style={styles.link}>›</Text></View>
          <Text style={styles.body}>{item.phoneNumber}</Text>
          {!!item.addPhoneNumber && <Text style={styles.muted}>Qo‘shimcha: {item.addPhoneNumber}</Text>}
          {!!item.address && <Text style={styles.muted}>{item.address}</Text>}
          <Text style={styles.body}>Eng eski muddat: {item.dueDate}</Text>
          <Text style={styles.body}>Kechikish: {item.daysOverdue} kun</Text>
          <Text style={styles.amount}>Bugungacha to‘lanmagan: {formatMoney(item.dueAmount)}</Text>
          <Text style={styles.muted}>Qolgan qarz: {formatMoney(item.remainingBalance)}</Text>
          {item.noInstallmentPaid && <Text style={styles.note}>Hali birorta bo‘lib to‘lash qilinmagan</Text>}
        </Pressable>
        <Pressable style={styles.contactButton} onPress={() => router.push({ pathname: "/customers/contacts", params: { mijoz_id: String(item.mijoz_id) } })} accessibilityRole="button">
          <Text style={styles.contactButtonText}>Aloqa qayd etish</Text>
        </Pressable>
      </View>)}
      {totalPages > 1 && <View style={styles.row}>
        <Pressable disabled={page <= 1} onPress={() => setPage((current) => current - 1)} accessibilityRole="button"><Text style={styles.link}>‹ Oldingi</Text></Pressable>
        <Text style={styles.muted}>{page} / {totalPages}</Text>
        <Pressable disabled={page >= totalPages} onPress={() => setPage((current) => current + 1)} accessibilityRole="button"><Text style={styles.link}>Keyingi ›</Text></Pressable>
      </View>}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 20, gap: 14, maxWidth: 620, width: "100%", alignSelf: "center" },
  link: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  title: { color: "#172536", fontSize: 25, fontWeight: "800" },
  muted: { color: "#627184", fontSize: 13, lineHeight: 19 },
  error: { color: "#C3333D", fontSize: 14 },
  errorBox: { gap: 8 },
  buckets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bucket: { minHeight: 42, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 11, paddingHorizontal: 12, justifyContent: "center", backgroundColor: "#FFFFFF" },
  bucketSelected: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  bucketText: { color: "#627184", fontSize: 13, fontWeight: "700" },
  bucketTextSelected: { color: "#1677D2" },
  card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8EDF3", borderRadius: 15, padding: 16, gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  name: { color: "#172536", fontSize: 17, fontWeight: "800", flex: 1 },
  body: { color: "#172536", fontSize: 14 },
  amount: { color: "#BA6B1F", fontSize: 14, fontWeight: "800", marginTop: 6 },
  note: { color: "#A96717", fontSize: 12, fontWeight: "700" },
  contactButton: { minHeight: 43, borderRadius: 10, backgroundColor: "#EAF4FF", alignItems: "center", justifyContent: "center" },
  contactButtonText: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
});
