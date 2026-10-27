import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import CurrentLocationPreview from "./CurrentLocationPreview";
import { formatMoney, type Customer } from "./customers";
import FullScreenLoading from "./FullScreenLoading";
import LocationPicker from "./LocationPicker";
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

function phoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return ((value.trim().startsWith("+998") || digits.length > 9) && digits.startsWith("998")
    ? digits.slice(3) : digits).slice(0, 9);
}

function formatPhoneTail(value: string) {
  return [
    value.slice(0, 3),
    value.length > 3 ? `-${value.slice(3, 5)}` : "",
    value.length > 5 ? `-${value.slice(5, 7)}` : "",
  ].join("");
}

function PhoneField({ label, value, onChangeText }: {
  label: string; value: string; onChangeText: (value: string) => void;
}) {
  const areaRef = useRef<TextInput>(null);
  const tailRef = useRef<TextInput>(null);
  const area = value.slice(0, 2);
  const tail = value.slice(2);

  function changeArea(text: string) {
    const digits = phoneDigits(text);
    onChangeText(digits.length > 2 ? digits : digits.length === 2 ? digits + tail : digits);
    if (digits.length >= 2) tailRef.current?.focus();
  }

  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.phoneInput}>
      <Text style={styles.phonePrefix}>+998 (</Text>
      <TextInput ref={areaRef} style={styles.phoneArea} value={area} onChangeText={changeArea}
        placeholder="00" placeholderTextColor="#9AA6B5" keyboardType="phone-pad" autoCorrect={false}
        accessibilityLabel={`${label}, operator kodi`} />
      <Text style={styles.phonePrefix}>) </Text>
      <TextInput ref={tailRef} style={styles.phoneEditable} value={formatPhoneTail(tail)}
        onChangeText={(text) => {
          const digits = phoneDigits(text);
          onChangeText(digits.length > 7 ? digits : area + digits.slice(0, 7));
        }}
        onKeyPress={({ nativeEvent }) => {
          if (nativeEvent.key === "Backspace" && !tail) {
            areaRef.current?.focus();
            onChangeText(area.slice(0, -1));
          }
        }}
        placeholder="000-00-00" placeholderTextColor="#9AA6B5" keyboardType="phone-pad" autoCorrect={false}
        accessibilityLabel={`${label}, qolgan yetti raqam`} />
    </View>
  </View>;
}

