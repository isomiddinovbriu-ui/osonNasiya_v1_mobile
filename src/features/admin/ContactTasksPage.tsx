import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import { type ContactEvent, type ContactListResponse, formatContactDay } from "./contacts";
import { formatMoney } from "./customers";
import { deleteStoredToken, getStoredToken } from "./session";
import StaffFilterPicker from "./StaffFilterPicker";

const pageSize = 20;
type CallStatus = "due" | "upcoming" | "all";

export default function ContactTasksPage() {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<User["role"] | null>(null);
  const [tab, setTab] = useState<"follow-ups" | "broken-promises">("follow-ups");
  const [callStatus, setCallStatus] = useState<CallStatus>("due");
  const [assignedTo, setAssignedTo] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ContactEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const expire = useCallback(async () => {
    await deleteStoredToken(); router.replace("/");
  }, []);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const stored = await getStoredToken();
        if (!stored) { router.replace("/"); return; }
        const session = await apiRequest<{ user: User }>("/auth/me", { headers: { Authorization: `Bearer ${stored}` } });
        if (session.user.role === "product_creator") { router.replace("/"); return; }
        if (active) { setToken(stored); setRole(session.user.role); }
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) await expire();
        else if (active) setError(cause instanceof Error ? cause.message : "Sahifa ochilmadi.");
      } finally { if (active) setLoading(false); }
    }
    void check();
    return () => { active = false; };
  }, [expire]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError("");
    try {
      const query = `?page=${page}&limit=${pageSize}${assignedTo ? `&assignedTo=${encodeURIComponent(assignedTo)}` : ""}`;
      const endpoint = tab === "follow-ups" ? `/contacts/call-list${query}&status=${callStatus}` : `/contacts/broken-promises${query}`;
      const result = await apiRequest<ContactListResponse>(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      setRows(result.contacts); setTotal(result.total);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await expire();
      else setError(cause instanceof Error ? cause.message : "Aloqalar yuklanmadi.");
    } finally { setLoading(false); }
  }, [token, tab, callStatus, assignedTo, page, expire]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function changeTab(value: "follow-ups" | "broken-promises") { setTab(value); setPage(1); }

  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}>
    <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>‹ Bosh sahifa</Text></Pressable>
    <Text style={styles.title}>Aloqalar</Text>
    <View style={styles.tabs}>
      <Pressable style={[styles.tab, tab === "follow-ups" && styles.activeTab]} onPress={() => changeTab("follow-ups")} accessibilityRole="button">
        <Text style={styles.tabText}>Keyingi aloqalar</Text>
      </Pressable>
      <Pressable style={[styles.tab, tab === "broken-promises" && styles.activeTab]} onPress={() => changeTab("broken-promises")} accessibilityRole="button">
        <Text style={styles.tabText}>Bajarilmagan va’dalar</Text>
      </Pressable>
    </View>
    {tab === "follow-ups" && <View style={styles.statusTabs}>
      {([ ["due", "Bugun va kechikkan"], ["upcoming", "Kelgusi"], ["all", "Barchasi"] ] as const).map(([value, label]) =>
        <Pressable key={value} style={[styles.statusTab, callStatus === value && styles.activeStatusTab]}
          onPress={() => { setCallStatus(value); setPage(1); }} accessibilityRole="button" accessibilityState={{ selected: callStatus === value }}>
          <Text style={[styles.statusTabText, callStatus === value && styles.activeStatusTabText]}>{label}</Text>
        </Pressable>
      )}
    </View>}
    {role === "super_admin" && token && <View style={styles.filter}>
      <StaffFilterPicker token={token} value={assignedTo} onChange={(value) => { setAssignedTo(value); setPage(1); }}
        onSessionExpired={expire} label="Mas’ul xodim" allowedRoles={["sotuvchi", "yiguvchi"]} />
    </View>}
    {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    {loading && <Text style={styles.muted}>Yuklanmoqda...</Text>}
    {!loading && !error && rows.length === 0 && <Text style={styles.muted}>
      {tab === "follow-ups" ? "Bu davr uchun qo‘ng‘iroq qaydlari yo‘q." : "Hozircha qayd topilmadi."}
    </Text>}
    {!loading && rows.map((item) => <Pressable key={item.id} style={styles.card}
      onPress={() => router.push({ pathname: "/customers/contacts", params: { mijoz_id: String(item.mijoz_id) } })} accessibilityRole="button">
      <View style={styles.heading}><Text style={styles.cardTitle}>{item.customer?.name ?? `Mijoz ${item.mijoz_id}`}</Text><Text style={styles.link}>›</Text></View>
      <Text style={styles.body}>{item.customer?.phoneNumber ?? ""}</Text>
      {!!item.customer?.address && <Text style={styles.muted}>{item.customer.address}</Text>}
      {tab === "follow-ups" ? <Text style={styles.body}>Keyingi aloqa: {item.nextContactDate ? formatContactDay(item.nextContactDate) : "—"}</Text> :
        <Text style={styles.body}>Va’da: {item.promisedDate} · {formatMoney(item.promisedAmount ?? 0)}</Text>}
      {!!item.note && <Text style={styles.muted}>{item.note}</Text>}
    </Pressable>)}
    {total > pageSize && <View style={styles.heading}>
      <Pressable disabled={page === 1} onPress={() => setPage((current) => current - 1)} accessibilityRole="button"><Text style={styles.link}>‹ Oldingi</Text></Pressable>
      <Text style={styles.muted}>{page} / {Math.ceil(total / pageSize)}</Text>
      <Pressable disabled={page * pageSize >= total} onPress={() => setPage((current) => current + 1)} accessibilityRole="button"><Text style={styles.link}>Keyingi ›</Text></Pressable>
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { padding: 20, paddingTop: 55, paddingBottom: 50, gap: 14 },
  title: { color: "#172536", fontSize: 25, fontWeight: "800" },
  link: { color: "#1677D2", fontSize: 15, fontWeight: "700" },
  tabs: { flexDirection: "row", gap: 8 },
  statusTabs: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  statusTab: { minHeight: 36, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: "#D7DFE8", alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  activeStatusTab: { borderColor: "#1677D2", backgroundColor: "#E8F2FF" },
  statusTabText: { color: "#627184", fontSize: 12, fontWeight: "700" },
  activeStatusTabText: { color: "#1677D2" },
  tab: { flex: 1, minHeight: 48, paddingHorizontal: 8, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10, justifyContent: "center", alignItems: "center" },
  activeTab: { backgroundColor: "#EAF4FF", borderColor: "#1677D2" },
  tabText: { color: "#172536", fontSize: 13, fontWeight: "700", textAlign: "center" },
  filter: { marginBottom: 4 },
  card: { backgroundColor: "#FFFFFF", padding: 16, borderRadius: 14, gap: 6 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  cardTitle: { color: "#172536", fontSize: 17, fontWeight: "800", flex: 1 },
  body: { color: "#172536", fontSize: 14 }, muted: { color: "#627184", fontSize: 13 },
  error: { color: "#C3333D", fontSize: 14 },
});
