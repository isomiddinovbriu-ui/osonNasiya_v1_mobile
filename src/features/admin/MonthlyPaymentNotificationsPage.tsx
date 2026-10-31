import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import LoadingMark from "./LoadingMark";
import {
  getMonthlyPaymentNotifications,
  type MonthlyPaymentNotificationsResponse,
  type MonthlyPaymentStatus,
} from "./monthlyPaymentNotifications";
import { formatMoneyWithUnits } from "./money";
import { PullRefreshControl } from "./PullRefresh";
import { deleteStoredToken, getStoredToken } from "./session";
import StaffFilterPicker from "./StaffFilterPicker";

type StatusFilter = MonthlyPaymentStatus | "all";
const statuses: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Barchasi" },
  { value: "due", label: "To‘lanmagan" },
  { value: "partial", label: "Qisman" },
  { value: "paid", label: "To‘langan" },
];
const monthNames = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

function formatMonth(month: string) {
  const [year, number] = month.split("-");
  return `${year} ${monthNames[Number(number) - 1]}`;
}

function tashkentMonth() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

function moveMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function MonthlyPaymentNotificationsPage() {
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(tashkentMonth);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [assignedTo, setAssignedTo] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState<MonthlyPaymentNotificationsResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<User["role"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const expireSession = useCallback(async () => {
    await deleteStoredToken();
    router.replace("/");
  }, []);

  useFocusEffect(useCallback(() => {
    void refreshKey;
    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError("");
        try {
          const access = await getStoredToken();
          if (!access) { router.replace("/"); return; }
          const headers = { Authorization: `Bearer ${access}` };
          const session = await apiRequest<{ user: User }>("/auth/me", { headers });
          if (!["super_admin", "sotuvchi", "yiguvchi"].includes(session.user.role)) { router.replace("/"); return; }
          if (active) { setToken(access); setRole(session.user.role); }
          const data = await getMonthlyPaymentNotifications(access, {
            month, status, assignedTo: session.user.role === "super_admin" ? assignedTo : undefined,
            page, limit: 20, q: query,
          });
          if (!active) return;
          const lastPage = Math.max(1, Math.ceil(data.total / data.limit));
          if (page > lastPage) { setPage(lastPage); return; }
          setResult(data);
        } catch (cause) {
          if (!active) return;
          if (cause instanceof ApiError && cause.status === 401) await expireSession();
          else setError(cause instanceof Error ? cause.message : "Bildirishnomalar yuklanmadi.");
        } finally {
          if (active) { setLoading(false); setRefreshing(false); }
        }
      })();
    }, query.trim() ? 300 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [month, status, assignedTo, query, page, refreshKey, expireSession]));

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;
  const currentMonth = tashkentMonth();
  const changeMonth = (offset: number) => { setMonth((current) => moveMonth(current, offset)); setPage(1); };

  return <ScrollView
    style={styles.screen}
    contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 40 }]}
    keyboardShouldPersistTaps="handled"
    refreshControl={<PullRefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setRefreshKey((current) => current + 1); }} />}
  >
    <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>‹ Bosh sahifa</Text></Pressable>
    <Text style={styles.title}>Oylik to‘lov bildirishnomalari</Text>
    <Text style={styles.muted}>Toshkent vaqti bo‘yicha oy boshidan hisoblanadi.</Text>

    <View style={styles.monthRow}>
      <Pressable style={styles.monthButton} onPress={() => changeMonth(-1)} accessibilityRole="button" accessibilityLabel="Oldingi oy"><Text style={styles.link}>‹</Text></Pressable>
      <Text style={styles.monthText}>{formatMonth(month)}</Text>
      <Pressable style={[styles.monthButton, month >= currentMonth && styles.disabled]} disabled={month >= currentMonth} onPress={() => changeMonth(1)} accessibilityRole="button" accessibilityLabel="Keyingi oy"><Text style={styles.link}>›</Text></Pressable>
    </View>

    <TextInput
      style={styles.search}
      value={query}
      onChangeText={(value) => { setQuery(value); setPage(1); }}
      placeholder="Mijoz ID, ism yoki telefon bo‘yicha qidirish"
      placeholderTextColor="#8B97A8"
      accessibilityLabel="Oylik bildirishnomalarni qidirish"
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      maxLength={100}
    />
    <View style={styles.row}>{statuses.map((option) => <Pressable key={option.value} style={[styles.filter, status === option.value && styles.selected]} onPress={() => { setStatus(option.value); setPage(1); }} accessibilityRole="radio" accessibilityState={{ selected: status === option.value }}><Text style={[styles.filterText, status === option.value && styles.selectedText]}>{option.label}</Text></Pressable>)}</View>
    {role === "super_admin" && token && <StaffFilterPicker token={token} value={assignedTo} onChange={(value) => { setAssignedTo(value); setPage(1); }} onSessionExpired={expireSession} label="Mas’ul xodim" />}

    {!!error && <View style={styles.card}><Text style={styles.error} accessibilityRole="alert">{error}</Text><Pressable onPress={() => setRefreshKey((current) => current + 1)} accessibilityRole="button"><Text style={styles.link}>Qayta yuklash</Text></Pressable></View>}
    {loading && <View style={styles.loading}><LoadingMark size={60} /><Text style={styles.muted}>Yuklanmoqda...</Text></View>}
    {!loading && !error && result && <>
      <Text style={styles.muted}>To‘lanmagan: {result.counts.due} · Qisman: {result.counts.partial} · To‘langan: {result.counts.paid}</Text>
      <Text style={styles.muted}>Filtr bo‘yicha jami: {result.total}</Text>
      {result.notifications.length === 0 && <View style={styles.card}><Text style={styles.muted}>Bu oy uchun bildirishnoma topilmadi.</Text></View>}
      {result.notifications.map((item) => <View key={item.id} style={styles.card}>
        <View style={styles.cardTop}><Text style={styles.heading}>{item.customerName || `Mijoz #${item.mijoz_id}`}</Text><Text style={[styles.badge, item.status === "paid" ? styles.paid : item.status === "partial" ? styles.partial : styles.due]}>{item.status === "paid" ? "To‘langan" : item.status === "partial" ? "Qisman" : "To‘lanmagan"}</Text></View>
        <Text style={styles.muted}>Mijoz #{item.mijoz_id}{item.phoneNumber ? ` · ${item.phoneNumber}` : ""}</Text>
        <Text style={styles.body}>Oylik to‘lov: {formatMoneyWithUnits(item.monthlyAmount)}</Text>
        <Text style={styles.body}>To‘langan: {formatMoneyWithUnits(item.paidAmount)}</Text>
        {item.status !== "paid" && <Text style={styles.remaining}>Qolgan: {formatMoneyWithUnits(item.remainingAmount)}</Text>}
        <Text style={styles.muted}>To‘lov sanasi: {item.dueDate}</Text>
        <Pressable onPress={() => router.push({ pathname: "/customers/payments", params: { mijoz_id: String(item.mijoz_id) } })} accessibilityRole="button"><Text style={styles.link}>To‘lovlarni ko‘rish ›</Text></Pressable>
      </View>)}
      {totalPages > 1 && <View style={styles.pagination}>
        <Pressable disabled={page <= 1} onPress={() => setPage(page - 1)} accessibilityRole="button"><Text style={[styles.link, page <= 1 && styles.disabled]}>‹ Oldingi</Text></Pressable>
        <Text style={styles.muted}>{page} / {totalPages}</Text>
        <Pressable disabled={page >= totalPages} onPress={() => setPage(page + 1)} accessibilityRole="button"><Text style={[styles.link, page >= totalPages && styles.disabled]}>Keyingi ›</Text></Pressable>
      </View>}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 18, gap: 13, maxWidth: 620, width: "100%", alignSelf: "center" },
  title: { color: "#172536", fontSize: 24, fontWeight: "800" },
  heading: { color: "#172536", fontSize: 17, fontWeight: "800", flex: 1 },
  body: { color: "#34445A", fontSize: 14 },
  muted: { color: "#627184", fontSize: 13 },
  link: { color: "#1677D2", fontSize: 15, fontWeight: "700" },
  error: { color: "#C3333D", fontSize: 14 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18 },
  monthButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#FFFFFF" },
  monthText: { color: "#172536", fontSize: 18, fontWeight: "800", minWidth: 120, textAlign: "center" },
  search: { minHeight: 48, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10, backgroundColor: "#FFFFFF", color: "#172536", paddingHorizontal: 12, fontSize: 14 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filter: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D7DFE8" },
  selected: { backgroundColor: "#1677D2", borderColor: "#1677D2" },
  filterText: { color: "#172536", fontWeight: "700" },
  selectedText: { color: "#FFFFFF" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: "#E2E8F0" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { overflow: "hidden", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, fontSize: 12, fontWeight: "700" },
  due: { color: "#A33820", backgroundColor: "#FCE9E4" },
  partial: { color: "#8B6200", backgroundColor: "#FFF2CF" },
  paid: { color: "#187653", backgroundColor: "#E1F5EA" },
  remaining: { color: "#A33820", fontSize: 15, fontWeight: "800" },
  pagination: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  loading: { alignItems: "center", paddingVertical: 32 },
  disabled: { opacity: 0.4 },
});
