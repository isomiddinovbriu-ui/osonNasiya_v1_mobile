import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import LocationPicker from "./LocationPicker";
import MoneyInput from "./MoneyInput";
import { formatMoneyDigits, formatMoneyWithUnits, parseMoney } from "./money";
import { deleteStoredToken, getStoredToken } from "./session";
import { type Customer, type PaymentMethod } from "./customers";

type Category = { id: string; name: string; parentId: string | null };
type Product = { id: string; universalId: string; categoryId: string; name: string; title?: string; originalPrice: number | null; minSellingPrice: number | null };
type Region = { id: string; name: string };
type CreatedCustomer = Pick<Customer, "mijoz_id" | "name" | "productName" | "totalPrice" | "totalPaid" | "remainingBalance">;
type Draft = {
  step: number; name: string; phoneNumber: string; addPhoneNumber: string; product: Product | null;
  groupId: string | null; sectionId: string | null; region: Region | null;
  lat: string; long: string; totalPrice: string; downPayment: string;
  paymentMethod: PaymentMethod | null; termMonths: string; description: string;
};
const stepTitles = ["Mijoz ma’lumotlari", "Mahsulot", "Hudud va joylashuv", "Nasiya shartlari"];
const suggestedTerms = [3, 6, 9, 12];

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Naqd" },
  { value: "transfer", label: "O‘tkazma" },
];

function parseCoordinate(value: string, min: number, max: number) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function phoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return ((value.trim().startsWith("+998") || digits.length > 9) && digits.startsWith("998") ? digits.slice(3) : digits).slice(0, 9);
}

function formatPhoneTail(value: string) {
  return [
    value.slice(0, 3),
    value.length > 3 ? `-${value.slice(3, 5)}` : "",
    value.length > 5 ? `-${value.slice(5, 7)}` : "",
  ].join("");
}

function validPhone(value: string) {
  return /^\d{9}$/.test(value);
}

function formatPrice(value: number | null) {
  return value === null ? "Ko‘rsatilmagan" : `${formatMoneyDigits(value)} so‘m`;
}

