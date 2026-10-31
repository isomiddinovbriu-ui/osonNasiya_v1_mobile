import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, apiRequestText, type User } from "./api";
import { formatMoney } from "./customers";
import DateFilterField, { formatUzDate } from "./DateFilterField";
import LoadingMark from "./LoadingMark";
import { formatMoneyWithUnits } from "./money";
import { PullRefreshControl, PullRefreshFeedback } from "./PullRefresh";
import { deleteStoredToken, getStoredToken } from "./session";

type ReportTab = "revenue" | "sales" | "debt" | "monthly-underpaid";
type RevenueGroup = "day" | "month";
type SalesGroup = "region" | "staff";
type RevenueReport = {
  rows: { period: string; paymentCount: number; amount: number }[];
  total: { paymentCount: number; amount: number };
};
type SalesReport = {
  rows: { id: string; name: string; salesCount: number; salesAmount: number }[];
  total: { salesCount: number; salesAmount: number };
};
type DebtReport = {
  asOfDate: string;
  customerCount: number;
  totalDebt: number;
  overdueCustomers: number;
  overdueDebt: number;
  unclassifiedCustomers: number;
  unclassifiedDebt: number;
};
type UnderpaidReport = {
  rows: {
    mijoz_id: number;
    name: string;
    regionId: string;
    monthlyAmount: number;
    paidAmount: number;
    shortfall: number;
    status: "underpaid" | "unpaid";
    message: string;
  }[];
  total: number;
  page: number;
  limit: number;
};
type ReportResult =
  | { kind: "revenue"; data: RevenueReport }
  | { kind: "sales"; data: SalesReport }
  | { kind: "debt"; data: DebtReport }
  | { kind: "monthly-underpaid"; data: UnderpaidReport };

const tabs = [
  { id: "revenue", label: "Tushum", icon: { ios: "banknote.fill", android: "payments", web: "payments" } },
  { id: "sales", label: "Savdo", icon: { ios: "bag.fill", android: "shopping_bag", web: "shopping_bag" } },
  { id: "debt", label: "Qarz", icon: { ios: "creditcard.fill", android: "credit_card", web: "credit_card" } },
  { id: "monthly-underpaid", label: "Oylik kamchilik", icon: { ios: "exclamationmark.circle.fill", android: "error_outline", web: "error_outline" } },
] as const;
const underpaidLimit = 20;
const reportMonths = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

function formatReportPeriod(period: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return formatUzDate(period, " ");
  const month = /^(\d{4})-(\d{2})$/.exec(period);
  if (month) {
    const name = reportMonths[Number(month[2]) - 1];
    if (name) return `${name.toLocaleLowerCase("uz-UZ")} ${month[1]} yil`;
  }
  return period;
}

function tashkentToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function daysBefore(date: string, count: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - count);
  return value.toISOString().slice(0, 10);
}

function previousMonth(date: string) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return {
    from: new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10),
  };
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function reportPath(tab: ReportTab, from: string, to: string, revenueGroup: RevenueGroup, salesGroup: SalesGroup, month: string, page: number) {
  if (tab === "revenue") return `/reports/revenue?from=${from}&to=${to}&groupBy=${revenueGroup}`;
  if (tab === "sales") return `/reports/sales?from=${from}&to=${to}&groupBy=${salesGroup}`;
  if (tab === "debt") return "/reports/debt";
  return `/reports/monthly-underpaid?month=${month}&page=${page}&limit=${underpaidLimit}`;
}

