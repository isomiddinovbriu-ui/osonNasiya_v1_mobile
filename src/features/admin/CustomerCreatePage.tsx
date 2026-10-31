import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurTargetView, BlurView } from "expo-blur";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  BackHandler,
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
import { type Customer, type PaymentMethod } from "./customers";
import FullScreenLoading from "./FullScreenLoading";
import LoadingMark from "./LoadingMark";
import { PullRefreshControl } from "./PullRefresh";
import LocationPicker from "./LocationPicker";
import { formatMoneyDigits, formatMoneyWithUnits, parseMoney } from "./money";
import MoneyInput from "./MoneyInput";
import PaymentMethodFields from "./PaymentMethodFields";
import { paymentDetailsError, paymentExtraFields, usePaymentOptions } from "./paymentOptions";
import { deleteStoredToken, getStoredToken } from "./session";

type Category = { id: string; name: string; parentId: string | null };
type Product = {
  id: string;
  universalId: string;
  categoryId: string;
  name: string;
  title?: string;
  originalPrice: number | null;
  minSellingPrice: number | null;
};
type Region = { id: string; name: string };
type ErrorTarget =
  | "name"
  | "phone"
  | "extraPhone"
  | "product"
  | "region"
  | "lat"
  | "long"
  | "price"
  | "advance"
  | "paymentMethod"
  | "months"
  | "description";
type CreatedCustomer = Pick<
  Customer,
  | "mijoz_id"
  | "name"
  | "productName"
  | "totalPrice"
  | "totalPaid"
  | "remainingBalance"
>;
type Draft = {
  step: number;
  furthestStep?: number;
  name: string;
  phoneNumber: string;
  addPhoneNumber: string;
  address: string;
  product: Product | null;
  groupId: string | null;
  sectionId: string | null;
  region: Region | null;
  lat: string;
  long: string;
  totalPrice: string;
  downPayment: string;
  paymentMethod: PaymentMethod | null;
  provider?: string;
  providerName?: string;
  termMonths: string;
  description: string;
};
const stepTitles = [
  "Mijoz ma’lumotlari",
  "Mahsulotni tanlash",
  "Hudud va joylashuv",
  "Nasiya shartlari",
];
const stepShortTitles = ["Mijoz", "Mahsulot", "Hudud", "Nasiya"];
const suggestedTerms = [3, 6, 9, 12];
function parseCoordinate(value: string, min: number, max: number) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

function randomTashkentCoordinates() {
  return {
    lat: (41.2995 + (Math.random() - 0.5) * 0.06).toFixed(6),
    long: (69.2401 + (Math.random() - 0.5) * 0.08).toFixed(6),
  };
}

function phoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return (
    (value.trim().startsWith("+998") || digits.length > 9) &&
    digits.startsWith("998")
      ? digits.slice(3)
      : digits
  ).slice(0, 9);
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
  return value === null ? "Ko'rsatilmagan" : `${formatMoneyDigits(value)} so'm`;
}