function coordinate(value: string, min: number, max: number) {
  const trimmed = value.trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function validPhone(value: string) {
  return /^\d{9}$/.test(value);
}

export default function CustomerEditPage() {
  const insets = useSafeAreaInsets();
  const { mijoz_id } = useLocalSearchParams<{ mijoz_id: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState("");
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
  const latitude = coordinate(lat, -90, 90);
  const longitude = coordinate(long, -180, 180);
  const selectedPoint = latitude !== null && longitude !== null ? { latitude, longitude } : null;

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
        setName(item.name); setPhoneNumber(phoneDigits(item.phoneNumber));
        setAddPhoneNumber(phoneDigits(item.addPhoneNumber ?? "")); setAddress(item.address ?? "");
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

  async function chooseCurrentLocation() {
    if (locationBusy) return;
    setLocationBusy(true); setLocationError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setLocationError("Joylashuvga ruxsat berilmadi. Xaritadan nuqtani tanlang.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: currentLat, longitude: currentLong } = position.coords;
      if (!Number.isFinite(currentLat) || !Number.isFinite(currentLong)) throw new Error("Joylashuv aniqlanmadi.");
      setLat(currentLat.toFixed(6)); setLong(currentLong.toFixed(6));
    } catch {
      setLocationError("Joriy joylashuv olinmadi. Xaritadan nuqtani tanlang.");
    } finally { setLocationBusy(false); }
  }

  async function openSelectedLocation(latitude: number, longitude: number) {
    const point = `${longitude},${latitude}`;
    try {
      if (Platform.OS !== "web") {
        try {
          await Linking.openURL(`yandexmaps://maps.yandex.ru/?pt=${point}&z=17`);
          return;
        } catch {
          // Open Yandex Maps in the browser when its app is unavailable.
        }
      }
      await Linking.openURL(`https://yandex.ru/maps/?pt=${point}&z=17&l=map`);
    } catch {
      setLocationError("Yandex Maps ochilmadi. Qayta urinib ko‘ring.");
    }
  }

  async function saveDetails() {
    if (!customer || !token || saving) return;
    setError(""); setNotice("");
    const nextName = name.trim();
    const phone = phoneNumber.trim();
    const extra = addPhoneNumber.trim();
    const nextAddress = address.trim() || null;
    if (!nextName || nextName.length > 100 || address.trim().length > 500) {
      setError("Ism va manzilni to‘g‘ri kiriting."); return;
    }
    if (!validPhone(phone) || (extra && !validPhone(extra))) {
      setError("Telefon raqamlarini to‘liq kiriting (9 ta raqam)."); return;
    }
    const patch: Record<string, string | number | null> = {};
    if (nextName !== customer.name) patch.name = nextName;
    if (`+998${phone}` !== customer.phoneNumber) patch.phoneNumber = `+998${phone}`;
    if ((extra ? `+998${extra}` : null) !== customer.addPhoneNumber) patch.addPhoneNumber = extra ? `+998${extra}` : null;
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
    let saved = false;
    try {
      await apiRequest<{ customer: Customer }>(`/customers/${mijoz_id}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(patch),
      });
      saved = true;
      router.replace({ pathname: "/customers/detail", params: { mijoz_id: String(customer.mijoz_id) } });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await expire();
      else setError(cause instanceof Error ? cause.message : "O‘zgarish saqlanmadi.");
    } finally { if (!saved) setSaving(false); }
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
    let saved = false;
    try {
      await apiRequest<{ customer: Customer }>(`/customers/${mijoz_id}/terms`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(patch),
      });
      saved = true;
      router.replace({ pathname: "/customers/detail", params: { mijoz_id: String(customer.mijoz_id) } });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await expire();
      else setTermsError(cause instanceof Error ? cause.message : "Shartlar saqlanmadi.");
    } finally { if (!saved) setTermsSaving(false); }
  }

  return <FullScreenLoading active={saving || termsSaving} message={termsSaving ? "Narx va muddat saqlanmoqda..." : "Mijoz ma’lumotlari saqlanmoqda..."}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>‹ Mijozga qaytish</Text></Pressable>
      <Text style={styles.title}>Mijozni tuzatish</Text>
      {loading && <Text style={styles.muted}>Yuklanmoqda...</Text>}
      {!!notice && <Text style={styles.success} accessibilityRole="alert">{notice}</Text>}
      {customer && <>
        <View style={styles.card}>
          <Field label="Ism" value={name} onChangeText={setName} maxLength={100} />
          <PhoneField label="Asosiy telefon *" value={phoneNumber} onChangeText={setPhoneNumber} />
          <PhoneField label="Qo‘shimcha telefon" value={addPhoneNumber} onChangeText={setAddPhoneNumber} />
          <Field label="Manzil" value={address} onChangeText={setAddress} maxLength={500} />
          <View style={styles.locationSection}>
            <Text style={styles.label}>Joylashuv</Text>
            <Text style={styles.muted}>Mijoz manzilini xaritadan belgilang yoki joriy joylashuvni oling.</Text>
            <Pressable style={styles.locationAction} onPress={() => { Keyboard.dismiss(); setLocationError(""); setMapOpen(true); }} accessibilityRole="button">
              <Text style={styles.locationActionText}>Xaritadan belgilash</Text>
            </Pressable>
            <Pressable style={[styles.locationAction, locationBusy && styles.disabled]} onPress={() => void chooseCurrentLocation()} disabled={locationBusy} accessibilityRole="button">
              <Text style={styles.locationActionText}>{locationBusy ? "Joylashuv olinmoqda..." : "Joriy joyni belgilash"}</Text>
            </Pressable>
            {!!locationError && <Text style={styles.error} accessibilityRole="alert">{locationError}</Text>}
            {selectedPoint && <>
              <Pressable style={styles.coordinateLink} onPress={() => void openSelectedLocation(selectedPoint.latitude, selectedPoint.longitude)}
                accessibilityRole="button" accessibilityLabel="Tanlangan nuqtani Yandex Maps’da ochish">
                <Text style={styles.coordinates}>Eski lokatsiyani Yandex Maps’da ochish</Text>
              </Pressable>
              <CurrentLocationPreview point={selectedPoint} />
            </>}
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
    <LocationPicker visible={mapOpen} value={selectedPoint} onClose={() => setMapOpen(false)}
      onSelect={(point) => {
        setLat(point.latitude.toFixed(6)); setLong(point.longitude.toFixed(6));
        setLocationError(""); setMapOpen(false);
      }} />
    </KeyboardAvoidingView>
  </FullScreenLoading>;
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
  phoneInput: { minHeight: 48, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 11, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF" },
  phonePrefix: { color: "#172536", fontSize: 15, fontWeight: "700" },
  phoneArea: { width: 26, minHeight: 46, paddingVertical: 0, paddingHorizontal: 0, color: "#172536", fontSize: 15 },
  phoneEditable: { flex: 1, minHeight: 46, paddingVertical: 0, color: "#172536", fontSize: 15 },
  locationSection: { gap: 9 },
  locationAction: { minHeight: 46, borderWidth: 1, borderColor: "#C9DDF1", borderRadius: 11, backgroundColor: "#EAF4FF", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  locationActionText: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  coordinateLink: { alignSelf: "flex-start", minHeight: 36, justifyContent: "center", paddingRight: 12 },
  coordinates: { color: "#1677D2", fontSize: 12, fontWeight: "700" },
  button: { minHeight: 50, backgroundColor: "#1677D2", borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 8 },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.6 }, muted: { color: "#627184", fontSize: 14 },
  error: { color: "#C3333D", fontSize: 14 }, success: { color: "#16865A", fontSize: 14 },
});