export default function ReportsPage() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<ReportTab>("revenue");
  const [from, setFrom] = useState(tashkentToday);
  const [to, setTo] = useState(tashkentToday);
  const [revenueGroup, setRevenueGroup] = useState<RevenueGroup>("day");
  const [salesGroup, setSalesGroup] = useState<SalesGroup>("region");
  const [reportYear, setReportYear] = useState(() => Number(tashkentToday().slice(0, 4)));
  const [reportMonth, setReportMonth] = useState(() => Number(tashkentToday().slice(5, 7)));
  const [appliedMonth, setAppliedMonth] = useState(() => tashkentToday().slice(0, 7));
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const requestSequence = useRef(0);
  const validPeriod = validDate(from) && validDate(to) && from <= to;

  const path = useMemo(
    () => reportPath(tab, from, to, revenueGroup, salesGroup, appliedMonth, page),
    [tab, from, to, revenueGroup, salesGroup, appliedMonth, page],
  );

  const load = useCallback(async (requestId: number) => {
    const isCurrent = () => requestSequence.current === requestId;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const token = await getStoredToken();
      if (!isCurrent()) return;
      if (!token) { router.replace("/"); return; }
      const headers = { Authorization: `Bearer ${token}` };
      const session = await apiRequest<{ user: User }>("/auth/me", { headers });
      if (!isCurrent()) return;
      if (session.user.role !== "super_admin") {
        setError("Hisobotlar faqat super admin uchun ochiq.");
        return;
      }
      let next: ReportResult;
      if (tab === "revenue") next = { kind: tab, data: await apiRequest<RevenueReport>(path, { headers }) };
      else if (tab === "sales") next = { kind: tab, data: await apiRequest<SalesReport>(path, { headers }) };
      else if (tab === "debt") next = { kind: tab, data: await apiRequest<DebtReport>(path, { headers }) };
      else next = { kind: tab, data: await apiRequest<UnderpaidReport>(path, { headers }) };
      if (isCurrent()) setResult(next);
    } catch (cause) {
      if (!isCurrent()) return;
      if (cause instanceof ApiError && cause.status === 401) {
        await deleteStoredToken();
        router.replace("/");
      } else {
        setError(cause instanceof ApiError && cause.status === 403
          ? "Hisobotlar faqat super admin uchun ochiq."
          : cause instanceof Error ? cause.message : "Hisobot yuklanmadi.");
      }
    } finally {
      if (isCurrent()) { setLoading(false); setRefreshing(false); }
    }
  }, [path, tab]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    if ((tab === "monthly-underpaid" && reportMonth === 0) || ((tab === "revenue" || tab === "sales") && !validPeriod)) return;
    const timer = setTimeout(() => { void load(requestId); }, 0);
    return () => { clearTimeout(timer); requestSequence.current += 1; };
  }, [load, refreshKey, reportMonth, tab, validPeriod]);

  function selectDateRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    if (!validDate(nextFrom) || !validDate(nextTo) || nextFrom > nextTo) {
      requestSequence.current += 1;
      setResult(null);
      setLoading(false);
      setRefreshing(false);
      setError("");
    }
  }

  async function exportCsv() {
    if (exporting || loading || !result || result.kind !== tab) return;
    setExporting(true);
    setExportError("");
    try {
      const token = await getStoredToken();
      if (!token) { router.replace("/"); return; }
      const separator = path.includes("?") ? "&" : "?";
      const csv = await apiRequestText(`${path}${separator}format=csv`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" },
      });
      const filename = `hisobot-${tab}-${tab === "monthly-underpaid" ? `${appliedMonth}-${page}` : tab === "debt" ? tashkentToday() : `${from}-${to}`}.csv`;
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        if (!await Sharing.isAvailableAsync()) throw new Error("Bu qurilmada fayl ulashish mavjud emas.");
        const file = new File(Paths.cache, filename);
        file.create({ overwrite: true });
        file.write(csv);
        await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: "Hisobot CSV" });
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await deleteStoredToken();
        router.replace("/");
      } else {
        setExportError(cause instanceof Error ? cause.message : "CSV olinmadi.");
      }
    } finally {
      setExporting(false);
    }
  }

  const underpaidPages = result?.kind === "monthly-underpaid"
    ? Math.max(1, Math.ceil(result.data.total / result.data.limit)) : 1;
  const todayKey = tashkentToday();
  const currentYear = Number(todayKey.slice(0, 4));
  const currentMonth = Number(todayKey.slice(5, 7));
  const reportYears = Array.from({ length: currentYear - 2019 }, (_, index) => 2020 + index);
  const datePresets = [
    { label: "Bugun", from: todayKey, to: todayKey },
    { label: "Oxirgi 7 kun", from: daysBefore(todayKey, 6), to: todayKey },
    { label: "Shu oy", from: `${todayKey.slice(0, 7)}-01`, to: todayKey },
    { label: "O‘tgan oy", ...previousMonth(todayKey) },
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerContent}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.back}>
            <SymbolView name={{ ios: "chevron.left", android: "arrow_back", web: "arrow_back" }} size={18} tintColor="#1677D2" />
            <Text style={styles.link}>Bosh sahifa</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: 20, paddingBottom: insets.bottom + 36 }]} keyboardShouldPersistTaps="handled" refreshControl={<PullRefreshControl refreshing={refreshing} onRefresh={() => { if (loading || refreshing || (tab === "monthly-underpaid" && reportMonth === 0) || ((tab === "revenue" || tab === "sales") && !validPeriod)) return; setRefreshing(true); setRefreshKey((value) => value + 1); }} />}>
      <Text style={styles.eyebrow}>BOSHQARUV PANELI</Text>
      <Text style={styles.title}>Hisobotlar</Text>
      <PullRefreshFeedback active={refreshing} />
      <Text style={styles.subtitle}>Moliyaviy ko‘rsatkichlarni bir joyda kuzating</Text>
      <Text style={styles.sectionLabel}>HISOBOT TURI</Text>
      <View style={styles.tabs} accessibilityRole="tablist">
        {tabs.map((item) => {
          const selected = tab === item.id;
          return <Pressable key={item.id} onPress={() => { setTab(item.id); setRefreshing(false); setExportError(""); }} accessibilityRole="tab" accessibilityState={{ selected }} style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.tabPressed]}>
            <View style={[styles.tabIcon, selected && styles.tabIconSelected]}>
              <SymbolView name={item.icon} size={20} tintColor={selected ? "#FFFFFF" : "#1677D2"} />
            </View>
            <Text numberOfLines={2} style={[styles.tabText, selected && styles.tabTextSelected]}>{item.label}</Text>
          </Pressable>;
        })}
      </View>

      {tab !== "debt" && <View style={styles.filterCard}>
        <View style={styles.filterHeading}>
          <View style={styles.filterHeadingIcon}><SymbolView name={{ ios: "calendar", android: "calendar_month", web: "calendar_month" }} size={19} tintColor="#1677D2" /></View>
          <View><Text style={styles.filterTitle}>{tab === "monthly-underpaid" ? "Hisobot oyi" : "Hisobot davri"}</Text><Text style={styles.filterSubtitle}>Toshkent vaqti bo‘yicha</Text></View>
        </View>
        {tab === "monthly-underpaid" ? <>
          <Text style={styles.inputLabel}>Yil</Text>
          <View style={styles.reportOptions}>
            {reportYears.map((year) => <Pressable key={year} onPress={() => { if (year === reportYear) return; requestSequence.current += 1; setReportYear(year); setReportMonth(0); setResult(null); setLoading(false); setRefreshing(false); setError(""); }} accessibilityRole="radio" accessibilityLabel={`${year}-yil`} accessibilityState={{ selected: reportYear === year }} style={[styles.reportOption, styles.yearOption, reportYear === year && styles.reportOptionSelected]}>
              <Text style={[styles.reportOptionText, reportYear === year && styles.reportOptionTextSelected]}>{year}</Text>
            </Pressable>)}
          </View>
          <Text style={styles.inputLabel}>Oy</Text>
          <View style={styles.reportOptions}>
            {reportMonths.map((name, index) => {
              const value = index + 1;
              const future = reportYear === currentYear && value > currentMonth;
              const selected = reportMonth === value;
              return <Pressable key={name} onPress={() => { setReportMonth(value); setPage(1); setAppliedMonth(`${reportYear}-${String(value).padStart(2, "0")}`); setRefreshKey((current) => current + 1); }} disabled={future} accessibilityRole="radio" accessibilityLabel={`${name} ${reportYear}`} accessibilityState={{ selected, disabled: future }} style={[styles.reportOption, styles.monthOption, selected && styles.reportOptionSelected, future && styles.disabled]}>
                <Text style={[styles.reportOptionText, selected && styles.reportOptionTextSelected]}>{name}</Text>
              </Pressable>;
            })}
          </View>
        </> : <>
          <Text style={styles.inputLabel}>Tez tanlash</Text>
          <View style={styles.datePresets}>
            {datePresets.map((preset) => {
              const selected = from === preset.from && to === preset.to;
              return <Pressable key={preset.label} onPress={() => selectDateRange(preset.from, preset.to)} accessibilityRole="button" accessibilityState={{ selected }} style={[styles.datePreset, selected && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, selected && styles.datePresetTextSelected]}>{preset.label}</Text>
              </Pressable>;
            })}
          </View>
          <DateFilterField label="Boshlanish" value={from} todayKey={todayKey} modal historicalPresets longFormat onChange={(value) => selectDateRange(value, value && value > to ? value : to)} />
          <DateFilterField label="Tugash" value={to} todayKey={todayKey} modal historicalPresets longFormat onChange={(value) => selectDateRange(value && value < from ? value : from, value)} />
          <Text style={styles.hint}>Ikkala sana ham hisobga olinadi</Text>
          <Text style={styles.inputLabel}>Guruhlash</Text>
          <View style={styles.groupRow}>
            {(tab === "revenue" ? [{ value: "day", label: "Kun" }, { value: "month", label: "Oy" }] : [{ value: "region", label: "Hudud" }, { value: "staff", label: "Xodim" }]).map((item) => {
              const selected = tab === "revenue" ? revenueGroup === item.value : salesGroup === item.value;
              return <Pressable key={item.value} onPress={() => tab === "revenue" ? setRevenueGroup(item.value as RevenueGroup) : setSalesGroup(item.value as SalesGroup)} accessibilityRole="radio" accessibilityState={{ selected }} style={[styles.chip, selected && styles.chipSelected]}>
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{item.label}</Text>
              </Pressable>;
            })}
          </View>
        </>}
        {tab !== "monthly-underpaid" && !validPeriod && <Text style={styles.error} accessibilityRole="alert">Hisobot uchun ikkala sanani tanlang.</Text>}
      </View>}

      {tab === "monthly-underpaid" && reportMonth === 0 && <Text style={styles.hint}>Hisobotni ko‘rish uchun oyni tanlang.</Text>}
      {tab === "debt" && <View style={styles.debtNote}><SymbolView name={{ ios: "info.circle.fill", android: "info", web: "info" }} size={20} tintColor="#1677D2" /><Text style={styles.debtNoteText}>Qarz holati ayni vaqtdagi ma’lumotlar asosida olinadi.</Text></View>}
      {loading && !refreshing && <View style={styles.loading}><LoadingMark size={64} /><Text style={styles.muted}>Hisobot yuklanmoqda...</Text></View>}
      {!!error && !loading && <View style={styles.errorCard}>
        <View style={styles.errorIcon}><SymbolView name={{ ios: "exclamationmark.circle.fill", android: "error_outline", web: "error_outline" }} size={25} tintColor="#C94A4F" /></View>
        <Text style={styles.errorTitle}>Hisobot yuklanmadi</Text>
        <Text style={styles.errorDetail} accessibilityRole="alert">{error}</Text>
        <Pressable onPress={() => setRefreshKey((value) => value + 1)} accessibilityRole="button" style={styles.retryButton}><SymbolView name={{ ios: "arrow.clockwise", android: "refresh", web: "refresh" }} size={17} tintColor="#1677D2" /><Text style={styles.link}>Qayta yuklash</Text></Pressable>
      </View>}

      {!loading && !error && result?.kind === "revenue" && <>
        <Summary title="Jami tushum" amount={result.data.total.amount} count={`${result.data.total.paymentCount} ta to‘lov`} />
        {result.data.rows.length === 0 && <Empty />}
        {result.data.rows.map((row) => <View key={row.period} style={styles.card}><Text style={styles.rowTitle}>{formatReportPeriod(row.period)}</Text><AmountText value={row.amount} /><Text style={styles.muted}>{row.paymentCount} ta to‘lov</Text></View>)}
      </>}
      {!loading && !error && result?.kind === "sales" && <>
        <Summary title="Jami savdo" amount={result.data.total.salesAmount} count={`${result.data.total.salesCount} ta savdo`} />
        {result.data.rows.length === 0 && <Empty />}
        {result.data.rows.map((row) => <View key={row.id} style={styles.card}><Text style={styles.rowTitle}>{row.name}</Text><AmountText value={row.salesAmount} /><Text style={styles.muted}>{row.salesCount} ta savdo</Text></View>)}
      </>}
      {!loading && !error && result?.kind === "debt" && <>
        <Text style={styles.asOf}>Sana: {result.data.asOfDate}</Text>
        <Summary title="Jami qolgan qarz" amount={result.data.totalDebt} count={`${result.data.customerCount} ta mijoz`} />
        <View style={styles.card}><Text style={styles.rowTitle}>Muddati o‘tgan qarz</Text><AmountText value={result.data.overdueDebt} /><Text style={styles.muted}>{result.data.overdueCustomers} ta mijoz</Text></View>
        <View style={styles.card}><Text style={styles.rowTitle}>Hisoblanmagan yozuvlar</Text><AmountText value={result.data.unclassifiedDebt} /><Text style={styles.muted}>{result.data.unclassifiedCustomers} ta mijoz</Text></View>
        <Text style={styles.hint}>Muddati o‘tgan qarz to‘lov jadvalisiz hisoblangan ko‘rsatkich. Penya qo‘shilmagan.</Text>
      </>}
      {!loading && !error && result?.kind === "monthly-underpaid" && <>
        <Text style={styles.count}>{appliedMonth} · {result.data.total} ta to‘lamagan yoki kam to‘lagan mijoz</Text>
        {result.data.rows.length === 0 && <Empty />}
        {result.data.rows.map((row) => <Pressable key={row.mijoz_id} style={styles.card} onPress={() => router.push({ pathname: "/customers/detail", params: { mijoz_id: String(row.mijoz_id) } })} accessibilityRole="button">
          <View style={styles.rowHeading}><Text style={styles.rowTitle}>{row.name}</Text><Text style={styles.link}>›</Text></View>
          <Text style={styles.muted}>Mijoz #{row.mijoz_id} · Hudud: {row.regionId}</Text>
          <Text style={styles.underpaidMessage}>{row.status === "unpaid" ? "To‘lov qilinmagan" : "Qisman to‘langan"} · {row.message}</Text>
          <Info label="Oylik summa" value={formatMoney(row.monthlyAmount)} />
          <Info label="To‘langan" value={formatMoney(row.paidAmount)} />
          <Info label="Yetishmayotgan" value={formatMoney(row.shortfall)} emphasized />
        </Pressable>)}
        {underpaidPages > 1 && <View style={styles.pagination}>
          <Pressable disabled={page <= 1} onPress={() => setPage((value) => value - 1)} accessibilityRole="button" style={[styles.pageButton, page <= 1 && styles.disabled]}><Text style={styles.link}>‹ Oldingi</Text></Pressable>
          <Text style={styles.muted}>{page} / {underpaidPages}</Text>
          <Pressable disabled={page >= underpaidPages} onPress={() => setPage((value) => value + 1)} accessibilityRole="button" style={[styles.pageButton, page >= underpaidPages && styles.disabled]}><Text style={styles.link}>Keyingi ›</Text></Pressable>
        </View>}
      </>}

      {!loading && !error && result?.kind === tab && <View style={styles.actions}>
        <Pressable onPress={() => setRefreshKey((value) => value + 1)} accessibilityRole="button" style={styles.secondaryButton}><Text style={styles.link}>Yangilash</Text></Pressable>
        <Pressable onPress={() => void exportCsv()} disabled={exporting} accessibilityRole="button" style={[styles.secondaryButton, exporting && styles.disabled]}><Text style={styles.link}>{exporting ? "CSV olinmoqda..." : "CSV olish"}</Text></Pressable>
        {tab === "monthly-underpaid" && <Text style={styles.hint}>CSV faqat {page}-sahifadagi mijozlarni o‘z ichiga oladi.</Text>}
        {!!exportError && <Text style={styles.error} accessibilityRole="alert">{exportError}</Text>}
      </View>}
      </ScrollView>
    </View>
  );
}

