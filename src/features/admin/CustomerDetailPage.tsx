import { randomUUID } from "expo-crypto";
import * as Linking from "expo-linking";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import { getCustomerProgress } from "./customerProgress";
import {
  formatDate,
  formatMoney,
  validPaymentMonth,
  type Customer,
  type CustomerPayment,
  type PaymentMethod,
} from "./customers";
import { type DailyPlan, getDailyPlans, isObjectId, tashkentToday } from "./dailyPlans";
import LoadingMark from "./LoadingMark";
import { formatMoneyWithUnits, parseMoney } from "./money";
import MoneyInput from "./MoneyInput";
import PaymentMethodFields, { ProviderIcon } from "./PaymentMethodFields";
import {
  paymentDetailsError,
  paymentExtraFields,
  usePaymentOptions,
} from "./paymentOptions";
import { PullRefreshControl } from "./PullRefresh";
import { deleteStoredToken, getStoredToken } from "./session";
import TransferMethodIcon from "./TransferMethodIcon";

const methods: Record<PaymentMethod, string> = {
  cash: "Naqd",
  transfer: "O‘tkazma (eski tur)",
  card: "Bank kartasi",
  payment_app: "To‘lov ilovasi",
};
type NamedItem = { id: string; name: string };
type ProductItem = NamedItem & { title?: string };
type DetailNames = {
  region: string;
  group: string;
  section: string;
  product: string;
  users: Record<string, string>;
};
type PaymentAttempt = { path: string; key: string; body: string };
const unavailable = "Ma’lumot topilmadi";
const roleNames = {
  super_admin: "Super admin",
  sotuvchi: "Sotuvchi",
  yiguvchi: "Yig'uvchi",
};
const monthNames = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr",
];
const paymentStepTitles = [
  "Oy va summa",
  "To‘lov usuli",
  "Tekshirish",
] as const;
const paymentStepLabels = ["Oy/Summa", "Usul", "Tekshiruv"] as const;

function currentPaymentMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function paymentMonths(createdAt: string) {
  const created = new Date(createdAt);
  const today = new Date();
  const currentMonth = today.getFullYear() * 12 + today.getMonth();
  const firstMonth = Number.isNaN(created.getTime())
    ? currentMonth
    : Math.min(created.getFullYear() * 12 + created.getMonth(), currentMonth);
  const months = [
    { value: currentPaymentMonth(), label: "Bu oy uchun to‘lov" },
  ];
  for (let index = firstMonth; index < currentMonth; index += 1) {
    const year = Math.floor(index / 12);
    const month = index % 12;
    months.push({
      value: `${year}-${String(month + 1).padStart(2, "0")}`,
      label: `${monthNames[month]} ${year}`,
    });
  }
  return months;
}

function formatPaymentMonth(value: string) {
  if (!validPaymentMonth(value)) return value;
  const [year, month] = value.split("-").map(Number);
  return `${monthNames[month - 1]} ${year}`;
}

async function resolveDetailNames(
  customer: Customer,
  token: string,
): Promise<DetailNames> {
  const headers = { Authorization: `Bearer ${token}` };
  const [regions, categories, products, users] = await Promise.allSettled([
    apiRequest<{ regions: NamedItem[] }>("/regions", { headers }),
    apiRequest<{ categories: NamedItem[] }>("/product-categories", { headers }),
    apiRequest<{ products: ProductItem[] }>("/products", { headers }),
    apiRequest<{ users: User[] }>("/users", { headers }).catch(
      async (cause) => {
        if (cause instanceof ApiError && cause.status === 403) {
          const result = await apiRequest<{ user: User }>("/auth/me", {
            headers,
          });
          return { users: [result.user] };
        }
        throw cause;
      },
    ),
  ]);
  for (const result of [regions, categories, products, users]) {
    if (
      result.status === "rejected" &&
      result.reason instanceof ApiError &&
      result.reason.status === 401
    )
      throw result.reason;
  }
  const userNames: Record<string, string> = {};
  if (users.status === "fulfilled") {
    for (const user of users.value.users)
      userNames[user.id] = user.name || user.login;
  }
  const categoryList =
    categories.status === "fulfilled" ? categories.value.categories : [];
  const productList =
    products.status === "fulfilled" ? products.value.products : [];
  const product = productList.find((item) => item.id === customer.productId);
  return {
    region:
      regions.status === "fulfilled"
        ? regions.value.regions.find((item) => item.id === customer.regionId)
            ?.name || unavailable
        : unavailable,
    group:
      categoryList.find((item) => item.id === customer.groupId)?.name ||
      unavailable,
    section:
      categoryList.find((item) => item.id === customer.sectionId)?.name ||
      unavailable,
    product: product?.title || product?.name || customer.productName,
    users: userNames,
  };
}

