import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import { formatMoney, type Customer } from "./customers";
import { parseMoney } from "./money";
import { deleteStoredToken, getStoredToken } from "./session";
import StaffFilterPicker from "./StaffFilterPicker";

function Field({ label, value, onChangeText, keyboardType, maxLength }: {
  label: string; value: string; onChangeText: (value: string) => void;
  keyboardType?: "default" | "phone-pad" | "decimal-pad" | "number-pad"; maxLength?: number;
}) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput
    style={styles.input} value={value} onChangeText={onChangeText}
    keyboardType={keyboardType} maxLength={maxLength} autoCorrect={false}
  /></View>;
}

function coordinate(value: string, min: number, max: number) {
  const trimmed = value.trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function validPhone(value: string) {
  return value.length <= 25 && /^[+\d\s()-]+$/.test(value) &&
    value.replace(/\D/g, "").length >= 9 && value.replace(/\D/g, "").length <= 15;
}

export default function CustomerEditPage() {
  const insets = useSafeAreaInsets();
  const { mijoz_id } = useLocalSearchParams<{ mijoz_id: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [termsSaving, setTermsSaving] = useState(false);
  const [error, setError] = useState("");
  const [termsError, setTermsError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [addPhoneNumber, setAddPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [long, setLong] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [reason, setReason] = useState("");

  const expire = useCallback(async () => {
    await deleteStoredToken();
    router.replace("/");
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!mijoz_id || !/^[1-9]\d*$/.test(mijoz_id)) { setError("Mijoz raqami noto‘g‘ri."); setLoading(false); return; }
      try {
        const stored = await getStoredToken();
        if (!stored) { router.replace("/"); return; }
        const headers = { Authorization: `Bearer ${stored}` };
        const [detail, session] = await Promise.all([
          apiRequest<{ customer: Customer }>(`/customers/${mijoz_id}`, { headers }),
          apiRequest<{ user: User }>("/auth/me", { headers }),
        ]);
        if (!active) return;
        const item = detail.customer;
        setToken(stored); setCustomer(item); setIsSuperAdmin(session.user.role === "super_admin");
        setName(item.name); setPhoneNumber(item.phoneNumber);
        setAddPhoneNumber(item.addPhoneNumber ?? ""); setAddress(item.address ?? "");
        setLat(item.lat?.toString() ?? ""); setLong(item.long?.toString() ?? "");
        setAssignedTo(item.assignedTo ?? "");
        setTotalPrice(String(item.totalPrice)); setTermMonths(String(item.termMonths));
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) await expire();
        else if (active) setError(cause instanceof Error ? cause.message : "Mijoz yuklanmadi.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [mijoz_id, expire]);

  async function saveDetails() {
    if (!customer || !token || saving) return;
    setError(""); setNotice("");
    const nextName = name.trim();
    const phone = phoneNumber.trim();
    const extra = addPhoneNumber.trim() || null;
    const nextAddress = address.trim() || null;
    if (!nextName || nextName.length > 100 || !validPhone(phone) || (extra && !validPhone(extra)) || address.trim().length > 500) {
      setError("Ism, telefon va manzilni to‘g‘ri kiriting."); return;
    }
    const patch: Record<string, string | number | null> = {};
    if (nextName !== customer.name) patch.name = nextName;
    if (phone !== customer.phoneNumber) patch.phoneNumber = phone;
    if (extra !== customer.addPhoneNumber) patch.addPhoneNumber = extra;
    if (nextAddress !== customer.address) patch.address = nextAddress;
    if (lat.trim() !== (customer.lat?.toString() ?? "") || long.trim() !== (customer.long?.toString() ?? "")) {
      const latitude = coordinate(lat, -90, 90);
      const longitude = coordinate(long, -180, 180);
      if (latitude === null || longitude === null) { setError("Kenglik va uzunlikni birga to‘g‘ri kiriting."); return; }
      patch.lat = latitude; patch.long = longitude;
    }
    if (isSuperAdmin && (assignedTo || null) !== customer.assignedTo) patch.assignedTo = assignedTo || null;
    if (!Object.keys(patch).length) { setNotice("O‘zgarish yo‘q."); return; }
    Keyboard.dismiss(); setSaving(true);
    try {
      const result = await apiRequest<{ customer: Customer }>(`/customers/${mijoz_id}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(patch),
      });
      setCustomer(result.customer); setNotice("Mijoz ma’lumotlari saqlandi.");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await expire();
      else setError(cause instanceof Error ? cause.message : "O‘zgarish saqlanmadi.");
    } finally { setSaving(false); }
  }

  async function saveTerms() {
    if (!customer || !token || termsSaving || !isSuperAdmin) return;
    setTermsError(""); setNotice("");
    const price = parseMoney(totalPrice);
    const months = Number(termMonths.trim());
    const why = reason.trim();
    if (price === null || price <= 0 || price < customer.totalPaid || !Number.isInteger(months) || months < 1 || months > 120 || !why || why.length > 500) {
      setTermsError("Narx, 1–120 oy muddat va 1–500 belgili sababni kiriting."); return;
    }
    const patch: Record<string, string | number> = { reason: why };
    if (price !== customer.totalPrice) patch.totalPrice = price;
    if (months !== customer.termMonths) patch.termMonths = months;
    if (Object.keys(patch).length === 1) { setTermsError("Narx yoki muddatni o‘zgartiring."); return; }
    Keyboard.dismiss(); setTermsSaving(true);
    try {
      const result = await apiRequest<{ customer: Customer }>(`/customers/${mijoz_id}/terms`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(patch),
      });
      setCustomer(result.customer); setReason(""); setNotice("Narx va muddat saqlandi.");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await expire();
      else setTermsError(cause instanceof Error ? cause.message : "Shartlar saqlanmadi.");
    } finally { setTermsSaving(false); }
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>‹ Mijozga qaytish</Text></Pressable>
      <Text style={styles.title}>Mijozni tuzatish</Text>
      {loading && <Text style={styles.muted}>Yuklanmoqda...</Text>}
      {!!notice && <Text style={styles.success} accessibilityRole="alert">{notice}</Text>}
      {customer && <>
        <View style={styles.card}>
          <Field label="Ism" value={name} onChangeText={setName} maxLength={100} />
          <Field label="Asosiy telefon" value={phoneNumber} onChangeText={setPhoneNumber} keyboardType="phone-pad" maxLength={25} />
          <Field label="Qo‘shimcha telefon" value={addPhoneNumber} onChangeText={setAddPhoneNumber} keyboardType="phone-pad" maxLength={25} />
          <Field label="Manzil" value={address} onChangeText={setAddress} maxLength={500} />
          <View style={styles.row}>
            <View style={styles.half}><Field label="Kenglik (lat)" value={lat} onChangeText={setLat} keyboardType="decimal-pad" /></View>
            <View style={styles.half}><Field label="Uzunlik (long)" value={long} onChangeText={setLong} keyboardType="decimal-pad" /></View>
          </View>
          {isSuperAdmin && token && <StaffFilterPicker token={token} value={assignedTo} onChange={setAssignedTo}
            onSessionExpired={expire} label="Mas’ul xodim" emptyLabel="Biriktirilmagan" allowedRoles={["sotuvchi", "yiguvchi"]} />}
          {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
          <Pressable style={[styles.button, saving && styles.disabled]} onPress={() => void saveDetails()} disabled={saving} accessibilityRole="button">
            <Text style={styles.buttonText}>{saving ? "Saqlanmoqda..." : "Ma’lumotlarni saqlash"}</Text>
          </Pressable>
        </View>
        {isSuperAdmin && <View style={styles.card}>
          <Text style={styles.sectionTitle}>Narx va muddat</Text>
          <Text style={styles.muted}>Jami to‘langan: {formatMoney(customer.totalPaid)}</Text>
          <Field label="Umumiy narx (so‘m)" value={totalPrice} onChangeText={setTotalPrice} keyboardType="number-pad" />
          <Field label="Muddat (oy)" value={termMonths} onChangeText={setTermMonths} keyboardType="number-pad" />
          <Field label="Tuzatish sababi" value={reason} onChangeText={setReason} maxLength={500} />
          {!!termsError && <Text style={styles.error} accessibilityRole="alert">{termsError}</Text>}
          <Pressable style={[styles.button, termsSaving && styles.disabled]} onPress={() => void saveTerms()} disabled={termsSaving} accessibilityRole="button">
            <Text style={styles.buttonText}>{termsSaving ? "Saqlanmoqda..." : "Narx va muddatni saqlash"}</Text>
          </Pressable>
        </View>}
      </>}
      {!loading && !customer && !!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { padding: 20, paddingTop: 55, paddingBottom: 50, gap: 14 },
  title: { color: "#172536", fontSize: 25, fontWeight: "800" },
  link: { color: "#1677D2", fontSize: 15, fontWeight: "700" },
  card: { backgroundColor: "#FFFFFF", padding: 18, borderRadius: 16, gap: 12 },
  sectionTitle: { color: "#172536", fontSize: 18, fontWeight: "800" },
  field: { gap: 7 }, label: { color: "#172536", fontSize: 14, fontWeight: "700" },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 11, paddingHorizontal: 12, color: "#172536", fontSize: 15 },
  row: { flexDirection: "row", gap: 10 }, half: { flex: 1 },
  button: { minHeight: 50, backgroundColor: "#1677D2", borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 8 },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.6 }, muted: { color: "#627184", fontSize: 14 },
  error: { color: "#C3333D", fontSize: 14 }, success: { color: "#16865A", fontSize: 14 },
});