function Summary({ title, amount, count }: { title: string; amount: number; count: string }) {
  return <View style={styles.summary}><Text style={styles.summaryLabel}>{title}</Text><AmountText value={amount} summary /><Text style={styles.summaryCount}>{count}</Text></View>;
}

function AmountText({ value, summary = false }: { value: number; summary?: boolean }) {
  const words = formatMoneyWithUnits(value);
  return <Text style={summary ? styles.summaryAmount : styles.rowAmount}>{formatMoney(value)}{words && <Text style={styles.amountWords}> ({words})</Text>}</Text>;
}

function Info({ label, value, emphasized }: { label: string; value: string; emphasized?: boolean }) {
  return <View style={styles.info}><Text style={styles.infoLabel}>{label}</Text><Text style={[styles.infoValue, emphasized && styles.emphasized]}>{value}</Text></View>;
}

function Empty() { return <View style={styles.card}><Text style={styles.muted}>Bu davr uchun ma’lumot yo‘q.</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  scroll: { flex: 1 },
  header: { backgroundColor: "#F6F8FB", borderBottomWidth: 1, borderBottomColor: "#E5EBF2", paddingBottom: 4 },
  headerContent: { paddingHorizontal: 18, maxWidth: 600, width: "100%", alignSelf: "center" },
  content: { paddingHorizontal: 18, maxWidth: 600, width: "100%", alignSelf: "center" },
  back: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44 },
  link: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  eyebrow: { color: "#1677D2", fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 6 },
  title: { color: "#172536", fontSize: 29, fontWeight: "800" },
  subtitle: { color: "#748397", fontSize: 14, lineHeight: 20, marginTop: 5, marginBottom: 27 },
  sectionLabel: { color: "#738197", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 10 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 18 },
  tab: { width: "48%", minHeight: 76, flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 11, borderRadius: 16, borderWidth: 1, borderColor: "#E5EBF2", backgroundColor: "#FFFFFF" },
  tabSelected: { borderColor: "#9ACBFA", backgroundColor: "#EFF7FF" },
  tabPressed: { opacity: 0.72 },
  tabIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center" },
  tabIconSelected: { backgroundColor: "#1677D2" },
  tabText: { flex: 1, color: "#354558", fontSize: 13, lineHeight: 17, fontWeight: "700" },
  tabTextSelected: { color: "#145EAA" },
  filterCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, marginBottom: 17, borderWidth: 1, borderColor: "#E5EBF2" },
  filterHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  filterHeadingIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center" },
  filterTitle: { color: "#172536", fontSize: 16, fontWeight: "800" },
  filterSubtitle: { color: "#8190A1", fontSize: 12, marginTop: 2 },
  datePresets: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 2 },
  datePreset: { minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: "#DCE4ED", backgroundColor: "#FAFBFD", paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  datePresetSelected: { borderColor: "#A8D0F5", backgroundColor: "#EAF4FF" },
  datePresetText: { color: "#53647A", fontSize: 13, fontWeight: "700" },
  datePresetTextSelected: { color: "#1677D2" },
  inputLabel: { color: "#53647A", fontSize: 12, fontWeight: "700", marginBottom: 7 },
  reportOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 15 },
  reportOption: { minHeight: 42, borderWidth: 1, borderColor: "#DCE4ED", borderRadius: 10, backgroundColor: "#FAFBFD", alignItems: "center", justifyContent: "center" },
  yearOption: { width: "22%", flexGrow: 1 },
  monthOption: { width: "30%", flexGrow: 1 },
  reportOptionSelected: { borderColor: "#8FC3F4", backgroundColor: "#EAF4FF" },
  reportOptionText: { color: "#53647A", fontSize: 13, fontWeight: "700" },
  reportOptionTextSelected: { color: "#1677D2" },
  groupRow: { flexDirection: "row", gap: 8, marginTop: 1, marginBottom: 13 },
  chip: { minHeight: 37, minWidth: 76, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: "#E9EDF3", backgroundColor: "#F2F5F8", alignItems: "center", justifyContent: "center" },
  chipSelected: { backgroundColor: "#EAF4FF", borderColor: "#A8D0F5" },
  chipText: { color: "#627184", fontSize: 13, fontWeight: "700" },
  chipTextSelected: { color: "#1677D2" },
  debtNote: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14, backgroundColor: "#EAF4FF", marginBottom: 17 },
  debtNoteText: { flex: 1, color: "#426689", fontSize: 13, lineHeight: 19 },
  loading: { alignItems: "center", paddingVertical: 36 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 17, borderWidth: 1, borderColor: "#E5EBF2", marginBottom: 10 },
  errorCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 22, borderWidth: 1, borderColor: "#F0E2E2", alignItems: "center" },
  errorIcon: { width: 49, height: 49, borderRadius: 16, backgroundColor: "#FFF0F0", alignItems: "center", justifyContent: "center", marginBottom: 11 },
  errorTitle: { color: "#172536", fontSize: 17, fontWeight: "800", textAlign: "center" },
  errorDetail: { color: "#A65357", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 5 },
  retryButton: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 16, marginTop: 17, borderRadius: 10, backgroundColor: "#EDF6FF" },
  error: { color: "#C3333D", fontSize: 13, lineHeight: 19, marginTop: 8 },
  muted: { color: "#627184", fontSize: 13, lineHeight: 19 },
  hint: { color: "#8290A1", fontSize: 12, lineHeight: 18, marginBottom: 14 },
  summary: { borderRadius: 18, backgroundColor: "#E7F2FF", padding: 20, marginBottom: 15 },
  summaryLabel: { color: "#1769B6", fontSize: 13, fontWeight: "700" },
  summaryAmount: { color: "#173B61", fontSize: 27, fontWeight: "800", marginTop: 5 },
  amountWords: { color: "#627184", fontSize: 13, fontWeight: "500" },
  summaryCount: { color: "#4C6B88", fontSize: 13, marginTop: 5 },
  rowHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowTitle: { color: "#172536", fontSize: 16, fontWeight: "800", marginBottom: 7 },
  rowAmount: { color: "#172536", fontSize: 20, fontWeight: "800", marginBottom: 5 },
  asOf: { color: "#627184", fontSize: 13, marginBottom: 10 },
  count: { color: "#627184", fontSize: 13, marginBottom: 12 },
  underpaidMessage: { color: "#A96717", fontSize: 12, fontWeight: "700", marginTop: 7 },
  info: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingTop: 9 },
  infoLabel: { color: "#627184", fontSize: 13 },
  infoValue: { color: "#172536", fontSize: 13, fontWeight: "700", textAlign: "right" },
  emphasized: { color: "#C26A1A" },
  pagination: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  pageButton: { paddingVertical: 12, paddingHorizontal: 5 },
  disabled: { opacity: 0.45 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  secondaryButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: "#BFD8F2", backgroundColor: "#FFFFFF", justifyContent: "center" },
});
