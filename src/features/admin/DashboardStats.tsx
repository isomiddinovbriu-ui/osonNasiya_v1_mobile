import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { apiRequest, type User } from "./api";
import DateFilterField, { formatUzDate } from "./DateFilterField";
import { formatMoneyWithUnits } from "./money";
import { getStoredToken } from "./session";

type DuePeriod = {
  dueRemainingAmount: number;
  dueCustomerCount: number;
  paidAmount: number;
  paidCustomerCount: number;
  initialPaidAmount: number;
  initialPaidCustomerCount: number;
  otherMonthPaidAmount: number;
  otherMonthPaidCustomerCount: number;
  unassignedPaidAmount: number;
  unassignedPaidCustomerCount: number;
};
type SalesStats = {
  soldAmount: number;
  salesCount: number;
  fullyPaidCount: number;
  remainingAmount: number;
  remainingCustomerCount: number;
  month: DuePeriod & { month: string };
  today: DuePeriod & { date: string };
};
type CollectionPeriod = {
  amount: number;
  paymentCount: number;
  customerCount: number;
  initialAmount: number;
  installmentAmount: number;
};
type CollectionStats = {
  allTime: CollectionPeriod;
  month: CollectionPeriod & { month: string };
  today: CollectionPeriod & { date: string };
};
type Region = { id: string; name: string };
type Option = { id: string; name: string; detail?: string };
type PaymentCategory = "current_month" | "other_month" | "initial" | "unassigned";

const months = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

function tashkentToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function monthLabel(month: string) {
  const [year, number] = month.split("-").map(Number);
  return `${months[number - 1]} ${year}`;
}

function money(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value).replace(/,/g, " ")} so'm`;
}

