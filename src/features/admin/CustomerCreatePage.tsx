import * as Location from "expo-location";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ApiError, apiRequest, type User } from "./api";
import FullScreenLoading from "./FullScreenLoading";
import LoadingMark from "./LoadingMark";
import { deleteStoredToken, getStoredToken } from "./session";

type Category = { id: string; name: string; parentId: string | null };
type Product = { id: string; categoryId: string; name: string; originalPrice: number | null; minSellingPrice: number | null };
type Region = { id: string; name: string };
type PaymentMethod = "cash" | "card" | "transfer";
type CreatedCustomer = { id: string; name: string; productName: string; totalPrice: number; totalPaid: number; remainingBalance: number };

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Naqd" },
  { value: "card", label: "Karta" },
  { value: "transfer", label: "O‘tkazma" },
];

function parseMoney(value: string) {
  const normalized = value.trim();
  const number = Number(normalized);
  return /^\d+$/.test(normalized) && Number.isSafeInteger(number) ? number : null;
}

function parseCoordinate(value: string, min: number, max: number) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function validPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return value.length <= 25 && /^[+\d\s()-]+$/.test(value) && digits.length >= 9 && digits.length <= 15;
}

function formatPrice(value: number | null) {
  return value === null ? "Ko‘rsatilmagan" : `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so‘m`;
}

