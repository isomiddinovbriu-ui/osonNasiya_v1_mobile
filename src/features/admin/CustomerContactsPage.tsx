import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest } from "./api";
import ContactDatePicker, { localDateString } from "./ContactDatePicker";
import { type ContactEvent, type ContactListResponse, formatContactDay, validContactDate } from "./contacts";
import { formatDate, formatMoney, type Customer } from "./customers";
import { parseMoney } from "./money";
import MoneyInput from "./MoneyInput";
import { deleteStoredToken, getStoredToken } from "./session";

const pageSize = 20;
const noteExamples = {
  reached: "To‘lovni keyinroq qilaman dedi.",
  no_answer: "Telefonni ko‘tarmadi.",
} as const;

function ContactCard({ item }: { item: ContactEvent }) {
  return <View style={styles.card}>
    <View style={styles.historyHeading}>
      <Text style={[styles.statusBadge, item.outcome === "reached" ? styles.reachedBadge : styles.noAnswerBadge]}>{item.outcome === "reached" ? "Gaplashildi" : "Javob bermadi"}</Text>
      <Text style={styles.historyDate}>{formatDate(item.contactedAt)}</Text>
    </View>
    {!!item.note && <Text style={styles.body}>{item.note}</Text>}
    {!!item.nextContactDate && <View style={styles.detailRow}><Text style={styles.detailLabel}>Keyingi aloqa</Text><Text style={styles.detailValue}>{formatContactDay(item.nextContactDate)}</Text></View>}
    {!!item.promisedDate && <>
      <View style={styles.detailRow}><Text style={styles.detailLabel}>To‘lov va’dasi</Text><Text style={styles.detailValue}>{formatMoney(item.promisedAmount ?? 0)}</Text></View>
      <View style={styles.detailRow}><Text style={styles.detailLabel}>Va’da sanasi</Text><Text style={styles.detailValue}>{formatContactDay(item.promisedDate)}</Text></View>
      <View style={styles.detailRow}><Text style={styles.detailLabel}>Holat</Text><Text style={styles.detailValue}>{item.promiseStatus === "fulfilled" ? "Bajarildi" : item.promiseStatus === "broken" ? "Bajarilmadi" : "Kutilmoqda"}</Text></View>
      <Text style={styles.muted}>Hisoblangan to‘lov: {formatMoney(item.paidTowardPromise ?? 0)}</Text>
    </>}
  </View>;
}

