import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import {
  formatDate,
  formatMoney,
  validPaymentMonth,
  type Customer,
  type CustomerPayment,
  type PaymentMethod,
} from "./customers";
import LoadingMark from "./LoadingMark";
import { formatMoneyWithUnits, parseMoney } from "./money";
import MoneyInput from "./MoneyInput";
import PaymentMethodFields, { ProviderIcon } from "./PaymentMethodFields";
import { paymentDetailsError, paymentExtraFields, usePaymentOptions } from "./paymentOptions";
import { PullRefreshControl } from "./PullRefresh";
import { deleteStoredToken, getStoredToken } from "./session";

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
const paymentStepTitles = ["Oy va summa", "To‘lov usuli", "Tekshirish"] as const;
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
  const months = [{ value: currentPaymentMonth(), label: "Bu oy uchun to‘lov" }];
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

export default function CustomerDetailPage() {
  const insets = useSafeAreaInsets();
  const { mijoz_id } = useLocalSearchParams<{ mijoz_id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [detailNames, setDetailNames] = useState<DetailNames | null>(null);
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
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentStep, setPaymentStep] = useState<0 | 1 | 2 | 3>(0);
  const [furthestPaymentStep, setFurthestPaymentStep] = useState<1 | 2 | 3>(1);
  const scrollRef = useRef<ScrollView>(null);
  const monthlyPayment =
    customer && customer.termMonths > 0 && customer.totalPrice > customer.downPayment
      ? Math.ceil((customer.totalPrice - customer.downPayment) / customer.termMonths)
      : null;
  const paymentDifference =
    amount && monthlyPayment !== null ? Number(amount) - monthlyPayment : null;
  const availableMonths = useMemo(
    () => (customer ? paymentMonths(customer.createdAt) : []),
    [customer],
  );
  const monthRows = useMemo(
    () => Array.from(
      { length: Math.ceil(availableMonths.length / 3) },
      (_, index) => availableMonths.slice(index * 3, index * 3 + 3),
    ),
    [availableMonths],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [paymentStep]);

  function goToPaymentStep(target: 1 | 2 | 3) {
    if (savingPayment || target > furthestPaymentStep || target === paymentStep) return;
    Keyboard.dismiss();
    setPaymentError("");
    setPaymentStep(target);
  }

  function nextPaymentStep() {
    setPaymentError("");
    if (paymentStep === 0) {
      setFurthestPaymentStep(1);
      setPaymentStep(1);
      return;
    }
    if (paymentStep === 1) {
      const paymentAmount = parseMoney(amount);
      if (!customer || paymentAmount === null || paymentAmount <= 0 || paymentAmount > customer.remainingBalance) {
        setPaymentError("To‘lov summasi 0 dan katta va qolgan qarzdan oshmasligi kerak.");
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
      const detailsError = paymentDetailsError(method, cardNumber, provider, providerName, paymentOptions.options);
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
    if (
      !mijoz_id ||
      !/^[1-9]\d*$/.test(mijoz_id) ||
      !Number.isSafeInteger(Number(mijoz_id))
    ) {
      setError("Mijoz raqami noto'g'ri.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setCustomer(null);
    setDetailNames(null);
    try {
      const token = await getStoredToken();
      if (!token) {
        router.replace("/");
        return;
      }
      setPaymentToken(token);
      const result = await apiRequest<{ customer: Customer }>(
        `/customers/${mijoz_id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const names = await resolveDetailNames(result.customer, token);
      setDetailNames(names);
      setCustomer(result.customer);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await deleteStoredToken();
        router.replace("/");
      } else
        setError(
          cause instanceof Error
            ? cause.message
            : "Mijoz ma’lumotlari yuklanmadi.",
        );
    } finally {
      setLoading(false);
    }
  }, [mijoz_id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function addPayment() {
    const paymentAmount = parseMoney(amount);
    if (!customer || !mijoz_id || !/^[1-9]\d*$/.test(mijoz_id)) return;
    if (
      paymentAmount === null ||
      paymentAmount <= 0 ||
      paymentAmount > customer.remainingBalance
    ) {
      setPaymentError(
        "To'lov summasi 0 dan katta va qolgan qarzdan oshmasligi kerak.",
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
      setPaymentError("To'lov oyini YYYY-MM shaklida kiriting.");
      return;
    }
    setSavingPayment(true);
    setPaymentError("");
    try {
      const token = await getStoredToken();
      if (!token) {
        router.replace("/");
        return;
      }
      const result = await apiRequest<{
        paymentId: string;
        payment: CustomerPayment;
        customer: Customer;
      }>(`/customers/${mijoz_id}/payments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount: paymentAmount,
          method,
          ...(selectedMonth ? { forMonth: selectedMonth } : {}),
          ...paymentExtraFields(method!, cardNumber, provider, providerName),
        }),
      });
      setAmount("");
      setMethod(null);
      setCardNumber("");
      setProvider("");
      setProviderName("");
      setForMonth(currentPaymentMonth());
      setCustomer(result.customer);
      setPaymentStep(0);
      setFurthestPaymentStep(1);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await deleteStoredToken();
        router.replace("/");
      } else {
        setPaymentError(
          cause instanceof Error ? cause.message : "To'lov saqlanmadi.",
        );
        if (cause instanceof ApiError && cause.status === 409) void load();
      }
    } finally {
      setSavingPayment(false);
    }
  }

  return (
    <View style={styles.screen}>
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={paymentStep === 0 ? (
        <PullRefreshControl
          refreshing={loading || paymentOptions.loading}
          onRefresh={() => {
            void Promise.all([load(), paymentOptions.reload()]);
          }}
        />
      ) : undefined}
    >
      <Pressable
        onPress={() => {
          if (savingPayment) return;
          setPaymentError("");
          if (paymentStep > 1) goToPaymentStep((paymentStep - 1) as 1 | 2);
          else if (paymentStep === 1) {
            Keyboard.dismiss();
            setPaymentStep(0);
          }
          else router.back();
        }}
        style={styles.back}
        accessibilityRole="button"
      >
        <Text style={styles.link}>{paymentStep > 0 ? "‹ Orqaga" : "‹ Mijozlarga qaytish"}</Text>
      </Pressable>
      <Text style={styles.title}>{paymentStep > 0 ? "Keyingi to‘lov" : "Mijoz ma’lumotlari"}</Text>
      {customer && !loading && paymentStep > 0 && (
        <>
          <Text style={styles.stepSubtitle}>{paymentStep}/3 · {paymentStepTitles[paymentStep - 1]}</Text>
          <View style={styles.progress}>
            {paymentStepTitles.map((title, index) => {
              const step = (index + 1) as 1 | 2 | 3;
              const visited = step <= furthestPaymentStep;
              return (
                <Pressable
                  key={title}
                  onPress={() => goToPaymentStep(step)}
                  disabled={!visited || step === paymentStep || savingPayment}
                  accessibilityRole="button"
                  accessibilityLabel={`${step}-qadam: ${title}`}
                  accessibilityState={{ selected: step === paymentStep, disabled: !visited || step === paymentStep || savingPayment }}
                  style={[
                    styles.progressSegment,
                    step < paymentStep && styles.progressSegmentCompleted,
                    step > paymentStep && visited && styles.progressSegmentVisitedNext,
                    step === paymentStep && styles.progressSegmentCurrent,
                  ]}
                >
                  <Text style={[
                    styles.progressNumber,
                    step < paymentStep && styles.progressTextCompleted,
                    step > paymentStep && visited && styles.progressTextVisitedNext,
                    step === paymentStep && styles.progressTextCurrent,
                  ]}>{step}</Text>
                  <Text style={[
                    styles.progressLabel,
                    step < paymentStep && styles.progressTextCompleted,
                    step > paymentStep && visited && styles.progressTextVisitedNext,
                    step === paymentStep && styles.progressTextCurrent,
                  ]} numberOfLines={1}>{paymentStepLabels[index]}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
      {loading && (
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
      {customer && !loading && (
        <>
          {paymentStep === 0 && (
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
                {customer.remainingBalance > 0 ? "Qarzi bor" : "To'langan"}
              </Text>
            </View>
            <Row label="Asosiy telefon" value={customer.phoneNumber} />
            {!!customer.addPhoneNumber && (
              <Row label="Qo'shimcha telefon" value={customer.addPhoneNumber} />
            )}
            <Row
              label="Yaratilgan sana"
              value={formatDate(customer.createdAt)}
            />
            <Row label="Mijoz raqami" value={String(customer.mijoz_id)} />
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Savdo va nasiya</Text>
            <Row
              label="Mahsulot"
              value={detailNames?.product || customer.productName}
            />
            <Row label="Umumiy narx" value={formatMoney(customer.totalPrice)} />
            <Row
              label="Boshlang'ich to'lov"
              value={formatMoney(customer.downPayment)}
            />
            <Row
              label="Jami to'langan"
              value={formatMoney(customer.totalPaid)}
            />
            <Row
              label="Qolgan qarz"
              value={formatMoney(customer.remainingBalance)}
              emphasized
            />
            <Row label="Nasiya muddati" value={`${customer.termMonths} oy`} />
            {!!customer.description && (
              <Row label="Izoh" value={customer.description} />
            )}
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Hudud va ma’lumotlar</Text>
            <Row label="Hudud" value={detailNames?.region || unavailable} />
            {customer.lat !== null && customer.long !== null && (
              <Row
                label="Joylashuv"
                value={`${customer.lat}, ${customer.long}`}
              />
            )}
            {!!customer.groupId && (
              <Row label="Guruh" value={detailNames?.group || unavailable} />
            )}
            {!!customer.sectionId && (
              <Row label="Bo'lim" value={detailNames?.section || unavailable} />
            )}
            <Row
              label="Yaratgan xodim"
              value={`${detailNames?.users[customer.createdBy] || "Xodim nomi topilmadi"} · ${roleNames[customer.createdByRole]}`}
            />
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              To‘lovlar ({customer.payments.length})
            </Text>
            {customer.payments.length === 0 && (
              <Text style={styles.muted}>To‘lovlar yo‘q.</Text>
            )}
            {customer.payments.map((payment) => (
              <View key={payment.paymentId || payment.id} style={styles.payment}>
                <View style={styles.headingRow}>
                  <Text style={styles.paymentAmount}>
                    {formatMoney(payment.amount)}
                  </Text>
                  <Text style={styles.muted}>
                    {payment.type === "initial"
                      ? "Boshlang'ich"
                      : "Keyingi to'lov"}
                  </Text>
                </View>
                <Row
                  label="Usul"
                  value={payment.method === "payment_app" ? "O‘tkazma" : paymentOptions.options?.methods.find((item) => item.id === payment.method)?.label || methods[payment.method]}
                />
                {!!payment.cardLast4 && (
                  <Row label="Karta" value={`•••• ${payment.cardLast4}`} />
                )}
                {!!payment.provider && (
                  <Row
                    label="Ilova"
                    value={payment.providerName || paymentOptions.options?.providers.find((item) => item.id === payment.provider)?.label || payment.provider}
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
              </View>
            ))}
          </View>
          </>
          )}
          {paymentStep > 0 && customer.remainingBalance > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                {paymentStep === 1 ? "Oy va summa" : paymentStep === 2 ? "Qanday to‘langan?" : "To‘lovni tekshirish"}
              </Text>
              {paymentStep === 1 && (
              <>
              <Text style={styles.muted}>
                Istalgan vaqtda, qolgan qarzgacha bo‘lgan summani to‘lashingiz
                mumkin.
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
                          forMonth === item.value && styles.methodSelected,
                        ]}
                        onPress={() => {
                          setForMonth(item.value);
                          setPaymentError("");
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: forMonth === item.value }}
                      >
                        {item.value === availableMonths[0]?.value ? (
                          <Text style={styles.monthLabel}>Bu oy uchun to‘lov</Text>
                        ) : (
                          <>
                            <Text style={styles.monthLabel} numberOfLines={1}>
                              {item.label.split(" ")[0]}
                            </Text>
                            <Text style={styles.monthYear}>{item.value.slice(0, 4)}</Text>
                          </>
                        )}
                      </Pressable>
                    ))}
                    {Array.from({ length: 3 - row.length }, (_, index) => (
                      <View key={`empty-${index}`} style={styles.monthChoice} />
                    ))}
                  </View>
                ))}
              </View>
              <View style={styles.selectedMonth}>
                <Text style={styles.selectedMonthLabel}>Tanlangan oy</Text>
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
              <Text style={styles.paymentMethodIntro}>To‘lov qanday qabul qilinganini tanlang.</Text>
              {paymentOptions.options ? (
                <PaymentMethodFields
                  presentation="step"
                  options={paymentOptions.options}
                  method={method}
                  onMethodChange={(value) => { setMethod(value); setPaymentError(""); }}
                  cardNumber={cardNumber}
                  onCardNumberChange={(value) => { setCardNumber(value); setPaymentError(""); }}
                  provider={provider}
                  onProviderChange={(value) => { setProvider(value); setPaymentError(""); }}
                  providerName={providerName}
                  onProviderNameChange={(value) => { setProviderName(value); setPaymentError(""); }}
                  disabled={savingPayment}
                />
              ) : (
                <Pressable onPress={() => void paymentOptions.reload()} accessibilityRole="button">
                  <Text style={styles.link}>
                    {paymentOptions.loading ? "To‘lov usullari yuklanmoqda..." : `${paymentOptions.error || "To‘lov usullari topilmadi."} Qayta yuklash`}
                  </Text>
                </Pressable>
              )}
              </>
              )}
              {paymentStep === 3 && (
                <View style={styles.review}>
                  <Text style={styles.reviewIntro}>Ma’lumotlarni tekshiring, so‘ng to‘lovni saqlang.</Text>
                  <View style={styles.reviewAmount}>
                    <Text style={styles.reviewAmountLabel}>TO‘LOV SUMMASI</Text>
                    <Text style={styles.reviewAmountValue}>{formatMoney(parseMoney(amount) || 0)}</Text>
                    <Text style={styles.reviewBalance}>
                      To‘lovdan keyingi qoldiq: {formatMoney(Math.max(0, customer.remainingBalance - (parseMoney(amount) || 0)))}
                    </Text>
                  </View>
                  <View style={styles.reviewGroup}>
                    <Text style={styles.reviewGroupTitle}>To‘lov tafsilotlari</Text>
                    <Row label="Mijoz" value={customer.name} />
                    <Row label="Qaysi oy uchun" value={formatPaymentMonth(forMonth)} />
                  </View>
                  <View style={styles.reviewMethod}>
                    <View style={styles.reviewMethodIcon}>
                      <Text style={styles.reviewMethodIconText}>{method === "cash" ? "💵" : "↗"}</Text>
                    </View>
                    <View style={styles.reviewMethodCopy}>
                      <Text style={styles.reviewMethodLabel}>TO‘LOV USULI</Text>
                      <Text style={styles.reviewMethodValue}>{method === "cash" ? "Naqd" : "O‘tkazma"}</Text>
                    </View>
                  </View>
                  {method === "payment_app" && (
                    <View style={styles.reviewTransfer}>
                      <View style={styles.reviewApp}>
                        <ProviderIcon id={provider} />
                        <View style={styles.reviewAppCopy}>
                          <Text style={styles.reviewMethodLabel}>TO‘LOV ILOVASI</Text>
                          <Text style={styles.reviewAppName}>
                            {providerName || paymentOptions.options?.providers.find((item) => item.id === provider)?.label || provider}
                          </Text>
                        </View>
                      </View>
                      <Row label="Pul yuborilgan karta" value={cardNumber.replace(/(.{4})/g, "$1 ").trim()} />
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
          {paymentStep === 0 && (
          <Pressable
            style={styles.refresh}
            onPress={() => void load()}
            accessibilityRole="button"
          >
            <Text style={styles.link}>Ma’lumotlarni yangilash</Text>
          </Pressable>
          )}
        </>
      )}
    </ScrollView>
    {customer && !loading && customer.remainingBalance > 0 && (
      <View style={[styles.paymentFooter, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <Pressable
          style={[styles.submitPayment, styles.footerButton, savingPayment && styles.disabled]}
          onPress={nextPaymentStep}
          disabled={savingPayment}
          accessibilityRole="button"
        >
          <Text style={styles.submitText}>
            {savingPayment ? "Saqlanmoqda..." : paymentStep === 0 ? "To‘lov qilish" : paymentStep === 3 ? "To‘lovni saqlash" : "Davom etish"}
          </Text>
        </Pressable>
      </View>
    )}
    </View>
  );
}

function Row({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, emphasized && styles.emphasized]}
        selectable
      >
        {value}
      </Text>
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
  fieldLabel: { color: "#627184", fontSize: 13, lineHeight: 19, marginBottom: 8 },
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
  paymentMethodIntro: { color: "#627184", fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 14 },
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
  footerButton: { marginTop: 0, minHeight: 52 },
  paymentFooter: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E8EDF3",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
  },
  stepSubtitle: { color: "#627184", fontSize: 15, marginTop: -12, marginBottom: 20 },
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
  reviewIntro: { color: "#627184", fontSize: 13, lineHeight: 19, marginBottom: 16 },
  reviewAmount: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#B8E3C9",
    backgroundColor: "#F1FAF4",
    paddingHorizontal: 16,
    paddingVertical: 17,
    marginBottom: 18,
  },
  reviewAmountLabel: { color: "#176B43", fontSize: 11, fontWeight: "800", letterSpacing: 0.7 },
  reviewAmountValue: { color: "#145C3A", fontSize: 27, fontWeight: "800", marginTop: 5 },
  reviewBalance: { color: "#557765", fontSize: 12, lineHeight: 17, marginTop: 8 },
  reviewGroup: { marginBottom: 16 },
  reviewGroupTitle: { color: "#172536", fontSize: 14, fontWeight: "800", marginBottom: 5 },
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
  reviewMethodIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: "#D8EBFF", alignItems: "center", justifyContent: "center" },
  reviewMethodIconText: { color: "#1677D2", fontSize: 24, fontWeight: "800" },
  reviewMethodCopy: { flex: 1 },
  reviewMethodLabel: { color: "#627184", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  reviewMethodValue: { color: "#172536", fontSize: 16, fontWeight: "800", marginTop: 3 },
  reviewTransfer: { marginTop: 10, borderWidth: 1, borderColor: "#E8EDF3", borderRadius: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 3 },
  reviewApp: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 9 },
  reviewAppCopy: { flex: 1 },
  reviewAppName: { color: "#172536", fontSize: 14, fontWeight: "700", marginTop: 3 },
  submitText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 18, paddingTop: 54, paddingBottom: 40 },
  back: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingRight: 20,
    marginBottom: 12,
  },
  link: { color: "#1677D2", fontSize: 15, fontWeight: "700" },
  title: {
    color: "#172536",
    fontSize: 27,
    fontWeight: "800",
    marginBottom: 18,
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
  rowValue: {
    flex: 1.4,
    color: "#172536",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
    lineHeight: 20,
  },
  emphasized: { color: "#C26A1A", fontWeight: "800" },
  payment: {
    borderTopWidth: 1,
    borderTopColor: "#E8EDF3",
    marginTop: 12,
    paddingTop: 12,
  },
  paymentAmount: { color: "#172536", fontSize: 17, fontWeight: "800" },
  muted: { color: "#627184", fontSize: 13, lineHeight: 19 },
  error: { color: "#C3333D", fontSize: 14, marginBottom: 12 },
  loading: { alignItems: "center", paddingVertical: 40 },
  refresh: { alignItems: "center", paddingVertical: 18 },
});
