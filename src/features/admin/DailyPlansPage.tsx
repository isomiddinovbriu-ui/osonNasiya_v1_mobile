import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import { formatDate, formatMoney } from "./customers";
import { type DailyPlan, type PlanCustomer, getDailyPlans, isObjectId, tashkentToday, validPlanDate } from "./dailyPlans";
import { deleteStoredToken, getStoredToken } from "./session";

type Region = { id: string; name: string };
const pageSize = 20;

export default function DailyPlansPage() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState("");
  const [date, setDate] = useState(tashkentToday);
  const [plans, setPlans] = useState<DailyPlan[]>([]);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [customers, setCustomers] = useState<PlanCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const expire = useCallback(async () => {
    await deleteStoredToken();
    router.replace("/");
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const access = await getStoredToken();
      if (!access) { router.replace("/"); return; }
      const headers = { Authorization: `Bearer ${access}` };
      const [session, regionResult, list] = await Promise.all([
        apiRequest<{ user: User }>("/auth/me", { headers }),
        apiRequest<{ regions: Region[] }>("/regions", { headers }),
        getDailyPlans(access),
      ]);
      if (session.user.role !== "yiguvchi" && session.user.role !== "super_admin") { router.replace("/"); return; }
      setToken(access); setUser(session.user); setRegions(regionResult.regions); setPlans(list.plans);
      if (id && isObjectId(id)) {
        const detail = await apiRequest<{ plan: DailyPlan }>(`/daily-plans/${id}`, { headers });
        setPlan(detail.plan);
      } else setPlan(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await expire();
      else setError(cause instanceof Error ? cause.message : "Rejalar yuklanmadi.");
    } finally { setLoading(false); }
  }, [id, expire]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const loadCustomers = useCallback(async () => {
    if (!token || !plan) return;
    try {
      const result = await apiRequest<{ customers: PlanCustomer[]; total: number }>(
        `/daily-plans/${plan.id}/customers?page=${page}&limit=${pageSize}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setCustomers(result.customers); setTotal(result.total);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await expire();
      else setError(cause instanceof Error ? cause.message : "Mijozlar yuklanmadi.");
    }
  }, [token, plan, page, expire]);

  useFocusEffect(useCallback(() => { void loadCustomers(); }, [loadCustomers]));

  async function createPlan() {
    if (!token || busy) return;
    if (!isObjectId(regionId)) { setError("Hududni tanlang."); return; }
    if (!validPlanDate(date) || date < tashkentToday()) {
      setError("Bugungi yoki kelajak sanani YYYY-MM-DD shaklida kiriting."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ plan: DailyPlan }>("/daily-plans", {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ regionId, date }),
      });
      setPage(1); setCustomers([]); setPlan(result.plan);
      router.setParams({ id: result.plan.id });
      setPlans((current) => [result.plan, ...current]);
      setNotice("Reja ochildi.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reja ochilmadi."); }
    finally { setBusy(false); }
  }

  async function changeStatus(action: "close" | "reopen") {
    if (!token || !plan || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest(`/daily-plans/${plan.id}/${action}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const result = await apiRequest<{ plan: DailyPlan }>(`/daily-plans/${plan.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPlan(result.plan);
      setPlans((current) => current.map((item) => item.id === result.plan.id ? result.plan : item));
      setNotice(action === "close" ? "Reja yopildi." : "Reja qayta ochildi.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reja holati o‘zgarmadi."); }
    finally { setBusy(false); }
  }

  const today = tashkentToday();
  const canChange = plan && user?.role === "yiguvchi" && plan.ownerId === user.id && plan.date === today;
  const canPay = plan?.status === "open" && plan.date === today;
  const regionName = (value: string) => regions.find((item) => item.id === value)?.name || value;

  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
    <Pressable onPress={() => plan ? router.setParams({ id: "" }) : router.back()} accessibilityRole="button"><Text style={styles.link}>‹ {plan ? "Rejalar" : "Bosh sahifa"}</Text></Pressable>
    <Text style={styles.title}>{plan ? "Kunlik reja" : "Kunlik rejalar"}</Text>
    {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    {!!notice && <Text style={styles.notice}>{notice}</Text>}
    {loading && <Text style={styles.muted}>Yuklanmoqda...</Text>}
    {plan ? <>
      <View style={styles.card}>
        <Text style={styles.heading}>{regionName(plan.regionId)}</Text>
        <Text style={styles.muted}>{plan.date} · {plan.status === "open" ? "Ochiq" : "Yopiq"}</Text>
        <Text style={styles.amount}>{formatMoney(plan.totalAmount)}</Text>
        <Text style={styles.muted}>{plan.paymentCount} ta faol to‘lov</Text>
        {!!canChange && <Pressable style={styles.button} disabled={busy} onPress={() => void changeStatus(plan.status === "open" ? "close" : "reopen")} accessibilityRole="button"><Text style={styles.buttonText}>{busy ? "Saqlanmoqda..." : plan.status === "open" ? "Rejani yopish" : "Qayta ochish"}</Text></Pressable>}
      </View>
      <Text style={styles.heading}>Hududdagi mijozlar · {total}</Text>
      {customers.map((item) => <Pressable key={item.mijoz_id} style={styles.card} accessibilityRole="button" onPress={() => router.push({ pathname: "/customers/payments", params: { mijoz_id: String(item.mijoz_id), dailyPlanId: plan.id } })}>
        <Text style={styles.heading}>{item.name}</Text>
        <Text style={styles.muted}>#{item.mijoz_id} · {item.phoneNumber}</Text>
        {!!item.address && <Text style={styles.muted}>{item.address}</Text>}
        <Text style={styles.amount}>Qolgan qarz: {formatMoney(item.remainingBalance)}</Text>
        <Text style={styles.link}>{canPay ? "To‘lovga o‘tish ›" : "To‘lov tarixini ko‘rish ›"}</Text>
      </Pressable>)}
      {total > pageSize && <View style={styles.row}><Pressable disabled={page <= 1} onPress={() => setPage(page - 1)}><Text style={styles.link}>‹ Oldingi</Text></Pressable><Text>{page} / {Math.ceil(total / pageSize)}</Text><Pressable disabled={page >= Math.ceil(total / pageSize)} onPress={() => setPage(page + 1)}><Text style={styles.link}>Keyingi ›</Text></Pressable></View>}
      <Text style={styles.heading}>To‘lovlar tarixi</Text>
      {plan.payments.map((item) => <View key={item.paymentId} style={styles.card}><Text style={styles.heading}>Mijoz #{item.mijoz_id} · {formatMoney(item.amount)}</Text><Text style={styles.muted}>{item.status === "voided" ? "Bekor qilingan" : "Faol"} · {formatDate(item.paidAt)}</Text><Pressable onPress={() => router.push({ pathname: "/customers/payments", params: { mijoz_id: String(item.mijoz_id), dailyPlanId: plan.id } })}><Text style={styles.link}>To‘lovni ko‘rish ›</Text></Pressable></View>)}
    </> : <>
      {user?.role === "yiguvchi" && <View style={styles.card}>
        <Text style={styles.heading}>Yangi reja ochish</Text>
        <Text style={styles.muted}>Hududni tanlang</Text>
        <View style={styles.regions}>{regions.map((item) => <Pressable key={item.id} style={[styles.region, regionId === item.id && styles.selected]} onPress={() => setRegionId(item.id)} accessibilityRole="radio" accessibilityState={{ selected: regionId === item.id }}><Text>{item.name}</Text></Pressable>)}</View>
        <Text style={styles.muted}>Sana (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" maxLength={10} keyboardType="numbers-and-punctuation" />
        <Pressable style={styles.button} disabled={busy} onPress={() => void createPlan()} accessibilityRole="button"><Text style={styles.buttonText}>{busy ? "Ochilmoqda..." : "Reja ochish"}</Text></Pressable>
      </View>}
      <Text style={styles.heading}>Rejalar</Text>
      {plans.map((item) => <Pressable key={item.id} style={styles.card} onPress={() => { setPage(1); setCustomers([]); router.setParams({ id: item.id }); }} accessibilityRole="button"><Text style={styles.heading}>{regionName(item.regionId)}</Text><Text style={styles.muted}>{item.date} · {item.status === "open" ? "Ochiq" : "Yopiq"}</Text><Text style={styles.amount}>{formatMoney(item.totalAmount)} · {item.paymentCount} ta to‘lov</Text></Pressable>)}
      {!loading && plans.length === 0 && <Text style={styles.muted}>Hozircha reja yo‘q.</Text>}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 20, gap: 14, maxWidth: 620, width: "100%", alignSelf: "center" },
  title: { color: "#172536", fontSize: 26, fontWeight: "800" },
  heading: { color: "#172536", fontSize: 16, fontWeight: "700" },
  muted: { color: "#627184", fontSize: 13 },
  amount: { color: "#1677D2", fontSize: 15, fontWeight: "700" },
  link: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  error: { color: "#C3333D" }, notice: { color: "#167A4A" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, gap: 9, borderWidth: 1, borderColor: "#E2E8F0" },
  regions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  region: { padding: 10, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10 },
  selected: { backgroundColor: "#EAF4FF", borderColor: "#1677D2" },
  input: { borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10, padding: 12, minHeight: 46 },
  button: { backgroundColor: "#1677D2", borderRadius: 10, minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  buttonText: { color: "#FFFFFF", fontWeight: "700" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
