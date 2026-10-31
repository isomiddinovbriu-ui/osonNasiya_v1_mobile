import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import CurrentLocationPreview from "./CurrentLocationPreview";
import { getCustomerProgress } from "./customerProgress";
import { formatDate, formatMoney, type Customer, type CustomerListResponse } from "./customers";
import LoadingMark from "./LoadingMark";
import ListPagination from "./ListPagination";
import LocationPicker from "./LocationPicker";
import { formatMoneyWithUnits } from "./money";
import { PullRefreshControl } from "./PullRefresh";
import { deleteStoredToken, getStoredToken } from "./session";

type Option = { id: string; name: string };
type NearbyCustomer = Customer & { distanceMeters: number; distanceKm: number };
type NearbyResponse = { customers: NearbyCustomer[]; total: number };
type Point = { latitude: number; longitude: number };
type DebtStatus = "" | "true" | "false";
type MonthlyDebtRow = {
  mijoz_id: number;
  name: string;
  phoneNumber: string | null;
  regionId: string | null;
  productName?: string | null;
  createdAt?: string | null;
  monthlyAmount: number;
  paidAmount: number;
  debtAmount: number;
  remainingBalance: number;
  status: "unpaid" | "underpaid";
};
type YearlyDebtRow = Omit<MonthlyDebtRow, "status"> & {
  months: { month: string; monthlyAmount: number; paidAmount: number; debtAmount: number }[];
};
type DebtReportRow = MonthlyDebtRow | YearlyDebtRow;
type MonthlyDebtsResponse = { rows: DebtReportRow[]; total: number; page: number; limit: number };
const pageSize = 10;
const monthNames = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

function debtPeriodLabel(value: string) {
  const year = value.slice(0, 4);
  if (value.length === 4) return `${year} yil uchun`;
  const month = monthNames[Number(value.slice(5, 7)) - 1].toLocaleLowerCase("uz-UZ");
  return `${year} yil ${month} oyi uchun`;
}

function tashkentYearMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

function addDebtQuery(query: URLSearchParams, status: DebtStatus, min: string, max: string) {
  if (status === "false") {
    if (min && Number(min) > 0) return false;
    query.set("remainingBalance", "0");
    return true;
  }
  if (status === "true") {
    if (max && Number(max) < 1) return false;
    if (!min && !max) {
      query.set("hasDebt", "true");
      return true;
    }
    query.set("remainingBalanceMin", String(Math.max(1, Number(min || 1))));
  } else if (min) {
    query.set("remainingBalanceMin", min);
  }
  if (max) query.set("remainingBalanceMax", max);
  return true;
}