export default function CustomerCreatePage() {
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [addPhoneNumber, setAddPhoneNumber] = useState("");
  const [lat, setLat] = useState("");
  const [long, setLong] = useState("");
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [downPayment, setDownPayment] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [termMonths, setTermMonths] = useState("12");
  const [description, setDescription] = useState("");
  const [regionFormOpen, setRegionFormOpen] = useState(false);
  const [newRegionName, setNewRegionName] = useState("");
  const [regionBusy, setRegionBusy] = useState(false);
  const [regionError, setRegionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [created, setCreated] = useState<CreatedCustomer | null>(null);

  const handleSessionExpired = useCallback(async () => {
    await deleteStoredToken();
    router.replace("/");
  }, []);

  const loadData = useCallback(async (authToken: string) => {
    setLoadingData(true);
    setLookupError("");
    try {
      const headers = { Authorization: `Bearer ${authToken}` };
      const [categoryResult, productResult, regionResult] = await Promise.all([
        apiRequest<{ categories: Category[] }>("/product-categories", { headers }),
        apiRequest<{ products: Product[] }>("/products", { headers }),
        apiRequest<{ regions: Region[] }>("/regions", { headers }),
      ]);
      setCategories(categoryResult.categories);
      setProducts(productResult.products);
      setRegions(regionResult.regions);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await handleSessionExpired();
      } else {
        setLookupError(cause instanceof Error ? cause.message : "Ma’lumotlarni yuklab bo‘lmadi.");
      }
    } finally {
      setLoadingData(false);
    }
  }, [handleSessionExpired]);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const stored = await getStoredToken();
        if (!stored) { router.replace("/"); return; }
        const result = await apiRequest<{ user: User }>("/auth/me", {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (result.user.role !== "sotuvchi") { router.replace("/"); return; }
        if (active) {
          setToken(stored);
          await loadData(stored);
        }
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await handleSessionExpired();
        } else if (active) {
          setLookupError(cause instanceof Error ? cause.message : "Sahifani ochib bo‘lmadi.");
        }
      } finally {
        if (active) setChecking(false);
      }
    }
    void checkSession();
    return () => { active = false; };
  }, [handleSessionExpired, loadData]);

  const groups = categories.filter((item) => item.parentId === null);
  const sections = categories.filter((item) => item.parentId === groupId);
  const sectionProducts = products.filter((item) => item.categoryId === sectionId);
  const selectedProduct = sectionProducts.find((item) => item.id === productId);
  const initialPayment = parseMoney(downPayment);

  async function getLocation() {
    setLocationError("");
    setLocationBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setLocationError("Joylashuvga ruxsat berilmadi. Koordinatalarni qo‘lda kiriting.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLat(position.coords.latitude.toFixed(6));
      setLong(position.coords.longitude.toFixed(6));
    } catch (cause) {
      setLocationError(cause instanceof Error ? cause.message : "Joylashuv olinmadi. Koordinatalarni qo‘lda kiriting.");
    } finally {
      setLocationBusy(false);
    }
  }

  async function createRegion() {
    if (!token || regionBusy) return;
    const regionName = newRegionName.trim();
    setRegionError("");
    if (!regionName || regionName.length > 100) {
      setRegionError("Hudud nomini 1–100 belgi bilan kiriting.");
      return;
    }
    Keyboard.dismiss();
    setRegionBusy(true);
    try {
      const result = await apiRequest<{ region: Region }>("/regions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: regionName }),
      });
      setRegions((items) => [result.region, ...items]);
      setRegionId(result.region.id);
      setNewRegionName("");
      setRegionFormOpen(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await handleSessionExpired();
      else setRegionError(cause instanceof Error ? cause.message : "Hudud yaratilmadi.");
    } finally {
      setRegionBusy(false);
    }
  }

  async function createCustomer() {
    if (!token || saving) return;
    setFormError("");
    const normalizedName = name.trim();
    const mainPhone = phoneNumber.trim();
    const extraPhone = addPhoneNumber.trim();
    const price = parseMoney(totalPrice);
    const advance = parseMoney(downPayment);
    const months = parseMoney(termMonths);
    const latitude = parseCoordinate(lat, -90, 90);
    const longitude = parseCoordinate(long, -180, 180);

    if (!normalizedName || normalizedName.length > 100) { setFormError("Mijoz ismini kiriting (100 belgigacha)."); return; }
    if (!validPhone(mainPhone) || (extraPhone && !validPhone(extraPhone))) { setFormError("Telefon raqamlarini to‘g‘ri kiriting (9–15 raqam)."); return; }
    if (!groupId || !sectionId || !productId || !selectedProduct) { setFormError("Guruh, bo‘lim va mahsulotni tanlang."); return; }
    if (!regionId) { setFormError("Hududni tanlang yoki yangi hudud yarating."); return; }
    if (latitude === null || longitude === null) { setFormError("Joylashuv koordinatalarini to‘g‘ri kiriting."); return; }
    if (price === null || price <= 0) { setFormError("Umumiy sotuv narxini musbat butun so‘mda kiriting."); return; }
    if (selectedProduct.minSellingPrice !== null && price < selectedProduct.minSellingPrice) {
      setFormError(`Sotuv narxi ${formatPrice(selectedProduct.minSellingPrice)} dan kam bo‘lmasligi kerak.`);
      return;
    }
    if (advance === null || advance > price) { setFormError("Boshlang‘ich to‘lov 0 dan sotuv narxigacha bo‘lishi kerak."); return; }
    if (advance > 0 && !paymentMethod) { setFormError("Boshlang‘ich to‘lov usulini tanlang."); return; }
    if (months === null || months < 1 || months > 120) { setFormError("Nasiya muddatini 1–120 oy oralig‘ida kiriting."); return; }
    if (description.length > 1000) { setFormError("Izoh 1000 belgidan oshmasligi kerak."); return; }

    Keyboard.dismiss();
    setSaving(true);
    try {
      const result = await apiRequest<{ customer: CreatedCustomer }>("/customers", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: normalizedName,
          phoneNumber: mainPhone,
          ...(extraPhone ? { addPhoneNumber: extraPhone } : {}),
          groupId, sectionId, productId, regionId,
          lat: latitude, long: longitude,
          totalPrice: price, downPayment: advance,
          ...(advance > 0 ? { paymentMethod } : {}),
          termMonths: months, description: description.trim(),
        }),
      });
      setCreated(result.customer);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await handleSessionExpired();
      else setFormError(cause instanceof Error ? cause.message : "Mijoz yaratilmadi.");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setCreated(null);
    setGroupId(null);
    setSectionId(null);
    setProductId(null);
    setRegionId(null);
    setName("");
    setPhoneNumber("");
    setAddPhoneNumber("");
    setLat("");
    setLong("");
    setTotalPrice("");
    setDownPayment("0");
    setPaymentMethod(null);
    setTermMonths("12");
    setDescription("");
    setFormError("");
    setLocationError("");
    setRegionError("");
  }

  return <FullScreenLoading active={saving || regionBusy} message={regionBusy ? "Hudud yaratilmoqda..." : "Mijoz yaratilmoqda..."}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button"><Text style={styles.link}>‹  Orqaga</Text></Pressable>
      <Text style={styles.eyebrow}>SOTUV</Text>
      <Text style={styles.title}>Yangi mijoz</Text>
      <Text style={styles.subtitle}>Mijoz, mahsulot va nasiya shartlarini kiriting.</Text>

      {(checking || loadingData) && <View style={styles.loader}><LoadingMark size={78} /><Text style={styles.hint}>Ma’lumotlar yuklanmoqda...</Text></View>}
      {!!lookupError && <View style={styles.card}>
        <Text style={styles.error} accessibilityRole="alert">{lookupError}</Text>
        {!!token && <Action title="Qayta yuklash" onPress={() => void loadData(token)} />}
      </View>}

      {created ? <View style={styles.card}>
        <Text style={styles.successTitle}>Mijoz yaratildi</Text>
        <Text style={styles.hint}>{created.name} · {created.productName}</Text>
        <Text style={styles.summary}>Umumiy narx: {formatPrice(created.totalPrice)}</Text>
        <Text style={styles.summary}>To‘langan: {formatPrice(created.totalPaid)}</Text>
        <Text style={styles.summary}>Qolgan qarz: {formatPrice(created.remainingBalance)}</Text>
        <Text style={styles.idText}>Mijoz ID: {created.id}</Text>
        <Action title="Yana mijoz qo‘shish" onPress={resetForm} />
      </View> : !checking && !loadingData && !lookupError && token && <>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Mijoz ma’lumotlari</Text>
          <Field label="Ism *" value={name} onChangeText={setName} placeholder="Mijoz ismi" maxLength={100} />
          <Field label="Telefon raqami *" value={phoneNumber} onChangeText={setPhoneNumber} placeholder="+998901234567" keyboardType="phone-pad" maxLength={25} />
          <Field label="Qo‘shimcha telefon" value={addPhoneNumber} onChangeText={setAddPhoneNumber} placeholder="Ixtiyoriy" keyboardType="phone-pad" maxLength={25} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>2. Mahsulot</Text>
          <Text style={styles.label}>Guruh *</Text>
          <View style={styles.options}>{groups.map((item) => <Option key={item.id} title={item.name} selected={groupId === item.id} onPress={() => { setGroupId(item.id); setSectionId(null); setProductId(null); }} />)}</View>
          {groups.length === 0 && <Text style={styles.hint}>Hali guruh yaratilmagan. Administratorga murojaat qiling.</Text>}
          {!!groupId && <>
            <Text style={styles.label}>Bo‘lim *</Text>
            <View style={styles.options}>{sections.map((item) => <Option key={item.id} title={item.name} selected={sectionId === item.id} onPress={() => { setSectionId(item.id); setProductId(null); }} />)}</View>
            {sections.length === 0 && <Text style={styles.hint}>Bu guruhda bo‘lim yo‘q.</Text>}
          </>}
          {!!sectionId && <>
            <Text style={styles.label}>Mahsulot *</Text>
            <View style={styles.options}>{sectionProducts.map((item) => <Option key={item.id} title={item.name} detail={`Eng past narx: ${formatPrice(item.minSellingPrice)}`} selected={productId === item.id} onPress={() => { setProductId(item.id); setTotalPrice(item.minSellingPrice?.toString() ?? ""); }} />)}</View>
            {sectionProducts.length === 0 && <Text style={styles.hint}>Bu bo‘limda mahsulot yo‘q.</Text>}
          </>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>3. Hudud va joylashuv</Text>
          <Text style={styles.label}>Hudud *</Text>
          <View style={styles.options}>{regions.map((item) => <Option key={item.id} title={item.name} selected={regionId === item.id} onPress={() => setRegionId(item.id)} />)}</View>
          {regions.length === 0 && <Text style={styles.hint}>Hudud hali yaratilmagan.</Text>}
          <Action title={regionFormOpen ? "Hudud yaratishni yopish" : "+ Yangi hudud yaratish"} onPress={() => setRegionFormOpen((open) => !open)} secondary />
          {regionFormOpen && <View style={styles.regionForm}>
            <Field label="Hudud nomi" value={newRegionName} onChangeText={setNewRegionName} placeholder="Masalan: Chilonzor" maxLength={100} />
            {!!regionError && <Text style={styles.error} accessibilityRole="alert">{regionError}</Text>}
            <Action title={regionBusy ? "Yaratilmoqda..." : "Hududni yaratish"} onPress={() => void createRegion()} disabled={regionBusy} />
          </View>}
          <Text style={styles.label}>Mijoz manzili *</Text>
          <Text style={styles.hint}>Mijoz manzilida turganingizda joylashuvni oling yoki koordinatani qo‘lda kiriting.</Text>
          <Action title={locationBusy ? "Joylashuv olinmoqda..." : "Joriy joylashuvni olish"} onPress={() => void getLocation()} disabled={locationBusy} secondary />
          {!!locationError && <Text style={styles.error} accessibilityRole="alert">{locationError}</Text>}
          <Field label="Kenglik (lat) *" value={lat} onChangeText={setLat} placeholder="41.2995" autoCapitalize="none" />
          <Field label="Uzunlik (long) *" value={long} onChangeText={setLong} placeholder="69.2401" autoCapitalize="none" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>4. Nasiya shartlari</Text>
          {!!selectedProduct && <Text style={styles.hint}>Mahsulotning eng past sotilish narxi: {formatPrice(selectedProduct.minSellingPrice)}</Text>}
          <Field label="Umumiy sotuv narxi (so‘m) *" value={totalPrice} onChangeText={setTotalPrice} placeholder="3000000" keyboardType="number-pad" />
          <Field label="Boshlang‘ich to‘lov (so‘m) *" value={downPayment} onChangeText={(value) => { setDownPayment(value); if (value === "0") setPaymentMethod(null); }} placeholder="0" keyboardType="number-pad" />
          {initialPayment !== null && initialPayment > 0 && <>
            <Text style={styles.label}>To‘lov usuli *</Text>
            <View style={styles.options}>{paymentMethods.map((item) => <Option key={item.value} title={item.label} selected={paymentMethod === item.value} onPress={() => setPaymentMethod(item.value)} />)}</View>
          </>}
          <Field label="Nasiya muddati (oy) *" value={termMonths} onChangeText={setTermMonths} placeholder="12" keyboardType="number-pad" maxLength={3} />
          <Text style={styles.label}>Izoh</Text>
          <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="Ixtiyoriy izoh" multiline maxLength={1000} textAlignVertical="top" />
          {!!formError && <Text style={styles.error} accessibilityRole="alert">{formError}</Text>}
          <Action title={saving ? "Saqlanmoqda..." : "Mijozni yaratish"} onPress={() => void createCustomer()} disabled={saving || locationBusy || regionBusy} />
        </View>
      </>}
    </ScrollView>
    </KeyboardAvoidingView>
  </FullScreenLoading>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType, maxLength, autoCapitalize }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder: string;
  keyboardType?: "default" | "number-pad" | "phone-pad"; maxLength?: number; autoCapitalize?: "none";
}) {
  return <View>
    <Text style={styles.label}>{label}</Text>
    <TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#9AA6B5" keyboardType={keyboardType} maxLength={maxLength} autoCapitalize={autoCapitalize} />
  </View>;
}