export default function CustomerCreatePage() {
  const [token, setToken] = useState<string | null>(null);
  const paymentOptions = usePaymentOptions(token);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [checking, setChecking] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productListOpen, setProductListOpen] = useState(true);
  const [productResults, setProductResults] = useState<Product[] | null>(null);
  const [productSearching, setProductSearching] = useState(false);
  const [productSearchError, setProductSearchError] = useState("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionSearch, setRegionSearch] = useState("");
  const [regionListOpen, setRegionListOpen] = useState(true);
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
  const [address, setAddress] = useState("");
  const [initialCoordinates] = useState(randomTashkentCoordinates);
  const [lat, setLat] = useState(initialCoordinates.lat);
  const [long, setLong] = useState(initialCoordinates.long);
  const [locationError, setLocationError] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [totalPrice, setTotalPrice] = useState("");
  const [downPayment, setDownPayment] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [cardNumber, setCardNumber] = useState("");
  const [provider, setProvider] = useState("");
  const [providerName, setProviderName] = useState("");
  const [paymentFieldError, setPaymentFieldError] = useState("");
  const [termMonths, setTermMonths] = useState("12");
  const [description, setDescription] = useState("");
  const [regionFormOpen, setRegionFormOpen] = useState(false);
  const [newRegionName, setNewRegionName] = useState("");
  const [regionBusy, setRegionBusy] = useState(false);
  const [regionError, setRegionError] = useState("");
  const [regionCreatedNotice, setRegionCreatedNotice] = useState(0);
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [focusRequest, setFocusRequest] = useState<{
    target: ErrorTarget;
    step: number;
    id: number;
  } | null>(null);
  const [created, setCreated] = useState<CreatedCustomer | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const viewportRef = useRef<View>(null);
  const nameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const extraPhoneRef = useRef<TextInput>(null);
  const productRef = useRef<TextInput>(null);
  const regionRef = useRef<TextInput>(null);
  const latRef = useRef<TextInput>(null);
  const longRef = useRef<TextInput>(null);
  const priceRef = useRef<TextInput>(null);
  const advanceRef = useRef<TextInput>(null);
  const paymentMethodRef = useRef<View>(null);
  const monthsRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const regionBlurTargetRef = useRef<View | null>(null);

  useEffect(() => {
    if (!regionCreatedNotice) return;
    const timer = setTimeout(() => setRegionCreatedNotice(0), 3000);
    return () => clearTimeout(timer);
  }, [regionCreatedNotice]);

  const handleSessionExpired = useCallback(async () => {
    await deleteStoredToken();
    router.replace("/");
  }, []);

  const loadData = useCallback(
    async (authToken: string) => {
      setLoadingData(true);
      setLookupError("");
      try {
        const headers = { Authorization: `Bearer ${authToken}` };
        const [categoryResult, productResult, regionResult] = await Promise.all(
          [
            apiRequest<{ categories: Category[] }>("/product-categories", {
              headers,
            }),
            apiRequest<{ products: Product[] }>("/products", { headers }),
            apiRequest<{ regions: Region[] }>("/regions", { headers }),
          ],
        );
        setCategories(categoryResult.categories);
        setProducts(productResult.products);
        setRegions(regionResult.regions);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await handleSessionExpired();
        } else {
          setLookupError(
            cause instanceof Error
              ? cause.message
              : "Ma’lumotlarni yuklab bo'lmadi.",
          );
        }
      } finally {
        setLoadingData(false);
      }
    },
    [handleSessionExpired],
  );

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const stored = await getStoredToken();
        if (!stored) {
          router.replace("/");
          return;
        }
        const result = await apiRequest<{ user: User }>("/auth/me", {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (result.user.role !== "sotuvchi") {
          router.replace("/");
          return;
        }
        if (active) {
          setToken(stored);
          setDraftKey(`customer_draft_${result.user.id}`);
          await loadData(stored);
        }
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await handleSessionExpired();
        } else if (active) {
          setLookupError(
            cause instanceof Error ? cause.message : "Sahifani ochib bo'lmadi.",
          );
        }
      } finally {
        if (active) setChecking(false);
      }
    }
    void checkSession();
    return () => {
      active = false;
    };
  }, [handleSessionExpired, loadData]);

  const isProductSearchActive = Boolean(productSearch.trim());
  const visibleProducts = isProductSearchActive
    ? (productResults ?? [])
    : products.slice(0, 3);
  const displayedProducts =
    selectedProduct && !productListOpen ? [selectedProduct] : visibleProducts;
  const visibleRegions = regionSearch.trim() ? (regionResults ?? []) : regions;
  const displayedRegions =
    selectedRegion && !regionListOpen
      ? [selectedRegion]
      : visibleRegions.slice(0, 5);
  const initialPayment = downPayment.trim() === "" ? 0 : parseMoney(downPayment);
  const priceAmount = parseMoney(totalPrice);
  const minimumSellingPrice = selectedProduct?.minSellingPrice ?? null;
  const priceTone = !totalPrice.trim()
    ? undefined
    : priceAmount === null ||
        priceAmount <= 0 ||
        (minimumSellingPrice !== null && priceAmount < minimumSellingPrice)
      ? "error"
      : "success";
  const monthsAmount = parseMoney(termMonths);
  const monthlyPayment =
    priceAmount !== null &&
    priceAmount > 0 &&
    initialPayment !== null &&
    initialPayment <= priceAmount &&
    monthsAmount !== null &&
    monthsAmount >= 1 &&
    monthsAmount <= 120
      ? Math.ceil((priceAmount - initialPayment) / monthsAmount)
      : null;

  useEffect(() => {
    if (!draftKey) return;
    let active = true;
    AsyncStorage.getItem(draftKey)
      .then((raw) => {
        if (!active || !raw) return;
        try {
          const draft = JSON.parse(raw) as Draft;
          const restoredStep = Math.max(0, Math.min(3, draft.step || 0));
          setStep(restoredStep);
          setFurthestStep(
            Math.max(
              restoredStep,
              Math.min(3, draft.furthestStep ?? restoredStep),
            ),
          );
          setName(draft.name ?? "");
          setPhoneNumber(phoneDigits(draft.phoneNumber ?? ""));
          setAddPhoneNumber(phoneDigits(draft.addPhoneNumber ?? ""));
          setAddress(draft.address ?? "");
          setSelectedProduct(draft.product ?? null);
          setProductId(draft.product?.id ?? null);
          setProductListOpen(!draft.product);
          setGroupId(draft.groupId ?? null);
          setSectionId(draft.sectionId ?? null);
          setSelectedRegion(draft.region ?? null);
          setRegionId(draft.region?.id ?? null);
          setRegionListOpen(!draft.region);
          setLat(draft.lat || initialCoordinates.lat);
          setLong(draft.long || initialCoordinates.long);
          setTotalPrice(draft.totalPrice ?? "");
          setDownPayment(draft.downPayment ?? "0");
          setPaymentMethod(
            ["cash", "payment_app"].includes(draft.paymentMethod || "")
              ? draft.paymentMethod
              : null,
          );
          setProvider(draft.provider ?? "");
          setProviderName(draft.providerName ?? "");
          setTermMonths(draft.termMonths ?? "12");
          setDescription(draft.description ?? "");
        } catch {
          /* Ignore an invalid old draft. */
        }
      })
      .catch(() => {
        /* The form remains usable if local storage is unavailable. */
      })
      .finally(() => {
        if (active) setDraftReady(true);
      });
    return () => {
      active = false;
    };
  }, [draftKey, initialCoordinates]);

  useEffect(() => {
    if (!draftReady || !draftKey || created) return;
    const draft: Draft = {
      step,
      furthestStep,
      name,
      phoneNumber,
      addPhoneNumber,
      address,
      product: selectedProduct,
      groupId,
      sectionId,
      region: selectedRegion,
      lat,
      long,
      totalPrice,
      downPayment,
      paymentMethod,
      provider,
      providerName,
      termMonths,
      description,
    };
    const timer = setTimeout(() => {
      void AsyncStorage.setItem(draftKey, JSON.stringify(draft));
    }, 300);
    return () => clearTimeout(timer);
  }, [
    draftReady,
    draftKey,
    created,
    step,
    furthestStep,
    name,
    phoneNumber,
    addPhoneNumber,
    address,
    selectedProduct,
    groupId,
    sectionId,
    selectedRegion,
    lat,
    long,
    totalPrice,
    downPayment,
    paymentMethod,
    provider,
    providerName,
    termMonths,
    description,
  ]);

  useEffect(() => {
    if (!token || !productSearch.trim()) return;
    let active = true;
    const timer = setTimeout(async () => {
      setProductSearching(true);
      setProductSearchError("");
      try {
        const result = await apiRequest<{ products: Product[] }>(
          `/products/search?search=${encodeURIComponent(productSearch.trim())}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (active) setProductResults(result.products);
      } catch (cause) {
        if (active) {
          if (cause instanceof ApiError && cause.status === 401)
            void handleSessionExpired();
          else
            setProductSearchError(
              cause instanceof Error ? cause.message : "Qidiruv bajarilmadi.",
            );
        }
      } finally {
        if (active) setProductSearching(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [token, productSearch, handleSessionExpired]);

  useEffect(() => {
    if (!token || !regionSearch.trim()) return;
    let active = true;
    const timer = setTimeout(async () => {
      setRegionSearching(true);
      setRegionSearchError("");
      try {
        const result = await apiRequest<{ regions: Region[] }>(
          `/regions?search=${encodeURIComponent(regionSearch.trim())}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (active) setRegionResults(result.regions);
      } catch (cause) {
        if (active) {
          if (cause instanceof ApiError && cause.status === 401)
            void handleSessionExpired();
          else
            setRegionSearchError(
              cause instanceof Error ? cause.message : "Qidiruv bajarilmadi.",
            );
        }
      } finally {
        if (active) setRegionSearching(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
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
      setRegionSearch("");
      setRegionResults(null);
      setRegionSearching(false);
      setRegionSearchError("");
      setRegionListOpen(false);
      setNewRegionName("");
      setRegionFormOpen(false);
      setRegionCreatedNotice((value) => value + 1);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401)
        await handleSessionExpired();
      else
        setRegionError(
          cause instanceof Error ? cause.message : "Hudud yaratilmadi.",
        );
    } finally {
      setRegionBusy(false);
    }
  }

  const closeRegionForm = useCallback(() => {
    if (regionBusy) return;
    Keyboard.dismiss();
    setRegionError("");
    setRegionFormOpen(false);
  }, [regionBusy]);

  useEffect(() => {
    if (!regionFormOpen) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        closeRegionForm();
        return true;
      },
    );
    return () => subscription.remove();
  }, [regionFormOpen, closeRegionForm]);

  useEffect(() => {
    if (!confirmCreateOpen) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (!saving) setConfirmCreateOpen(false);
        return true;
      },
    );
    return () => subscription.remove();
  }, [confirmCreateOpen, saving]);

  function showFieldError(
    message: string,
    target: ErrorTarget,
    targetStep = step,
  ) {
    setFormError(message);
    if (step !== targetStep) {
      Keyboard.dismiss();
      setStep(targetStep);
      scrollOffsetRef.current = 0;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    setFocusRequest((current) => ({
      target,
      step: targetStep,
      id: (current?.id ?? 0) + 1,
    }));
  }

  useEffect(() => {
    if (!focusRequest) return;
    if (step !== focusRequest.step) return;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const focusTimer = setTimeout(() => {
      const targets = {
        name: nameRef,
        phone: phoneRef,
        extraPhone: extraPhoneRef,
        product: productRef,
        region: regionRef,
        lat: latRef,
        long: longRef,
        price: priceRef,
        advance: advanceRef,
        paymentMethod: paymentMethodRef,
        months: monthsRef,
        description: descriptionRef,
      };
      const target = targets[focusRequest.target].current;
      if (!target) {
        setFocusRequest(null);
        return;
      }
      if (focusRequest.target === "paymentMethod") Keyboard.dismiss();
      else (target as TextInput).focus();
      scrollTimer = setTimeout(() => {
        target.measureInWindow((_x, targetY) => {
          viewportRef.current?.measureInWindow((_scrollX, scrollY) => {
            scrollRef.current?.scrollTo({
              y: Math.max(0, scrollOffsetRef.current + targetY - scrollY - 70),
              animated: true,
            });
          });
        });
        setFocusRequest(null);
      }, focusRequest.target === "paymentMethod" ? 150 : 180);
    }, 50);
    return () => {
      clearTimeout(focusTimer);
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, [focusRequest, step]);

  function nextStep() {
    setFormError("");
    if (step === 0) {
      if (!name.trim() || name.trim().length > 100) {
        showFieldError("Mijoz ismini kiriting (100 belgigacha).", "name");
        return;
      }
      if (
        !validPhone(phoneNumber.trim()) ||
        (addPhoneNumber.trim() && !validPhone(addPhoneNumber.trim()))
      ) {
        showFieldError("Telefon raqamlarini to'liq kiriting (9 ta raqam).", !validPhone(phoneNumber.trim()) ? "phone" : "extraPhone");
        return;
      }
    }
    if (
      step === 1 &&
      (!productId || !selectedProduct || !groupId || !sectionId)
    ) {
      showFieldError("Mahsulotni tanlang.", "product");
      return;
    }
    if (step === 2) {
      if (!regionId) {
        showFieldError("Hududni tanlang.", "region");
        return;
      }
      if (
        parseCoordinate(lat, -90, 90) === null ||
        parseCoordinate(long, -180, 180) === null
      ) {
        showFieldError(
          "Xaritadan joylashuvni belgilang yoki koordinatalarni kiriting.",
          parseCoordinate(lat, -90, 90) === null ? "lat" : "long",
        );
        return;
      }
    }
    Keyboard.dismiss();
    setFocusRequest(null);
    const next = Math.min(3, step + 1);
    setFurthestStep((current) => Math.max(current, next));
    setStep(next);
    scrollOffsetRef.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function goToStep(targetStep: number) {
    if (targetStep < 0 || targetStep > furthestStep || targetStep === step)
      return;
    Keyboard.dismiss();
    setFormError("");
    setFocusRequest(null);
    setStep(targetStep);
    scrollOffsetRef.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function chooseProduct(item: Product) {
    const section = categories.find(
      (category) => category.id === item.categoryId,
    );
    if (!section?.parentId) {
      showFieldError("Mahsulot bo'limi topilmadi. Ma’lumotlarni qayta yuklang.", "product", 1);
      return;
    }
    Keyboard.dismiss();
    setSelectedProduct(item);
    setProductId(item.id);
    setSectionId(section.id);
    setGroupId(section.parentId);
    setProductSearch("");
    setProductResults(null);
    setProductSearchError("");
    setProductListOpen(false);
    setTotalPrice(item.minSellingPrice?.toString() ?? "");
    setFormError("");
  }

  async function createCustomer(confirmed = false) {
    if (!token || saving) return;
    setFormError("");
    setPaymentFieldError("");
    const normalizedName = name.trim();
    const mainPhone = phoneNumber;
    const extraPhone = addPhoneNumber;
    const price = parseMoney(totalPrice);
    const advance = downPayment.trim() === "" ? 0 : parseMoney(downPayment);
    const months = parseMoney(termMonths);
    const latitude = parseCoordinate(lat, -90, 90);
    const longitude = parseCoordinate(long, -180, 180);

    if (!normalizedName || normalizedName.length > 100) {
      showFieldError("Mijoz ismini kiriting (100 belgigacha).", "name", 0);
      return;
    }
    if (!validPhone(mainPhone) || (extraPhone && !validPhone(extraPhone))) {
      showFieldError("Telefon raqamlarini to'liq kiriting (9 ta raqam).", !validPhone(mainPhone) ? "phone" : "extraPhone", 0);
      return;
    }
    if (address.trim().length > 500) {
      setFormError("Manzil 500 belgidan oshmasligi kerak.");
      setStep(0);
      return;
    }
    if (!groupId || !sectionId || !productId || !selectedProduct) {
      showFieldError("Mahsulotni tanlang.", "product", 1);
      return;
    }
    if (!regionId) {
      showFieldError("Hududni tanlang yoki yangi hudud yarating.", "region", 2);
      return;
    }
    if (latitude === null || longitude === null) {
      showFieldError("Joylashuv koordinatalarini to'g'ri kiriting.", latitude === null ? "lat" : "long", 2);
      return;
    }
    if (price === null || price <= 0) {
      showFieldError("Umumiy sotuv narxini musbat butun so'mda kiriting.", "price", 3);
      return;
    }
    if (
      selectedProduct.minSellingPrice !== null &&
      price < selectedProduct.minSellingPrice
    ) {
      showFieldError(
        `Sotuv narxi ${formatPrice(selectedProduct.minSellingPrice)} dan kam bo'lmasligi kerak.`,
        "price", 3,
      );
      return;
    }
    if (advance === null || advance > price) {
      showFieldError(
        "Boshlang'ich to'lov 0 dan sotuv narxigacha bo'lishi kerak.",
        "advance", 3,
      );
      return;
    }
    if (advance > 0) {
      const detailsError = paymentDetailsError(
        paymentMethod, cardNumber, provider, providerName, paymentOptions.options,
      );
      if (detailsError) {
        setPaymentFieldError(detailsError);
        showFieldError(detailsError, "paymentMethod", 3);
        return;
      }
    }
    if (months === null || months < 1 || months > 120) {
      showFieldError("Nasiya muddatini 1–120 oy oralig'ida kiriting.", "months", 3);
      return;
    }
    if (description.length > 1000) {
      showFieldError("Izoh 1000 belgidan oshmasligi kerak.", "description", 3);
      return;
    }

    Keyboard.dismiss();
    if (!confirmed) {
      setConfirmCreateOpen(true);
      return;
    }
    setConfirmCreateOpen(false);
    setSaving(true);
    try {
      const result = await apiRequest<{ customer: CreatedCustomer }>(
        "/customers",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: normalizedName,
            phoneNumber: `+998${mainPhone}`,
            ...(extraPhone ? { addPhoneNumber: `+998${extraPhone}` } : {}),
            ...(address.trim() ? { address: address.trim() } : {}),
            groupId,
            sectionId,
            productId,
            regionId,
            lat: latitude,
            long: longitude,
            totalPrice: price,
            downPayment: advance,
            ...(advance > 0 && paymentMethod
              ? { paymentMethod, ...paymentExtraFields(paymentMethod, cardNumber, provider, providerName) }
              : {}),
            termMonths: months,
            description: description.trim(),
          }),
        },
      );
      setCreated(result.customer);
      setCardNumber("");
      if (draftKey) void AsyncStorage.removeItem(draftKey);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401)
        await handleSessionExpired();
      else
        setFormError(
          cause instanceof Error ? cause.message : "Mijoz yaratilmadi.",
        );
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setCreated(null);
    setConfirmCreateOpen(false);
    setStep(0);
    setFurthestStep(0);
    setGroupId(null);
    setSectionId(null);
    setProductId(null);
    setSelectedProduct(null);
    setProductListOpen(true);
    setRegionId(null);
    setSelectedRegion(null);
    setRegionListOpen(true);
    setProductSearch("");
    setRegionSearch("");
    setRegionResults(null);
    setRegionSearching(false);
    setRegionSearchError("");
    setName("");
    setPhoneNumber("");
    setAddPhoneNumber("");
    const coordinates = randomTashkentCoordinates();
    setLat(coordinates.lat);
    setLong(coordinates.long);
    setTotalPrice("");
    setDownPayment("0");
    setPaymentMethod(null);
    setCardNumber("");
    setProvider("");
    setProviderName("");
    setPaymentFieldError("");
    setTermMonths("12");
    setDescription("");
    setFormError("");
    setFocusRequest(null);
    setLocationError("");
    setRegionError("");
  }

  return (
    <View ref={viewportRef} style={styles.screen}>
      <BlurTargetView ref={regionBlurTargetRef} style={styles.screen}>
        <FullScreenLoading active={saving} message="Mijoz yaratilmoqda...">
          <KeyboardAvoidingView
            style={styles.screen}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView
              ref={scrollRef}
              refreshControl={<PullRefreshControl refreshing={loadingData || paymentOptions.loading} onRefresh={() => { if (token && !saving) void Promise.all([loadData(token), paymentOptions.reload()]); }} />}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              onScroll={(event) => {
                scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
            >
              <Pressable
                onPress={() =>
                  step > 0 && !created ? goToStep(step - 1) : router.back()
                }
                style={styles.back}
                accessibilityRole="button"
              >
                <Text style={styles.link}>‹ Orqaga</Text>
              </Pressable>
              <Text style={styles.eyebrow}>SOTUV</Text>
              <Text style={styles.title}>Yangi mijoz</Text>
              <Text style={styles.subtitle}>
                {created
                  ? "Mijoz muvaffaqiyatli yaratildi."
                  : `${step + 1}/4 · ${stepTitles[step]}`}
              </Text>

              {(checking || loadingData) && (
                <View style={styles.loader}>
                  <LoadingMark size={78} />
                  <Text style={styles.hint}>Ma’lumotlar yuklanmoqda...</Text>
                </View>
              )}
              {!!lookupError && (
                <View style={styles.card}>
                  <Text style={styles.error} accessibilityRole="alert">
                    {lookupError}
                  </Text>
                  {!!token && (
                    <Action
                      title="Qayta yuklash"
                      onPress={() => void loadData(token)}
                    />
                  )}
                </View>
              )}

              {created ? (
                <View style={styles.card}>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/customers/detail",
                        params: { mijoz_id: String(created.mijoz_id) },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${created.name} mijozining ma’lumotlarini ko'rish`}
                    style={({ pressed }) => [
                      styles.createdCustomerLink,
                      pressed && styles.createdCustomerLinkPressed,
                    ]}
                  >
                    <Text style={styles.successTitle}>Mijoz yaratildi</Text>
                    <Text style={styles.hint}>
                      {created.name} · {created.productName}
                    </Text>
                    <Text style={styles.summary}>
                      Umumiy narx: {formatPrice(created.totalPrice)}
                    </Text>
                    <Text style={styles.summary}>
                      To'langan: {formatPrice(created.totalPaid)}
                    </Text>
                    <Text style={styles.summary}>
                      Qolgan qarz: {formatPrice(created.remainingBalance)}
                    </Text>
                    <Text style={styles.idText}>
                      Mijoz raqami: {created.mijoz_id}
                    </Text>
                    <Text style={styles.createdCustomerOpen}>
                      Mijoz ma’lumotlarini ko'rish →
                    </Text>
                  </Pressable>
                  <Action title="Yana mijoz qo'shish" onPress={resetForm} />
                </View>
              ) : (
                !checking &&
                !loadingData &&
                draftReady &&
                !lookupError &&
                token && (
                  <>
                    <View style={styles.progress}>
                      {stepTitles.map((title, index) => (
                        <Pressable
                          key={title}
                          onPress={() => goToStep(index)}
                          disabled={index > furthestStep || index === step}
                          accessibilityRole="button"
                          accessibilityLabel={`${index + 1}-qadam: ${title}`}
                          accessibilityState={{
                            disabled: index > furthestStep || index === step,
                            selected: index === step,
                          }}
                          style={[
                            styles.progressSegment,
                            index < step && styles.progressSegmentCompleted,
                            index > step &&
                              index <= furthestStep &&
                              styles.progressSegmentVisitedNext,
                            index === step && styles.progressSegmentCurrent,
                          ]}
                        >
                          <Text
                            style={[
                              styles.progressNumber,
                              index < step && styles.progressTextCompleted,
                              index > step &&
                                index <= furthestStep &&
                                styles.progressTextVisitedNext,
                              index === step && styles.progressTextCurrent,
                            ]}
                          >
                            {index + 1}
                          </Text>
                          <Text
                            style={[
                              styles.progressLabel,
                              index < step && styles.progressTextCompleted,
                              index > step &&
                                index <= furthestStep &&
                                styles.progressTextVisitedNext,
                              index === step && styles.progressTextCurrent,
                            ]}
                            numberOfLines={1}
                          >
                            {stepShortTitles[index]}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    {step === 0 && (
                      <View style={styles.card}>
                        <Text style={styles.cardTitle}>Mijoz ma’lumotlari</Text>
                        <Field
                          label="Ism *"
                          inputRef={nameRef}
                          value={name}
                          onChangeText={setName}
                          placeholder="Mijoz ismi"
                          maxLength={100}
                        />
                        <PhoneField
                          label="Telefon raqami *"
                          inputRef={phoneRef}
                          value={phoneNumber}
                          onChangeText={setPhoneNumber}
                        />
                        <PhoneField
                          label="Qo'shimcha telefon"
                          inputRef={extraPhoneRef}
                          value={addPhoneNumber}
                          onChangeText={setAddPhoneNumber}
                        />
                        <Field
                          label="Manzil (ixtiyoriy)"
                          value={address}
                          onChangeText={setAddress}
                          placeholder="Mijoz manzili"
                          maxLength={500}
                        />
                      </View>
                    )}

                    {step === 1 && (
                      <View style={styles.card}>
                        <Text style={styles.cardTitle}>Mahsulotni tanlang</Text>
                        <Text style={styles.hint}>
                          Nomi, UD-kodi, sarlavhasi, bo'limi yoki guruhi
                          bo'yicha qidiring.
                        </Text>
                        <Field
                          label="Mahsulot qidirish"
                          inputRef={productRef}
                          value={productSearch}
                          onChangeText={(value) => {
                            setProductListOpen(true);
                            setProductSearch(value);
                            setProductResults(null);
                            setProductSearchError("");
                          }}
                          placeholder="Nomi yoki UD-261015001"
                          maxLength={100}
                        />
                        {productListOpen && productSearching && (
                          <Text style={styles.hint}>Qidirilmoqda...</Text>
                        )}
                        {productListOpen && !!productSearchError && (
                          <Text style={styles.error} accessibilityRole="alert">
                            {productSearchError}
                          </Text>
                        )}
                        <View style={styles.list}>
                          {displayedProducts.map((item) => {
                            const section = categories.find(
                              (category) => category.id === item.categoryId,
                            );
                            const group = categories.find(
                              (category) => category.id === section?.parentId,
                            );
                            return (
                              <Option
                                key={item.id}
                                title={item.name}
                                detail={[
                                  item.universalId,
                                  item.title,
                                  group?.name,
                                  section?.name,
                                  `Eng past narx: ${formatPrice(item.minSellingPrice)}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                                selected={productId === item.id}
                                onPress={() => chooseProduct(item)}
                              />
                            );
                          })}
                        </View>
                        {productListOpen &&
                          !isProductSearchActive &&
                          products.length > 3 && (
                            <Text style={styles.hint}>
                              Boshqa mahsulotlarni ko'rish uchun qidiruvdan
                              foydalaning.
                            </Text>
                          )}
                        {productListOpen &&
                          visibleProducts.length === 0 &&
                          !productSearching && (
                            <Text style={styles.hint}>Mahsulot topilmadi.</Text>
                          )}
                        {selectedProduct && !productListOpen && (
                          <Action
                            title="Boshqa mahsulotni tanlash"
                            onPress={() => setProductListOpen(true)}
                            secondary
                          />
                        )}
                      </View>
                    )}

                    {step === 2 && (
                      <View style={styles.card}>
                        <View style={styles.regionHeader}>
                          <Text
                            style={[styles.cardTitle, styles.regionHeaderTitle]}
                          >
                            Hudud va joylashuv
                          </Text>
                          <Pressable
                            style={styles.addRegionButton}
                            onPress={() => {
                              setRegionError("");
                              setRegionFormOpen(true);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Yangi hudud yaratish"
                          >
                            <View style={styles.addRegionIcon}>
                              <SymbolView
                                name={{
                                  ios: "mappin",
                                  android: "location_on",
                                  web: "location_on",
                                }}
                                tintColor="#1677D2"
                                size={25}
                              />
                              <View style={styles.addRegionBadge}>
                                <Text style={styles.addRegionBadgeText}>+</Text>
                              </View>
                            </View>
                          </Pressable>
                        </View>
                        <Field
                          label="Hudud qidirish"
                          inputRef={regionRef}
                          value={regionSearch}
                          onChangeText={(value) => {
                            setRegionListOpen(true);
                            setRegionSearch(value);
                            setRegionResults(null);
                            setRegionSearchError("");
                          }}
                          placeholder="Masalan: Toshkent"
                          maxLength={100}
                        />
                        {regionListOpen && regionSearching && (
                          <Text style={styles.hint}>Qidirilmoqda...</Text>
                        )}
                        {regionListOpen && !!regionSearchError && (
                          <Text style={styles.error} accessibilityRole="alert">
                            {regionSearchError}
                          </Text>
                        )}
                        <Text style={styles.label}>Hudud *</Text>
                        {selectedRegion && (
                          <Text style={styles.hint}>
                            Tanlangan: {selectedRegion.name}
                          </Text>
                        )}
                        <View style={styles.options}>
                          {displayedRegions.map((item) => (
                            <Option
                              key={item.id}
                              title={item.name}
                              selected={regionId === item.id}
                              onPress={() => {
                                Keyboard.dismiss();
                                setRegionId(item.id);
                                setSelectedRegion(item);
                                setRegionSearch("");
                                setRegionResults(null);
                                setRegionSearching(false);
                                setRegionSearchError("");
                                setRegionListOpen(false);
                                setFormError("");
                              }}
                            />
                          ))}
                        </View>
                        {regionListOpen && visibleRegions.length > 5 && (
                          <Text style={styles.hint}>
                            Ko'proq natija uchun qidiruvni aniqlashtiring.
                          </Text>
                        )}
                        {regionListOpen &&
                          visibleRegions.length === 0 &&
                          !regionSearching && (
                          <Text style={styles.hint}>Hudud topilmadi.</Text>
                          )}
                        {selectedRegion && !regionListOpen && (
                          <Action
                            title="Boshqa hududni tanlash"
                            onPress={() => setRegionListOpen(true)}
                            secondary
                          />
                        )}
                        <Text style={styles.label}>Mijoz manzili *</Text>
                        <Text style={styles.hint}>
                          Xaritadan manzilni tanlang. Koordinatalarni qo'lda
                          kiritish ham mumkin.
                        </Text>
                        <Action
                          title="Xaritada joylashuvni belgilash"
                          onPress={() => setMapOpen(true)}
                          secondary
                        />
                        {!!locationError && (
                          <Text style={styles.error} accessibilityRole="alert">
                            {locationError}
                          </Text>
                        )}
                        <Field
                          label="Kenglik (lat) *"
                          inputRef={latRef}
                          value={lat}
                          onChangeText={setLat}
                          placeholder=""
                          autoCapitalize="none"
                        />
                        <Field
                          label="Uzunlik (long) *"
                          inputRef={longRef}
                          value={long}
                          onChangeText={setLong}
                          placeholder=""
                          autoCapitalize="none"
                        />
                      </View>
                    )}

                    {step === 3 && (
                      <View style={styles.card}>
                        <Text style={styles.cardTitle}>Nasiya shartlari</Text>
                        <Text style={styles.hint}>
                          Mahsulot: {selectedProduct?.name}
                        </Text>
                        {!!selectedProduct && (
                          <View>
                            <Text style={styles.hint}>
                              Mahsulotning eng past sotilish narxi:{" "}
                              <Text style={styles.priceBadgeText1}>
                                {formatPrice(selectedProduct.minSellingPrice)}
                              </Text>
                            </Text>
                            {selectedProduct.minSellingPrice !== null && (
                              <Text style={styles.minimumPriceWords}>
                                {formatMoneyWithUnits(selectedProduct.minSellingPrice)}
                              </Text>
                            )}
                          </View>
                        )}
                        <Text style={styles.label}>
                          Umumiy sotuv narxi (so'm) *
                        </Text>
                        <MoneyInput
                          value={totalPrice}
                          inputRef={priceRef}
                          onChangeText={setTotalPrice}
                          placeholder="3 000 000"
                          tone={priceTone}
                        />
                        <Text style={styles.label}>
                          Boshlang'ich to'lov (so'm)
                        </Text>
                        <MoneyInput
                          value={downPayment}
                          inputRef={advanceRef}
                          onChangeText={(value) => {
                            setDownPayment(value);
                            setFormError("");
                            setPaymentFieldError("");
                            if (value === "0" || value === "") {
                              setPaymentMethod(null);
                              setCardNumber("");
                              setProvider("");
                              setProviderName("");
                            }
                          }}
                          placeholder="0"
                          emptyHint="Kiritilmasa 0 so'm hisoblanadi"
                        />
                        {initialPayment !== null && initialPayment > 0 && (
                          <>
                            <Text style={styles.label}>To'lov usuli *</Text>
                            <View ref={paymentMethodRef} style={paymentFieldError ? styles.paymentOptionsError : undefined}>
                              {paymentOptions.options ? (
                                <PaymentMethodFields
                                  options={paymentOptions.options}
                                  method={paymentMethod}
                                  onMethodChange={(value) => { setPaymentMethod(value); setFormError(""); setPaymentFieldError(""); }}
                                  cardNumber={cardNumber}
                                  onCardNumberChange={(value) => { setCardNumber(value); setFormError(""); setPaymentFieldError(""); }}
                                  provider={provider}
                                  onProviderChange={(value) => { setProvider(value); setFormError(""); setPaymentFieldError(""); }}
                                  providerName={providerName}
                                  onProviderNameChange={(value) => { setProviderName(value); setFormError(""); setPaymentFieldError(""); }}
                                  disabled={saving}
                                />
                              ) : (
                                <Pressable onPress={() => void paymentOptions.reload()} accessibilityRole="button">
                                  <Text style={styles.link}>
                                    {paymentOptions.loading ? "To‘lov usullari yuklanmoqda..." : `${paymentOptions.error || "To‘lov usullari topilmadi."} Qayta yuklash`}
                                  </Text>
                                </Pressable>
                              )}
                            </View>
                            {!!paymentFieldError && (
                              <Text style={styles.error} accessibilityRole="alert">
                                {paymentFieldError}
                              </Text>
                            )}
                          </>
                        )}
                        <Text style={styles.label}>Nasiya muddati *</Text>
                        <View style={styles.options}>
                          {suggestedTerms.map((months) => (
                            <Option
                              key={months}
                              title={`${months} oy`}
                              selected={termMonths === String(months)}
                              onPress={() => {
                                setTermMonths(String(months));
                                Keyboard.dismiss();
                              }}
                            />
                          ))}
                        </View>
                        <Field
                          label="Yoki muddatni qo'lda kiriting (oy)"
                          inputRef={monthsRef}
                          value={termMonths}
                          onChangeText={setTermMonths}
                          placeholder="Masalan: 18"
                          keyboardType="number-pad"
                          maxLength={3}
                        />
                        <Text style={styles.selectedTerm}>
                          Tanlangan muddat:{" "}
                          {parseMoney(termMonths) !== null &&
                          Number(termMonths) >= 1 &&
                          Number(termMonths) <= 120
                            ? `${termMonths} oy`
                            : "kiritilmagan"}
                        </Text>
                        {monthlyPayment !== null && (
                          <View style={styles.monthlyPreview}>
                            <Text style={styles.monthlyAmount}>
                              Oyiga taxminan {formatMoneyDigits(monthlyPayment)}{" "}
                              so'mdan
                            </Text>
                            <Text style={styles.monthlyWords}>
                              {formatMoneyWithUnits(monthlyPayment)}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.label}>Izoh</Text>
                        <TextInput
                          ref={descriptionRef}
                          style={[styles.input, styles.multiline]}
                          value={description}
                          onChangeText={setDescription}
                          placeholder="Ixtiyoriy izoh"
                          multiline
                          maxLength={1000}
                          textAlignVertical="top"
                        />
                      </View>
                    )}
                    {!!formError && formError !== paymentFieldError && (
                      <Text style={styles.error} accessibilityRole="alert">
                        {formError}
                      </Text>
                    )}
                    <Action
                      title={
                        step === 3
                          ? saving
                            ? "Saqlanmoqda..."
                            : "Mijozni yaratish"
                          : "Davom etish"
                      }
                      onPress={
                        step === 3 ? () => void createCustomer() : nextStep
                      }
                      disabled={saving || regionBusy}
                    />
                  </>
                )
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </FullScreenLoading>
      </BlurTargetView>
      <LocationPicker
        visible={mapOpen}
        value={
          parseCoordinate(lat, -90, 90) !== null &&
          parseCoordinate(long, -180, 180) !== null
            ? { latitude: Number(lat), longitude: Number(long) }
            : null
        }
        onClose={() => setMapOpen(false)}
        onSelect={(point) => {
          setLat(point.latitude.toFixed(6));
          setLong(point.longitude.toFixed(6));
          setMapOpen(false);
          setLocationError("");
        }}
      />
      {regionFormOpen && (
        <KeyboardAvoidingView
          style={styles.regionModalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          accessibilityViewIsModal
        >
          <BlurView
            blurTarget={regionBlurTargetRef}
            blurMethod="dimezisBlurView"
            intensity={75}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            style={styles.regionModalBackdrop}
            onPress={closeRegionForm}
            accessibilityRole="button"
            accessibilityLabel="Hudud yaratishni yopish"
          />
          <View style={styles.regionModalCard}>
            <Text style={styles.regionModalTitle}>Yangi hudud yaratish</Text>
            <Text style={styles.regionModalHint}>Hudud nomini kiriting.</Text>
            <Field
              label="Hudud nomi"
              value={newRegionName}
              onChangeText={setNewRegionName}
              placeholder="Masalan: Chilonzor"
              maxLength={100}
            />
            {!!regionError && (
              <Text style={styles.error} accessibilityRole="alert">
                {regionError}
              </Text>
            )}
            <Action
              title={regionBusy ? "Yaratilmoqda..." : "Hududni yaratish"}
              onPress={() => void createRegion()}
              disabled={regionBusy}
            />
            <Action
              title="Bekor qilish"
              onPress={closeRegionForm}
              disabled={regionBusy}
              secondary
            />
          </View>
        </KeyboardAvoidingView>
      )}
      {confirmCreateOpen && (
        <View style={styles.regionModalOverlay} accessibilityViewIsModal>
          <BlurView
            blurTarget={regionBlurTargetRef}
            blurMethod="dimezisBlurView"
            intensity={75}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            style={styles.regionModalBackdrop}
            onPress={() => setConfirmCreateOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Mijoz yaratishni bekor qilish"
          />
          <View style={styles.regionModalCard}>
            <Text style={styles.regionModalTitle}>
              Mijozni yaratishga aminmisiz?
            </Text>
            <Text style={styles.regionModalHint}>
              {name.trim()} uchun mijoz ma&apos;lumotlari saqlanadi.
            </Text>
            <Action
              title="Ha, yaratish"
              onPress={() => {
                setConfirmCreateOpen(false);
                void createCustomer(true);
              }}
              disabled={saving}
            />
            <Action
              title="Bekor qilish"
              onPress={() => setConfirmCreateOpen(false)}
              disabled={saving}
              secondary
            />
          </View>
        </View>
      )}
      {regionCreatedNotice > 0 && (
        <View style={styles.regionCreatedNotice} pointerEvents="none">
          <Text
            style={styles.regionCreatedNoticeText}
            accessibilityRole="alert"
          >
            ✅ Hudud yaratildi
          </Text>
        </View>
      )}
    </View>
  );
}

function PhoneField({
  label,
  value,
  onChangeText,
  inputRef,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  inputRef?: RefObject<TextInput | null>;
}) {
  const areaRef = useRef<TextInput>(null);
  const areaInputRef = inputRef ?? areaRef;
  const tailRef = useRef<TextInput>(null);
  const area = value.slice(0, 2);
  const tail = value.slice(2);

  function changeArea(text: string) {
    const digits = phoneDigits(text);
    onChangeText(digits.length > 2 ? digits : digits.slice(0, 2) + tail);
    if (digits.length >= 2) tailRef.current?.focus();
  }

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.phoneInput}>
        <Text style={styles.phonePrefix}>+998 (</Text>
        <TextInput
          ref={areaInputRef}
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
          onChangeText={(text) =>
            onChangeText(area + text.replace(/\D/g, "").slice(0, 7))
          }
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === "Backspace" && !tail) {
              areaInputRef.current?.focus();
              onChangeText(area.slice(0, -1));
            }
          }}
          placeholder="000-00-00"
          placeholderTextColor="#9AA6B5"
          keyboardType="phone-pad"
          accessibilityLabel={`${label}, qolgan yetti raqam`}
        />
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  maxLength,
  autoCapitalize,
  inputRef,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "number-pad" | "phone-pad";
  maxLength?: number;
  autoCapitalize?: "none";
  inputRef?: RefObject<TextInput | null>;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9AA6B5"
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

function Option({
  title,
  detail,
  selected,
  onPress,
}: {
  title: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.option, selected && styles.optionSelected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
        {title}
      </Text>
      {!!detail && <Text style={styles.optionDetail}>{detail}</Text>}
    </Pressable>
  );
}

function Action({
  title,
  onPress,
  disabled,
  secondary,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.action,
        secondary && styles.secondaryAction,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text
        style={[styles.actionText, secondary && styles.secondaryActionText]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 40 },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  priceBadge: {
    backgroundColor: "#DCFCE7",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  priceBadgeText: {
    color: "#15803D",
    fontWeight: "700",
    fontSize: 14,
  },
  priceBadgeText1: {
    backgroundColor: "#DCFCE7",
    color: "#15803D",
    fontWeight: "700",
  },
  minimumPriceWords: {
    color: "#15803D",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
    marginBottom: 8,
  },
  back: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingRight: 20,
    marginBottom: 18,
  },
  link: { color: "#1677D2", fontSize: 16, fontWeight: "700" },
  eyebrow: {
    color: "#1677D2",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: { color: "#172536", fontSize: 30, fontWeight: "800" },
  subtitle: {
    color: "#627184",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E8EDF3",
  },
  cardTitle: {
    color: "#172536",
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 8,
  },
  regionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  regionHeaderTitle: { flexShrink: 1, marginBottom: 0 },
  addRegionButton: {
    width: 44,
    height: 44,
    borderRadius: 11,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  addRegionIcon: {
    width: 25,
    height: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  addRegionBadge: {
    position: "absolute",
    top: 4,
    left: 7,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  addRegionBadgeText: {
    color: "#1677D2",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 12,
  },
  progress: { flexDirection: "row", gap: 6, marginBottom: 18 },
  progressSegment: {
    flex: 1,
    minHeight: 56,
    borderRadius: 10,
    backgroundColor: "#E8EDF3",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  progressSegmentCompleted: { backgroundColor: "#FFF2C6" },
  progressSegmentVisitedNext: { backgroundColor: "#1677D2" },
  progressSegmentCurrent: { backgroundColor: "#16865A" },
  progressNumber: { color: "#8A97A6", fontSize: 15, fontWeight: "800" },
  progressLabel: { color: "#8A97A6", fontSize: 11, fontWeight: "700" },
  progressTextCompleted: { color: "#8A5A00" },
  progressTextVisitedNext: { color: "#FFFFFF" },
  progressTextCurrent: { color: "#FFFFFF" },
  selectedBox: {
    backgroundColor: "#EAF4FF",
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  selectedTerm: {
    color: "#1677D2",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 12,
  },
  monthlyPreview: {
    backgroundColor: "#EAF4FF",
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  monthlyAmount: { color: "#172536", fontSize: 16, fontWeight: "800" },
  monthlyWords: {
    color: "#627184",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  list: { gap: 8, marginTop: 14 },
  label: {
    color: "#172536",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    paddingHorizontal: 14,
    color: "#172536",
    fontSize: 16,
    backgroundColor: "#FFFFFF",
  },
  phoneInput: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  phonePrefix: { color: "#172536", fontSize: 16, fontWeight: "700" },
  phoneArea: {
    width: 26,
    minHeight: 48,
    paddingVertical: 0,
    paddingHorizontal: 0,
    color: "#172536",
    fontSize: 16,
  },
  phoneEditable: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 0,
    color: "#172536",
    fontSize: 16,
  },
  multiline: { height: 86, paddingTop: 12 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  paymentOptionsError: {
    borderWidth: 1,
    borderColor: "#E29B9F",
    backgroundColor: "#FFF1F1",
    borderRadius: 12,
    padding: 8,
  },
  option: {
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 11,
    paddingVertical: 11,
    paddingHorizontal: 13,
    minWidth: 80,
  },
  optionSelected: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  optionText: { color: "#45586E", fontSize: 14, fontWeight: "700" },
  optionTextSelected: { color: "#1677D2" },
  optionDetail: { color: "#627184", fontSize: 12, marginTop: 3 },
  hint: {
    color: "#627184",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 8,
  },
  regionModalOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  regionModalBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(23, 37, 54, 0.28)",
  },
  regionModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#172536",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  regionModalTitle: { color: "#172536", fontSize: 20, fontWeight: "800" },
  regionModalHint: { color: "#627184", fontSize: 14, marginTop: 6 },
  regionCreatedNotice: {
    position: "absolute",
    top: 16,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  regionCreatedNoticeText: {
    overflow: "hidden",
    backgroundColor: "#E8F7EE",
    borderColor: "#A5DEC0",
    borderWidth: 1,
    borderRadius: 12,
    color: "#167347",
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  action: {
    minHeight: 48,
    backgroundColor: "#1677D2",
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    marginTop: 14,
  },
  hintBold: {
    fontWeight: "700",
  },
  secondaryAction: { backgroundColor: "#EAF4FF" },
  actionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  secondaryActionText: { color: "#1677D2" },
  disabled: { opacity: 0.55 },
  error: { color: "#C3333D", fontSize: 14, lineHeight: 20, marginTop: 14 },
  loader: { alignItems: "center", paddingVertical: 40 },
  successTitle: { color: "#16865A", fontSize: 22, fontWeight: "800" },
  createdCustomerLink: { borderRadius: 12 },
  createdCustomerLinkPressed: { opacity: 0.65 },
  createdCustomerOpen: {
    color: "#1677D2",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 14,
  },
  summary: { color: "#172536", fontSize: 15, marginTop: 10 },
  idText: { color: "#627184", fontSize: 12, marginTop: 18 },
});
