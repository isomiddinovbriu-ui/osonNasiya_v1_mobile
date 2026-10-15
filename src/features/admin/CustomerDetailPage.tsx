import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, apiRequest } from "./api";
import { type Customer, type PaymentMethod, formatDate, formatMoney } from "./customers";
import LoadingMark from "./LoadingMark";
import { parseMoney } from "./money";
import { deleteStoredToken, getStoredToken } from "./session";

const methods = { cash: "Naqd", transfer: "O‘tkazma" };

export default function CustomerDetailPage() {
  const { mijoz_id } = useLocalSearchParams<{ mijoz_id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  const load = useCallback(async () => {
    if (!mijoz_id || !/^[1-9]\d*$/.test(mijoz_id) || !Number.isSafeInteger(Number(mijoz_id))) {
      setError("Mijoz raqami noto‘g‘ri."); setLoading(false); return;
    }
    setLoading(true); setError(""); setCustomer(null);
    try {
      const token = await getStoredToken();
      if (!token) { router.replace("/"); return; }
      const result = await apiRequest<{ customer: Customer }>(`/customers/${mijoz_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCustomer(result.customer);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await deleteStoredToken(); router.replace("/");
      } else setError(cause instanceof Error ? cause.message : "Mijoz ma’lumotlari yuklanmadi.");
    } finally { setLoading(false); }
  }, [mijoz_id]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function addPayment() {
    const paymentAmount = parseMoney(amount);
    if (!customer || !mijoz_id || !/^[1-9]\d*$/.test(mijoz_id)) return;
    if (paymentAmount === null || paymentAmount <= 0 || paymentAmount > customer.remainingBalance) {
      setPaymentError("To‘lov summasi 0 dan katta va qolgan qarzdan oshmasligi kerak."); return;
    }
    if (!method) { setPaymentError("To‘lov usulini tanlang."); return; }
    setSavingPayment(true); setPaymentError("");
    try {
      const token = await getStoredToken();
      if (!token) { router.replace("/"); return; }
      await apiRequest(`/customers/${mijoz_id}/payments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: paymentAmount, method }),
      });
      setAmount(""); setMethod(null);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await deleteStoredToken(); router.replace("/");
      } else setPaymentError(cause instanceof Error ? cause.message : "To‘lov saqlanmadi.");
    } finally { setSavingPayment(false); }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button"><Text style={styles.link}>‹  Mijozlarga qaytish</Text></Pressable>
    <Text style={styles.title}>Mijoz ma’lumotlari</Text>
    {loading && <View style={styles.loading}><LoadingMark size={72} /><Text style={styles.muted}>Yuklanmoqda...</Text></View>}
    {!!error && <View style={styles.card}><Text style={styles.error} accessibilityRole="alert">{error}</Text><Pressable onPress={() => void load()} accessibilityRole="button"><Text style={styles.link}>Qayta yuklash</Text></Pressable></View>}
    {customer && !loading && <>
      <View style={styles.card}>
        <View style={styles.headingRow}><Text style={styles.name}>{customer.name}</Text><Text style={[styles.badge, customer.remainingBalance <= 0 && styles.badgePaid]}>{customer.remainingBalance > 0 ? "Qarzi bor" : "To‘langan"}</Text></View>
        <Row label="Asosiy telefon" value={customer.phoneNumber} />
        {!!customer.addPhoneNumber && <Row label="Qo‘shimcha telefon" value={customer.addPhoneNumber} />}
        <Row label="Yaratilgan sana" value={formatDate(customer.createdAt)} />
        <Row label="Mijoz raqami" value={String(customer.mijoz_id)} />
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Savdo va nasiya</Text>
        <Row label="Mahsulot" value={customer.productName} />
        <Row label="Umumiy narx" value={formatMoney(customer.totalPrice)} />
        <Row label="Boshlang‘ich to‘lov" value={formatMoney(customer.downPayment)} />
        <Row label="Jami to‘langan" value={formatMoney(customer.totalPaid)} />
        <Row label="Qolgan qarz" value={formatMoney(customer.remainingBalance)} emphasized />
        <Row label="Nasiya muddati" value={`${customer.termMonths} oy`} />
        {!!customer.description && <Row label="Izoh" value={customer.description} />}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Hudud va yozuv</Text>
        <Row label="Hudud ID" value={customer.regionId} />
        {customer.lat !== null && customer.long !== null && <Row label="Joylashuv" value={`${customer.lat}, ${customer.long}`} />}
        {!!customer.groupId && <Row label="Guruh ID" value={customer.groupId} />}
        {!!customer.sectionId && <Row label="Bo‘lim ID" value={customer.sectionId} />}
        {!!customer.productId && <Row label="Mahsulot ID" value={customer.productId} />}
        <Row label="Yaratgan xodim" value={`${customer.createdBy} · ${customer.createdByRole}`} />
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>To‘lovlar ({customer.payments.length})</Text>
        {customer.payments.length === 0 && <Text style={styles.muted}>To‘lovlar yo‘q.</Text>}
        {customer.payments.map((payment) => <View key={payment.id} style={styles.payment}>
          <View style={styles.headingRow}><Text style={styles.paymentAmount}>{formatMoney(payment.amount)}</Text><Text style={styles.muted}>{payment.type === "initial" ? "Boshlang‘ich" : "Oylik"}</Text></View>
          <Row label="Usul" value={methods[payment.method]} />
          <Row label="Sana" value={formatDate(payment.paidAt)} />
          <Row label="Qabul qilgan" value={payment.receivedBy} />
          <Row label="To‘lov ID" value={payment.id} />
        </View>)}
      </View>
      {customer.remainingBalance > 0 && <View style={styles.card}>
        <Text style={styles.sectionTitle}>Keyingi to‘lov</Text>
        <Text style={styles.rowLabel}>Summa (so‘m)</Text>
        <TextInput style={styles.paymentInput} value={amount} onChangeText={(value) => { setAmount(value); setPaymentError(""); }} keyboardType="number-pad" placeholder="To‘lov summasi" maxLength={15} />
        <Text style={styles.rowLabel}>To‘lov usuli</Text>
        <View style={styles.paymentMethods}>{(["cash", "transfer"] as const).map((value) =>
          <Pressable key={value} style={[styles.methodButton, method === value && styles.methodSelected]} onPress={() => { setMethod(value); setPaymentError(""); }} accessibilityRole="radio" accessibilityState={{ selected: method === value }}>
            <Text style={styles.link}>{methods[value]}</Text>
          </Pressable>)}</View>
        {!!paymentError && <Text style={styles.error} accessibilityRole="alert">{paymentError}</Text>}
        <Pressable style={[styles.submitPayment, savingPayment && styles.disabled]} onPress={() => void addPayment()} disabled={savingPayment} accessibilityRole="button"><Text style={styles.submitText}>{savingPayment ? "Saqlanmoqda..." : "To‘lovni saqlash"}</Text></Pressable>
      </View>}
      <Pressable style={styles.refresh} onPress={() => void load()} accessibilityRole="button"><Text style={styles.link}>Ma’lumotlarni yangilash</Text></Pressable>
    </>}
  </ScrollView>;
}