export default function CustomerDetailPage({
  paymentsOnly = false,
}: {
  paymentsOnly?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { mijoz_id, dailyPlanId } = useLocalSearchParams<{
    mijoz_id: string;
    dailyPlanId?: string;
  }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [detailNames, setDetailNames] = useState<DetailNames | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [role, setRole] = useState<User["role"] | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [ownedPlanIds, setOwnedPlanIds] = useState<string[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<DailyPlan | null>(null);
  const [voidRequests, setVoidRequests] = useState<
    Record<string, "pending" | "approved" | "rejected">
  >({});
  const [voidPayment, setVoidPayment] = useState<CustomerPayment | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState("");
  const [voidSaving, setVoidSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [provider, setProvider] = useState("");
  const [providerName, setProviderName] = useState("");
  const [paymentToken, setPaymentToken] = useState<string | null>(null);
  const paymentOptions = usePaymentOptions(paymentToken);
  const [forMonth, setForMonth] = useState(currentPaymentMonth);
  const [paymentError, setPaymentError] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const [retryPayment, setRetryPayment] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentStep, setPaymentStep] = useState<0 | 1 | 2 | 3>(0);
  const [furthestPaymentStep, setFurthestPaymentStep] = useState<1 | 2 | 3>(1);
  const scrollRef = useRef<ScrollView>(null);
  const paymentAttempt = useRef<PaymentAttempt | null>(null);
  const paymentRequestInFlight = useRef(false);
  const loadVersion = useRef(0);
  const activePayments =
    customer?.payments.filter((payment) => payment.status !== "voided")
      .length ?? 0;
  const monthlyPayment =
    customer &&
    customer.termMonths > 0 &&
    customer.totalPrice > customer.downPayment
      ? Math.ceil(
          (customer.totalPrice - customer.downPayment) / customer.termMonths,
        )
      : null;
  const paymentDifference =
    amount && monthlyPayment !== null ? Number(amount) - monthlyPayment : null;
  const availableMonths = useMemo(
    () => (customer ? paymentMonths(customer.createdAt) : []),
    [customer],
  );
  const monthRows = useMemo(
    () =>
      Array.from(
        { length: Math.ceil(availableMonths.length / 3) },
        (_, index) => availableMonths.slice(index * 3, index * 3 + 3),
      ),
    [availableMonths],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [paymentStep]);

  function goToPaymentStep(target: 1 | 2 | 3) {
    if (
      savingPayment ||
      retryPayment ||
      target > furthestPaymentStep ||
      target === paymentStep
    )
      return;
    Keyboard.dismiss();
    setPaymentError("");
    setPaymentStep(target);
  }

  function nextPaymentStep() {
    if (paymentRequestInFlight.current) return;
    setPaymentError("");
    if (paymentStep === 0) {
      setPaymentNotice("");
      setFurthestPaymentStep(1);
      setPaymentStep(1);
      return;
    }
    if (paymentStep === 1) {
      const paymentAmount = parseMoney(amount);
      if (
        !customer ||
        paymentAmount === null ||
        paymentAmount <= 0 ||
        paymentAmount > customer.remainingBalance
      ) {
        setPaymentError(
          "To‘lov summasi 0 dan katta va qolgan qarzdan oshmasligi kerak.",
        );
        return;
      }
      if (!validPaymentMonth(forMonth.trim())) {
        setPaymentError("To‘lov oyini tanlang.");
        return;
      }
      Keyboard.dismiss();
      setFurthestPaymentStep((current) => Math.max(current, 2) as 2 | 3);
      setPaymentStep(2);
      return;
    }
    if (paymentStep === 2) {
      const detailsError = paymentDetailsError(
        method,
        cardNumber,
        provider,
        providerName,
        paymentOptions.options,
      );
      if (detailsError) {
        setPaymentError(detailsError);
        return;
      }
      Keyboard.dismiss();
      setFurthestPaymentStep(3);
      setPaymentStep(3);
      return;
    }
    void addPayment();
  }

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    if (
      !mijoz_id ||
      !/^[1-9]\d*$/.test(mijoz_id) ||
      !Number.isSafeInteger(Number(mijoz_id))
    ) {
      setCustomer(null);
      setDetailNames(null);
      setError("Mijoz raqami noto'g'ri.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setCustomer((current) =>
      current?.mijoz_id === Number(mijoz_id) ? current : null,
    );
    setDetailNames(null);
    try {
      const token = await getStoredToken();
      if (!token) {
        router.replace("/");
        return;
      }
      if (paymentsOnly) setPaymentToken(token);
      const headers = { Authorization: `Bearer ${token}` };
      const [result, session] = await Promise.all([
        apiRequest<{ customer: Customer }>(`/customers/${mijoz_id}`, {
          headers,
        }),
        apiRequest<{ user: User }>("/auth/me", { headers }),
      ]);
      if (version !== loadVersion.current) return;
      setIsSuperAdmin(session.user.role === "super_admin");
      setRole(session.user.role);
      setCurrentUserId(session.user.id);
      setCustomer(result.customer);
      if (paymentsOnly && dailyPlanId) {
        if (!isObjectId(dailyPlanId)) throw new Error("Reja IDsi noto‘g‘ri.");
        const detail = await apiRequest<{ plan: DailyPlan }>(`/daily-plans/${dailyPlanId}`, { headers });
        if (version !== loadVersion.current) return;
        setSelectedPlan(detail.plan);
      } else setSelectedPlan(null);
      if (paymentsOnly && session.user.role === "yiguvchi") {
        const ownPlans = await getDailyPlans(token, `?regionId=${encodeURIComponent(result.customer.regionId)}`);
        if (version !== loadVersion.current) return;
        const owned = ownPlans.plans.map((item) => item.id);
        setOwnedPlanIds(owned);
        const entries = await Promise.all(result.customer.payments.filter((payment) => payment.dailyPlanId && (payment.receivedBy === session.user.id || owned.includes(payment.dailyPlanId))).map(async (payment) => {
          const paymentId = payment.paymentId || payment.id;
          const response = await apiRequest<{ requests: { status: "pending" | "approved" | "rejected" }[] }>(`/payments/${encodeURIComponent(paymentId)}/void-requests`, { headers }).catch(() => null);
          return [paymentId, response?.requests[0]?.status] as const;
        }));
        if (version !== loadVersion.current) return;
        setVoidRequests(Object.fromEntries(entries.filter((item): item is readonly [string, "pending" | "approved" | "rejected"] => !!item[1])));
      }
      setPaymentNotice("");
      setLoading(false);
      const names = await resolveDetailNames(result.customer, token);
      if (version === loadVersion.current) setDetailNames(names);
    } catch (cause) {
      if (version !== loadVersion.current) return;
      if (cause instanceof ApiError && cause.status === 401) {
        await deleteStoredToken();
        router.replace("/");
      } else {
        if (cause instanceof ApiError && cause.status === 404)
          setCustomer(null);
        setError(
          cause instanceof ApiError && cause.status === 404
            ? "Mijoz topilmadi. Raqamni tekshiring."
            : cause instanceof Error
              ? cause.message
              : "Mijoz ma’lumotlari yuklanmadi.",
        );
      }
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [mijoz_id, paymentsOnly, dailyPlanId]);

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        void load();
      }, 0);
      return () => {
        clearTimeout(timer);
        loadVersion.current += 1;
      };
    }, [load]),
  );

  async function addPayment() {
    if (paymentRequestInFlight.current) return;
    if (!customer || !mijoz_id || !/^[1-9]\d*$/.test(mijoz_id)) return;
    const paymentPath = dailyPlanId
      ? `/daily-plans/${encodeURIComponent(dailyPlanId)}/customers/${mijoz_id}/payments`
      : `/customers/${mijoz_id}/payments`;
    const pending =
      paymentAttempt.current?.path === paymentPath
        ? paymentAttempt.current
        : null;
    if (dailyPlanId && !pending && (!isObjectId(dailyPlanId) || selectedPlan?.id !== dailyPlanId || selectedPlan.regionId !== customer.regionId || selectedPlan.status !== "open" || selectedPlan.date !== tashkentToday())) {
      setPaymentError("Bu mijoz uchun bugungi ochiq reja topilmadi. Rejani yangilang.");
      return;
    }
    let body = pending?.body;
    if (!pending) {
      const paymentAmount = parseMoney(amount);
      if (
        paymentAmount === null ||
        paymentAmount <= 0 ||
        paymentAmount > customer.remainingBalance
      ) {
        setPaymentError(
          "To‘lov summasi 0 dan katta va qolgan qarzdan oshmasligi kerak.",
        );
        return;
      }
      const detailsError = paymentDetailsError(
        method,
        cardNumber,
        provider,
        providerName,
        paymentOptions.options,
      );
      if (detailsError) {
        setPaymentError(detailsError);
        return;
      }
      const selectedMonth = forMonth.trim();
      if (selectedMonth && !validPaymentMonth(selectedMonth)) {
        setPaymentError("To‘lov oyini YYYY-MM shaklida kiriting.");
        return;
      }
      body = JSON.stringify({
        amount: paymentAmount,
        method,
        ...(selectedMonth ? { forMonth: selectedMonth } : {}),
        ...paymentExtraFields(method!, cardNumber, provider, providerName),
      });
    }
    paymentRequestInFlight.current = true;
    setSavingPayment(true);
    setPaymentError("");
    try {
      const token = await getStoredToken();
      if (!token) {
        router.replace("/");
        return;
      }
      const attempt = pending ?? {
        path: paymentPath,
        key: randomUUID(),
        body: body!,
      };
      paymentAttempt.current = attempt;
      const result = await apiRequest<{
        paymentId: string;
        payment: CustomerPayment;
        customer: Customer;
      }>(paymentPath, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": attempt.key,
        },
        body: attempt.body,
      });
      paymentAttempt.current = null;
      setRetryPayment(false);
      setAmount("");
      setMethod(null);
      setCardNumber("");
      setProvider("");
      setProviderName("");
      setForMonth(currentPaymentMonth());
      setPaymentStep(0);
      setFurthestPaymentStep(1);
      setCustomer(result.customer);
      setPaymentNotice("");
      try {
        const latest = await apiRequest<{ customer: Customer }>(
          `/customers/${mijoz_id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        setCustomer(latest.customer);
      } catch {
        setPaymentNotice(
          "To‘lov saqlandi. Eng so‘nggi balansni ko‘rish uchun ma’lumotlarni yangilang.",
        );
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await deleteStoredToken();
        router.replace("/");
      } else {
        const uncertain = !(cause instanceof ApiError) || cause.status >= 500;
        setRetryPayment(uncertain);
        if (!uncertain) paymentAttempt.current = null;
        setPaymentError(
          uncertain
            ? "To‘lov natijasi noma’lum. Xuddi shu to‘lovni xavfsiz qayta yuboring."
            : cause instanceof Error
              ? cause.message
              : "To‘lov saqlanmadi.",
        );
        if (cause instanceof ApiError && cause.status === 409) {
          const token = await getStoredToken();
          if (token) {
            const latest = await apiRequest<{ customer: Customer }>(
              `/customers/${mijoz_id}`,
              {
                headers: { Authorization: `Bearer ${token}` },
              },
            ).catch(() => null);
            if (latest) setCustomer(latest.customer);
          }
        }
      }
    } finally {
      paymentRequestInFlight.current = false;
      setSavingPayment(false);
    }
  }

  function closeVoid() {
    if (voidSaving) return;
    setVoidPayment(null);
    setVoidReason("");
    setVoidError("");
  }

  async function openCustomerLocation(latitude: number, longitude: number) {
    const point = `${longitude},${latitude}`;
    const webUrl = `https://yandex.ru/maps/?pt=${point}&z=17&l=map`;
    try {
      if (Platform.OS !== "web") {
        try {
          await Linking.openURL(
            `yandexmaps://maps.yandex.ru/?pt=${point}&z=17`,
          );
          return;
        } catch {
          // The app is unavailable; open the same point in Yandex Maps on the web.
        }
      }
      await Linking.openURL(webUrl);
    } catch {
      setError("Yandex Maps ochilmadi. Qayta urinib ko‘ring.");
    }
  }

  async function confirmVoid() {
    const reason = voidReason.trim();
    if (!voidPayment || !customer || !mijoz_id || voidSaving) return;
    if (reason.length < 1 || reason.length > 500) {
      setVoidError("Sabab 1–500 belgidan iborat bo‘lishi kerak.");
      return;
    }
    const paymentId = voidPayment.paymentId || voidPayment.id;
    if (!paymentId) {
      setVoidError("To‘lov IDsi topilmadi.");
      return;
    }
    setVoidSaving(true);
    setVoidError("");
    try {
      const token = await getStoredToken();
      if (!token) {
        router.replace("/");
        return;
      }
      if (voidPayment.dailyPlanId) {
        await apiRequest(`/payments/${encodeURIComponent(paymentId)}/void-requests`, {
          method: "POST", headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason }),
        });
        setVoidRequests((current) => ({ ...current, [paymentId]: "pending" }));
        setPaymentNotice("Bekor qilish so‘rovi adminga yuborildi.");
      } else {
        const result = await apiRequest<{ payment: CustomerPayment; customer: Customer }>(
          `/customers/${mijoz_id}/payments/${encodeURIComponent(paymentId)}/void`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ reason }) },
        );
        setCustomer(result.customer);
      }
      setVoidPayment(null);
      setVoidReason("");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await deleteStoredToken();
        router.replace("/");
      } else {
        setVoidError(
          cause instanceof ApiError && cause.status === 409
            ? voidPayment.dailyPlanId
              ? "Bu to‘lov uchun ochiq so‘rov bor yoki to‘lov allaqachon bekor qilingan."
              : "Bu to‘lov allaqachon bekor qilingan. Ma’lumotlarni yangilang."
            : cause instanceof Error
              ? cause.message
              : "To‘lov bekor qilinmadi.",
        );
        if (cause instanceof ApiError && cause.status === 409) {
          // Keep the dialog open so the server's rejection remains visible.
          const refreshed = await apiRequest<{ customer: Customer }>(
            `/customers/${mijoz_id}`,
            { headers: { Authorization: `Bearer ${await getStoredToken()}` } },
          ).catch(() => null);
          if (refreshed) setCustomer(refreshed.customer);
        }
      }
    } finally {
      setVoidSaving(false);
    }
  }

  const locationPoint =
    customer &&
    customer.lat !== null &&
    customer.long !== null &&
    Number.isFinite(customer.lat) &&
    Number.isFinite(customer.long) &&
    Math.abs(customer.lat) <= 90 &&
    Math.abs(customer.long) <= 180
      ? { latitude: customer.lat, longitude: customer.long }
      : null;
  const planReady = !dailyPlanId || (selectedPlan?.id === dailyPlanId && selectedPlan.status === "open" && selectedPlan.date === tashkentToday() && selectedPlan.regionId === customer?.regionId);

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => {
            if (savingPayment || retryPayment) return;
            setPaymentError("");
            if (paymentStep > 1) goToPaymentStep((paymentStep - 1) as 1 | 2);
            else if (paymentStep === 1) {
              Keyboard.dismiss();
              setPaymentStep(0);
            } else router.back();
          }}
          style={styles.back}
          accessibilityRole="button"
          disabled={savingPayment || retryPayment}
        >
          <Text style={[styles.link, retryPayment && styles.disabled]}>
            {paymentStep > 0
              ? "‹ Orqaga"
              : paymentsOnly
                ? "‹ Mijozga qaytish"
                : "‹ Mijozlarga qaytish"}
          </Text>
        </Pressable>
        {paymentStep === 0 && (
          <Pressable
            style={[styles.headerRefresh, loading && styles.disabled]}
            onPress={() => void Promise.all([load(), paymentOptions.reload()])}
            accessibilityRole="button"
            accessibilityLabel="Ma’lumotlarni yangilash"
            accessibilityState={{ disabled: loading }}
            disabled={loading}
          >
            <Text style={styles.headerRefreshIcon}>↻</Text>
          </Pressable>
        )}
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          paymentStep === 0 ? (
            <PullRefreshControl
              refreshing={loading || paymentOptions.loading}
              onRefresh={() => {
                void Promise.all([load(), paymentOptions.reload()]);
              }}
            />
          ) : undefined
        }
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>
            {paymentStep > 0
              ? "Keyingi to‘lov"
              : paymentsOnly
                ? "To‘lovlar"
                : "Mijoz ma’lumotlari"}
          </Text>
          {!paymentsOnly && paymentStep === 0 && locationPoint && (
            <Pressable
              style={styles.titleLocationButton}
              onPress={() =>
                void openCustomerLocation(
                  locationPoint.latitude,
                  locationPoint.longitude,
                )
              }
              accessibilityRole="button"
              accessibilityLabel="Mijoz joylashuvini Yandex Mapsda ochish"
            >
              <SymbolView
                name={{
                  ios: "mappin.and.ellipse",
                  android: "location_on",
                  web: "location_on",
                }}
                size={23}
                tintColor="#1677D2"
              />
            </Pressable>
          )}
        </View>
        {customer && !loading && paymentStep > 0 && (
          <>
            <Text style={styles.stepSubtitle}>
              {paymentStep}/3 · {paymentStepTitles[paymentStep - 1]}
            </Text>
            <View style={styles.progress}>
              {paymentStepTitles.map((title, index) => {
                const step = (index + 1) as 1 | 2 | 3;
                const visited = step <= furthestPaymentStep;
                return (
                  <Pressable
                    key={title}
                    onPress={() => goToPaymentStep(step)}
                    disabled={
                      !visited ||
                      step === paymentStep ||
                      savingPayment ||
                      retryPayment
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${step}-qadam: ${title}`}
                    accessibilityState={{
                      selected: step === paymentStep,
                      disabled:
                        !visited ||
                        step === paymentStep ||
                        savingPayment ||
                        retryPayment,
                    }}
                    style={[
                      styles.progressSegment,
                      step < paymentStep && styles.progressSegmentCompleted,
                      step > paymentStep &&
                        visited &&
                        styles.progressSegmentVisitedNext,
                      step === paymentStep && styles.progressSegmentCurrent,
                    ]}
                  >
                    <Text
                      style={[
                        styles.progressNumber,
                        step < paymentStep && styles.progressTextCompleted,
                        step > paymentStep &&
                          visited &&
                          styles.progressTextVisitedNext,
                        step === paymentStep && styles.progressTextCurrent,
                      ]}
                    >
                      {step}
                    </Text>
                    <Text
                      style={[
                        styles.progressLabel,
                        step < paymentStep && styles.progressTextCompleted,
                        step > paymentStep &&
                          visited &&
                          styles.progressTextVisitedNext,
                        step === paymentStep && styles.progressTextCurrent,
                      ]}
                      numberOfLines={1}
                    >
                      {paymentStepLabels[index]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        {loading && !customer && (
          <View style={styles.loading}>
            <LoadingMark size={72} />
            <Text style={styles.muted}>Yuklanmoqda...</Text>
          </View>
        )}
        {!!error && (
          <View style={styles.card}>
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
            <Pressable onPress={() => void load()} accessibilityRole="button">
              <Text style={styles.link}>Qayta yuklash</Text>
            </Pressable>
          </View>
        )}
        {!!paymentNotice && paymentStep === 0 && (
          <View style={styles.card}>
            <Text style={styles.muted}>{paymentNotice}</Text>
          </View>
        )}
        {paymentsOnly && !!dailyPlanId && <View style={styles.card}>
          <Text style={styles.sectionTitle}>Kunlik reja orqali to‘lov</Text>
          <Text style={styles.muted}>{selectedPlan ? `${selectedPlan.date} · ${selectedPlan.status === "open" ? "Ochiq" : "Yopiq"}` : "Reja yuklanmoqda..."}</Text>
          {!planReady && !loading && <Text style={styles.error}>To‘lov uchun bugungi ochiq va mijoz hududiga mos reja kerak.</Text>}
        </View>}
        {customer && (
          <>
            {paymentStep === 0 && (
              <>
                {!paymentsOnly && (
                  <>
                    <View style={styles.card}>
                      <View style={styles.headingRow}>
                        <Text style={styles.name}>{customer.name}</Text>
                        <Text
                          style={[
                            styles.badge,
                            customer.remainingBalance <= 0 && styles.badgePaid,
                          ]}
                        >
                          {customer.remainingBalance > 0
                            ? "Qarzi bor"
                            : "To'langan"}
                        </Text>
                      </View>
                      <Text style={styles.customerId}>
                        Mijoz #{customer.mijoz_id}
                      </Text>
                      <BalancePanel customer={customer} />
                      <Pressable
                        style={[
                          styles.submitPayment,
                          styles.detailPaymentButton,
                        ]}
                        onPress={() =>
                          router.push({
                            pathname: "/customers/payments",
                            params: { mijoz_id },
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel="To‘lovlarga o‘tish"
                      >
                        <Text style={styles.submitText}>
                          To‘lovlarga o‘tish
                        </Text>
                      </Pressable>
                      <View style={styles.quickActions}>
                        <Pressable
                          style={[
                            styles.quickAction,
                            styles.quickActionPrimary,
                          ]}
                          onPress={() =>
                            void Linking.openURL(
                              `tel:${customer.phoneNumber.replace(/[^\d+]/g, "")}`,
                            ).catch(() =>
                              setError("Telefon ilovasini ochib bo‘lmadi."),
                            )
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`${customer.name}ga qo‘ng‘iroq qilish`}
                        >
                          <Text style={styles.quickActionPrimaryText}>
                            Qo‘ng‘iroq
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.quickAction}
                          onPress={() =>
                            router.push({
                              pathname: "/customers/contacts",
                              params: { mijoz_id },
                            })
                          }
                          accessibilityRole="button"
                        >
                          <Text style={styles.quickActionText}>
                            Aloqa tarixi
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.quickAction}
                          onPress={() =>
                            router.push({
                              pathname: "/customers/edit",
                              params: { mijoz_id },
                            })
                          }
                          accessibilityRole="button"
                        >
                          <Text style={styles.quickActionText}>Tahrirlash</Text>
                        </Pressable>
                      </View>
                      <Row
                        label="Asosiy telefon"
                        value={customer.phoneNumber}
                      />
                      {!!customer.addPhoneNumber && (
                        <Row
                          label="Qo'shimcha telefon"
                          value={customer.addPhoneNumber}
                        />
                      )}
                      <Row
                        label="Yaratilgan sana"
                        value={formatDate(customer.createdAt)}
                      />
                      {!!customer.address && (
                        <Row label="Manzil" value={customer.address} />
                      )}
                    </View>
                    <View style={styles.card}>
                      <Text style={styles.sectionTitle}>Savdo va nasiya</Text>
                      <Row
                        label="Mahsulot"
                        value={detailNames?.product || customer.productName}
                      />
                      <Row
                        label="Umumiy narx"
                        value={formatMoney(customer.totalPrice)}
                        words={formatMoneyWithUnits(customer.totalPrice, true)}
                      />
                      <Row
                        label="Boshlang'ich to'lov"
                        value={formatMoney(customer.downPayment)}
                        words={formatMoneyWithUnits(customer.downPayment, true)}
                      />
                      <Row
                        label="Jami to'langan"
                        value={formatMoney(customer.totalPaid)}
                        words={formatMoneyWithUnits(customer.totalPaid, true)}
                      />
                      <Row
                        label="Qolgan qarz"
                        value={formatMoney(customer.remainingBalance)}
                        words={formatMoneyWithUnits(
                          customer.remainingBalance,
                          true,
                        )}
                        emphasized
                      />
                      <Row
                        label="Nasiya muddati"
                        value={`${customer.termMonths} oy`}
                      />
                      {!!customer.description && (
                        <Row label="Izoh" value={customer.description} />
                      )}
                    </View>
                    <View style={styles.card}>
                      <Text style={styles.sectionTitle}>
                        Hudud va ma’lumotlar
                      </Text>
                      <Row
                        label="Hudud"
                        value={detailNames?.region || unavailable}
                      />
                      {locationPoint && (
                        <Pressable
                          style={styles.row}
                          onPress={() =>
                            void openCustomerLocation(
                              locationPoint.latitude,
                              locationPoint.longitude,
                            )
                          }
                          accessibilityRole="button"
                          accessibilityLabel="Joylashuvni Yandex Mapsda ochish"
                        >
                          <Text style={styles.rowLabel}>Joylashuv</Text>
                          <View style={styles.locationValue}>
                            <Text style={styles.locationLink}>
                              Yandex’da ochish
                            </Text>
                            <Text
                              style={styles.locationIcon}
                              accessibilityElementsHidden
                              importantForAccessibility="no"
                            >
                              📍
                            </Text>
                          </View>
                        </Pressable>
                      )}
                      {!!customer.groupId && (
                        <Row
                          label="Guruh"
                          value={detailNames?.group || unavailable}
                        />
                      )}
                      {!!customer.sectionId && (
                        <Row
                          label="Bo'lim"
                          value={detailNames?.section || unavailable}
                        />
                      )}
                      <Row
                        label="Yaratgan xodim"
                        value={`${detailNames?.users[customer.createdBy] || "Xodim nomi topilmadi"} · ${roleNames[customer.createdByRole]}`}
                      />
                      <Row
                        label="Mas’ul xodim"
                        value={
                          customer.assignedTo
                            ? detailNames?.users[customer.assignedTo] ||
                              customer.assignedTo
                            : "Biriktirilmagan"
                        }
                      />
                    </View>
                  </>
                )}
                {paymentsOnly && (
                  <>
                    <View style={styles.card}>
                      <Text style={styles.name}>{customer.name}</Text>
                      <Text style={styles.customerId}>
                        Mijoz #{customer.mijoz_id}
                      </Text>
                      <BalancePanel customer={customer} />
                    </View>
                    <View style={styles.paymentSection}>
                      <Text style={styles.sectionTitle}>
                        To‘lovlar ({activePayments})
                      </Text>
                      {customer.payments.length > activePayments && (
                        <Text style={styles.muted}>
                          Bekor qilingan:{" "}
                          {customer.payments.length - activePayments}
                        </Text>
                      )}
                      {customer.payments.length === 0 && (
                        <View style={styles.card}>
                          <Text style={styles.muted}>To‘lovlar yo‘q.</Text>
                        </View>
                      )}
                      {customer.payments.map((payment, index) => (
                        <View key={payment.paymentId || payment.id}>
                          {index > 0 && <View style={styles.paymentDivider} />}
                          <View
                            style={[
                              styles.card,
                              styles.paymentCard,
                              payment.status === "voided" && styles.voidedPayment,
                            ]}
                          >
                          <View style={styles.headingRow}>
                            <View style={styles.paymentAmountGroup}>
                              <Text
                                style={[
                                  styles.paymentAmount,
                                  payment.status === "voided" &&
                                    styles.voidedAmount,
                                ]}
                              >
                                {formatMoney(payment.amount)}
                              </Text>
                              <Text style={styles.paymentWords}>
                                {formatMoneyWithUnits(payment.amount, true)}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.paymentStatus,
                                payment.status === "voided"
                                  ? styles.statusVoided
                                  : styles.statusActive,
                              ]}
                            >
                              {payment.status === "voided"
                                ? "Bekor qilingan"
                                : "Faol"}
                            </Text>
                          </View>
                          <Row
                            label="Turi"
                            value={
                              payment.type === "initial"
                                ? "Boshlang‘ich"
                                : "Keyingi to‘lov"
                            }
                          />
                          <Row
                            label="Usul"
                            value={
                              payment.method === "payment_app"
                                ? "O‘tkazma"
                                : paymentOptions.options?.methods.find(
                                    (item) => item.id === payment.method,
                                  )?.label || methods[payment.method]
                            }
                          />
                          {!!payment.cardLast4 && (
                            <Row
                              label="Karta"
                              value={`•••• ${payment.cardLast4}`}
                            />
                          )}
                          {!!payment.provider && (
                            <Row
                              label="Ilova"
                              value={
                                payment.providerName ||
                                paymentOptions.options?.providers.find(
                                  (item) => item.id === payment.provider,
                                )?.label ||
                                payment.provider
                              }
                            />
                          )}
                          {!!payment.forMonth && (
                            <Row
                              label="Qaysi oy uchun"
                              value={formatPaymentMonth(payment.forMonth)}
                            />
                          )}
                          <Row
                            label="Qabul qilingan sana"
                            value={formatDate(payment.paidAt)}
                          />
                          <Row
                            label="Qabul qilgan"
                            value={
                              detailNames?.users[payment.receivedBy] ||
                              "Xodim nomi topilmadi"
                            }
                          />
                          {!!voidRequests[payment.paymentId || payment.id] && <Row
                            label="Bekor qilish so‘rovi"
                            value={{ pending: "Ko‘rib chiqilmoqda", approved: "Tasdiqlangan", rejected: "Rad etilgan" }[voidRequests[payment.paymentId || payment.id]]}
                          />}
                          {payment.status === "voided" ? (
                            <>
                              {!!payment.voidedAt && (
                                <Row
                                  label="Bekor qilingan sana"
                                  value={formatDate(payment.voidedAt)}
                                />
                              )}
                              {!!payment.voidedBy && (
                                <Row
                                  label="Bekor qilgan"
                                  value={
                                    detailNames?.users[payment.voidedBy] ||
                                    payment.voidedBy
                                  }
                                />
                              )}
                              {!!payment.voidReason && (
                                <Row label="Sabab" value={payment.voidReason} />
                              )}
                            </>
                          ) : (
                            ((isSuperAdmin && !payment.dailyPlanId) || (role === "yiguvchi" && !!payment.dailyPlanId && (payment.receivedBy === currentUserId || ownedPlanIds.includes(payment.dailyPlanId)))) && (
                              <Pressable
                                style={styles.voidButton}
                                disabled={voidRequests[payment.paymentId || payment.id] === "pending"}
                                onPress={() => {
                                  setVoidPayment(payment);
                                  setVoidReason("");
                                  setVoidError("");
                                }}
                                accessibilityRole="button"
                              >
                                <Text style={styles.voidButtonText}>
                                  {voidRequests[payment.paymentId || payment.id] === "pending" ? "So‘rov ko‘rib chiqilmoqda" : payment.dailyPlanId ? "Bekor qilish so‘rovi" : "To‘lovni bekor qilish"}
                                </Text>
                              </Pressable>
                            )
                          )}
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                )}
                {isSuperAdmin && (
                  <Pressable
                    style={styles.auditLink}
                    onPress={() =>
                      router.push({
                        pathname: "/customers/audit",
                        params: { mijoz_id },
                      })
                    }
                    accessibilityRole="button"
                  >
                    <Text style={styles.auditLinkText}>
                      Audit tarixini ko‘rish ›
                    </Text>
                  </Pressable>
                )}
              </>
            )}
            {paymentsOnly &&
              paymentStep > 0 &&
              customer.remainingBalance > 0 && (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>
                    {paymentStep === 1
                      ? "Oy va summa"
                      : paymentStep === 2
                        ? "Qanday to‘langan?"
                        : "To‘lovni tekshirish"}
                  </Text>
                  {paymentStep === 1 && (
                    <>
                      <Text style={styles.muted}>
                        Istalgan vaqtda, qolgan qarzgacha bo‘lgan summani
                        to‘lashingiz mumkin.
                      </Text>
                      <Text style={styles.fieldLabel}>Qaysi oy uchun</Text>
                      <View style={styles.monthOptions}>
                        {monthRows.map((row, rowIndex) => (
                          <View key={rowIndex} style={styles.monthRow}>
                            {row.map((item) => (
                              <Pressable
                                key={item.value}
                                style={[
                                  styles.methodButton,
                                  styles.monthChoice,
                                  forMonth === item.value &&
                                    styles.methodSelected,
                                ]}
                                onPress={() => {
                                  setForMonth(item.value);
                                  setPaymentError("");
                                }}
                                accessibilityRole="radio"
                                accessibilityState={{
                                  selected: forMonth === item.value,
                                }}
                              >
                                {item.value === availableMonths[0]?.value ? (
                                  <Text style={styles.monthLabel}>
                                    Bu oy uchun to‘lov
                                  </Text>
                                ) : (
                                  <>
                                    <Text
                                      style={styles.monthLabel}
                                      numberOfLines={1}
                                    >
                                      {item.label.split(" ")[0]}
                                    </Text>
                                    <Text style={styles.monthYear}>
                                      {item.value.slice(0, 4)}
                                    </Text>
                                  </>
                                )}
                              </Pressable>
                            ))}
                            {Array.from(
                              { length: 3 - row.length },
                              (_, index) => (
                                <View
                                  key={`empty-${index}`}
                                  style={styles.monthChoice}
                                />
                              ),
                            )}
                          </View>
                        ))}
                      </View>
                      <View style={styles.selectedMonth}>
                        <Text style={styles.selectedMonthLabel}>
                          Tanlangan oy
                        </Text>
                        <Text style={styles.selectedMonthValue}>
                          {forMonth === availableMonths[0]?.value
                            ? `Bu oy uchun to‘lov · ${formatPaymentMonth(forMonth)}`
                            : formatPaymentMonth(forMonth)}
                        </Text>
                      </View>
                      <View style={styles.amountHeading}>
                        <Text style={[styles.fieldLabel, styles.amountLabel]}>
                          Summa (so‘m)
                        </Text>
                        {monthlyPayment !== null && (
                          <Text style={styles.monthlyHint}>
                            Oylik to‘lov: {formatMoney(monthlyPayment)}
                          </Text>
                        )}
                      </View>
                      <MoneyInput
                        value={amount}
                        onChangeText={(value) => {
                          setAmount(value);
                          setPaymentError("");
                        }}
                        placeholder="To'lov summasi"
                        editable={!savingPayment}
                        tone={paymentError ? "error" : undefined}
                        wordsStyle={
                          amount && monthlyPayment !== null
                            ? [
                                styles.amountWords,
                                Number(amount) < monthlyPayment
                                  ? styles.amountWordsLow
                                  : styles.amountWordsEnough,
                              ]
                            : undefined
                        }
                        wordsAccessory={
                          paymentDifference !== null ? (
                            <Text
                              style={[
                                styles.paymentDifference,
                                paymentDifference < 0
                                  ? styles.paymentDifferenceLow
                                  : paymentDifference > 0
                                    ? styles.paymentDifferenceHigh
                                    : styles.paymentDifferenceEqual,
                              ]}
                            >
                              {paymentDifference === 0
                                ? "Oylik to‘lovga teng"
                                : `${formatMoneyWithUnits(Math.abs(paymentDifference))} ${paymentDifference < 0 ? "kam" : "ko‘p"} to‘layapti`}
                            </Text>
                          ) : undefined
                        }
                      />
                    </>
                  )}
                  {paymentStep === 2 && (
                    <>
                      <Text style={styles.paymentMethodIntro}>
                        To‘lov qanday qabul qilinganini tanlang.
                      </Text>
                      {paymentOptions.options ? (
                        <PaymentMethodFields
                          presentation="step"
                          options={paymentOptions.options}
                          method={method}
                          onMethodChange={(value) => {
                            setMethod(value);
                            setPaymentError("");
                          }}
                          cardNumber={cardNumber}
                          onCardNumberChange={(value) => {
                            setCardNumber(value);
                            setPaymentError("");
                          }}
                          provider={provider}
                          onProviderChange={(value) => {
                            setProvider(value);
                            setPaymentError("");
                          }}
                          providerName={providerName}
                          onProviderNameChange={(value) => {
                            setProviderName(value);
                            setPaymentError("");
                          }}
                          disabled={savingPayment}
                        />
                      ) : (
                        <Pressable
                          onPress={() => void paymentOptions.reload()}
                          accessibilityRole="button"
                        >
                          <Text style={styles.link}>
                            {paymentOptions.loading
                              ? "To‘lov usullari yuklanmoqda..."
                              : `${paymentOptions.error || "To‘lov usullari topilmadi."} Qayta yuklash`}
                          </Text>
                        </Pressable>
                      )}
                    </>
                  )}
                  {paymentStep === 3 && (
                    <View style={styles.review}>
                      <Text style={styles.reviewIntro}>
                        Ma’lumotlarni tekshiring, so‘ng to‘lovni saqlang.
                      </Text>
                      <View style={styles.reviewAmount}>
                        <Text style={styles.reviewAmountLabel}>
                          TO‘LOV SUMMASI
                        </Text>
                        <Text style={styles.reviewAmountValue}>
                          {formatMoney(parseMoney(amount) || 0)}
                        </Text>
                        <Text style={styles.reviewBalance}>
                          To‘lovdan keyingi qoldiq:{" "}
                          {formatMoney(
                            Math.max(
                              0,
                              customer.remainingBalance -
                                (parseMoney(amount) || 0),
                            ),
                          )}
                        </Text>
                      </View>
                      <View style={styles.reviewGroup}>
                        <Text style={styles.reviewGroupTitle}>
                          To‘lov tafsilotlari
                        </Text>
                        <Row label="Mijoz" value={customer.name} />
                        <Row
                          label="Qaysi oy uchun"
                          value={formatPaymentMonth(forMonth)}
                        />
                      </View>
                      <View style={styles.reviewMethod}>
                        {method === "cash" ? (
                          <View style={styles.reviewMethodIcon}>
                            <Text style={styles.reviewMethodIconText}>💵</Text>
                          </View>
                        ) : (
                          <TransferMethodIcon size={42} />
                        )}
                        <View style={styles.reviewMethodCopy}>
                          <Text style={styles.reviewMethodLabel}>
                            TO‘LOV USULI
                          </Text>
                          <Text style={styles.reviewMethodValue}>
                            {method === "cash" ? "Naqd" : "O‘tkazma"}
                          </Text>
                        </View>
                      </View>
                      {method === "payment_app" && (
                        <View style={styles.reviewTransfer}>
                          <View style={styles.reviewApp}>
                            <ProviderIcon id={provider} />
                            <View style={styles.reviewAppCopy}>
                              <Text style={styles.reviewMethodLabel}>
                                TO‘LOV ILOVASI
                              </Text>
                              <Text style={styles.reviewAppName}>
                                {providerName ||
                                  paymentOptions.options?.providers.find(
                                    (item) => item.id === provider,
                                  )?.label ||
                                  provider}
                              </Text>
                            </View>
                          </View>
                          <Row
                            label="Pul yuborilgan karta"
                            value={cardNumber.replace(/(.{4})/g, "$1 ").trim()}
                          />
                        </View>
                      )}
                    </View>
                  )}
                  {!!paymentError && (
                    <Text style={styles.error} accessibilityRole="alert">
                      {paymentError}
                    </Text>
                  )}
                </View>
              )}
          </>
        )}
      </ScrollView>
      {paymentsOnly && customer && customer.remainingBalance > 0 && (
        <View
          style={[
            styles.paymentFooter,
            { paddingBottom: Math.max(insets.bottom, 18) },
          ]}
        >
          <Pressable
            style={[
              styles.submitPayment,
              styles.footerButton,
              (savingPayment || (!planReady && !retryPayment) || (paymentStep === 0 && loading)) &&
                styles.disabled,
            ]}
            onPress={nextPaymentStep}
            disabled={savingPayment || (!planReady && !retryPayment) || (paymentStep === 0 && loading)}
            accessibilityRole="button"
          >
            <Text style={styles.submitText}>
              {savingPayment
                ? "Saqlanmoqda..."
                : retryPayment
                  ? "Qayta yuborish"
                  : paymentStep === 0
                    ? "To‘lov qilish"
                    : paymentStep === 3
                      ? "To‘lovni saqlash"
                      : "Davom etish"}
            </Text>
          </Pressable>
        </View>
      )}
      <Modal
        visible={!!voidPayment}
        transparent
        animationType="fade"
        onRequestClose={closeVoid}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{voidPayment?.dailyPlanId ? "Bekor qilish so‘rovi" : "To‘lovni bekor qilish"}</Text>
              <Text style={styles.modalDescription}>
                {voidPayment
                  ? `${formatMoney(voidPayment.amount)} · ${voidPayment.paymentId || voidPayment.id}`
                  : ""}
              </Text>
              <Text style={styles.modalDescription}>{voidPayment?.dailyPlanId
                ? "So‘rov superadmin tasdiqlagach to‘lov bekor qilinadi."
                : "Bu amal mijozning to‘langan summasini kamaytiradi va qolgan qarzini oshiradi."}</Text>
              <TextInput
                style={styles.reasonInput}
                value={voidReason}
                onChangeText={(value) => {
                  setVoidReason(value);
                  setVoidError("");
                }}
                placeholder="Bekor qilish sababini kiriting"
                placeholderTextColor="#8A97A6"
                multiline
                maxLength={500}
                editable={!voidSaving}
                accessibilityLabel="Bekor qilish sababi"
              />
              <Text style={styles.reasonCount}>{voidReason.length}/500</Text>
              {!!voidError && (
                <Text style={styles.error} accessibilityRole="alert">
                  {voidError}
                </Text>
              )}
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancel}
                  onPress={closeVoid}
                  disabled={voidSaving}
                  accessibilityRole="button"
                >
                  <Text style={styles.modalCancelText}>Qaytish</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalConfirm, voidSaving && styles.disabled]}
                  onPress={() => void confirmVoid()}
                  disabled={voidSaving}
                  accessibilityRole="button"
                >
                  <Text style={styles.modalConfirmText}>
                    {voidSaving ? "Yuborilmoqda..." : voidPayment?.dailyPlanId ? "So‘rov yuborish" : "Tasdiqlash"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function BalancePanel({ customer }: { customer: Customer }) {
  const { percent: paidPercent, tone } = getCustomerProgress(customer);
  return (
    <View style={[styles.balancePanel, { backgroundColor: tone.background }]}>
      <Text style={styles.balanceLabel}>Qolgan qarz</Text>
      <Text style={[styles.balanceValue, { color: tone.value }]}>
        {formatMoney(customer.remainingBalance)}
      </Text>
      <Text style={styles.balanceWords}>
        {formatMoneyWithUnits(customer.remainingBalance, true)}
      </Text>
      <View
        style={[styles.balanceTrack, { backgroundColor: tone.track }]}
        accessibilityRole="progressbar"
        accessibilityLabel="To‘langan ulush"
        accessibilityValue={{ min: 0, max: 100, now: paidPercent }}
      >
        <View
          style={[
            styles.balanceFill,
            { width: `${paidPercent}%`, backgroundColor: tone.fill },
          ]}
        />
      </View>
      <View style={styles.balanceCaption}>
        <View style={styles.balancePaid}>
          <Text style={styles.balanceCaptionText}>
            To‘langan: {formatMoney(customer.totalPaid)}
          </Text>
          <Text style={styles.balancePaidWords}>
            {formatMoneyWithUnits(customer.totalPaid, true)}
          </Text>
        </View>
        <Text style={styles.balanceCaptionText}>{paidPercent}%</Text>
      </View>
      <View style={[styles.balanceTotal, { borderTopColor: tone.track }]}>
        <Text style={styles.balanceTotalText}>
          Sotilgan narx: {formatMoney(customer.totalPrice)}
        </Text>
        <Text style={styles.balanceTotalWords}>
          {formatMoneyWithUnits(customer.totalPrice, true)}
        </Text>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  words,
  emphasized,
}: {
  label: string;
  value: string;
  words?: string | null;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValueGroup}>
        <Text
          style={[styles.rowValue, emphasized && styles.emphasized]}
          selectable
        >
          {value}
        </Text>
        {!!words && <Text style={styles.rowWords}>{words}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  monthOptions: {
    gap: 8,
    marginTop: 0,
    marginBottom: 10,
  },
  selectedMonth: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    backgroundColor: "#F1F7FF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 18,
  },
  selectedMonthLabel: { color: "#627184", fontSize: 13 },
  selectedMonthValue: {
    flexShrink: 1,
    color: "#1677D2",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  monthRow: { flexDirection: "row", gap: 8 },
  monthChoice: {
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  monthLabel: {
    color: "#1677D2",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  monthYear: { color: "#627184", fontSize: 11, marginTop: 2 },
  fieldLabel: {
    color: "#627184",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  amountHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  amountLabel: { marginBottom: 0 },
  monthlyHint: {
    flexShrink: 1,
    color: "#172536",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    textAlign: "right",
  },
  amountWords: {
    borderWidth: 1,
    borderRadius: 10,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 8,
  },
  amountWordsLow: {
    borderColor: "#E29B9F",
    backgroundColor: "#FFF1F1",
    color: "#A62E38",
  },
  amountWordsEnough: {
    borderColor: "#8CCFA9",
    backgroundColor: "#F1FAF4",
    color: "#176B43",
  },
  paymentDifference: {
    flex: 1,
    minWidth: 0,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    paddingHorizontal: 10,
    paddingVertical: 9,
    textAlign: "center",
  },
  paymentDifferenceLow: {
    borderColor: "#E7B56E",
    backgroundColor: "#FFF7EA",
    color: "#9A5B12",
  },
  paymentDifferenceHigh: {
    borderColor: "#8DBBF0",
    backgroundColor: "#EFF7FF",
    color: "#1766B2",
  },
  paymentDifferenceEqual: {
    borderColor: "#8CCFA9",
    backgroundColor: "#F1FAF4",
    color: "#176B43",
  },
  paymentMethodIntro: {
    color: "#627184",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 14,
  },
  methodButton: {
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  methodSelected: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  submitPayment: {
    minHeight: 46,
    borderRadius: 11,
    backgroundColor: "#1677D2",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  detailPaymentButton: { marginTop: 0, marginBottom: 14, minHeight: 52 },
  footerButton: { marginTop: 0, minHeight: 52 },
  paymentFooter: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E8EDF3",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
  },
  stepSubtitle: {
    color: "#627184",
    fontSize: 15,
    marginTop: -12,
    marginBottom: 20,
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
  review: { marginTop: 8 },
  reviewIntro: {
    color: "#627184",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  reviewAmount: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#B8E3C9",
    backgroundColor: "#F1FAF4",
    paddingHorizontal: 16,
    paddingVertical: 17,
    marginBottom: 18,
  },
  reviewAmountLabel: {
    color: "#176B43",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  reviewAmountValue: {
    color: "#145C3A",
    fontSize: 27,
    fontWeight: "800",
    marginTop: 5,
  },
  reviewBalance: {
    color: "#557765",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  reviewGroup: { marginBottom: 16 },
  reviewGroupTitle: {
    color: "#172536",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 5,
  },
  reviewMethod: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#D7E8FA",
    backgroundColor: "#F1F7FF",
    borderRadius: 12,
    padding: 12,
  },
  reviewMethodIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: "#D8EBFF",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewMethodIconText: { color: "#1677D2", fontSize: 24, fontWeight: "800" },
  reviewMethodCopy: { flex: 1 },
  reviewMethodLabel: {
    color: "#627184",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  reviewMethodValue: {
    color: "#172536",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 3,
  },
  reviewTransfer: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E8EDF3",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 3,
  },
  reviewApp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 9,
  },
  reviewAppCopy: { flex: 1 },
  reviewAppName: {
    color: "#172536",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 3,
  },
  submitText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF3",
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  content: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 40 },
  back: {
    minHeight: 44,
    justifyContent: "center",
    paddingRight: 12,
  },
  headerRefresh: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerRefreshIcon: {
    color: "#1677D2",
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "600",
  },
  link: { color: "#1677D2", fontSize: 15, fontWeight: "700" },
  title: {
    flexShrink: 1,
    color: "#172536",
    fontSize: 27,
    fontWeight: "800",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 18,
  },
  titleLocationButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF3",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },
  headingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  name: { flex: 1, color: "#172536", fontSize: 22, fontWeight: "800" },
  customerId: {
    color: "#627184",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 3,
    marginBottom: 14,
  },
  balancePanel: {
    backgroundColor: "#F1F7FF",
    borderRadius: 14,
    padding: 15,
    marginBottom: 14,
  },
  balanceLabel: { color: "#627184", fontSize: 12, fontWeight: "700" },
  balanceValue: {
    color: "#172536",
    fontSize: 26,
    fontWeight: "800",
    marginTop: 3,
  },
  balanceWords: {
    color: "#627184",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
    marginBottom: 14,
  },
  balanceTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D8E5F4",
    overflow: "hidden",
  },
  balanceFill: { height: "100%", borderRadius: 4, backgroundColor: "#16865A" },
  balanceCaption: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 8,
  },
  balancePaid: { flex: 1 },
  balanceCaptionText: { color: "#627184", fontSize: 12, fontWeight: "700" },
  balancePaidWords: { color: "#627184", fontSize: 12, marginTop: 2 },
  balanceTotal: { borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  balanceTotalText: { color: "#1677D2", fontSize: 14, fontWeight: "800" },
  balanceTotalWords: { color: "#1677D2", fontSize: 12, marginTop: 3 },
  quickActions: { flexDirection: "row", gap: 7, marginBottom: 8 },
  quickAction: {
    flex: 1,
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C9DDF1",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  quickActionPrimary: { backgroundColor: "#1677D2", borderColor: "#1677D2" },
  quickActionText: {
    color: "#1677D2",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  quickActionPrimaryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  badge: {
    color: "#B76517",
    backgroundColor: "#FFF2E4",
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: "700",
  },
  badgePaid: { color: "#16865A", backgroundColor: "#E8F7F0" },
  sectionTitle: {
    color: "#172536",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F5",
  },
  rowLabel: { flex: 1, color: "#627184", fontSize: 13, lineHeight: 19 },
  rowValueGroup: { flex: 1.4, alignItems: "flex-end" },
  locationValue: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  locationLink: {
    flexShrink: 1,
    color: "#1677D2",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },
  locationIcon: { fontSize: 21, lineHeight: 26 },
  rowValue: {
    color: "#172536",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
    lineHeight: 20,
  },
  rowWords: {
    color: "#627184",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "right",
    marginTop: 2,
  },
  emphasized: { color: "#C26A1A", fontWeight: "800" },
  paymentSection: { marginBottom: 2 },
  paymentDivider: {
    height: 2,
    backgroundColor: "#C8D4E2",
    marginVertical: 8,
    marginHorizontal: 24,
  },
  paymentCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#1677D2",
    marginTop: 8,
    marginBottom: 0,
  },
  paymentAmount: { color: "#172536", fontSize: 17, fontWeight: "800" },
  paymentAmountGroup: { flex: 1 },
  paymentWords: {
    color: "#627184",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  voidedPayment: { borderLeftColor: "#A6B1BE", opacity: 0.8 },
  voidedAmount: { textDecorationLine: "line-through", color: "#627184" },
  paymentStatus: {
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusActive: { color: "#16865A", backgroundColor: "#E8F7F0" },
  statusVoided: { color: "#A62E38", backgroundColor: "#FFF1F1" },
  voidButton: { alignSelf: "flex-start", paddingVertical: 10, marginTop: 5 },
  voidButtonText: { color: "#C3333D", fontSize: 13, fontWeight: "700" },
  auditLink: { alignItems: "center", paddingVertical: 16 },
  auditLinkText: { color: "#1677D2", fontSize: 15, fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(23, 37, 54, 0.45)",
  },
  modalScroll: { flexGrow: 1, justifyContent: "center" },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 20,
  },
  modalTitle: {
    color: "#172536",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },
  modalDescription: {
    color: "#627184",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  reasonInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 11,
    padding: 12,
    color: "#172536",
    fontSize: 15,
    textAlignVertical: "top",
  },
  reasonCount: {
    color: "#627184",
    fontSize: 12,
    textAlign: "right",
    marginTop: 5,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalCancel: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#EEF1F5",
  },
  modalCancelText: { color: "#172536", fontWeight: "700" },
  modalConfirm: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#C3333D",
  },
  modalConfirmText: { color: "#FFFFFF", fontWeight: "700" },
  muted: { color: "#627184", fontSize: 13, lineHeight: 19 },
  error: { color: "#C3333D", fontSize: 14, marginBottom: 12 },
  loading: { alignItems: "center", paddingVertical: 40 },
});