function MonthPicker({ value, currentMonth, onChange }: { value: string; currentMonth: string; onChange: (month: string) => void }) {
  const [open, setOpen] = useState(false);
  const [visibleYear, setVisibleYear] = useState(() => Number(value.slice(0, 4)));
  const currentYear = Number(currentMonth.slice(0, 4));

  function openPicker() {
    setVisibleYear(Number(value.slice(0, 4)));
    setOpen(true);
  }

  function choose(month: string) {
    onChange(month);
    setOpen(false);
  }

  return <View>
    <Text style={styles.filterLabel}>Oylik ko‘rsatkich</Text>
    <Pressable style={[styles.monthPickerTrigger, open && styles.monthPickerTriggerOpen]} onPress={openPicker} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Oylik ko‘rsatkich, ${monthLabel(value)}`}>
      <Text style={styles.monthPickerValue}>{monthLabel(value)}</Text>
      <Text style={styles.monthPickerIcon}>▦</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.monthModalRoot} accessibilityViewIsModal>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Oy tanlash oynasini yopish" />
        <View style={styles.monthModalCard}>
          <View style={styles.monthModalHeading}>
            <Text style={styles.monthModalTitle}>Oyni tanlang</Text>
            <Pressable style={styles.monthCloseButton} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Yopish"><Text style={styles.monthCloseText}>×</Text></Pressable>
          </View>
          <View style={styles.yearRow}>
            <Pressable style={styles.yearArrow} onPress={() => setVisibleYear((year) => year - 1)} accessibilityRole="button" accessibilityLabel="Oldingi yil"><Text style={styles.yearArrowText}>‹</Text></Pressable>
            <Text style={styles.yearText}>{visibleYear} yil</Text>
            <Pressable style={[styles.yearArrow, visibleYear >= currentYear && styles.disabled]} onPress={() => setVisibleYear((year) => year + 1)} disabled={visibleYear >= currentYear} accessibilityRole="button" accessibilityLabel="Keyingi yil"><Text style={styles.yearArrowText}>›</Text></Pressable>
          </View>
          <View style={styles.monthGrid}>
            {months.map((name, index) => {
              const option = `${visibleYear}-${String(index + 1).padStart(2, "0")}`;
              const selected = option === value;
              const future = option > currentMonth;
              return <Pressable key={name} style={[styles.monthOption, selected && styles.monthOptionSelected, future && styles.disabled]} onPress={() => choose(option)} disabled={future} accessibilityRole="button" accessibilityLabel={`${name} ${visibleYear}`} accessibilityState={{ selected, disabled: future }}>
                <Text style={[styles.monthOptionText, selected && styles.monthOptionTextSelected]}>{name}</Text>
              </Pressable>;
            })}
          </View>
          <Pressable style={styles.currentMonthButton} onPress={() => choose(currentMonth)} accessibilityRole="button"><Text style={styles.currentMonthText}>Joriy oy</Text></Pressable>
        </View>
      </View>
    </Modal>
  </View>;
}

function FilterPicker({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((item) => item.id === value);
  const matches = options.filter((item) => `${item.name} ${item.detail ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <View style={styles.filterBlock}>
    <Text style={styles.filterLabel}>{label}</Text>
    <Pressable style={styles.filterTrigger} onPress={() => { setOpen((current) => !current); setSearch(""); }} accessibilityRole="button" accessibilityState={{ expanded: open }}>
      <Text style={styles.filterValue} numberOfLines={1}>{selected?.name ?? "Barchasi"}</Text>
      <Text style={styles.filterArrow}>{open ? "⌃" : "⌄"}</Text>
    </Pressable>
    {open && <View style={styles.filterOptions}>
      <TextInput value={search} onChangeText={setSearch} style={styles.filterSearch} placeholder={`${label}ni qidiring`} placeholderTextColor="#8B97A8" maxLength={100} />
      <Pressable style={styles.filterOption} onPress={() => { onChange(""); setOpen(false); }} accessibilityRole="button"><Text style={styles.filterOptionText}>Barchasi</Text></Pressable>
      {matches.slice(0, 8).map((item) => <Pressable key={item.id} style={styles.filterOption} onPress={() => { onChange(item.id); setOpen(false); }} accessibilityRole="button">
        <Text style={styles.filterOptionText}>{item.name}</Text>
        {!!item.detail && <Text style={styles.filterOptionDetail}>{item.detail}</Text>}
      </Pressable>)}
      {matches.length === 0 && <Text style={styles.hint}>Topilmadi.</Text>}
      {matches.length > 8 && <Text style={styles.hint}>Yana {matches.length - 8} ta natija bor. Qidiruvni aniqlashtiring.</Text>}
    </View>}
  </View>;
}

function StatCard({ title, amount, detail, tint }: {
  title: string;
  amount: number;
  detail: string;
  tint: string;
}) {
  return <View style={[styles.statCard, { backgroundColor: tint }]}>
    <Text style={styles.statTitle}>{title}</Text>
    <Text style={styles.statAmount} adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1}>{money(amount)}</Text>
    <Text style={styles.amountWords}>({formatMoneyWithUnits(amount)})</Text>
    <Text style={styles.statDetail}>{detail}</Text>
  </View>;
}

function CollectionBreakdown({ label, amount, onPress }: { label: string; amount: number; onPress?: () => void }) {
  const content = <>
    <Text style={[styles.collectionBreakdownAmount, onPress && styles.collectionBreakdownLink]}>{label}: {money(amount)}</Text>
    <Text style={styles.collectionBreakdownWords}>({formatMoneyWithUnits(amount)})</Text>
  </>;
  return onPress
    ? <Pressable style={styles.collectionBreakdown} onPress={(event) => { event.stopPropagation(); onPress(); }} accessibilityRole="button" accessibilityLabel={`${label} to‘lovlarini ko‘rish`}>{content}</Pressable>
    : <View style={styles.collectionBreakdown}>{content}</View>;
}