function OptionPicker({ label, options, value, onChange }: {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [anchor, setAnchor] = useState({ x: 16, y: 80, width: 280, height: 46 });
  const triggerRef = useRef<View>(null);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const selected = options.find((option) => option.id === value);
  const matches = options.filter((option) =>
    option.name.toLocaleLowerCase("uz-UZ").includes(search.trim().toLocaleLowerCase("uz-UZ")),
  );
  function close() {
    setOpen(false);
    setSearch("");
  }
  function select(id: string) {
    onChange(id);
    close();
  }
  function openPicker() {
    Keyboard.dismiss();
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  }
  const popupHeight = Math.min(300, windowHeight - 32, 64 + 43 * Math.min(options.length + 1, 8));
  const below = anchor.y + anchor.height + 6;
  const popupTop = below + popupHeight <= windowHeight
    ? below
    : Math.max(8, anchor.y - popupHeight - 6);
  return (
    <View style={styles.picker}>
      <Text style={styles.label}>{label}</Text>
      <View ref={triggerRef} collapsable={false} style={styles.pickerButton}>
        <Pressable style={styles.pickerOpen} onPress={openPicker} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <Text style={styles.pickerValue} numberOfLines={1}>{selected?.name ?? "Barchasi"}</Text>
          <Text style={styles.link}>Tanlash</Text>
        </Pressable>
        <Pressable style={styles.pickerClear} onPress={() => onChange("")} accessibilityRole="button" accessibilityLabel={`Faqat ${label.toLocaleLowerCase("uz-UZ")} filtrini tozalash`}>
          <Text style={styles.pickerClearText}>×</Text>
        </Pressable>
      </View>
      <Modal visible={open} transparent animationType="none" onRequestClose={close}>
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Tanlash oynasini yopish" />
          <View style={[styles.pickerSheet, {
            left: Math.max(8, Math.min(anchor.x, windowWidth - anchor.width - 8)),
            top: popupTop,
            width: Math.min(anchor.width, windowWidth - 16),
            maxHeight: popupHeight,
          }]}>
            <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder={`${label}ni qidiring`} autoCapitalize="none" accessibilityLabel={`${label}ni qidirish`} />
            <ScrollView style={styles.options} keyboardShouldPersistTaps="always">
              <Pressable style={styles.option} onPress={() => select("")} accessibilityRole="button">
                <Text style={styles.optionText}>Barchasi</Text>
              </Pressable>
              {matches.slice(0, 8).map((option) => (
                <Pressable key={option.id} style={styles.option} onPress={() => select(option.id)} accessibilityRole="button">
                  <Text style={styles.optionText}>{option.name}</Text>
                </Pressable>
              ))}
              {matches.length === 0 && <Text style={styles.hint}>Topilmadi.</Text>}
              {matches.length > 8 && <Text style={styles.hint}>Qidiruvni aniqlashtiring.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function SalesPage() {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [appliedName, setAppliedName] = useState("");
  const [productId, setProductId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [debtFiltersOpen, setDebtFiltersOpen] = useState(false);
  const [debtStatus, setDebtStatus] = useState<DebtStatus>("");
  const [debtMin, setDebtMin] = useState("");
  const [debtMax, setDebtMax] = useState("");
  const [appliedDebtMin, setAppliedDebtMin] = useState("");
  const [appliedDebtMax, setAppliedDebtMax] = useState("");
  const [debtError, setDebtError] = useState("");
  const [{ year: currentYear, month: currentMonth }] = useState(tashkentYearMonth);
  const [reportYear, setReportYear] = useState(currentYear);
  const [reportMonth, setReportMonth] = useState(0);
  const [appliedMonth, setAppliedMonth] = useState("");
  const [monthError, setMonthError] = useState("");
  const [products, setProducts] = useState<Option[]>([]);
  const [regions, setRegions] = useState<Option[]>([]);
  const [rows, setRows] = useState<(Customer | NearbyCustomer | DebtReportRow)[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [point, setPoint] = useState<Point | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [radiusMeters, setRadiusMeters] = useState(5000);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [locationError, setLocationError] = useState("");
  const requestId = useRef(0);

  const expire = useCallback(async () => {
    await deleteStoredToken();
    router.replace("/");
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await getStoredToken();
        if (!stored) { router.replace("/"); return; }
        const headers = { Authorization: `Bearer ${stored}` };
        const [session, regionResult, productResult] = await Promise.all([
          apiRequest<{ user: User }>("/auth/me", { headers }),
          apiRequest<{ regions: Option[] }>("/regions", { headers }),
          apiRequest<{ products: Option[] }>("/products", { headers }),
        ]);
        if (!active) return;
        if (session.user.role !== "sotuvchi") { router.replace("/"); return; }
        setRegions(regionResult.regions);
        setProducts(productResult.products);
        setToken(stored);
      } catch (cause) {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) void expire();
        else setError(cause instanceof Error ? cause.message : "Ma'lumotlarni yuklab bo'lmadi.");
      }
    })();
    return () => { active = false; requestId.current += 1; };
  }, [expire]);

  useEffect(() => {
    const timer = setTimeout(() => { setAppliedName(name.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [name]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (debtMin && debtMax && Number(debtMin) > Number(debtMax)) {
        setDebtError("Eng kam qarz eng ko'p qarzdan katta bo'lmasligi kerak.");
        return;
      }
      setDebtError("");
      setAppliedDebtMin(debtMin);
      setAppliedDebtMax(debtMax);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [debtMin, debtMax]);

  const load = useCallback(async () => {
    if (!token) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if (appliedMonth) {
        const query = new URLSearchParams({
          year: appliedMonth.slice(0, 4),
          minAmount: appliedDebtMin || "0",
          maxAmount: appliedDebtMax || String(Number.MAX_SAFE_INTEGER),
          page: String(page),
          limit: String(pageSize),
        });
        if (appliedMonth.length === 7) query.set("month", String(Number(appliedMonth.slice(5, 7))));
        const result = await apiRequest<MonthlyDebtsResponse>(`/reports/monthly-debts?${query}`, { headers });
        if (currentRequest !== requestId.current) return;
        setRows(result.rows);
        setTotal(result.total);
      } else if (point) {
        const query = new URLSearchParams({ lat: String(point.latitude), long: String(point.longitude), radiusMeters: String(radiusMeters) });
        const result = await apiRequest<NearbyResponse>(`/customers/nearby?${query}`, { headers });
        if (currentRequest !== requestId.current) return;
        const search = appliedName.toLocaleLowerCase("uz-UZ");
        const filtered = result.customers.filter((customer) =>
          (!search || customer.name.toLocaleLowerCase("uz-UZ").includes(search)) &&
          (!productId || customer.productId === productId) &&
          (!regionId || customer.regionId === regionId) &&
          (!debtStatus || (customer.remainingBalance > 0) === (debtStatus === "true")) &&
          (!appliedDebtMin || customer.remainingBalance >= Number(appliedDebtMin)) &&
          (!appliedDebtMax || customer.remainingBalance <= Number(appliedDebtMax)),
        );
        setRows(filtered);
        setTotal(filtered.length);
      } else {
        const query = new URLSearchParams({ page: String(page), limit: String(pageSize) });
        if (appliedName) query.set("name", appliedName);
        if (productId) query.set("productId", productId);
        if (regionId) query.set("regionId", regionId);
        if (!addDebtQuery(query, debtStatus, appliedDebtMin, appliedDebtMax)) {
          setRows([]);
          setTotal(0);
          return;
        }
        const result = await apiRequest<CustomerListResponse>(`/customers?${query}`, { headers });
        if (currentRequest !== requestId.current) return;
        setRows(result.customers);
        setTotal(result.total);
      }
    } catch (cause) {
      if (currentRequest !== requestId.current) return;
      setRows([]);
      setTotal(0);
      if (cause instanceof ApiError && cause.status === 401) void expire();
      else setError(cause instanceof ApiError && cause.status === 403 && appliedMonth
        ? "Oylik qarzlar API'si bu foydalanuvchi uchun ruxsat etilmagan."
        : cause instanceof Error ? cause.message : "Mijozlar yuklanmadi.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [token, appliedMonth, point, radiusMeters, appliedName, productId, regionId, debtStatus, appliedDebtMin, appliedDebtMax, page, expire]);

  function applyMonth() {
    if (debtMin && debtMax && Number(debtMin) > Number(debtMax)) {
      setMonthError("Eng kam summa eng ko'p summadan katta bo'lmasligi kerak.");
      return;
    }
    setMonthError("");
    setName("");
    setAppliedName("");
    setProductId("");
    setRegionId("");
    setPoint(null);
    setDebtStatus("");
    setDebtFiltersOpen(true);
    setAppliedDebtMin(debtMin);
    setAppliedDebtMax(debtMax);
    setAppliedMonth(reportMonth ? `${reportYear}-${String(reportMonth).padStart(2, "0")}` : String(reportYear));
    setPage(1);
  }

  function leavePeriodFilter() {
    if (!appliedMonth) return;
    setAppliedMonth("");
    setReportYear(currentYear);
    setReportMonth(0);
    setMonthError("");
    setDebtMin("");
    setDebtMax("");
    setAppliedDebtMin("");
    setAppliedDebtMax("");
    setDebtError("");
    setPage(1);
  }

  useFocusEffect(useCallback(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(timer); requestId.current += 1; };
  }, [load]));

  async function locate() {
    if (locating) return;
    setLocating(true);
    setLocationError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setLocationError("Joylashuvga ruxsat berilmadi.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      leavePeriodFilter();
      setPage(1);
      setPoint({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch {
      setLocationError("Joylashuvni aniqlab bo'lmadi. Qayta urinib ko'ring.");
    } finally {
      setLocating(false);
    }
  }

  const header = (
    <View>
      <Text style={styles.title}>Qarzlarni undirish</Text>
      <Text style={styles.subtitle}>Mijozlarni tez toping va qarz ma&apos;lumotlarini oching.</Text>
      <View style={styles.filters}>
        <Text style={styles.label}>Mijoz ismi</Text>
        <View style={styles.nameField}>
          <TextInput style={[styles.input, !!name && styles.nameInput]} value={name} onChangeText={(value) => { leavePeriodFilter(); setName(value); }} placeholder="Ism bo'yicha qidirish" maxLength={100} accessibilityLabel="Mijoz ismi" />
          {!!name && (
            <Pressable
              style={styles.nameClear}
              onPress={() => { setName(""); setAppliedName(""); setPage(1); }}
              accessibilityRole="button"
              accessibilityLabel="Faqat mijoz ismini tozalash"
            >
              <Text style={styles.nameClearText}>×</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.locationRow}>
          <Text style={styles.label}>Yaqin atrof</Text>
          {point && <Pressable onPress={() => { leavePeriodFilter(); setPoint(null); setPage(1); }} accessibilityRole="button"><Text style={styles.link}>O&apos;chirish</Text></Pressable>}
        </View>
        <View style={styles.radiusRow}>
          {[1000, 3000, 5000].map((radius) => (
            <Pressable key={radius} style={[styles.radius, radiusMeters === radius && styles.radiusActive]} onPress={() => { leavePeriodFilter(); setRadiusMeters(radius); }} accessibilityRole="radio" accessibilityState={{ selected: radiusMeters === radius }}>
              <Text style={[styles.radiusText, radiusMeters === radius && styles.radiusTextActive]}>{radius / 1000} km</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.mapButton} onPress={() => setMapOpen(true)} accessibilityRole="button">
          <SymbolView name={{ ios: "map", android: "map", web: "map" }} size={18} tintColor="#FFFFFF" />
          <Text style={styles.mapButtonText}>{point ? "Xaritada joyni o'zgartirish" : "Xaritada joy tanlash"}</Text>
        </Pressable>
        <Pressable style={styles.locateButton} onPress={() => void locate()} disabled={locating} accessibilityRole="button">
          <SymbolView name={{ ios: "location", android: "my_location", web: "my_location" }} size={18} tintColor="#1677D2" />
          <Text style={styles.link}>{locating ? "Joylashuv aniqlanmoqda..." : point ? "Joylashuvni yangilash" : "Yaqindagi mijozlarni topish"}</Text>
        </Pressable>
        {point && <CurrentLocationPreview point={point} />}
        {point && <Text style={styles.hint}>Eng yaqin mijozlar birinchi. Masofa to&apos;g&apos;ri chiziq bo&apos;yicha.</Text>}
        {!!locationError && <Text style={styles.error} accessibilityRole="alert">{locationError}</Text>}
        <OptionPicker label="Mahsulot" options={products} value={productId} onChange={(value) => { leavePeriodFilter(); setProductId(value); setPage(1); }} />
        <OptionPicker label="Hudud" options={regions} value={regionId} onChange={(value) => { leavePeriodFilter(); setRegionId(value); setPage(1); }} />
        <Pressable
          style={styles.debtToggle}
          onPress={() => setDebtFiltersOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: debtFiltersOpen }}
        >
          <Text style={styles.debtToggleText}>Qarzi bo&apos;yicha filtrlar</Text>
          <Text style={styles.debtToggleText}>{debtFiltersOpen ? "−" : "+"}</Text>
        </Pressable>
        {debtFiltersOpen && <View style={styles.debtFields}>
          <Text style={styles.label}>Qarz holati</Text>
          <View style={styles.radiusRow}>
            {([
              { value: "", label: "Barchasi" },
              { value: "true", label: "Qarzi bor" },
              { value: "false", label: "To'langan" },
            ] as const).map((option) => (
              <Pressable
                key={option.value}
                style={[styles.radius, debtStatus === option.value && styles.radiusActive]}
                onPress={() => { leavePeriodFilter(); setDebtStatus(option.value); setPage(1); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: debtStatus === option.value }}
              >
                <Text style={[styles.radiusText, debtStatus === option.value && styles.radiusTextActive]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.debtAmountRow}>
            <View style={styles.debtAmountField}>
              <Text style={styles.label}>Qarz summasi: dan</Text>
              <TextInput style={styles.input} value={debtMin} onChangeText={(value) => setDebtMin(value.replace(/\D/g, ""))} placeholder="0" keyboardType="number-pad" maxLength={12} accessibilityLabel="Eng kam qarz summasi" />
            </View>
            <View style={styles.debtAmountField}>
              <Text style={styles.label}>Gacha</Text>
              <TextInput style={styles.input} value={debtMax} onChangeText={(value) => setDebtMax(value.replace(/\D/g, ""))} placeholder="Cheklanmagan" keyboardType="number-pad" maxLength={12} accessibilityLabel="Eng ko'p qarz summasi" />
            </View>
          </View>
          {!!debtError && <Text style={styles.error} accessibilityRole="alert">{debtError}</Text>}
          <Text style={[styles.label, styles.monthLabel]}>Qarz oyi</Text>
          <Text style={styles.monthFieldLabel}>Yil</Text>
          <View style={styles.monthOptions}>
            {Array.from({ length: currentYear - 2019 }, (_, index) => 2020 + index).map((year) => (
              <Pressable
                key={year}
                style={[styles.monthChoice, styles.yearChoice, reportYear === year && styles.monthChoiceSelected]}
                onPress={() => { setReportYear(year); setReportMonth(0); setMonthError(""); }}
                accessibilityRole="radio"
                accessibilityLabel={`${year}-yil`}
                accessibilityState={{ selected: reportYear === year }}
              >
                <Text style={[styles.monthChoiceText, reportYear === year && styles.monthChoiceTextSelected]}>{year}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.monthFieldLabel}>Oy</Text>
          <Pressable
            style={[styles.monthChoice, styles.wholeYearChoice, reportMonth === 0 && styles.monthChoiceSelected]}
            onPress={() => { setReportMonth(0); setMonthError(""); }}
            accessibilityRole="radio"
            accessibilityLabel={`${reportYear}-yilning barcha oylari`}
            accessibilityState={{ selected: reportMonth === 0 }}
          >
            <Text style={[styles.monthChoiceText, reportMonth === 0 && styles.monthChoiceTextSelected]}>Butun yil</Text>
          </Pressable>
          <View style={styles.monthOptions}>
            {monthNames.map((month, index) => {
              const value = index + 1;
              const future = reportYear === currentYear && value > currentMonth;
              const selected = reportMonth === value;
              return <Pressable
                key={month}
                style={[styles.monthChoice, styles.monthNameChoice, selected && styles.monthChoiceSelected, future && styles.disabled]}
                onPress={() => { setReportMonth(value); setMonthError(""); }}
                disabled={future}
                accessibilityRole="radio"
                accessibilityLabel={`${month} ${reportYear}`}
                accessibilityState={{ selected, disabled: future }}
              >
                <Text style={[styles.monthChoiceText, selected && styles.monthChoiceTextSelected]}>{month}</Text>
              </Pressable>;
            })}
          </View>
          <Text style={styles.hint}>{reportMonth ? "Summa chegaralari tanlangan oyda to‘lanmagan qismga qo‘llanadi." : "Summa chegaralari yil davomida to‘lanmagan jami qarzga qo‘llanadi."}</Text>
          {!!monthError && <Text style={styles.error} accessibilityRole="alert">{monthError}</Text>}
          <Pressable style={styles.monthButton} onPress={applyMonth} accessibilityRole="button">
            <Text style={styles.monthButtonText}>{reportMonth ? "Oylik qarzlarni ko‘rish" : "Yillik qarzlarni ko‘rish"}</Text>
          </Pressable>
          {!!appliedMonth && <Pressable style={styles.monthClear} onPress={() => { setAppliedMonth(""); setReportYear(currentYear); setReportMonth(0); setDebtMin(""); setDebtMax(""); setAppliedDebtMin(""); setAppliedDebtMax(""); setPage(1); }} accessibilityRole="button"><Text style={styles.link}>Davr filtrini tozalash</Text></Pressable>}
        </View>}
        {(name || productId || regionId || point || debtStatus || debtMin || debtMax || appliedMonth) && <Pressable style={styles.clear} onPress={() => { setName(""); setAppliedName(""); setProductId(""); setRegionId(""); setPoint(null); setDebtStatus(""); setDebtMin(""); setDebtMax(""); setAppliedDebtMin(""); setAppliedDebtMax(""); setDebtError(""); setReportYear(currentYear); setReportMonth(0); setAppliedMonth(""); setMonthError(""); setPage(1); }} accessibilityRole="button"><Text style={styles.link}>Filtrlarni tozalash</Text></Pressable>}
      </View>
      <View style={styles.summary}><Text style={styles.count}>{appliedMonth ? `${debtPeriodLabel(appliedMonth)} · ${total} ta mijoz` : `Jami: ${total} ta mijoz`}</Text><Pressable onPress={() => void load()} accessibilityRole="button"><Text style={styles.link}>Yangilash</Text></Pressable></View>
      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    </View>
  );

  return (
    <View style={styles.screen}>
    <View style={[styles.fixedHeader, { paddingTop: insets.top }]}>
      <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Orqaga qaytish"><Text style={styles.link}>‹ Orqaga</Text></Pressable>
    </View>
    <FlatList
      key={page}
      style={styles.list}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={<PullRefreshControl refreshing={loading} onRefresh={() => { void load(); }} />}
      data={loading ? [] : point ? rows.slice((page - 1) * pageSize, page * pageSize) : rows}
      keyExtractor={(item) => String(item.mijoz_id)}
      ListHeaderComponent={header}
      renderItem={({ item }) => {
        const isPeriodDebt = "debtAmount" in item;
        const { percent, tone } = getCustomerProgress(isPeriodDebt
          ? { totalPrice: item.paidAmount + item.debtAmount, totalPaid: item.paidAmount, remainingBalance: item.debtAmount }
          : item);
        const progress = <View style={styles.customerProgressRow}>
          <View
            style={[styles.customerProgressTrack, { backgroundColor: tone.track }]}
            accessibilityRole="progressbar"
            accessibilityLabel={isPeriodDebt ? "Davr uchun to'langan ulush" : "To'langan ulush"}
            accessibilityValue={{ min: 0, max: 100, now: percent }}
          >
            <View style={[styles.customerProgressFill, { width: `${percent}%`, backgroundColor: tone.fill }]} />
          </View>
          <Text style={[styles.customerProgressText, { color: tone.textColor }]}>{percent}%</Text>
        </View>;
        return isPeriodDebt ? (
        <Pressable style={[styles.customer, { backgroundColor: tone.background, borderColor: tone.track }]} onPress={() => router.push({ pathname: "/customers/detail", params: { mijoz_id: String(item.mijoz_id) } })} accessibilityRole="button" accessibilityLabel={`${item.name} ma'lumotlarini ko'rish`}>
          <View style={styles.customerTop}>
            <Text style={styles.customerName}>{item.name}</Text>
            <SymbolView name={{ ios: "eye", android: "visibility", web: "visibility" }} size={20} tintColor="#1677D2" />
          </View>
          {!!item.productName && <Text style={styles.customerMeta}>Mahsulot: {item.productName}</Text>}
          {!!item.createdAt && <Text style={styles.customerMeta}>Olingan sana: {formatDate(item.createdAt)}</Text>}
          <Text style={[styles.customerAmount, { color: tone.textColor }]}>{"months" in item ? "Shu yil qarzi" : "Shu oy qarzi"}: {formatMoney(item.debtAmount)}</Text>
          <Text style={styles.amountWords}>{formatMoneyWithUnits(item.debtAmount, true)}</Text>
          <Text style={[styles.customerMeta, item.paidAmount > 0 ? styles.paymentPaid : styles.paymentUnpaid]}>
            {item.paidAmount > 0 ? ("months" in item ? "Shu yil to'langan" : "Shu oy to'langan") : "To'lov qilinmagan"}: {formatMoney(item.paidAmount)}
          </Text>
          {progress}
        </Pressable>
      ) : (
        <Pressable style={[styles.customer, { backgroundColor: tone.background, borderColor: tone.track }]} onPress={() => router.push({ pathname: "/customers/detail", params: { mijoz_id: String(item.mijoz_id) } })} accessibilityRole="button" accessibilityLabel={`${item.name} ma'lumotlarini ko'rish`}>
          <View style={styles.customerTop}>
            <Text style={styles.customerName}>{item.name}</Text>
            <View style={styles.customerTopActions}>
              <Text style={[styles.badge, { color: tone.textColor, backgroundColor: tone.track }]}>
                {item.remainingBalance > 0 ? "Qarzi bor" : "To'langan"}
              </Text>
              <SymbolView name={{ ios: "eye", android: "visibility", web: "visibility" }} size={20} tintColor="#1677D2" />
            </View>
          </View>
          <Text style={styles.customerMeta}>Mijoz raqami: {item.mijoz_id}</Text>
          <Text style={styles.customerMeta}>{item.phoneNumber} · {item.productName}</Text>
          <Text style={[styles.customerAmount, { color: tone.textColor }]}>Qolgan qarz: {formatMoney(item.remainingBalance)}</Text>
          <Text style={styles.amountWords}>{formatMoneyWithUnits(item.remainingBalance, true)}</Text>
          {progress}
          <Text style={styles.customerMeta}>{formatDate(item.createdAt)}</Text>
          {"distanceMeters" in item && <Text style={styles.distance}>{item.distanceMeters < 1000 ? `${item.distanceMeters} m` : `${(item.distanceMeters / 1000).toLocaleString("uz-UZ", { maximumFractionDigits: 1 })} km`} uzoqlikda</Text>}
        </Pressable>
      );
      }}
      ListEmptyComponent={loading ? <View style={styles.loading}><LoadingMark size={48} /></View> : !error && token ? <Text style={styles.empty}>Mijoz topilmadi.</Text> : null}
      ListFooterComponent={!loading && !error ? <ListPagination
        page={page}
        limit={pageSize}
        total={point ? rows.length : total}
        onPageChange={setPage}
      /> : null}
    />
    <LocationPicker
      visible={mapOpen}
      value={point}
      onClose={() => setMapOpen(false)}
      onSelect={(selected) => {
        leavePeriodFilter();
        setPoint(selected);
        setPage(1);
        setLocationError("");
        setMapOpen(false);
      }}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5F7FA" },
  fixedHeader: { backgroundColor: "#F5F7FA", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#E8EDF3" },
  list: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  title: { color: "#172536", fontSize: 27, fontWeight: "800", marginTop: 8 },
  subtitle: { color: "#627184", fontSize: 14, lineHeight: 20, marginTop: 5, marginBottom: 18 },
  filters: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8EDF3", borderRadius: 16, padding: 16 },
  label: { color: "#172536", fontSize: 14, fontWeight: "700", marginBottom: 8 },
  input: { minHeight: 46, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10, paddingHorizontal: 12, color: "#172536", backgroundColor: "#FFFFFF" },
  nameField: { position: "relative" },
  nameInput: { paddingRight: 48 },
  nameClear: { position: "absolute", right: 1, top: 1, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  nameClearText: { color: "#627184", fontSize: 25, lineHeight: 27 },
  locationRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 18 },
  radiusRow: { flexDirection: "row", gap: 8 },
  radius: { flex: 1, minHeight: 40, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 9, alignItems: "center", justifyContent: "center" },
  radiusActive: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  radiusText: { color: "#45586E", fontWeight: "700" },
  radiusTextActive: { color: "#1677D2" },
  mapButton: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#1677D2", borderRadius: 10, marginTop: 12 },
  mapButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  locateButton: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EAF4FF", borderRadius: 10, marginTop: 10 },
  picker: { marginTop: 18 },
  pickerButton: { minHeight: 46, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10, flexDirection: "row", alignItems: "center" },
  pickerOpen: { flex: 1, minHeight: 44, paddingLeft: 12, paddingRight: 4, flexDirection: "row", alignItems: "center", gap: 8 },
  pickerValue: { flex: 1, color: "#172536" },
  pickerClear: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  pickerClearText: { color: "#627184", fontSize: 25, lineHeight: 27 },
  debtToggle: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#EAF4FF" },
  debtToggleText: { color: "#1677D2", fontSize: 13, fontWeight: "700" },
  debtFields: { paddingTop: 16 },
  debtAmountRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  debtAmountField: { flex: 1, minWidth: 0 },
  monthLabel: { marginTop: 18 },
  monthFieldLabel: { color: "#53647A", fontSize: 12, fontWeight: "700", marginBottom: 7 },
  monthOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 15 },
  monthChoice: { minHeight: 42, borderWidth: 1, borderColor: "#DCE4ED", borderRadius: 10, backgroundColor: "#FAFBFD", alignItems: "center", justifyContent: "center" },
  yearChoice: { width: "22%", flexGrow: 1 },
  monthNameChoice: { width: "30%", flexGrow: 1 },
  monthChoiceSelected: { borderColor: "#8FC3F4", backgroundColor: "#EAF4FF" },
  monthChoiceText: { color: "#53647A", fontSize: 13, fontWeight: "700" },
  monthChoiceTextSelected: { color: "#1677D2" },
  wholeYearChoice: { marginBottom: 8 },
  monthButton: { minHeight: 46, backgroundColor: "#1677D2", borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 14 },
  monthButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  monthClear: { alignSelf: "center", paddingVertical: 12 },
  pickerOverlay: { flex: 1 },
  pickerSheet: { position: "absolute", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, padding: 8, elevation: 7, shadowColor: "#172536", shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  options: { marginTop: 8 },
  option: { minHeight: 43, justifyContent: "center", paddingHorizontal: 8 },
  optionText: { color: "#172536", fontSize: 14 },
  clear: { minHeight: 44, backgroundColor: "#EAF4FF", borderRadius: 10, justifyContent: "center", alignItems: "center", marginTop: 18 },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginVertical: 16 },
  count: { flex: 1, color: "#172536", fontSize: 16, fontWeight: "800" },
  link: { color: "#1677D2", fontSize: 13, fontWeight: "700" },
  hint: { color: "#627184", fontSize: 12, lineHeight: 18, marginTop: 8 },
  error: { color: "#C3333D", fontSize: 13, marginTop: 10 },
  customer: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8EDF3", borderRadius: 15, padding: 16, marginBottom: 10 },
  customerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  customerTopActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  customerName: { flex: 1, color: "#172536", fontSize: 17, fontWeight: "800" },
  customerMeta: { color: "#627184", fontSize: 13, marginTop: 7 },
  paymentPaid: { color: "#16865A", fontWeight: "700" },
  paymentUnpaid: { color: "#C3333D", fontWeight: "700" },
  customerAmount: { color: "#172536", fontSize: 13, fontWeight: "700", marginTop: 10 },
  amountWords: { color: "#627184", fontSize: 12, marginTop: 4 },
  customerProgressRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 9 },
  customerProgressTrack: { flex: 1, height: 7, borderRadius: 4, overflow: "hidden" },
  customerProgressFill: { height: "100%", borderRadius: 4 },
  customerProgressText: { minWidth: 32, fontSize: 12, fontWeight: "700", textAlign: "right" },
  badge: { color: "#AD5D13", backgroundColor: "#FFF1E4", borderRadius: 8, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: "700" },
  badgePaid: { color: "#16865A", backgroundColor: "#E8F7F0" },
  distance: { color: "#1677D2", fontSize: 13, fontWeight: "700", marginTop: 8 },
  loading: { paddingVertical: 20, alignItems: "center" },
  empty: { textAlign: "center", color: "#627184", paddingVertical: 25 },
  pages: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 8 },
  pageButton: { minHeight: 44, paddingHorizontal: 16, backgroundColor: "#EAF4FF", borderRadius: 9, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.4 },
});