function Row({ label, value, emphasized }: { label: string; value: string; emphasized?: boolean }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={[styles.rowValue, emphasized && styles.emphasized]} selectable>{value}</Text></View>;
}

const styles = StyleSheet.create({
  paymentInput: { minHeight: 48, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 11, paddingHorizontal: 13, marginTop: 8, marginBottom: 14, color: "#172536", fontSize: 16 },
  paymentMethods: { flexDirection: "row", gap: 10, marginTop: 8 },
  methodButton: { borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  methodSelected: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  submitPayment: { minHeight: 46, borderRadius: 11, backgroundColor: "#1677D2", alignItems: "center", justifyContent: "center", marginTop: 16 },
  submitText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 18, paddingTop: 54, paddingBottom: 40 },
  back: { alignSelf: "flex-start", paddingVertical: 10, paddingRight: 20, marginBottom: 12 },
  link: { color: "#1677D2", fontSize: 15, fontWeight: "700" },
  title: { color: "#172536", fontSize: 27, fontWeight: "800", marginBottom: 18 },
  card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8EDF3", borderRadius: 18, padding: 18, marginBottom: 14 },
  headingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  name: { flex: 1, color: "#172536", fontSize: 22, fontWeight: "800" },
  badge: { color: "#B76517", backgroundColor: "#FFF2E4", borderRadius: 8, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontWeight: "700" },
  badgePaid: { color: "#16865A", backgroundColor: "#E8F7F0" },
  sectionTitle: { color: "#172536", fontSize: 18, fontWeight: "800", marginBottom: 5 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#EEF1F5" },
  rowLabel: { flex: 1, color: "#627184", fontSize: 13, lineHeight: 19 },
  rowValue: { flex: 1.4, color: "#172536", fontSize: 14, fontWeight: "600", textAlign: "right", lineHeight: 20 },
  emphasized: { color: "#C26A1A", fontWeight: "800" },
  payment: { borderTopWidth: 1, borderTopColor: "#E8EDF3", marginTop: 12, paddingTop: 12 },
  paymentAmount: { color: "#172536", fontSize: 17, fontWeight: "800" },
  muted: { color: "#627184", fontSize: 13, lineHeight: 19 },
  error: { color: "#C3333D", fontSize: 14, marginBottom: 12 },
  loading: { alignItems: "center", paddingVertical: 40 },
  refresh: { alignItems: "center", paddingVertical: 18 },
});
