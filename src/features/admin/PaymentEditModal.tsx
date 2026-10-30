import { BlurTargetView, BlurView } from "expo-blur";
import { useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, apiRequest } from "./api";
import { formatMoney, validPaymentMonth, type Customer, type CustomerPayment, type PaymentMethod } from "./customers";
import MoneyInput from "./MoneyInput";
import { parseMoney } from "./money";
import PaymentMethodFields from "./PaymentMethodFields";
import { paymentDetailsError, paymentExtraFields, type PaymentOptions } from "./paymentOptions";

type Props = {
  customer: Customer;
  payment: CustomerPayment;
  token: string;
  isSuperAdmin: boolean;
  options: PaymentOptions | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
  onConflict: () => void;
};

type PendingChange = { body: Record<string, unknown>; nextAmount: number; paymentId: string };

const monthNames = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

function monthLabel(value: string) {
  if (!validPaymentMonth(value)) return "Oy tanlanmagan";
  const [year, month] = value.split("-").map(Number);
  return `${monthNames[month - 1]} ${year}`;
}

export default function PaymentEditModal({ customer, payment, token, isSuperAdmin, options, onClose, onSaved, onConflict }: Props) {
  const amountInputRef = useRef<TextInput>(null);
  const blurTargetRef = useRef<View | null>(null);
  const [amount, setAmount] = useState(String(payment.amount));
  const [forMonth, setForMonth] = useState(payment.forMonth ?? "");
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => Number(payment.forMonth?.slice(0, 4)) || new Date().getFullYear());
  const [editMethod, setEditMethod] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [provider, setProvider] = useState("");
  const [providerName, setProviderName] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [error, setError] = useState("");
  const canEditMonth = isSuperAdmin && payment.type !== "initial";

  function close() {
    if (saving) return;
    if (pendingChange) { setPendingChange(null); return; }
    Keyboard.dismiss();
    onClose();
  }

  function save() {
    if (saving) return;
    const nextAmount = parseMoney(amount);
    if (nextAmount === null || nextAmount <= 0 || nextAmount > payment.amount + customer.remainingBalance) {
      setError("To‘lov summasi 0 dan katta va mavjud balansdan oshmasligi kerak.");
      return;
    }
    const month = forMonth.trim();
    if (canEditMonth && month && !validPaymentMonth(month)) {
      setError("To‘lov oyini YYYY-MM shaklida kiriting.");
      return;
    }
    if (editMethod) {
      const detailsError = paymentDetailsError(method, cardNumber, provider, providerName, options);
      if (detailsError) { setError(detailsError); return; }
    }
    const body = {
      ...(nextAmount !== payment.amount ? { amount: nextAmount } : {}),
      ...(canEditMonth && (month || null) !== payment.forMonth ? { forMonth: month || null } : {}),
      ...(editMethod && method ? { method, ...paymentExtraFields(method, cardNumber, provider, providerName) } : {}),
    };
    if (!Object.keys(body).length) { close(); return; }
    const paymentId = payment.paymentId || payment.id;
    if (!/^[a-f\d]{24}$/i.test(paymentId)) { setError("To‘lov IDsi noto‘g‘ri."); return; }
    Keyboard.dismiss();
    setError("");
    setPendingChange({ body, nextAmount, paymentId });
  }

  async function confirmSave() {
    if (saving || !pendingChange) return;
    const { body, paymentId } = pendingChange;
    setSaving(true);
    try {
      const result = await apiRequest<{ customer: Customer }>(`/customers/${customer.mijoz_id}/payments/${paymentId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      onSaved(result.customer);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) onConflict();
      setError(cause instanceof Error ? cause.message : "To‘lov tahrirlanmadi.");
      setPendingChange(null);
    } finally {
      setSaving(false);
    }
  }

  const amountChanged = pendingChange !== null && pendingChange.nextAmount !== payment.amount;
  const amountDelta = pendingChange ? pendingChange.nextAmount - payment.amount : 0;
  const changeWarning = amountDelta < 0
    ? "Siz summani kamaytiryapsiz. Bu to‘lov va qolgan balansga ta’sir qiladi."
    : amountDelta > 0
      ? "Siz summani oshiryapsiz. Bu to‘lov va qolgan balansga ta’sir qiladi."
      : "To‘lov ma’lumotlari o‘zgaradi. Davom etishni tasdiqlang.";

  return <Modal visible transparent animationType="fade" onRequestClose={close} onShow={() => amountInputRef.current?.focus()}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <BlurTargetView ref={blurTargetRef} style={styles.modalContent} importantForAccessibility={pendingChange ? "no-hide-descendants" : "auto"}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.touchArea} onPress={close} accessible={false}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()} accessible={false}>
          <Text style={styles.title}>To‘lovni tahrirlash</Text>
          <Text style={styles.description}>{formatMoney(payment.amount)} · {payment.paymentId || payment.id}</Text>
          <Text style={styles.label}>Summa</Text>
          <MoneyInput inputRef={amountInputRef} value={amount} onChangeText={value => { setAmount(value); setError(""); }} editable={!saving} />
          {canEditMonth && <View style={styles.field}>
            <Text style={styles.label}>To‘lov oyi</Text>
            <Pressable style={[styles.monthField, monthPickerOpen && styles.monthFieldOpen]} onPress={() => { Keyboard.dismiss(); setMonthPickerOpen(value => !value); }} disabled={saving} accessibilityRole="button" accessibilityLabel={`To‘lov oyi: ${monthLabel(forMonth)}`} accessibilityState={{ expanded: monthPickerOpen }}>
              <Text style={[styles.selectedMonth, !forMonth && styles.monthPlaceholder]}>{monthLabel(forMonth)}</Text>
              <Text style={styles.monthChevron}>{monthPickerOpen ? "⌃" : "⌄"}</Text>
            </Pressable>
            {monthPickerOpen && <View style={styles.calendar}>
              <View style={styles.calendarHeader}>
                <Pressable style={styles.yearButton} onPress={() => setCalendarYear(year => Math.max(1, year - 1))} disabled={saving || calendarYear <= 1} accessibilityRole="button" accessibilityLabel="Oldingi yil"><Text style={styles.yearArrow}>‹</Text></Pressable>
                <Text style={styles.calendarYear}>{calendarYear}</Text>
                <Pressable style={styles.yearButton} onPress={() => setCalendarYear(year => Math.min(9999, year + 1))} disabled={saving || calendarYear >= 9999} accessibilityRole="button" accessibilityLabel="Keyingi yil"><Text style={styles.yearArrow}>›</Text></Pressable>
              </View>
              <View style={styles.monthGrid}>
                {monthNames.map((name, index) => {
                  const value = `${String(calendarYear).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`;
                  return <Pressable key={value} style={[styles.monthCell, forMonth === value && styles.monthSelected]} onPress={() => { setForMonth(value); setMonthPickerOpen(false); setError(""); }} disabled={saving} accessibilityRole="button" accessibilityState={{ selected: forMonth === value }}><Text style={[styles.monthText, forMonth === value && styles.monthTextSelected]}>{name}</Text></Pressable>;
                })}
              </View>
              <Pressable onPress={() => { setForMonth(""); setMonthPickerOpen(false); setError(""); }} disabled={saving} accessibilityRole="button"><Text style={styles.link}>Oyni olib tashlash</Text></Pressable>
            </View>}
          </View>}
          <View style={styles.field}>
            <Pressable onPress={() => { setEditMethod(value => !value); setError(""); }} disabled={saving} accessibilityRole="button"><Text style={styles.link}>{editMethod ? "Usulni o‘zgartirmaslik" : "To‘lov usulini o‘zgartirish"}</Text></Pressable>
            {editMethod && <>
              <Text style={styles.hint}>Karta yoki ilova usulini tanlasangiz, karta raqamini qayta tanlang.</Text>
              {options ? <PaymentMethodFields options={options} method={method} onMethodChange={setMethod} cardNumber={cardNumber} onCardNumberChange={setCardNumber} provider={provider} onProviderChange={setProvider} providerName={providerName} onProviderNameChange={setProviderName} disabled={saving} /> : <Text style={styles.hint}>To‘lov usullari yuklanmoqda...</Text>}
            </>}
          </View>
          {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={close} disabled={saving} accessibilityRole="button"><Text style={styles.cancelText}>Qaytish</Text></Pressable>
            <Pressable style={[styles.save, saving && styles.disabled]} onPress={save} disabled={saving} accessibilityRole="button"><Text style={styles.saveText}>{saving ? "Saqlanmoqda..." : "Saqlash"}</Text></Pressable>
          </View>
        </Pressable>
        </Pressable>
      </ScrollView>
      </BlurTargetView>
      {!!pendingChange && <View style={styles.confirmOverlay} accessibilityViewIsModal>
        <BlurView blurTarget={blurTargetRef} blurMethod="dimezisBlurView" intensity={75} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.confirmScrim} />
        <View style={styles.confirmCard}>
          <View style={styles.warningIcon}><Text style={styles.warningIconText}>!</Text></View>
          <Text style={styles.confirmTitle} accessibilityRole="header">Rostdan ham o‘zgartirmoqchimisiz?</Text>
          {amountChanged && <View style={styles.amountComparison}>
            <View style={styles.amountRow}><Text style={styles.amountCaption}>Oldingi summa</Text><Text style={styles.amountValue}>{formatMoney(payment.amount)}</Text></View>
            <View style={styles.amountRow}><Text style={styles.amountCaption}>Yangi summa</Text><Text style={styles.newAmountValue}>{formatMoney(pendingChange.nextAmount)}</Text></View>
          </View>}
          <Text style={styles.confirmWarning}>{changeWarning}</Text>
          <View style={styles.confirmActions}>
            <Pressable style={styles.cancel} onPress={() => setPendingChange(null)} disabled={saving} accessibilityRole="button"><Text style={styles.cancelText}>Yo‘q</Text></Pressable>
            <Pressable style={[styles.save, saving && styles.disabled]} onPress={() => void confirmSave()} disabled={saving} accessibilityRole="button"><Text style={styles.saveText}>{saving ? "Saqlanmoqda..." : "Ha, saqlash"}</Text></Pressable>
          </View>
        </View>
      </View>}
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(23, 37, 54, 0.45)" },
  modalContent: { flex: 1 },
  scroll: { flexGrow: 1 },
  touchArea: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, alignSelf: "center", borderRadius: 18, backgroundColor: "#FFFFFF", padding: 20 },
  title: { color: "#172536", fontSize: 20, fontWeight: "800" },
  description: { color: "#627184", marginTop: 6, marginBottom: 18 },
  label: { color: "#172536", fontSize: 14, fontWeight: "700", marginBottom: 8 },
  field: { marginTop: 18 },
  link: { color: "#1677D2", fontSize: 14, fontWeight: "700", paddingVertical: 10 },
  monthField: { minHeight: 46, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 11, backgroundColor: "#F8FAFD", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthFieldOpen: { borderColor: "#1677D2", backgroundColor: "#FFFFFF" },
  selectedMonth: { color: "#172536", fontSize: 15, fontWeight: "600" },
  monthPlaceholder: { color: "#627184" },
  monthChevron: { color: "#1677D2", fontSize: 22, fontWeight: "600" },
  calendar: { borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 12, padding: 12, marginTop: 4 },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  yearButton: { minWidth: 44, minHeight: 40, alignItems: "center", justifyContent: "center" },
  yearArrow: { color: "#1677D2", fontSize: 28, lineHeight: 32 },
  calendarYear: { color: "#172536", fontSize: 17, fontWeight: "800" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  monthCell: { width: "31%", minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#F3F6FA" },
  monthSelected: { backgroundColor: "#1677D2" },
  monthText: { color: "#172536", fontSize: 13, fontWeight: "600" },
  monthTextSelected: { color: "#FFFFFF" },
  hint: { color: "#627184", fontSize: 13, lineHeight: 18, marginBottom: 8 },
  error: { color: "#C3333D", fontSize: 14, marginTop: 12 },
  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancel: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#EEF1F5" },
  cancelText: { color: "#172536", fontWeight: "700" },
  save: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#1677D2" },
  saveText: { color: "#FFFFFF", fontWeight: "700" },
  disabled: { opacity: 0.6 },
  confirmOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", padding: 20 },
  confirmScrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(23, 37, 54, 0.2)" },
  confirmCard: { width: "100%", maxWidth: 360, borderRadius: 20, backgroundColor: "#FFFFFF", padding: 22, alignItems: "center", shadowColor: "#263A52", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 },
  warningIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#FFF1D9", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  warningIconText: { color: "#C77A13", fontSize: 25, fontWeight: "800" },
  confirmTitle: { color: "#172536", fontSize: 19, fontWeight: "800", textAlign: "center" },
  amountComparison: { alignSelf: "stretch", backgroundColor: "#F6F8FB", borderRadius: 12, padding: 14, gap: 10, marginTop: 18 },
  amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  amountCaption: { color: "#627184", fontSize: 13 },
  amountValue: { color: "#172536", fontSize: 14, fontWeight: "700" },
  newAmountValue: { color: "#1677D2", fontSize: 14, fontWeight: "800" },
  confirmWarning: { color: "#627184", fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 16 },
  confirmActions: { width: "100%", flexDirection: "row", gap: 10, marginTop: 22 },
});
