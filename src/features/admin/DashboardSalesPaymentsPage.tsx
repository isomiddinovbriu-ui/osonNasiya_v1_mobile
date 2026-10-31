import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest } from "./api";
import { formatDate, formatMoney } from "./customers";
import { formatMoneyWithUnits } from "./money";
import PaymentSearchField from "./PaymentSearchField";
import { getStoredToken } from "./session";

type PaymentCategory = "installment" | "current_month" | "other_month" | "initial" | "unassigned";
type SalesPayment = {
  paymentId: string;
  customerId: string;
  mijoz_id: number;
  customerName: string;
  phoneNumber?: string | null;
  addPhoneNumber?: string | null;
  type: "initial" | "installment";
  amount: number;
  forMonth: string | null;
  paidAt: string;
  category: Exclude<PaymentCategory, "installment">;
};
type PaymentsResponse = {
  month: string;
  category: PaymentCategory;
  total: number;
  page: number;
  limit: number;
  payments: SalesPayment[];
};

const categories: { id: PaymentCategory; label: string }[] = [
  { id: "installment", label: "Bo‘lib to‘lovlar" },
  { id: "current_month", label: "Shu oy uchun" },
  { id: "other_month", label: "Boshqa oy uchun" },
  { id: "initial", label: "Boshlang‘ich" },
  { id: "unassigned", label: "Oyi belgilanmagan" },
];
const monthNames = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

function monthLabel(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  return `${monthNames[Number(value.slice(5)) - 1]} ${value.slice(0, 4)}`;
}

function paymentCategoryLabel(category: SalesPayment["category"]) {
  return categories.find((item) => item.id === category)?.label ?? category;
}