function CollectionPaymentRow({ label, amount, count, onPress }: { label: string; amount: number; count: number; onPress?: () => void }) {
  const content = <>
    <Text style={[styles.collectionBreakdownAmount, onPress && styles.collectionBreakdownLink]}>{label}: {money(amount)} · {count} kishi{onPress ? " ›" : ""}</Text>
    <Text style={styles.collectionBreakdownWords}>({formatMoneyWithUnits(amount)})</Text>
  </>;
  return onPress
    ? <Pressable style={styles.collectionBreakdown} onPress={(event) => { event.stopPropagation(); onPress(); }} accessibilityRole="button" accessibilityLabel={`${label} to‘lovlarini ko‘rish`}>{content}</Pressable>
    : <View style={styles.collectionBreakdown}>{content}</View>;
}

function CollectionCard({ title, value, tint, paidBreakdown, onOpenPaidCategory, onOpenPayments }: { title: string; value: CollectionPeriod; tint: string; paidBreakdown?: DuePeriod; onOpenPaidCategory?: (category: PaymentCategory) => void; onOpenPayments?: (category: "all" | "initial" | "installment") => void }) {
  const content = <>
    <Text style={styles.collectionTitle}>{title}</Text>
    <Text style={styles.collectionAmount} adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1}>{money(value.amount)}</Text>
    <Text style={styles.amountWords}>({formatMoneyWithUnits(value.amount)})</Text>
    <Text style={styles.statDetail}>{value.customerCount} kishi · {value.paymentCount} ta to‘lov</Text>
    {paidBreakdown ? <>
      <CollectionPaymentRow label="Shu oy uchun to‘langan" amount={paidBreakdown.paidAmount} count={paidBreakdown.paidCustomerCount} onPress={onOpenPaidCategory ? () => onOpenPaidCategory("current_month") : undefined} />
      <CollectionPaymentRow label="Boshlang‘ich to‘lov" amount={paidBreakdown.initialPaidAmount} count={paidBreakdown.initialPaidCustomerCount} onPress={onOpenPaidCategory ? () => onOpenPaidCategory("initial") : undefined} />
      <CollectionPaymentRow label="Boshqa oylar uchun" amount={paidBreakdown.otherMonthPaidAmount} count={paidBreakdown.otherMonthPaidCustomerCount} onPress={onOpenPaidCategory ? () => onOpenPaidCategory("other_month") : undefined} />
      <CollectionPaymentRow label="Oyi belgilanmagan" amount={paidBreakdown.unassignedPaidAmount} count={paidBreakdown.unassignedPaidCustomerCount} onPress={onOpenPaidCategory ? () => onOpenPaidCategory("unassigned") : undefined} />
    </> : <>
      <CollectionBreakdown label="Boshlang‘ich" amount={value.initialAmount} onPress={onOpenPayments ? () => onOpenPayments("initial") : undefined} />
      <CollectionBreakdown label="Keyingi" amount={value.installmentAmount} onPress={onOpenPayments ? () => onOpenPayments("installment") : undefined} />
    </>}
    {!!onOpenPayments && <Text style={styles.collectionOpenHint}>To‘lovlar ro‘yxatini ko‘rish ›</Text>}
  </>;
  return onOpenPayments
    ? <Pressable style={[styles.collectionCard, { backgroundColor: tint }]} onPress={() => onOpenPayments("all")} accessibilityRole="button" accessibilityLabel={`${title} to‘lovlar ro‘yxatini ko‘rish`}>{content}</Pressable>
    : <View style={[styles.collectionCard, { backgroundColor: tint }]}>{content}</View>;
}