function Option({ title, detail, selected, onPress }: { title: string; detail?: string; selected: boolean; onPress: () => void }) {
  return <Pressable style={[styles.option, selected && styles.optionSelected]} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{title}</Text>
    {!!detail && <Text style={styles.optionDetail}>{detail}</Text>}
  </Pressable>;
}

function Action({ title, onPress, disabled, secondary }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable style={[styles.action, secondary && styles.secondaryAction, disabled && styles.disabled]} onPress={onPress} disabled={disabled} accessibilityRole="button">
    <Text style={[styles.actionText, secondary && styles.secondaryActionText]}>{title}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 40 },
  back: { alignSelf: "flex-start", paddingVertical: 10, paddingRight: 20, marginBottom: 18 },
  link: { color: "#1677D2", fontSize: 16, fontWeight: "700" },
  eyebrow: { color: "#1677D2", fontSize: 12, fontWeight: "800", letterSpacing: 1.5, marginBottom: 8 },
  title: { color: "#172536", fontSize: 30, fontWeight: "800" },
  subtitle: { color: "#627184", fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 24 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: "#E8EDF3" },
  cardTitle: { color: "#172536", fontSize: 19, fontWeight: "800", marginBottom: 8 },
  label: { color: "#172536", fontSize: 14, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  input: { minHeight: 50, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 12, paddingHorizontal: 14, color: "#172536", fontSize: 16, backgroundColor: "#FFFFFF" },
  multiline: { height: 86, paddingTop: 12 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 11, paddingVertical: 11, paddingHorizontal: 13, minWidth: 80 },
  optionSelected: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  optionText: { color: "#45586E", fontSize: 14, fontWeight: "700" },
  optionTextSelected: { color: "#1677D2" },
  optionDetail: { color: "#627184", fontSize: 12, marginTop: 3 },
  hint: { color: "#627184", fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 8 },
  regionForm: { backgroundColor: "#F6F8FB", borderRadius: 12, padding: 14, marginTop: 8 },
  action: { minHeight: 48, backgroundColor: "#1677D2", borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, marginTop: 14 },
  secondaryAction: { backgroundColor: "#EAF4FF" },
  actionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  secondaryActionText: { color: "#1677D2" },
  disabled: { opacity: 0.55 },
  error: { color: "#C3333D", fontSize: 14, lineHeight: 20, marginTop: 14 },
  loader: { alignItems: "center", paddingVertical: 40 },
  successTitle: { color: "#16865A", fontSize: 22, fontWeight: "800" },
  summary: { color: "#172536", fontSize: 15, marginTop: 10 },
  idText: { color: "#627184", fontSize: 12, marginTop: 18 },
});