export default function CustomerContactsPage() {
  const insets = useSafeAreaInsets();
  const { mijoz_id } = useLocalSearchParams<{ mijoz_id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<ContactEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [outcome, setOutcome] = useState<"reached" | "no_answer">("reached");
  const [note, setNote] = useState("");
  const [nextContactDate, setNextContactDate] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [promisedAmount, setPromisedAmount] = useState("");

  const load = useCallback(async () => {
    if (!mijoz_id || !/^[1-9]\d*$/.test(mijoz_id)) { setError("Mijoz raqami noto‘g‘ri."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const token = await getStoredToken();
      if (!token) { router.replace("/"); return; }
      const headers = { Authorization: `Bearer ${token}` };
      const [detail, history] = await Promise.all([
        apiRequest<{ customer: Customer }>(`/customers/${mijoz_id}`, { headers }),
        apiRequest<ContactListResponse>(`/customers/${mijoz_id}/contacts?page=${page}&limit=${pageSize}`, { headers }),
      ]);
      setCustomer(detail.customer); setContacts(history.contacts); setTotal(history.total);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { await deleteStoredToken(); router.replace("/"); }
      else setError(cause instanceof Error ? cause.message : "Aloqa tarixi yuklanmadi.");
    } finally { setLoading(false); }
  }, [mijoz_id, page]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function save() {
    if (!customer || !mijoz_id || saving) return;
    setFormError("");
    const next = nextContactDate.trim();
    const promiseDay = promisedDate.trim();
    const promiseAmount = promisedAmount.trim();
    const today = localDateString();
    if (note.trim().length > 1000 || (next && (!validContactDate(next) || next < today)) ||
      (promiseDay && (!validContactDate(promiseDay) || promiseDay < today)) || Boolean(promiseDay) !== Boolean(promiseAmount) ||
      (outcome === "no_answer" && promiseDay)) {
      setFormError("Bugun yoki keyingi sanani tanlang; va’da sanasi va summasi birga kiritiladi."); return;
    }
    const amount = promiseAmount ? parseMoney(promiseAmount) : null;
    if (promiseDay && (amount === null || amount <= 0 || amount > customer.remainingBalance)) {
      setFormError("Va’da summasi 0 dan katta va qolgan qarzdan oshmasligi kerak."); return;
    }
    Keyboard.dismiss(); setSaving(true);
    try {
      const token = await getStoredToken();
      if (!token) { router.replace("/"); return; }
      await apiRequest<{ contact: ContactEvent }>(`/customers/${mijoz_id}/contacts`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ outcome, note: note.trim(), ...(next ? { nextContactDate: next } : {}),
          ...(promiseDay ? { promisedDate: promiseDay, promisedAmount: amount } : {}) }),
      });
      setNote(""); setNextContactDate(""); setPromisedDate(""); setPromisedAmount("");
      setFormOpen(false);
      if (page === 1) await load(); else setPage(1);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { await deleteStoredToken(); router.replace("/"); }
      else setFormError(cause instanceof Error ? cause.message : "Aloqa qaydi saqlanmadi.");
    } finally { setSaving(false); }
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
      <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>‹ Mijozga qaytish</Text></Pressable>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Aloqa tarixi</Text>
      {!!customer && <View style={styles.customerSummary}>
        <View style={styles.customerAvatar}><Text style={styles.customerInitial}>{customer.name.trim().charAt(0).toUpperCase() || "M"}</Text></View>
        <View style={styles.customerCopy}><Text style={styles.customerName} numberOfLines={1}>{customer.name}</Text><Text style={styles.customerPhone}>{customer.phoneNumber}</Text></View>
      </View>}
      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      {customer && <View style={[styles.card, !formOpen && styles.collapsedCard]}>
        <Pressable style={styles.formToggle} onPress={() => { Keyboard.dismiss(); setFormOpen((open) => !open); }}
          disabled={saving} accessibilityRole="button" accessibilityLabel={formOpen ? "Yangi aloqa qaydini yopish" : "Yangi aloqa qaydini ochish"} accessibilityState={{ expanded: formOpen, disabled: saving }}>
          <Text style={styles.cardTitle}>Yangi aloqa qaydi</Text>
          <View style={styles.toggleIcon}><Text style={styles.toggleIconText}>{formOpen ? "−" : "+"}</Text></View>
        </Pressable>
        {formOpen && <>
        <Text style={styles.fieldHint}>Aloqa natijasi</Text>
        <View style={styles.choiceRow}>
          {(["reached", "no_answer"] as const).map((value) => <Pressable key={value}
            style={[styles.choice, outcome === value && styles.choiceSelected]}
            onPress={() => { if (value !== outcome) setNote((current) => current === noteExamples[outcome] ? "" : current); setOutcome(value); if (value === "no_answer") { setPromisedDate(""); setPromisedAmount(""); } }}
            accessibilityRole="radio" accessibilityState={{ selected: outcome === value }}>
            <Text style={[styles.choiceText, outcome === value && styles.choiceTextSelected]}>{value === "reached" ? "Gaplashildi" : "Javob bermadi"}</Text>
          </Pressable>)}
        </View>
        <View style={styles.noteExampleRow}>
          <Text style={styles.fieldHint}>Namuna:</Text>
          <Pressable style={[styles.noteExample, note === noteExamples[outcome] && styles.noteExampleSelected]}
            onPress={() => setNote(noteExamples[outcome])} accessibilityRole="button" accessibilityState={{ selected: note === noteExamples[outcome] }}>
            <Text style={styles.noteExampleText}>{noteExamples[outcome]}</Text>
          </Pressable>
        </View>
        <Text style={styles.label}>Izoh</Text>
        <TextInput style={[styles.input, styles.note]} value={note} onChangeText={setNote} multiline maxLength={1000} placeholder="Suhbat haqida qisqacha yozing" placeholderTextColor="#8A97A6" />
        <View style={styles.labelRow}><Text style={styles.label}>Keyingi aloqa sanasi</Text><Text style={styles.optional}>Ixtiyoriy</Text></View>
        <ContactDatePicker label="Keyingi aloqa sanasi" value={nextContactDate} onChange={setNextContactDate} showQuickOptions />
        {outcome === "reached" && <>
          <View style={styles.divider} />
          <View style={styles.labelRow}><Text style={styles.label}>To‘lov va’dasi</Text><Text style={styles.optional}>Ixtiyoriy</Text></View>
          <Text style={styles.fieldHint}>Sana va summani birga kiriting</Text>
          <ContactDatePicker label="Va’da sanasi" value={promisedDate} onChange={setPromisedDate} showQuickOptions />
          <MoneyInput
            value={promisedAmount}
            onChangeText={setPromisedAmount}
            editable={!saving}
            placeholder="Va’da summasi (so‘m)"
            emptyHint="Summani kiriting"
            inputStyle={styles.moneyInput}
            tone={promisedAmount && (Number(promisedAmount) <= 0 || Number(promisedAmount) > customer.remainingBalance) ? "error" : undefined}
          />
          <View style={styles.balanceRow}><Text style={styles.balanceLabel}>Qolgan qarz</Text><Text style={styles.balanceValue}>{formatMoney(customer.remainingBalance)}</Text></View>
        </>}
        {!!formError && <Text style={styles.error} accessibilityRole="alert">{formError}</Text>}
        <Pressable style={[styles.button, saving && styles.disabled]} onPress={() => void save()} disabled={saving} accessibilityRole="button">
          <Text style={styles.buttonText}>{saving ? "Saqlanmoqda..." : "Aloqani saqlash"}</Text>
        </Pressable>
        </>}
      </View>}
      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Qaydlar</Text><Text style={styles.count}>{total}</Text></View>
      {loading && <Text style={styles.muted}>Yuklanmoqda...</Text>}
      {!loading && !error && contacts.length === 0 && <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Hozircha qayd yo‘q</Text><Text style={styles.muted}>Yuqoridagi “Yangi aloqa qaydi” tugmasini bosib birinchi qaydni saqlang.</Text></View>}
      {contacts.map((item) => <ContactCard key={item.id} item={item} />)}
      {total > pageSize && <View style={styles.row}>
        <Pressable disabled={page === 1} onPress={() => setPage((current) => current - 1)} accessibilityRole="button"><Text style={styles.link}>‹ Oldingi</Text></Pressable>
        <Text style={styles.muted}>{page} / {Math.ceil(total / pageSize)}</Text>
        <Pressable disabled={page * pageSize >= total} onPress={() => setPage((current) => current + 1)} accessibilityRole="button"><Text style={styles.link}>Keyingi ›</Text></Pressable>
      </View>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  topBar: { backgroundColor: "#FFFFFF", paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#E8EDF3" },
  backButton: { minHeight: 40, alignSelf: "flex-start", justifyContent: "center", paddingRight: 12 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  title: { color: "#172536", fontSize: 25, fontWeight: "800", marginBottom: 2 },
  customerSummary: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: "#EAF4FF" },
  customerAvatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#D3E9FF", alignItems: "center", justifyContent: "center" },
  customerInitial: { color: "#1677D2", fontSize: 17, fontWeight: "800" },
  customerCopy: { flex: 1, minWidth: 0 },
  customerName: { color: "#172536", fontSize: 15, fontWeight: "800" },
  customerPhone: { color: "#627184", fontSize: 12, marginTop: 2 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  sectionTitle: { color: "#172536", fontSize: 18, fontWeight: "800" },
  count: { color: "#1677D2", backgroundColor: "#EAF4FF", overflow: "hidden", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, fontSize: 12, fontWeight: "800" },
  link: { color: "#1677D2", fontSize: 15, fontWeight: "700" },
  card: { backgroundColor: "#FFFFFF", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#E8EDF3", gap: 8 },
  collapsedCard: { borderColor: "#C9DDF1" },
  formToggle: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cardTitle: { color: "#172536", fontSize: 17, fontWeight: "800", flex: 1 },
  toggleIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#EAF4FF", alignItems: "center", justifyContent: "center" },
  toggleIconText: { color: "#1677D2", fontSize: 25, fontWeight: "500", lineHeight: 29 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  body: { color: "#172536", fontSize: 14, lineHeight: 20 },
  muted: { color: "#627184", fontSize: 13, lineHeight: 19 },
  label: { color: "#172536", fontSize: 13, fontWeight: "700" },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  optional: { color: "#8A97A6", fontSize: 11, fontWeight: "600" },
  fieldHint: { color: "#627184", fontSize: 12 },
  input: { minHeight: 44, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10, paddingHorizontal: 12, color: "#172536", fontSize: 14 },
  moneyInput: { minHeight: 44, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  note: { minHeight: 68, paddingTop: 11, textAlignVertical: "top" },
  noteExampleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7, marginTop: 1 },
  noteExample: { minHeight: 34, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 9, backgroundColor: "#F6F8FB", justifyContent: "center" },
  noteExampleSelected: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  noteExampleText: { color: "#1677D2", fontSize: 12, fontWeight: "700" },
  choiceRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  choice: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10, paddingHorizontal: 4 },
  choiceSelected: { backgroundColor: "#EAF4FF", borderColor: "#1677D2" },
  choiceText: { color: "#627184", fontSize: 12, fontWeight: "700", textAlign: "center" },
  choiceTextSelected: { color: "#1677D2" },
  divider: { height: 1, backgroundColor: "#EEF1F5", marginVertical: 3 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 2 },
  balanceLabel: { color: "#627184", fontSize: 12 },
  balanceValue: { color: "#172536", fontSize: 12, fontWeight: "700" },
  emptyCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8EDF3", borderRadius: 14, padding: 20, alignItems: "center", gap: 4 },
  emptyTitle: { color: "#172536", fontSize: 14, fontWeight: "800" },
  button: { minHeight: 48, backgroundColor: "#1677D2", borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 4 },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  historyHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 },
  statusBadge: { overflow: "hidden", borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5, fontSize: 12, fontWeight: "700" },
  reachedBadge: { color: "#16865A", backgroundColor: "#E8F7F0" },
  noAnswerBadge: { color: "#A65C18", backgroundColor: "#FFF2E4" },
  historyDate: { color: "#627184", fontSize: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingTop: 4 },
  detailLabel: { color: "#627184", fontSize: 12, flex: 1 },
  detailValue: { color: "#172536", fontSize: 12, fontWeight: "700", flex: 1, textAlign: "right" },
  disabled: { opacity: 0.6 }, error: { color: "#C3333D", fontSize: 14 },
});
