import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest } from "./api";
import { type ContactEvent, type ContactListResponse, validContactDate } from "./contacts";
import { formatDate, formatMoney, type Customer } from "./customers";
import { parseMoney } from "./money";
import { deleteStoredToken, getStoredToken } from "./session";

const pageSize = 20;

function ContactCard({ item }: { item: ContactEvent }) {
  return <View style={styles.card}>
    <View style={styles.row}><Text style={styles.cardTitle}>{item.outcome === "reached" ? "Gaplashildi" : "Javob bermadi"}</Text><Text style={styles.muted}>{formatDate(item.contactedAt)}</Text></View>
    {!!item.note && <Text style={styles.body}>{item.note}</Text>}
    {!!item.nextContactDate && <Text style={styles.body}>Keyingi aloqa: {item.nextContactDate}</Text>}
    {!!item.promisedDate && <>
      <Text style={styles.body}>Va’da: {formatMoney(item.promisedAmount ?? 0)} · {item.promisedDate}</Text>
      <Text style={styles.body}>Holat: {item.promiseStatus === "fulfilled" ? "Bajarildi" : item.promiseStatus === "broken" ? "Bajarilmadi" : "Kutilmoqda"}</Text>
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
    if (note.trim().length > 1000 || (next && !validContactDate(next)) ||
      (promiseDay && !validContactDate(promiseDay)) || Boolean(promiseDay) !== Boolean(promiseAmount) ||
      (outcome === "no_answer" && promiseDay)) {
      setFormError("Sana YYYY-MM-DD shaklida bo‘lsin; va’da sanasi va summasi birga kiritiladi."); return;
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
      if (page === 1) await load(); else setPage(1);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { await deleteStoredToken(); router.replace("/"); }
      else setFormError(cause instanceof Error ? cause.message : "Aloqa qaydi saqlanmadi.");
    } finally { setSaving(false); }
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>‹ Mijozga qaytish</Text></Pressable>
      <Text style={styles.title}>Aloqa tarixi</Text>
      {!!customer && <Text style={styles.muted}>{customer.name} · {customer.phoneNumber}</Text>}
      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      {customer && <View style={styles.card}>
        <Text style={styles.cardTitle}>Yangi aloqa qaydi</Text>
        <View style={styles.row}>
          {(["reached", "no_answer"] as const).map((value) => <Pressable key={value}
            style={[styles.choice, outcome === value && styles.choiceSelected]}
            onPress={() => { setOutcome(value); if (value === "no_answer") { setPromisedDate(""); setPromisedAmount(""); } }}
            accessibilityRole="radio" accessibilityState={{ selected: outcome === value }}>
            <Text style={styles.choiceText}>{value === "reached" ? "Gaplashildi" : "Javob bermadi"}</Text>
          </Pressable>)}
        </View>
        <Text style={styles.label}>Izoh</Text>
        <TextInput style={[styles.input, styles.note]} value={note} onChangeText={setNote} multiline maxLength={1000} placeholder="Aloqa haqida izoh" />
        <Text style={styles.label}>Keyingi aloqa sanasi (ixtiyoriy)</Text>
        <TextInput style={styles.input} value={nextContactDate} onChangeText={setNextContactDate} placeholder="YYYY-MM-DD" maxLength={10} keyboardType="numbers-and-punctuation" />
        {outcome === "reached" && <>
          <Text style={styles.label}>To‘lov va’dasi (ixtiyoriy)</Text>
          <TextInput style={styles.input} value={promisedDate} onChangeText={setPromisedDate} placeholder="Va’da sanasi: YYYY-MM-DD" maxLength={10} keyboardType="numbers-and-punctuation" />
          <TextInput style={styles.input} value={promisedAmount} onChangeText={setPromisedAmount} placeholder="Va’da summasi (so‘m)" keyboardType="number-pad" />
          <Text style={styles.muted}>Qolgan qarz: {formatMoney(customer.remainingBalance)}</Text>
        </>}
        {!!formError && <Text style={styles.error} accessibilityRole="alert">{formError}</Text>}
        <Pressable style={[styles.button, saving && styles.disabled]} onPress={() => void save()} disabled={saving} accessibilityRole="button">
          <Text style={styles.buttonText}>{saving ? "Saqlanmoqda..." : "Aloqani saqlash"}</Text>
        </Pressable>
      </View>}
      <Text style={styles.sectionTitle}>Qaydlar ({total})</Text>
      {loading && <Text style={styles.muted}>Yuklanmoqda...</Text>}
      {!loading && contacts.length === 0 && <Text style={styles.muted}>Hozircha aloqa qaydi yo‘q.</Text>}
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
  content: { padding: 20, paddingTop: 55, paddingBottom: 50, gap: 14 },
  title: { color: "#172536", fontSize: 25, fontWeight: "800" },
  sectionTitle: { color: "#172536", fontSize: 19, fontWeight: "800" },
  link: { color: "#1677D2", fontSize: 15, fontWeight: "700" },
  card: { backgroundColor: "#FFFFFF", padding: 18, borderRadius: 16, gap: 10 },
  cardTitle: { color: "#172536", fontSize: 17, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  body: { color: "#172536", fontSize: 14, lineHeight: 20 },
  muted: { color: "#627184", fontSize: 13 },
  label: { color: "#172536", fontSize: 14, fontWeight: "700" },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 11, paddingHorizontal: 12, color: "#172536", fontSize: 15 },
  note: { minHeight: 80, paddingTop: 12, textAlignVertical: "top" },
  choice: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10 },
  choiceSelected: { backgroundColor: "#EAF4FF", borderColor: "#1677D2" },
  choiceText: { color: "#1677D2", fontSize: 13, fontWeight: "700" },
  button: { minHeight: 50, backgroundColor: "#1677D2", borderRadius: 11, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.6 }, error: { color: "#C3333D", fontSize: 14 },
});