export default function DashboardStats({ user, refreshKey }: { user: User; refreshKey: number }) {
  const admin = user.role === "super_admin";
  const [month, setMonth] = useState(() => tashkentToday().slice(0, 7));
  const [date, setDate] = useState(tashkentToday);
  const [createdBy, setCreatedBy] = useState("");
  const [regionId, setRegionId] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [filterError, setFilterError] = useState("");
  const [sales, setSales] = useState<SalesStats | null>(null);
  const [collections, setCollections] = useState<CollectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(false);

  useEffect(() => {
    if (!admin) return;
    let active = true;
    async function loadFilters() {
      try {
        const token = await getStoredToken();
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        const [staff, locations] = await Promise.all([
          apiRequest<{ users: User[] }>("/users", { headers }),
          apiRequest<{ regions: Region[] }>("/regions", { headers }),
        ]);
        if (active) { setUsers(staff.users); setRegions(locations.regions); setFilterError(""); }
      } catch (cause) {
        if (active) setFilterError(cause instanceof Error ? cause.message : "Filtrlar yuklanmadi.");
      }
    }
    void loadFilters();
    return () => { active = false; };
  }, [admin, retryKey]);

  useFocusEffect(useCallback(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const token = await getStoredToken();
        if (!token) throw new Error("Sessiya tugadi. Qayta kiring.");
        const headers = { Authorization: `Bearer ${token}` };
        const base = `month=${encodeURIComponent(month)}&date=${encodeURIComponent(date)}`;
        const region = admin && regionId ? `&regionId=${encodeURIComponent(regionId)}` : "";
        const seller = admin && createdBy ? `&createdBy=${encodeURIComponent(createdBy)}` : "";
        const collector = admin && createdBy ? `&receivedBy=${encodeURIComponent(createdBy)}` : "";
        const [nextSales, nextCollections] = await Promise.all([
          apiRequest<SalesStats>(`/dashboard/sales?${base}${region}${seller}`, { headers }),
          apiRequest<CollectionStats>(`/dashboard/collections?${base}${region}${collector}`, { headers }),
        ]);
        if (active) { setSales(nextSales); setCollections(nextCollections); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Statistika yuklanmadi.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
    // These keys intentionally restart the request after pull-to-refresh or Retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, createdBy, date, month, regionId, refreshKey, retryKey, user.id]));

  const currentMonth = tashkentToday().slice(0, 7);
  const staffOptions: Option[] = [user, ...users].filter((item) => item.role !== "product_creator").map((item) => ({ id: item.id, name: item.name || item.login, detail: `${item.login} · ${item.role}` }));

  const monthPaid = sales?.month;
  const monthBreakdownMatches = !!monthPaid && !!collections
    && monthPaid.initialPaidAmount === collections.month.initialAmount
    && monthPaid.paidAmount + monthPaid.otherMonthPaidAmount + monthPaid.unassignedPaidAmount === collections.month.installmentAmount;

  function openSalesPayments(category: PaymentCategory) {
    router.push({
      pathname: "/dashboard-payments",
      params: { month, category, ...(admin && createdBy ? { createdBy } : {}), ...(admin && regionId ? { regionId } : {}) },
    });
  }

  function openTodayCollections(category: "all" | "initial" | "installment") {
    router.push({
      pathname: "/dashboard-collection-payments",
      params: { date, category, ...(admin && createdBy ? { receivedBy: createdBy } : {}), ...(admin && regionId ? { regionId } : {}) },
    });
  }

  return <View style={styles.container}>
    <View style={styles.headingRow}>
      <View style={styles.headingText}>
        <Text style={styles.eyebrow}>DASHBOARD</Text>
        <Text style={styles.heading}>Statistika</Text>
      </View>
      <Pressable onPress={() => setRetryKey((current) => current + 1)} accessibilityRole="button" accessibilityLabel="Statistikani yangilash" style={styles.refreshButton}><Text style={styles.refreshText}>↻</Text></Pressable>
    </View>
    <Text style={styles.subtitle}>{admin ? "Umumiy savdo va tushum" : "Sizning savdolaringiz va qabul qilgan pullaringiz"}</Text>

    <Pressable style={styles.controlsToggle} onPress={() => setControlsOpen((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded: controlsOpen }} accessibilityLabel="Davr va filtrlarni tanlash">
      <View style={styles.controlsSummary}>
        <Text style={styles.controlsTitle}>{monthLabel(month)} · {formatUzDate(date)}</Text>
        <Text style={styles.controlsHint}>{admin && (createdBy || regionId) ? "Xodim yoki hudud filtri faol" : "Davr va filtrlarni o‘zgartirish"}</Text>
      </View>
      <Text style={styles.controlsArrow}>{controlsOpen ? "⌃" : "⌄"}</Text>
    </Pressable>

    {controlsOpen && admin && <View style={styles.filterCard}>
      <Text style={styles.filterHeading}>Filtrlar</Text>
      <FilterPicker label="Xodim" value={createdBy} options={staffOptions} onChange={setCreatedBy} />
      <FilterPicker label="Hudud" value={regionId} options={regions.map((item) => ({ id: item.id, name: item.name }))} onChange={setRegionId} />
      {!!filterError && <View><Text style={styles.errorText}>{filterError}</Text><Pressable onPress={() => setRetryKey((current) => current + 1)} accessibilityRole="button"><Text style={styles.retryText}>Filtrlarni qayta yuklash</Text></Pressable></View>}
    </View>}

    {controlsOpen && <View style={styles.periodCard}>
      <Text style={styles.filterHeading}>Davr</Text>
      <MonthPicker value={month} currentMonth={currentMonth} onChange={setMonth} />
      <DateFilterField label="Kunlik ko‘rsatkich" value={date} onChange={(value) => setDate(value || tashkentToday())} todayKey={tashkentToday()} modal quickPresets />
    </View>}

    {!!error && <View style={styles.errorCard}><Text style={styles.errorText} accessibilityRole="alert">{error}</Text><Pressable onPress={() => setRetryKey((current) => current + 1)} accessibilityRole="button"><Text style={styles.retryText}>Qayta urinish</Text></Pressable></View>}
    {loading && !sales && <Text style={styles.loadingText}>Statistika yuklanmoqda...</Text>}

    {sales && <View style={loading ? styles.stale : undefined}>
      <View style={[styles.sectionHeader, styles.salesHeader]}>
        <View style={[styles.sectionNumber, styles.salesNumber]}><Text style={styles.sectionNumberText}>01</Text></View>
        <View style={styles.sectionHeadingText}>
          <Text style={styles.sectionTitle}>{admin ? "Savdo statistikasi" : "Mening savdolarim"}</Text>
          <Text style={styles.sectionSubtitle}>{admin ? "Sotilgan summa va qolgan to‘lovlar" : "Siz yaratgan savdolar va ularning qoldig‘i"}</Text>
        </View>
      </View>
      <Pressable onPress={() => router.push("/customers")} accessibilityRole="button" accessibilityLabel="Jami sotilgan summa, mijozlar sahifasini ochish">
        <StatCard title="Jami sotilgan summa" amount={sales.soldAmount} detail={`${sales.fullyPaidCount} / ${sales.salesCount} ta savdo to‘liq to‘langan`} tint="#FDEDF2" />
      </Pressable>
      <StatCard title="To‘lanmagan summa" amount={sales.remainingAmount} detail={`${sales.remainingCustomerCount} / ${sales.salesCount} ta savdoda qoldiq bor`} tint="#E7F5FC" />
      <StatCard title="Bu oy to‘lanishi kerak" amount={sales.month.dueRemainingAmount} detail={`Qolgan summa · ${sales.month.dueCustomerCount} kishi`} tint="#F2FBE9" />
      <View style={styles.explainerCard}><Text style={styles.explainer}>Bu oylik qoldiq summa. Qabul qilingan pullar pastdagi bo‘limda ko‘rsatiladi.</Text></View>
    </View>}

    {collections && <View style={[styles.collectionsSection, loading && styles.stale]}>
      <View style={[styles.sectionHeader, styles.collectionsHeader]}>
        <View style={[styles.sectionNumber, styles.collectionsNumber]}><Text style={styles.sectionNumberText}>02</Text></View>
        <View style={styles.sectionHeadingText}>
          <Text style={styles.sectionTitle}>{admin ? "Qabul qilingan pullar" : "Qabul qilgan pullarim"}</Text>
          <Text style={styles.sectionSubtitle}>{admin ? "Pulni qabul qilgan xodim bo‘yicha" : "Shaxsan siz qabul qilgan to‘lovlar"}</Text>
        </View>
      </View>
      <CollectionCard title="Jami qabul qilingan" value={collections.allTime} tint="#EEF3FF" />
      <CollectionCard title="Bu oy qabul qilingan" value={collections.month} tint="#EBF8F4" paidBreakdown={monthBreakdownMatches ? monthPaid : undefined} onOpenPaidCategory={monthBreakdownMatches && admin && !createdBy ? openSalesPayments : undefined} />
      <CollectionCard title="Bugun qabul qilingan" value={collections.today} tint="#FFF2E9" onOpenPayments={openTodayCollections} />
      <View style={styles.explainerCard}><Text style={styles.explainer}>Bu yerda tanlangan davrda amalda qabul qilingan pul ko‘rsatiladi. Summa boshlang‘ich va keyingi to‘lovlarni o‘z ichiga oladi.</Text></View>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  container: { marginBottom: 32 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headingText: { flex: 1 },
  eyebrow: { color: "#1677D2", fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  heading: { color: "#172536", fontSize: 26, fontWeight: "800", marginTop: 4 },
  refreshButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: "#E8F2FF", alignItems: "center", justifyContent: "center" },
  refreshText: { color: "#1677D2", fontSize: 29, lineHeight: 32 },
  subtitle: { color: "#627184", fontSize: 14, marginTop: 6, marginBottom: 18 },
  controlsToggle: { minHeight: 58, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5EAF1", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row", alignItems: "center", marginBottom: 18 },
  controlsSummary: { flex: 1 },
  controlsTitle: { color: "#172536", fontSize: 14, fontWeight: "800" },
  controlsHint: { color: "#627184", fontSize: 11, marginTop: 3 },
  controlsArrow: { color: "#1677D2", fontSize: 22 },
  filterCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8EDF3", borderRadius: 16, padding: 16, marginBottom: 14 },
  periodCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8EDF3", borderRadius: 16, padding: 16, marginBottom: 18 },
  filterHeading: { color: "#172536", fontSize: 16, fontWeight: "800" },
  filterBlock: { marginTop: 14 },
  filterLabel: { color: "#627184", fontSize: 13, fontWeight: "700", marginTop: 13, marginBottom: 7 },
  filterTrigger: { minHeight: 48, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 11, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF" },
  filterValue: { flex: 1, color: "#172536", fontSize: 15 },
  filterArrow: { color: "#1677D2", fontSize: 22 },
  filterOptions: { marginTop: 6, padding: 8, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 11 },
  filterSearch: { minHeight: 44, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 9, paddingHorizontal: 11, color: "#172536", fontSize: 14 },
  filterOption: { minHeight: 44, paddingHorizontal: 8, paddingVertical: 8, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: "#F0F3F7" },
  filterOptionText: { color: "#172536", fontSize: 14, fontWeight: "600" },
  filterOptionDetail: { color: "#627184", fontSize: 12, marginTop: 2 },
  hint: { color: "#627184", fontSize: 13, padding: 8 },
  monthPickerTrigger: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 11, paddingHorizontal: 13, backgroundColor: "#FFFFFF" },
  monthPickerTriggerOpen: { borderColor: "#1677D2" },
  monthPickerValue: { color: "#172536", fontSize: 15, fontWeight: "700" },
  monthPickerIcon: { color: "#1677D2", fontSize: 25 },
  monthModalRoot: { flex: 1, backgroundColor: "rgba(23, 37, 54, 0.42)", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  monthModalCard: { width: "100%", maxWidth: 400, backgroundColor: "#FFFFFF", borderRadius: 20, padding: 18, shadowColor: "#172536", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 12 },
  monthModalHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthModalTitle: { color: "#172536", fontSize: 18, fontWeight: "800" },
  monthCloseButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  monthCloseText: { color: "#627184", fontSize: 26, lineHeight: 30 },
  yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 18, backgroundColor: "#F6F8FB", borderRadius: 12 },
  yearArrow: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  yearArrowText: { color: "#1677D2", fontSize: 28 },
  yearText: { color: "#172536", fontSize: 17, fontWeight: "800" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  monthOption: { width: "31%", minHeight: 48, borderWidth: 1, borderColor: "#DCE6F0", borderRadius: 11, backgroundColor: "#F8FAFD", alignItems: "center", justifyContent: "center" },
  monthOptionSelected: { backgroundColor: "#1677D2", borderColor: "#1677D2" },
  monthOptionText: { color: "#314255", fontSize: 13, fontWeight: "700" },
  monthOptionTextSelected: { color: "#FFFFFF" },
  currentMonthButton: { alignSelf: "flex-end", minHeight: 44, justifyContent: "center", marginTop: 12, paddingHorizontal: 6 },
  currentMonthText: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.3 },
  sectionHeader: { minHeight: 76, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 15, paddingVertical: 12, marginBottom: 14 },
  salesHeader: { backgroundColor: "#FFF3E7", borderWidth: 1, borderColor: "#F8DFC4" },
  collectionsHeader: { backgroundColor: "#EAF3FF", borderWidth: 1, borderColor: "#D2E4FA" },
  sectionNumber: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  salesNumber: { backgroundColor: "#D77A32" },
  collectionsNumber: { backgroundColor: "#1677D2" },
  sectionNumberText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  sectionHeadingText: { flex: 1 },
  sectionTitle: { color: "#172536", fontSize: 18, fontWeight: "800" },
  sectionSubtitle: { color: "#526071", fontSize: 12, marginTop: 4, lineHeight: 17 },
  statCard: { borderRadius: 16, paddingHorizontal: 22, paddingVertical: 22, marginBottom: 14, minHeight: 146, justifyContent: "center" },
  statTitle: { color: "#4F5A69", fontSize: 18, marginBottom: 8 },
  statAmount: { color: "#18212D", fontSize: 25, fontWeight: "800", fontVariant: ["tabular-nums"] },
  amountWords: { color: "#526071", fontSize: 15, fontWeight: "500", marginTop: 2, lineHeight: 20 },
  statDetail: { color: "#526071", fontSize: 14, marginTop: 8 },
  explainerCard: { backgroundColor: "#FFFFFF", borderLeftWidth: 3, borderLeftColor: "#D77A32", borderRadius: 8, paddingHorizontal: 13, paddingVertical: 10, marginTop: 2 },
  explainer: { color: "#627184", fontSize: 12, lineHeight: 18 },
  collectionsSection: { marginTop: 34, paddingTop: 24, borderTopWidth: 1, borderTopColor: "#D9E2EC" },
  collectionCard: { borderRadius: 16, padding: 18, marginBottom: 12 },
  collectionTitle: { color: "#4F5A69", fontSize: 16 },
  collectionAmount: { color: "#18212D", fontSize: 23, fontWeight: "800", marginTop: 8, fontVariant: ["tabular-nums"] },
  collectionBreakdown: { marginTop: 6 },
  collectionBreakdownAmount: { color: "#627184", fontSize: 12 },
  collectionBreakdownLink: { color: "#1677D2", textDecorationLine: "underline" },
  collectionBreakdownWords: { color: "#627184", fontSize: 12, marginTop: 2 },
  collectionOpenHint: { color: "#1677D2", fontSize: 13, fontWeight: "700", marginTop: 14 },
  errorCard: { backgroundColor: "#FFF1F2", borderRadius: 12, padding: 14, marginBottom: 12 },
  errorText: { color: "#C3333D", fontSize: 14, lineHeight: 20 },
  retryText: { color: "#1677D2", fontSize: 14, fontWeight: "700", marginTop: 8 },
  loadingText: { color: "#627184", fontSize: 14, textAlign: "center", paddingVertical: 24 },
  stale: { opacity: 0.5 },
});
