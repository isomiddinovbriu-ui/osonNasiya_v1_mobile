import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import ContactDatePicker from "./ContactDatePicker";
import { formatMoney } from "./customers";
import { type DailyPlan, type PlanCustomer, formatPlanDate, getDailyPlans, isObjectId, tashkentToday, validPlanDate } from "./dailyPlans";
import { formatMoneyWithUnits } from "./money";
import { PullRefreshControl, PullRefreshFeedback } from "./PullRefresh";
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
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [regionSearch, setRegionSearch] = useState("");
  const regionSearchRef = useRef<TextInput>(null);
  const [date, setDate] = useState(tashkentToday);
  const [plans, setPlans] = useState<DailyPlan[]>([]);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [customers, setCustomers] = useState<PlanCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [customerSearch, setCustomerSearch] = useState("");
  const [appliedCustomerSearch, setAppliedCustomerSearch] = useState("");
  const [customersLoading, setCustomersLoading] = useState(false);
  const customerRequestId = useRef(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dismissError = useCallback(() => setError(""), []);
  const dismissNotice = useCallback(() => setNotice(""), []);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setAppliedCustomerSearch(customerSearch.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  function resetCustomerView() {
    customerRequestId.current += 1;
    setCustomerSearch("");
    setAppliedCustomerSearch("");
    setCustomers([]);
    setTotal(0);
    setPage(1);
    setCustomersLoading(false);
  }

  const activePlanId = plan?.id;
  const loadCustomers = useCallback(async () => {
    if (!token || !activePlanId || activePlanId !== id) return;
    const requestId = ++customerRequestId.current;
    setCustomersLoading(true);
    setCustomers([]);
    setTotal(0);
    try {
      const searchQuery = appliedCustomerSearch ? `&search=${encodeURIComponent(appliedCustomerSearch)}` : "";
      const result = await apiRequest<{ customers: PlanCustomer[]; total: number }>(
        `/daily-plans/${activePlanId}/customers?page=${page}&limit=${pageSize}${searchQuery}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (requestId === customerRequestId.current) {
        setCustomers(result.customers); setTotal(result.total);
      }
    } catch (cause) {
      if (requestId === customerRequestId.current) {
        if (cause instanceof ApiError && cause.status === 401) await expire();
        else setError(cause instanceof Error ? cause.message : "Mijozlar yuklanmadi.");
      }
    } finally {
      if (requestId === customerRequestId.current) setCustomersLoading(false);
    }
  }, [token, activePlanId, id, page, appliedCustomerSearch, expire]);

  useFocusEffect(useCallback(() => { void loadCustomers(); }, [loadCustomers]));

  const refresh = useCallback(async () => {
    if (refreshing || loading || busy) return;
    setRefreshing(true);
    try {
      await Promise.all([load(), loadCustomers()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, loading, busy, load, loadCustomers]);

  async function createPlan() {
    if (!token || busy) return;
    if (!isObjectId(regionId)) { setError("Hududni tanlang."); return; }
    if (!validPlanDate(date) || date < tashkentToday()) {
      setError("Bugungi yoki kelajak sanani tanlang."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ plan: DailyPlan }>("/daily-plans", {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ regionId, date }),
      });
      const reopened = plans.some((item) => item.id === result.plan.id && item.status === "closed");
      resetCustomerView(); setPlan(result.plan);
      router.setParams({ id: result.plan.id });
      setPlans((current) => current.some((item) => item.id === result.plan.id)
        ? current.map((item) => item.id === result.plan.id ? result.plan : item)
        : [result.plan, ...current]);
      setNotice(reopened ? "Mavjud reja qayta ochildi." : "Reja ochildi.");
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
  const searchPending = customerSearch.trim() !== appliedCustomerSearch;
  const regionName = (value: string) => regions.find((item) => item.id === value)?.name || value;
  const selectedRegion = regions.find((item) => item.id === regionId);
  const visibleRegions = useMemo(() => {
    const query = regionSearch.trim().toLocaleLowerCase();
    return query ? regions.filter((item) => item.name.toLocaleLowerCase().includes(query)) : regions;
  }, [regions, regionSearch]);

  return <View style={styles.screen}>
    <View style={[styles.stickyHeader, { paddingTop: insets.top + 10 }]}>
      <View style={styles.headerContent}>
        <Pressable style={styles.backButton} onPress={() => { if (plan) { resetCustomerView(); router.setParams({ id: "" }); } else router.back(); }} accessibilityRole="button"><Text style={styles.link}>‹ {plan ? "Rejalar" : "Bosh sahifa"}</Text></Pressable>
      </View>
    </View>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: 18, paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={<PullRefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} />}
    >
    <Text style={styles.title}>{plan ? "Kunlik reja" : "Kunlik rejalar"}</Text>
    <PullRefreshFeedback active={refreshing} />
    {loading && <Text style={styles.muted}>Yuklanmoqda...</Text>}
    {plan ? <>
      <View style={styles.card}>
        <Text style={styles.heading}>{regionName(plan.regionId)}</Text>
        <View style={styles.planMetaRow}>
          <Text style={styles.muted}>{formatPlanDate(plan.date)}</Text>
          <Text style={[styles.planStatus, plan.status === "open" ? styles.planStatusOpen : styles.planStatusClosed]}>{plan.status === "open" ? "Ochiq" : "Yopiq"}</Text>
        </View>
        <Text style={styles.amount}>{formatMoney(plan.totalAmount)}</Text>
        <Text style={styles.muted}>{plan.paymentCount} ta faol to‘lov</Text>
        <Pressable style={styles.historyLink} onPress={() => router.push({ pathname: "/daily-plans/payments", params: { id: plan.id } })} accessibilityRole="button">
          <Text style={styles.historyLinkText}>To‘lovlar tarixi</Text>
          <Text style={styles.historyLinkCount}>{plan.payments.length} ta ›</Text>
        </Pressable>
        {!!canChange && <Pressable style={styles.button} disabled={busy} onPress={() => void changeStatus(plan.status === "open" ? "close" : "reopen")} accessibilityRole="button"><Text style={styles.buttonText}>{busy ? "Saqlanmoqda..." : plan.status === "open" ? "Rejani yopish" : "Qayta ochish"}</Text></Pressable>}
      </View>
      <Text style={styles.heading}>Hududdagi mijozlar · {customersLoading || searchPending ? "..." : total}</Text>
      <View style={styles.customerSearchBox}>
        <TextInput
          style={styles.customerSearchInput}
          value={customerSearch}
          onChangeText={setCustomerSearch}
          placeholder="Ism, telefon yoki mijoz ID si"
          placeholderTextColor="#8996A6"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={100}
          returnKeyType="search"
          accessibilityLabel="Reja mijozlarini qidirish"
        />
        {!!customerSearch && <Pressable style={styles.customerSearchClear} onPress={() => setCustomerSearch("")} accessibilityRole="button" accessibilityLabel="Qidiruvni tozalash"><Text style={styles.customerSearchClearText}>×</Text></Pressable>}
      </View>
      {(customersLoading || searchPending) && <Text style={styles.muted}>Mijozlar qidirilmoqda...</Text>}
      {!customersLoading && !searchPending && !error && customers.length === 0 && <Text style={styles.muted}>{appliedCustomerSearch ? "Qidiruv bo‘yicha mijoz topilmadi." : "Bu hududda mijoz yo‘q."}</Text>}
      {!customersLoading && !searchPending && customers.map((item) => <Pressable key={item.mijoz_id} style={[styles.card, styles.customerCard]} accessibilityRole="button" onPress={() => router.push({ pathname: "/customers/payments", params: { mijoz_id: String(item.mijoz_id), dailyPlanId: plan.id } })}>
        <View style={styles.customerCardBody}>
          <View style={styles.customerCardHeader}>
            <Text style={styles.customerName}>{item.name}</Text>
            <Text style={styles.customerIdBadge}>#{item.mijoz_id}</Text>
          </View>
          <Text style={styles.customerDetail}>Telefon · {item.phoneNumber}</Text>
          {!!item.address && <Text style={styles.customerDetail} numberOfLines={2}>Manzil · {item.address}</Text>}
          <View style={[styles.customerDebtPanel, item.remainingBalance <= 0 && styles.customerDebtCleared]}>
            <Text style={styles.customerDebtLabel}>Qolgan qarz</Text>
            <Text style={[styles.customerDebtAmount, item.remainingBalance <= 0 && styles.customerDebtAmountCleared]}>{formatMoney(item.remainingBalance)}</Text>
            <Text style={styles.customerDebtWords}>{formatMoneyWithUnits(item.remainingBalance)}</Text>
          </View>
        </View>
        <View style={styles.customerCardFooter}>
          <Text style={styles.customerAction}>{canPay ? "To‘lovga o‘tish" : "To‘lov tarixini ko‘rish"}</Text>
          <Text style={styles.customerActionArrow}>›</Text>
        </View>
      </Pressable>)}
      {!customersLoading && !searchPending && total > pageSize && <View style={styles.row}><Pressable disabled={page <= 1} onPress={() => setPage(page - 1)}><Text style={styles.link}>‹ Oldingi</Text></Pressable><Text>{page} / {Math.ceil(total / pageSize)}</Text><Pressable disabled={page >= Math.ceil(total / pageSize)} onPress={() => setPage(page + 1)}><Text style={styles.link}>Keyingi ›</Text></Pressable></View>}
    </> : <>
      {user?.role === "yiguvchi" && <View style={styles.card}>
        <Text style={styles.heading}>Yangi reja ochish</Text>
        <Text style={styles.muted}>Bugungi ish hududini tanlang va reja oching.</Text>
        <Text style={styles.fieldLabel}>Hudud</Text>
        <Pressable
          style={[styles.regionPicker, !!selectedRegion && styles.regionPickerSelected]}
          onPress={() => { setRegionSearch(""); setRegionPickerOpen(true); }}
          accessibilityRole="button"
          accessibilityLabel={selectedRegion ? `Tanlangan hudud: ${selectedRegion.name}. O'zgartirish` : "Hududni tanlash"}
        >
          <View style={styles.regionPickerIcon}><Text style={styles.regionPickerIconText}>⌖</Text></View>
          <View style={styles.regionPickerCopy}>
            <Text style={styles.regionPickerHint}>{selectedRegion ? "Tanlangan hudud" : "Reja ochiladigan hudud"}</Text>
            <Text style={[styles.regionPickerName, !selectedRegion && styles.regionPickerPlaceholder]} numberOfLines={1}>{selectedRegion?.name ?? "Hududni tanlang"}</Text>
          </View>
          <Text style={styles.regionPickerChevron}>⌄</Text>
        </Pressable>
        <Text style={styles.fieldLabel}>Sana</Text>
        <ContactDatePicker label="Reja sanasi" value={date} onChange={setDate} getToday={tashkentToday} />
        <Pressable style={styles.button} disabled={busy} onPress={() => void createPlan()} accessibilityRole="button"><Text style={styles.buttonText}>{busy ? "Ochilmoqda..." : "Reja ochish"}</Text></Pressable>
      </View>}
      <Text style={styles.heading}>Rejalar</Text>
      {plans.map((item) => <Pressable key={item.id} style={styles.card} onPress={() => { resetCustomerView(); router.setParams({ id: item.id }); }} accessibilityRole="button">
        <View style={styles.planCardHeader}>
          <Text style={[styles.heading, styles.planCardName]}>{regionName(item.regionId)}</Text>
          <Text style={[styles.planStatus, item.status === "open" ? styles.planStatusOpen : styles.planStatusClosed]}>{item.status === "open" ? "Ochiq" : "Yopiq"}</Text>
        </View>
        <Text style={styles.muted}>{formatPlanDate(item.date)}</Text>
        <Text style={styles.amount}>{formatMoney(item.totalAmount)} · {item.paymentCount} ta to‘lov</Text>
      </Pressable>)}
      {!loading && plans.length === 0 && <Text style={styles.muted}>Hozircha reja yo‘q.</Text>}
    </>}
    <Modal visible={regionPickerOpen} transparent animationType="slide" onShow={() => regionSearchRef.current?.focus()} onRequestClose={() => setRegionPickerOpen(false)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRegionPickerOpen(false)} accessibilityLabel="Hududlar ro'yxatini yopish" />
        <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Hududni tanlang</Text>
              <Text style={styles.muted}>{regions.length} ta hudud mavjud</Text>
            </View>
            <Pressable style={styles.modalClose} onPress={() => setRegionPickerOpen(false)} accessibilityRole="button" accessibilityLabel="Yopish"><Text style={styles.modalCloseText}>×</Text></Pressable>
          </View>
          <TextInput
            ref={regionSearchRef}
            style={styles.regionSearch}
            value={regionSearch}
            onChangeText={setRegionSearch}
            placeholder="Hudud nomini qidiring"
            placeholderTextColor="#8996A6"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Hudud qidirish"
          />
          <FlatList
            data={visibleRegions}
            keyExtractor={(item) => item.id}
            extraData={regionId}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.regionList}
            ListEmptyComponent={<Text style={styles.emptyRegions}>Hudud topilmadi. Boshqa nom bilan qidiring.</Text>}
            renderItem={({ item }) => {
              const selected = item.id === regionId;
              return <Pressable
                style={[styles.regionRow, selected && styles.regionRowSelected]}
                onPress={() => { setRegionId(item.id); setRegionPickerOpen(false); setRegionSearch(""); setError(""); }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.regionRowName, selected && styles.regionRowNameSelected]}>{item.name}</Text>
                <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>{selected && <View style={styles.radioInner} />}</View>
              </Pressable>;
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </ScrollView>
    {!!error
      ? <StatusToast message={error} kind="error" top={insets.top + 8} onDismiss={dismissError} />
      : !!notice && <StatusToast message={notice} kind="success" top={insets.top + 8} onDismiss={dismissNotice} />}
  </View>;
}

function StatusToast({ message, kind, top, onDismiss }: { message: string; kind: "error" | "success"; top: number; onDismiss: () => void }) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) onDismiss();
      });
    }, 2800);
    return () => { clearTimeout(timer); progress.stopAnimation(); };
  }, [message, kind, onDismiss, progress]);

  function dismiss() {
    Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  }

  return <Animated.View style={[styles.toast, kind === "success" ? styles.successToast : styles.errorToast, { top, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) }] }]}>
    <Text style={[styles.toastText, kind === "success" ? styles.successToastText : styles.errorToastText]} accessibilityRole="alert">{message}</Text>
    <Pressable style={styles.toastAction} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Xabarni yopish"><Text style={[styles.toastIcon, kind === "success" ? styles.successToastIcon : styles.errorToastIcon]}>{kind === "success" ? "✓" : "×"}</Text></Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  scroll: { flex: 1 },
  stickyHeader: { backgroundColor: "#F6F8FB", borderBottomWidth: 1, borderBottomColor: "#E5EBF2", paddingBottom: 12, paddingHorizontal: 20 },
  headerContent: { maxWidth: 620, width: "100%", alignSelf: "center" },
  backButton: { minHeight: 32, alignSelf: "flex-start", justifyContent: "center" },
  content: { paddingHorizontal: 20, gap: 14, maxWidth: 620, width: "100%", alignSelf: "center" },
  title: { color: "#172536", fontSize: 26, fontWeight: "800" },
  heading: { color: "#172536", fontSize: 16, fontWeight: "700" },
  muted: { color: "#627184", fontSize: 13 },
  amount: { color: "#1677D2", fontSize: 15, fontWeight: "700" },
  link: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  toast: { position: "absolute", alignSelf: "center", width: "92%", maxWidth: 600, minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 16, paddingRight: 8, paddingVertical: 8, borderWidth: 1, borderRadius: 14, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 18, zIndex: 30 },
  errorToast: { borderColor: "#F1B9BD", backgroundColor: "#FFF4F4", shadowColor: "#6D1F25" },
  successToast: { borderColor: "#A9DFC4", backgroundColor: "#F0FCF5", shadowColor: "#206345" },
  toastText: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 19 },
  errorToastText: { color: "#B32D37" },
  successToastText: { color: "#167A4A" },
  toastAction: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  toastIcon: { fontSize: 26, fontWeight: "700", lineHeight: 30 },
  errorToastIcon: { color: "#C3333D" },
  successToastIcon: { color: "#16834E" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, gap: 9, borderWidth: 1, borderColor: "#E2E8F0" },
  historyLink: { minHeight: 46, borderRadius: 10, paddingHorizontal: 12, backgroundColor: "#EAF4FF", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  historyLinkText: { flex: 1, color: "#1269BC", fontSize: 14, fontWeight: "700" },
  historyLinkCount: { color: "#1269BC", fontSize: 13, fontWeight: "700" },
  planCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  planMetaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  planCardName: { flex: 1 },
  planStatus: { overflow: "hidden", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontWeight: "700" },
  planStatusOpen: { color: "#167A4A", backgroundColor: "#E8F7EE" },
  planStatusClosed: { color: "#C3333D", backgroundColor: "#FDECEE" },
  customerSearchBox: { minHeight: 48, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#D7E1EC", borderRadius: 12, backgroundColor: "#FFFFFF", paddingLeft: 14, paddingRight: 5 },
  customerSearchInput: { flex: 1, minHeight: 46, color: "#172536", fontSize: 14 },
  customerSearchClear: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  customerSearchClearText: { color: "#627184", fontSize: 24, lineHeight: 28 },
  customerCard: { padding: 0, gap: 0, overflow: "hidden" },
  customerCardBody: { padding: 16, gap: 8 },
  customerCardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  customerName: { flex: 1, color: "#172536", fontSize: 17, fontWeight: "800" },
  customerIdBadge: { overflow: "hidden", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: "#F0F3F7", color: "#53677D", fontSize: 12, fontWeight: "700" },
  customerDetail: { color: "#627184", fontSize: 13, lineHeight: 18 },
  customerDebtPanel: { backgroundColor: "#F0F7FF", borderRadius: 11, paddingHorizontal: 13, paddingVertical: 11, gap: 3, marginTop: 3 },
  customerDebtCleared: { backgroundColor: "#EAF8F0" },
  customerDebtLabel: { color: "#52677E", fontSize: 12, fontWeight: "600" },
  customerDebtAmount: { color: "#1269BC", fontSize: 18, fontWeight: "800" },
  customerDebtAmountCleared: { color: "#167A4A" },
  customerDebtWords: { color: "#16865A", fontSize: 12, fontWeight: "600", lineHeight: 17 },
  customerCardFooter: { minHeight: 47, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: "#E8EDF3" },
  customerAction: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  customerActionArrow: { color: "#1677D2", fontSize: 24, lineHeight: 27 },
  fieldLabel: { color: "#34465A", fontSize: 13, fontWeight: "700", marginTop: 5 },
  regionPicker: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 68, paddingHorizontal: 14, borderWidth: 1, borderColor: "#D7E1EC", borderRadius: 14, backgroundColor: "#F8FAFD" },
  regionPickerSelected: { backgroundColor: "#F0F7FF", borderColor: "#8CC3F2" },
  regionPickerIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#E5F2FF", alignItems: "center", justifyContent: "center" },
  regionPickerIconText: { color: "#1677D2", fontSize: 25, fontWeight: "600", marginTop: -3 },
  regionPickerCopy: { flex: 1, gap: 2 },
  regionPickerHint: { color: "#708197", fontSize: 11, fontWeight: "600" },
  regionPickerName: { color: "#172536", fontSize: 15, fontWeight: "700" },
  regionPickerPlaceholder: { color: "#627184", fontWeight: "500" },
  regionPickerChevron: { color: "#61758B", fontSize: 24, marginTop: -6 },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(15, 28, 44, 0.42)" },
  modalSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, maxHeight: "78%", minHeight: 340 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#CFD8E3", alignSelf: "center", marginBottom: 20 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { color: "#172536", fontSize: 20, fontWeight: "800", marginBottom: 4 },
  modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#F0F3F7", alignItems: "center", justifyContent: "center" },
  modalCloseText: { color: "#53677D", fontSize: 23, lineHeight: 26 },
  regionSearch: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: "#D7E1EC", backgroundColor: "#F8FAFD", paddingHorizontal: 14, color: "#172536", fontSize: 15, marginBottom: 10 },
  regionList: { paddingBottom: 12 },
  regionRow: { minHeight: 54, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 6, borderRadius: 12, borderWidth: 1, borderColor: "#E5EBF2", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  regionRowSelected: { backgroundColor: "#EFF7FF", borderColor: "#8CC3F2" },
  regionRowName: { flex: 1, color: "#26384B", fontSize: 14, fontWeight: "500" },
  regionRowNameSelected: { color: "#1269BC", fontWeight: "700" },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: "#A7B6C6", alignItems: "center", justifyContent: "center" },
  radioOuterSelected: { borderColor: "#1677D2" },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#1677D2" },
  emptyRegions: { color: "#627184", textAlign: "center", paddingVertical: 28 },
  button: { backgroundColor: "#1677D2", borderRadius: 10, minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  buttonText: { color: "#FFFFFF", fontWeight: "700" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