export default function CustomerCreatePage() {
  const [token, setToken] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [step, setStep] = useState(0);
  const [checking, setChecking] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[] | null>(null);
  const [productSearching, setProductSearching] = useState(false);
  const [productSearchError, setProductSearchError] = useState("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionSearch, setRegionSearch] = useState("");
  const [regionResults, setRegionResults] = useState<Region[] | null>(null);
  const [regionSearching, setRegionSearching] = useState(false);
  const [regionSearchError, setRegionSearchError] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [addPhoneNumber, setAddPhoneNumber] = useState("");
  const [lat, setLat] = useState("");
  const [long, setLong] = useState("");
  const [locationError, setLocationError] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
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
  const scrollRef = useRef<ScrollView>(null);

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
          setDraftKey(`customer_draft_${result.user.id}`);
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

  const visibleProducts = productSearch.trim() ? productResults ?? [] : products;
  const visibleRegions = regionSearch.trim() ? regionResults ?? [] : regions;
  const initialPayment = parseMoney(downPayment);
  const priceAmount = parseMoney(totalPrice);
  const monthsAmount = parseMoney(termMonths);
  const monthlyPayment = priceAmount !== null && priceAmount > 0 && initialPayment !== null && initialPayment <= priceAmount &&
    monthsAmount !== null && monthsAmount >= 1 && monthsAmount <= 120
    ? Math.ceil((priceAmount - initialPayment) / monthsAmount)
    : null;

  useEffect(() => {
    if (!draftKey) return;
    let active = true;
    AsyncStorage.getItem(draftKey).then((raw) => {
      if (!active || !raw) return;
      try {
        const draft = JSON.parse(raw) as Draft;
        setStep(Math.max(0, Math.min(3, draft.step || 0)));
        setName(draft.name ?? ""); setPhoneNumber(phoneDigits(draft.phoneNumber ?? ""));
        setAddPhoneNumber(phoneDigits(draft.addPhoneNumber ?? ""));
        setSelectedProduct(draft.product ?? null); setProductId(draft.product?.id ?? null);
        setGroupId(draft.groupId ?? null); setSectionId(draft.sectionId ?? null);
        setSelectedRegion(draft.region ?? null); setRegionId(draft.region?.id ?? null);
        setLat(draft.lat ?? ""); setLong(draft.long ?? "");
        setTotalPrice(draft.totalPrice ?? ""); setDownPayment(draft.downPayment ?? "0");
        setPaymentMethod(draft.paymentMethod === "cash" || draft.paymentMethod === "transfer" ? draft.paymentMethod : null);
        setTermMonths(draft.termMonths ?? "12");
        setDescription(draft.description ?? "");
      } catch { /* Ignore an invalid old draft. */ }
    }).catch(() => { /* The form remains usable if local storage is unavailable. */ })
      .finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady || !draftKey || created) return;
    const draft: Draft = { step, name, phoneNumber, addPhoneNumber, product: selectedProduct,
      groupId, sectionId, region: selectedRegion, lat, long, totalPrice, downPayment,
      paymentMethod, termMonths, description };
    const timer = setTimeout(() => { void AsyncStorage.setItem(draftKey, JSON.stringify(draft)); }, 300);
    return () => clearTimeout(timer);
  }, [draftReady, draftKey, created, step, name, phoneNumber, addPhoneNumber, selectedProduct,
    groupId, sectionId, selectedRegion, lat, long, totalPrice, downPayment, paymentMethod, termMonths, description]);

  useEffect(() => {
    if (!token || !productSearch.trim()) return;
    let active = true;
    const timer = setTimeout(async () => {
      setProductSearching(true); setProductSearchError("");
      try {
        const result = await apiRequest<{ products: Product[] }>(`/products/search?search=${encodeURIComponent(productSearch.trim())}`, { headers: { Authorization: `Bearer ${token}` } });
        if (active) setProductResults(result.products);
      } catch (cause) {
        if (active) {
          if (cause instanceof ApiError && cause.status === 401) void handleSessionExpired();
          else setProductSearchError(cause instanceof Error ? cause.message : "Qidiruv bajarilmadi.");
        }
      } finally { if (active) setProductSearching(false); }
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [token, productSearch, handleSessionExpired]);

  useEffect(() => {
    if (!token || !regionSearch.trim()) return;
    let active = true;
    const timer = setTimeout(async () => {
      setRegionSearching(true); setRegionSearchError("");
      try {
        const result = await apiRequest<{ regions: Region[] }>(`/regions?search=${encodeURIComponent(regionSearch.trim())}`, { headers: { Authorization: `Bearer ${token}` } });
        if (active) setRegionResults(result.regions);
      } catch (cause) {
        if (active) {
          if (cause instanceof ApiError && cause.status === 401) void handleSessionExpired();
          else setRegionSearchError(cause instanceof Error ? cause.message : "Qidiruv bajarilmadi.");
        }
      } finally { if (active) setRegionSearching(false); }
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [token, regionSearch, handleSessionExpired]);

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
      setSelectedRegion(result.region);
      setNewRegionName("");
      setRegionFormOpen(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await handleSessionExpired();
      else setRegionError(cause instanceof Error ? cause.message : "Hudud yaratilmadi.");
    } finally {
      setRegionBusy(false);
    }
  }

  function nextStep() {
    setFormError("");
    if (step === 0) {
      if (!name.trim() || name.trim().length > 100) { setFormError("Mijoz ismini kiriting (100 belgigacha)."); return; }
      if (!validPhone(phoneNumber.trim()) || (addPhoneNumber.trim() && !validPhone(addPhoneNumber.trim()))) {
        setFormError("Telefon raqamlarini to‘liq kiriting (9 ta raqam)."); return;
      }
    }
    if (step === 1 && (!productId || !selectedProduct || !groupId || !sectionId)) {
      setFormError("Mahsulotni tanlang."); return;
    }
    if (step === 2) {
      if (!regionId) { setFormError("Hududni tanlang."); return; }
      if (parseCoordinate(lat, -90, 90) === null || parseCoordinate(long, -180, 180) === null) {
        setFormError("Xaritadan joylashuvni belgilang yoki koordinatalarni kiriting."); return;
      }
    }
    Keyboard.dismiss();
    setStep((current) => Math.min(3, current + 1));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function chooseProduct(item: Product) {
    const section = categories.find((category) => category.id === item.categoryId);
    if (!section?.parentId) { setFormError("Mahsulot bo‘limi topilmadi. Ma’lumotlarni qayta yuklang."); return; }
    setSelectedProduct(item); setProductId(item.id); setSectionId(section.id); setGroupId(section.parentId);
    setTotalPrice(item.minSellingPrice?.toString() ?? "");
    setFormError("");
  }

  async function createCustomer() {
    if (!token || saving) return;
    setFormError("");
    const normalizedName = name.trim();
    const mainPhone = phoneNumber;
    const extraPhone = addPhoneNumber;
    const price = parseMoney(totalPrice);
    const advance = parseMoney(downPayment);
    const months = parseMoney(termMonths);
    const latitude = parseCoordinate(lat, -90, 90);
    const longitude = parseCoordinate(long, -180, 180);

    if (!normalizedName || normalizedName.length > 100) { setFormError("Mijoz ismini kiriting (100 belgigacha)."); return; }
    if (!validPhone(mainPhone) || (extraPhone && !validPhone(extraPhone))) { setFormError("Telefon raqamlarini to‘liq kiriting (9 ta raqam)."); return; }
    if (!groupId || !sectionId || !productId || !selectedProduct) { setFormError("Mahsulotni tanlang."); return; }
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
          phoneNumber: `+998${mainPhone}`,
          ...(extraPhone ? { addPhoneNumber: `+998${extraPhone}` } : {}),
          groupId, sectionId, productId, regionId,
          lat: latitude, long: longitude,
          totalPrice: price, downPayment: advance,
          ...(advance > 0 ? { paymentMethod } : {}),
          termMonths: months, description: description.trim(),
        }),
      });
      setCreated(result.customer);
      if (draftKey) void AsyncStorage.removeItem(draftKey);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await handleSessionExpired();
      else setFormError(cause instanceof Error ? cause.message : "Mijoz yaratilmadi.");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setCreated(null);
    setStep(0);
    setGroupId(null);
    setSectionId(null);
    setProductId(null);
    setSelectedProduct(null);
    setRegionId(null);
    setSelectedRegion(null);
    setProductSearch(""); setRegionSearch("");
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
    <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => step > 0 && !created ? setStep(step - 1) : router.back()} style={styles.back} accessibilityRole="button"><Text style={styles.link}>‹  Orqaga</Text></Pressable>
      <Text style={styles.eyebrow}>SOTUV</Text>
      <Text style={styles.title}>Yangi mijoz</Text>
      <Text style={styles.subtitle}>{created ? "Mijoz muvaffaqiyatli yaratildi." : `${step + 1}/4 · ${stepTitles[step]}`}</Text>

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
        <Text style={styles.idText}>Mijoz raqami: {created.mijoz_id}</Text>
        <Action title="Yana mijoz qo‘shish" onPress={resetForm} />
      </View> : !checking && !loadingData && draftReady && !lookupError && token && <>
        <View style={styles.progress}>{stepTitles.map((title, index) => <View key={title} style={[styles.progressSegment, index <= step && styles.progressSegmentActive]} />)}</View>
        {step === 0 && <View style={styles.card}>
          <Text style={styles.cardTitle}>Mijoz ma’lumotlari</Text>
          <Field label="Ism *" value={name} onChangeText={setName} placeholder="Mijoz ismi" maxLength={100} />
          <PhoneField label="Telefon raqami *" value={phoneNumber} onChangeText={setPhoneNumber} />
          <PhoneField label="Qo‘shimcha telefon" value={addPhoneNumber} onChangeText={setAddPhoneNumber} />
        </View>}

        {step === 1 && <View style={styles.card}>
          <Text style={styles.cardTitle}>Mahsulotni tanlang</Text>
          <Text style={styles.hint}>Nomi, UD-kodi, sarlavhasi, bo‘limi yoki guruhi bo‘yicha qidiring.</Text>
          <Field label="Mahsulot qidirish" value={productSearch} onChangeText={(value) => { setProductSearch(value); setProductResults(null); setProductSearchError(""); }} placeholder="Nomi yoki UD-261015001" maxLength={100} />
          {productSearching && <Text style={styles.hint}>Qidirilmoqda...</Text>}
          {!!productSearchError && <Text style={styles.error} accessibilityRole="alert">{productSearchError}</Text>}
          {selectedProduct && <View style={styles.selectedBox}><Text style={styles.optionTextSelected}>Tanlangan: {selectedProduct.name}{selectedProduct.universalId ? ` · ${selectedProduct.universalId}` : ""}</Text></View>}
          <View style={styles.list}>{visibleProducts.slice(0, 50).map((item) => {
            const section = categories.find((category) => category.id === item.categoryId);
            const group = categories.find((category) => category.id === section?.parentId);
            return <Option key={item.id} title={item.name} detail={[item.universalId, item.title, group?.name, section?.name, `Eng past narx: ${formatPrice(item.minSellingPrice)}`].filter(Boolean).join(" · ")} selected={productId === item.id} onPress={() => chooseProduct(item)} />;
          })}</View>
          {visibleProducts.length > 50 && <Text style={styles.hint}>Ko‘proq natija uchun qidiruvni aniqlashtiring.</Text>}
          {visibleProducts.length === 0 && !productSearching && <Text style={styles.hint}>Mahsulot topilmadi.</Text>}
        </View>}

        {step === 2 && <View style={styles.card}>
          <Text style={styles.cardTitle}>Hudud va joylashuv</Text>
          <Field label="Hudud qidirish" value={regionSearch} onChangeText={(value) => { setRegionSearch(value); setRegionResults(null); setRegionSearchError(""); }} placeholder="Masalan: Toshkent" maxLength={100} />
          {regionSearching && <Text style={styles.hint}>Qidirilmoqda...</Text>}
          {!!regionSearchError && <Text style={styles.error} accessibilityRole="alert">{regionSearchError}</Text>}
          <Text style={styles.label}>Hudud *</Text>
          {selectedRegion && <Text style={styles.hint}>Tanlangan: {selectedRegion.name}</Text>}
          <View style={styles.options}>{visibleRegions.slice(0, 50).map((item) => <Option key={item.id} title={item.name} selected={regionId === item.id} onPress={() => { setRegionId(item.id); setSelectedRegion(item); }} />)}</View>
          {visibleRegions.length > 50 && <Text style={styles.hint}>Ko‘proq natija uchun qidiruvni aniqlashtiring.</Text>}
          {visibleRegions.length === 0 && !regionSearching && <Text style={styles.hint}>Hudud topilmadi.</Text>}
          <Action title={regionFormOpen ? "Hudud yaratishni yopish" : "+ Yangi hudud yaratish"} onPress={() => setRegionFormOpen((open) => !open)} secondary />
          {regionFormOpen && <View style={styles.regionForm}>
            <Field label="Hudud nomi" value={newRegionName} onChangeText={setNewRegionName} placeholder="Masalan: Chilonzor" maxLength={100} />
            {!!regionError && <Text style={styles.error} accessibilityRole="alert">{regionError}</Text>}
            <Action title={regionBusy ? "Yaratilmoqda..." : "Hududni yaratish"} onPress={() => void createRegion()} disabled={regionBusy} />
          </View>}
          <Text style={styles.label}>Mijoz manzili *</Text>
          <Text style={styles.hint}>Xaritadan manzilni tanlang. Koordinatalarni qo‘lda kiritish ham mumkin.</Text>
          <Action title="Xaritada joylashuvni belgilash" onPress={() => setMapOpen(true)} secondary />
          {!!locationError && <Text style={styles.error} accessibilityRole="alert">{locationError}</Text>}
          <Field label="Kenglik (lat) *" value={lat} onChangeText={setLat} placeholder="41.2995" autoCapitalize="none" />
          <Field label="Uzunlik (long) *" value={long} onChangeText={setLong} placeholder="69.2401" autoCapitalize="none" />
          <LocationPicker visible={mapOpen} value={parseCoordinate(lat, -90, 90) !== null && parseCoordinate(long, -180, 180) !== null ? { latitude: Number(lat), longitude: Number(long) } : null} onClose={() => setMapOpen(false)} onSelect={(point) => { setLat(point.latitude.toFixed(6)); setLong(point.longitude.toFixed(6)); setMapOpen(false); setLocationError(""); }} />
        </View>}

        {step === 3 && <View style={styles.card}>
          <Text style={styles.cardTitle}>Nasiya shartlari</Text>
          <Text style={styles.hint}>Mahsulot: {selectedProduct?.name}</Text>
          {!!selectedProduct && <Text style={styles.hint}>Mahsulotning eng past sotilish narxi: {formatPrice(selectedProduct.minSellingPrice)}</Text>}
          <Text style={styles.label}>Umumiy sotuv narxi (so‘m) *</Text>
          <MoneyInput value={totalPrice} onChangeText={setTotalPrice} placeholder="3 000 000" />
          <Text style={styles.label}>Boshlang‘ich to‘lov (so‘m) *</Text>
          <MoneyInput value={downPayment} onChangeText={(value) => { setDownPayment(value); if (value === "0") setPaymentMethod(null); }} placeholder="0" />
          {initialPayment !== null && initialPayment > 0 && <>
            <Text style={styles.label}>To‘lov usuli *</Text>
            <View style={styles.options}>{paymentMethods.map((item) => <Option key={item.value} title={item.label} selected={paymentMethod === item.value} onPress={() => setPaymentMethod(item.value)} />)}</View>
          </>}
          <Text style={styles.label}>Nasiya muddati *</Text>
          <View style={styles.options}>{suggestedTerms.map((months) => <Option key={months} title={`${months} oy`} selected={termMonths === String(months)} onPress={() => { setTermMonths(String(months)); Keyboard.dismiss(); }} />)}</View>
          <Field label="Yoki muddatni qo‘lda kiriting (oy)" value={termMonths} onChangeText={setTermMonths} placeholder="Masalan: 18" keyboardType="number-pad" maxLength={3} />
          <Text style={styles.selectedTerm}>Tanlangan muddat: {parseMoney(termMonths) !== null && Number(termMonths) >= 1 && Number(termMonths) <= 120 ? `${termMonths} oy` : "kiritilmagan"}</Text>
          {monthlyPayment !== null && <View style={styles.monthlyPreview}>
            <Text style={styles.monthlyAmount}>Oyiga taxminan {formatMoneyDigits(monthlyPayment)} so‘mdan</Text>
            <Text style={styles.monthlyWords}>{formatMoneyWithUnits(monthlyPayment)}</Text>
          </View>}
          <Text style={styles.label}>Izoh</Text>
          <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="Ixtiyoriy izoh" multiline maxLength={1000} textAlignVertical="top" />
        </View>}
        {!!formError && <Text style={styles.error} accessibilityRole="alert">{formError}</Text>}
        <Action title={step === 3 ? (saving ? "Saqlanmoqda..." : "Mijozni yaratish") : "Davom etish"} onPress={step === 3 ? () => void createCustomer() : nextStep} disabled={saving || regionBusy} />
      </>}
    </ScrollView>
    </KeyboardAvoidingView>
  </FullScreenLoading>;
}

function PhoneField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  const areaRef = useRef<TextInput>(null);
  const tailRef = useRef<TextInput>(null);
  const area = value.slice(0, 2);
  const tail = value.slice(2);

  function changeArea(text: string) {
    const digits = phoneDigits(text);
    onChangeText(digits.length > 2 ? digits : digits.slice(0, 2) + tail);
    if (digits.length >= 2) tailRef.current?.focus();
  }

  return <View>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.phoneInput}>
      <Text style={styles.phonePrefix}>+998 (</Text>
      <TextInput
        ref={areaRef}
        style={styles.phoneArea}
        value={area}
        onChangeText={changeArea}
        placeholder="00"
        placeholderTextColor="#9AA6B5"
        keyboardType="phone-pad"
        accessibilityLabel={`${label}, operator kodi`}
      />
      <Text style={styles.phonePrefix}>) </Text>
      <TextInput
        ref={tailRef}
        style={styles.phoneEditable}
        value={formatPhoneTail(tail)}
        onChangeText={(text) => onChangeText(area + text.replace(/\D/g, "").slice(0, 7))}
        onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === "Backspace" && !tail) { areaRef.current?.focus(); onChangeText(area.slice(0, -1)); } }}
        placeholder="000-00-00"
        placeholderTextColor="#9AA6B5"
        keyboardType="phone-pad"
        accessibilityLabel={`${label}, qolgan yetti raqam`}
      />
    </View>
  </View>;
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
  progress: { flexDirection: "row", gap: 6, marginBottom: 18 },
  progressSegment: { flex: 1, height: 5, borderRadius: 5, backgroundColor: "#D7DFE8" },
  progressSegmentActive: { backgroundColor: "#1677D2" },
  selectedBox: { backgroundColor: "#EAF4FF", borderRadius: 10, padding: 12, marginTop: 14 },
  selectedTerm: { color: "#1677D2", fontSize: 15, fontWeight: "700", marginTop: 12 },
  monthlyPreview: { backgroundColor: "#EAF4FF", borderRadius: 12, padding: 14, marginTop: 12 },
  monthlyAmount: { color: "#172536", fontSize: 16, fontWeight: "800" },
  monthlyWords: { color: "#627184", fontSize: 13, lineHeight: 19, marginTop: 4 },
  list: { gap: 8, marginTop: 14 },
  label: { color: "#172536", fontSize: 14, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  input: { minHeight: 50, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 12, paddingHorizontal: 14, color: "#172536", fontSize: 16, backgroundColor: "#FFFFFF" },
  phoneInput: { minHeight: 50, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF" },
  phonePrefix: { color: "#172536", fontSize: 16, fontWeight: "700" },
  phoneArea: { width: 26, minHeight: 48, paddingVertical: 0, paddingHorizontal: 0, color: "#172536", fontSize: 16 },
  phoneEditable: { flex: 1, minHeight: 48, paddingVertical: 0, color: "#172536", fontSize: 16 },
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
