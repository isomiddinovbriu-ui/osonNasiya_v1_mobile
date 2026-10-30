import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest } from "./api";
import { formatDate, formatMoney } from "./customers";
import { type DailyPlan, formatPlanDate, isObjectId } from "./dailyPlans";
import { PullRefreshControl, PullRefreshFeedback } from "./PullRefresh";
import { deleteStoredToken, getStoredToken } from "./session";

type PaymentFilter = "all" | "active" | "voided";
const pageSize = 20;
const filters: { value: PaymentFilter; label: string }[] = [
  { value: "all", label: "Barchasi" },
  { value: "active", label: "Faol" },
  { value: "voided", label: "Bekor qilingan" },
];

export default function DailyPlanPaymentsPage() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const access = await getStoredToken();
      if (!access) { router.replace("/"); return; }
      if (!id || !isObjectId(id)) { setError("Reja topilmadi."); return; }
      const result = await apiRequest<{ plan: DailyPlan }>(`/daily-plans/${id}`, {
        headers: { Authorization: `Bearer ${access}` },
      });
      setPlan(result.plan);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await deleteStoredToken();
        router.replace("/");
      } else setError(cause instanceof Error ? cause.message : "To‘lovlar yuklanmadi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const digits = query.replace(/[\s#]/g, "");
    const numeric = !!digits && /^\d+$/.test(digits);
    return [...(plan?.payments ?? [])]
      .filter((item) => filter === "all" || item.status === filter)
      .filter((item) => !query ||
        (numeric && (String(item.mijoz_id).includes(digits) || String(item.amount).includes(digits))) ||
        formatDate(item.paidAt).toLocaleLowerCase().includes(query))
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
  }, [plan, search, filter]);

  const visiblePayments = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.headerContent}>
        <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>‹ Rejaga qaytish</Text></Pressable>
      </View>
    </View>
    <FlatList
      style={styles.list}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={<PullRefreshControl refreshing={refreshing} onRefresh={() => { if (!loading && !refreshing) void load(true); }} />}
      data={visiblePayments}
      keyExtractor={(item) => item.paymentId}
      ListHeaderComponent={<View style={styles.intro}>
        <Text style={styles.title}>To‘lovlar tarixi</Text>
        <PullRefreshFeedback active={refreshing} />
        {loading && <Text style={styles.muted}>Yuklanmoqda...</Text>}
        {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        {plan && <>
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>{formatPlanDate(plan.date)} kungi reja</Text>
            <Text style={styles.summaryAmount}>{formatMoney(plan.totalAmount)}</Text>
            <Text style={styles.muted}>{plan.paymentCount} ta faol to‘lov</Text>
          </View>
          <Text style={styles.sectionTitle}>To‘lovni topish</Text>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={(value) => { setSearch(value); setVisibleCount(pageSize); }}
              placeholder="Mijoz ID si, summa yoki sana"
              placeholderTextColor="#8996A6"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="To‘lovlar tarixidan qidirish"
            />
            {!!search && <Pressable style={styles.clearButton} onPress={() => { setSearch(""); setVisibleCount(pageSize); }} accessibilityRole="button" accessibilityLabel="Qidiruvni tozalash"><Text style={styles.clearText}>×</Text></Pressable>}
          </View>
          <View style={styles.filters}>{filters.map((option) => <Pressable
            key={option.value}
            style={[styles.filter, filter === option.value && styles.selectedFilter]}
            onPress={() => { setFilter(option.value); setVisibleCount(pageSize); }}
            accessibilityRole="radio"
            accessibilityState={{ selected: filter === option.value }}
          ><Text style={[styles.filterText, filter === option.value && styles.selectedFilterText]}>{option.label}</Text></Pressable>)}</View>
          <Text style={styles.resultCount}>{filtered.length} ta to‘lov</Text>
        </>}
      </View>}
      ListEmptyComponent={!loading && !error && plan ? <Text style={styles.empty}>To‘lov topilmadi.</Text> : null}
      ListFooterComponent={visibleCount < filtered.length ? <Pressable style={styles.moreButton} onPress={() => setVisibleCount((count) => count + pageSize)} accessibilityRole="button"><Text style={styles.moreText}>Yana ko‘rsatish</Text></Pressable> : null}
      renderItem={({ item }) => <Pressable style={styles.paymentCard} onPress={() => router.push({ pathname: "/customers/payments", params: { mijoz_id: String(item.mijoz_id), dailyPlanId: plan?.id ?? id } })} accessibilityRole="button">
        <View style={styles.cardTop}>
          <Text style={styles.customerId}>Mijoz #{item.mijoz_id}</Text>
          <Text style={[styles.status, item.status === "active" ? styles.activeStatus : styles.voidedStatus]}>{item.status === "active" ? "Faol" : "Bekor qilingan"}</Text>
        </View>
        <Text style={styles.amount}>{formatMoney(item.amount)}</Text>
        <Text style={styles.muted}>{formatDate(item.paidAt)}</Text>
        <Text style={styles.link}>To‘lovni ko‘rish ›</Text>
      </Pressable>}
    />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  header: { backgroundColor: "#F6F8FB", borderBottomWidth: 1, borderBottomColor: "#E5EBF2", paddingHorizontal: 20, paddingBottom: 12 },
  headerContent: { maxWidth: 620, width: "100%", alignSelf: "center" },
  backButton: { minHeight: 32, alignSelf: "flex-start", justifyContent: "center" },
  list: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 18, gap: 10, maxWidth: 620, width: "100%", alignSelf: "center" },
  intro: { gap: 14, marginBottom: 6 },
  title: { color: "#172536", fontSize: 26, fontWeight: "800" },
  sectionTitle: { color: "#172536", fontSize: 16, fontWeight: "700" },
  muted: { color: "#627184", fontSize: 13 },
  error: { color: "#C3333D", fontSize: 13 },
  link: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  summary: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 16, gap: 6 },
  summaryLabel: { color: "#627184", fontSize: 13 },
  summaryAmount: { color: "#172536", fontSize: 21, fontWeight: "800" },
  searchBox: { minHeight: 48, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#D7E1EC", borderRadius: 12, backgroundColor: "#FFFFFF", paddingLeft: 14, paddingRight: 5 },
  searchInput: { flex: 1, minHeight: 46, color: "#172536", fontSize: 14 },
  clearButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  clearText: { color: "#627184", fontSize: 24, lineHeight: 28 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filter: { minHeight: 36, justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: "#D7E1EC", borderRadius: 10, backgroundColor: "#FFFFFF" },
  selectedFilter: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  filterText: { color: "#627184", fontSize: 12, fontWeight: "700" },
  selectedFilterText: { color: "#1269BC" },
  resultCount: { color: "#627184", fontSize: 13, fontWeight: "600" },
  paymentCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 16, gap: 8 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  customerId: { flex: 1, color: "#172536", fontSize: 15, fontWeight: "700" },
  status: { overflow: "hidden", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: "700" },
  activeStatus: { color: "#167A4A", backgroundColor: "#E8F7EE" },
  voidedStatus: { color: "#C3333D", backgroundColor: "#FDECEE" },
  amount: { color: "#1677D2", fontSize: 16, fontWeight: "800" },
  empty: { color: "#627184", textAlign: "center", paddingVertical: 24 },
  moreButton: { minHeight: 44, borderWidth: 1, borderColor: "#C9DEF3", borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF4FF", marginTop: 4 },
  moreText: { color: "#1269BC", fontSize: 14, fontWeight: "700" },
});