export default function DashboardSalesPaymentsPage() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ month?: string; category?: string; createdBy?: string; regionId?: string }>();
  const month = typeof params.month === "string" ? params.month : "";
  const createdBy = typeof params.createdBy === "string" ? params.createdBy : "";
  const regionId = typeof params.regionId === "string" ? params.regionId : "";
  const initialCategory = categories.find((item) => item.id === params.category)?.id ?? "installment";
  const [category, setCategory] = useState<PaymentCategory>(initialCategory);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [payments, setPayments] = useState<SalesPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        setError("Oy noto‘g‘ri ko‘rsatilgan.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const token = await getStoredToken();
        if (!token) { router.replace("/"); return; }
        const query = `month=${encodeURIComponent(month)}&category=${category}&page=${page}&limit=20`
          + (createdBy ? `&createdBy=${encodeURIComponent(createdBy)}` : "")
          + (regionId ? `&regionId=${encodeURIComponent(regionId)}` : "")
          + (search.trim() ? `&search=${encodeURIComponent(search.trim())}` : "");
        const result = await apiRequest<PaymentsResponse>(`/dashboard/sales/payments?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!active) return;
        setPayments((current) => page === 1 ? result.payments : [...current, ...result.payments]);
        setTotal(result.total);
      } catch (cause) {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) router.replace("/");
        else setError(cause instanceof Error ? cause.message : "To‘lovlar yuklanmadi.");
      } finally {
        if (active) setLoading(false);
      }
    }
    const timeout = setTimeout(() => { void load(); }, page === 1 && search.trim() ? 300 : 0);
    return () => { active = false; clearTimeout(timeout); };
  }, [month, category, page, createdBy, regionId, search, reloadKey]);

  function changeSearch(value: string) {
    setSearch(value);
    setPage(1);
    setPayments([]);
    setTotal(0);
    setLoading(true);
    setError("");
  }

  function chooseCategory(next: PaymentCategory) {
    if (next === category) return;
    setCategory(next);
    setPage(1);
    setPayments([]);
    setTotal(0);
  }

  function refresh() {
    setPage(1);
    setReloadKey((value) => value + 1);
  }

  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.back}>
        <Text style={styles.backText}>‹ Statistikaga qaytish</Text>
      </Pressable>
      <Text style={styles.title}>{monthLabel(month)} · savdo to‘lovlari</Text>
      <Text style={styles.subtitle}>Tanlangan toifada qabul qilingan pullar</Text>
      <PaymentSearchField value={search} onChangeText={changeSearch} />
    </View>
    <FlatList
      data={payments}
      keyExtractor={(item) => item.paymentId}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]}
      refreshControl={<RefreshControl refreshing={loading && page === 1} onRefresh={refresh} />}
      ListHeaderComponent={<>
        <View style={styles.filters}>
          {categories.map((item) => <Pressable key={item.id} onPress={() => chooseCategory(item.id)} accessibilityRole="button" accessibilityState={{ selected: category === item.id }} style={[styles.filter, category === item.id && styles.filterSelected]}>
            <Text style={[styles.filterText, category === item.id && styles.filterTextSelected]}>{item.label}</Text>
          </Pressable>)}
        </View>
        <Text style={styles.count}>{total} ta to‘lov</Text>
      </>}
      renderItem={({ item }) => <Pressable
        style={styles.paymentCard}
        onPress={() => router.push({ pathname: "/customers/payment-detail", params: { mijoz_id: String(item.mijoz_id), paymentId: item.paymentId } })}
        accessibilityRole="button"
        accessibilityLabel={`${item.customerName}, ${formatMoney(item.amount)} to‘lov tafsilotlari`}
      >
        <View style={styles.cardHeading}>
          <Text style={styles.customerName}>{item.customerName}</Text>
          <Text style={styles.amount}>{formatMoney(item.amount)}</Text>
        </View>
        <Text style={styles.amountWords}>{formatMoneyWithUnits(item.amount)}</Text>
        {!!(item.phoneNumber || item.addPhoneNumber) && <Text style={styles.phone}>{[item.phoneNumber, item.addPhoneNumber].filter(Boolean).join(" · ")}</Text>}
        <View style={styles.metaRow}><Text style={styles.metaLabel}>Toifa</Text><Text style={styles.metaValue}>{paymentCategoryLabel(item.category)}</Text></View>
        {!!item.forMonth && <View style={styles.metaRow}><Text style={styles.metaLabel}>Qaysi oy uchun</Text><Text style={styles.metaValue}>{monthLabel(item.forMonth)}</Text></View>}
        <View style={styles.metaRow}><Text style={styles.metaLabel}>Qabul qilingan sana</Text><Text style={styles.metaValue}>{formatDate(item.paidAt)}</Text></View>
        <Text style={styles.detailsLink}>To‘lov tafsilotlari ›</Text>
      </Pressable>}
      ListEmptyComponent={!loading && !error ? <Text style={styles.empty}>{search.trim() ? "Qidiruv bo‘yicha to‘lov topilmadi." : "Bu toifada to‘lov topilmadi."}</Text> : null}
      ListFooterComponent={<>
        {!!error && <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => setReloadKey((value) => value + 1)} accessibilityRole="button"><Text style={styles.retryText}>Qayta urinish</Text></Pressable></View>}
        {loading && page > 1 && <Text style={styles.status}>Yuklanmoqda...</Text>}
        {!loading && payments.length < total && !error && <Pressable style={styles.moreButton} onPress={() => setPage((value) => value + 1)} accessibilityRole="button"><Text style={styles.moreText}>Yana yuklash</Text></Pressable>}
      </>}
    />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  header: { backgroundColor: "#FFFFFF", paddingHorizontal: 18, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#E8EDF3" },
  back: { alignSelf: "flex-start", paddingVertical: 10, marginBottom: 5 },
  backText: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  title: { color: "#172536", fontSize: 23, fontWeight: "800" },
  subtitle: { color: "#627184", fontSize: 13, marginTop: 4 },
  list: { paddingHorizontal: 18, paddingTop: 16 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filter: { minHeight: 38, borderRadius: 10, paddingHorizontal: 12, justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE6F0" },
  filterSelected: { backgroundColor: "#1677D2", borderColor: "#1677D2" },
  filterText: { color: "#314255", fontSize: 12, fontWeight: "700" },
  filterTextSelected: { color: "#FFFFFF" },
  count: { color: "#627184", fontSize: 13, marginTop: 16, marginBottom: 12 },
  paymentCard: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E8EDF3", borderLeftWidth: 4, borderLeftColor: "#1677D2", padding: 16, marginBottom: 12 },
  cardHeading: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  customerName: { flex: 1, color: "#172536", fontSize: 16, fontWeight: "800" },
  amount: { color: "#172536", fontSize: 15, fontWeight: "800", textAlign: "right" },
  amountWords: { color: "#718097", fontSize: 12, marginTop: 4, marginBottom: 9 },
  phone: { color: "#627184", fontSize: 13, marginBottom: 9 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: "#EEF1F5" },
  metaLabel: { flex: 1, color: "#718097", fontSize: 12 },
  metaValue: { flex: 1.4, color: "#172536", fontSize: 12, fontWeight: "600", textAlign: "right" },
  detailsLink: { color: "#1677D2", fontSize: 12, fontWeight: "700", marginTop: 9 },
  empty: { color: "#627184", fontSize: 14, textAlign: "center", paddingVertical: 28 },
  errorCard: { backgroundColor: "#FFF1F2", borderRadius: 12, padding: 14, marginTop: 10 },
  errorText: { color: "#C3333D", fontSize: 13 },
  retryText: { color: "#1677D2", fontSize: 13, fontWeight: "700", marginTop: 8 },
  status: { color: "#627184", fontSize: 13, textAlign: "center", paddingVertical: 14 },
  moreButton: { minHeight: 46, backgroundColor: "#E8F2FF", borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 4 },
  moreText: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
});
