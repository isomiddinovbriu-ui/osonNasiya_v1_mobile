import { BlurTargetView, BlurView } from "expo-blur";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import { formatDate, formatMoney, validPaymentMonth, type Customer, type CustomerPayment } from "./customers";
import LoadingMark from "./LoadingMark";
import { formatMoneyWithUnits } from "./money";
import { fullCardForLast4 } from "./paymentOptions";
import { PullRefreshControl, PullRefreshFeedback } from "./PullRefresh";
import { deleteStoredToken, getStoredToken } from "./session";

type AuditEntry = {
  id?: string;
  action: string;
  entityId: string | number;
  actorName: string;
  actorId: string;
  createdAt: string;
  before: unknown;
  after: unknown;
};
type AuditResponse = { entries: AuditEntry[]; total: number; page: number; limit: number };

const methods: Record<string, string> = {
  cash: "Naqd",
  transfer: "O‘tkazma",
  card: "Bank kartasi",
  payment_app: "To‘lov ilovasi",
};
const monthNames = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

function formatPaymentMonth(value: string) {
  if (!validPaymentMonth(value)) return value;
  const [year, month] = value.split("-").map(Number);
  return `${monthNames[month - 1]} ${year}`;
}

const fieldNames: Record<string, string> = {
  amount: "Summa",
  method: "Usul",
  forMonth: "Qaysi oy uchun",
  cardLast4: "Karta oxirgi raqamlari",
  cardNumber: "Karta raqami",
  provider: "Ilova",
  providerName: "Ilova nomi",
};
const methodFields = new Set(["method", "cardLast4", "cardNumber", "provider", "providerName"]);

function paymentMethodDetails(value: unknown) {
  const fields = flattenSnapshot(snapshotValue(value));
  const field = (key: string) => fields[key] ?? fields[`payment.${key}`];
  const method = field("method");
  const providerName = field("providerName");
  const provider = field("provider");
  const card = field("cardLast4") ?? field("cardNumber");
  const app = typeof providerName === "string" && providerName
    ? providerName
    : typeof provider === "string" && provider
      ? provider === "other" ? "Boshqa ilova" : provider
      : null;
  const last4 = typeof card === "string" && card ? card.slice(-4) : null;
  return {
    method: typeof method === "string" && method ? methods[method] || method : null,
    app: method !== "cash" && app ? `${app.charAt(0).toLocaleUpperCase("uz-UZ")}${app.slice(1)}` : null,
    last4: method !== "cash" ? last4 : null,
    fullCard: last4 ? fullCardForLast4(last4) : null,
  };
}

function readableValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "amount") {
    return typeof value === "number" ? formatMoney(value) : String(value);
  }
  if (key === "method") return methods[String(value)] || String(value);
  if (key === "forMonth") return formatPaymentMonth(String(value));
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function snapshotValue(value: unknown) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

function flattenSnapshot(value: unknown, path = "", result: Record<string, unknown> = {}) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0 && path) result[path] = value;
    for (const [key, child] of entries) flattenSnapshot(child, path ? `${path}.${key}` : key, result);
  } else if (path) result[path] = value;
  return result;
}

function changedFields(before: unknown, after: unknown) {
  const oldValues = flattenSnapshot(snapshotValue(before));
  const newValues = flattenSnapshot(snapshotValue(after));
  return [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])]
    .filter((key) => {
      const field = key.startsWith("payment.") ? key.slice("payment.".length) : key;
      return Object.hasOwn(fieldNames, field) && JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key]);
    })
    .map((key) => ({ key, before: oldValues[key], after: newValues[key] }));
}

function moneyValue(value: unknown) {
  const amount = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;
  return amount !== null && Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function snapshotBalance(value: unknown) {
  const fields = flattenSnapshot(snapshotValue(value));
  return moneyValue(fields.remainingBalance ?? fields["customer.remainingBalance"]);
}

function auditDebtChanges(edits: AuditEntry[], latestBalance: number | null) {
  let nextBalance = latestBalance;
  return edits.map((entry) => {
    const amount = changedFields(entry.before, entry.after).find(
      (change) => change.key === "amount" || change.key === "payment.amount",
    );
    const oldAmount = moneyValue(amount?.before);
    const newAmount = moneyValue(amount?.after);
    const recordedBefore = snapshotBalance(entry.before);
    const recordedAfter = snapshotBalance(entry.after);
    const after = recordedAfter ?? nextBalance;
    const before = recordedBefore ?? (
      after !== null && oldAmount !== null && newAmount !== null
        ? after + newAmount - oldAmount
        : null
    );
    nextBalance = before ?? after;
    if (oldAmount === null || newAmount === null || oldAmount === newAmount ||
      before === null || after === null ||
      !Number.isSafeInteger(before) || !Number.isSafeInteger(after) ||
      before < 0 || after < 0) return null;
    return { before, after };
  });
}

function AuditMethodState({
  label,
  snapshot,
  tone,
  onOpenCard,
}: {
  label: string;
  snapshot: unknown;
  tone: "old" | "new";
  onOpenCard: (card: string) => void;
}) {
  const details = paymentMethodDetails(snapshot);
  const valueStyle = tone === "old" ? styles.oldValue : styles.newValue;
  const fullCard = details.fullCard;
  return <View style={styles.methodState}>
    <Text style={styles.methodStateLabel}>{label}</Text>
    <Text style={valueStyle}>{details.method || "Usul saqlanmagan"}</Text>
    {!!details.app && <Text style={valueStyle}>Ilova: {details.app}</Text>}
    {!!details.last4 && (fullCard ?
      <Pressable onPress={() => onOpenCard(fullCard)} accessibilityRole="button" accessibilityLabel={`Oxiri ${details.last4} bo‘lgan kartani to‘liq ko‘rish`} style={styles.cardLinkButton}>
        <Text style={[valueStyle, styles.cardLink]}>Karta: •••• {details.last4}</Text>
      </Pressable>
      : <Text style={valueStyle}>Karta: •••• {details.last4}</Text>)}
  </View>;
}

function AuditChanges({ entry, onOpenCard }: { entry: AuditEntry; onOpenCard: (card: string) => void }) {
  const changes = changedFields(entry.before, entry.after);
  if (changes.length > 0) return <>
    {changes.filter((change) => !methodFields.has(change.key.split(".").at(-1) || "")).map((change) => {
    const name = change.key.split(".").at(-1) || change.key;
    return <View key={change.key} style={styles.change}>
      <Text style={styles.changeLabel}>{fieldNames[name] || change.key}</Text>
      <Text style={styles.oldValue}>{readableValue(name, change.before)}</Text>
      <Text style={styles.newValue}>→ {readableValue(name, change.after)}</Text>
    </View>;
    })}
    {changes.some((change) => methodFields.has(change.key.split(".").at(-1) || "")) &&
      <View style={styles.change}>
        <Text style={styles.changeLabel}>To‘lov usuli va rekvizitlar</Text>
        <AuditMethodState label="Oldin" snapshot={entry.before} tone="old" onOpenCard={onOpenCard} />
        <AuditMethodState label="Keyin" snapshot={entry.after} tone="new" onOpenCard={onOpenCard} />
      </View>}
  </>;
  if (entry.before == null && entry.after == null) {
    return <Text style={styles.muted}>Bu yozuv uchun oldingi va keyingi qiymatlar saqlanmagan.</Text>;
  }
  return <Text style={styles.muted}>To‘lov ma’lumotlarida ko‘rsatiladigan o‘zgarish yo‘q.</Text>;
}

export default function PaymentDetailPage() {
  const insets = useSafeAreaInsets();
  const { mijoz_id, paymentId } = useLocalSearchParams<{ mijoz_id: string; paymentId: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [payment, setPayment] = useState<CustomerPayment | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<AuditEntry[]>([]);
  const [paymentCreatedAt, setPaymentCreatedAt] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const loadingRef = useRef(false);
  const blurTargetRef = useRef<View | null>(null);

  useEffect(() => {
    if (!selectedCard) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelectedCard(null);
      return true;
    });
    return () => subscription.remove();
  }, [selectedCard]);

  const load = useCallback(async (refresh = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!mijoz_id || !/^[1-9]\d*$/.test(mijoz_id) || !Number.isSafeInteger(Number(mijoz_id)) || !paymentId) {
      setError("To‘lov manzili noto‘g‘ri.");
      setLoading(false);
      loadingRef.current = false;
      return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    setHistoryError("");
    setPaymentCreatedAt(null);
    try {
      const token = await getStoredToken();
      if (!token) { router.replace("/"); return; }
      const headers = { Authorization: `Bearer ${token}` };
      const [customerResult, session, usersResult] = await Promise.all([
        apiRequest<{ customer: Customer }>(`/customers/${mijoz_id}`, { headers }),
        apiRequest<{ user: User }>("/auth/me", { headers }),
        apiRequest<{ users: User[] }>("/users", { headers }).catch(() => null),
      ]);
      const selected = customerResult.customer.payments.find((item) =>
        item.paymentId === paymentId || item.id === paymentId,
      );
      if (!selected) throw new Error("To‘lov topilmadi.");
      setCustomer(customerResult.customer);
      setPayment(selected);
      const names = Object.fromEntries((usersResult?.users || []).map((user) => [user.id, user.name || user.login]));
      names[session.user.id] = session.user.name || session.user.login;
      setUserNames(names);
      setReceiverName(names[selected.receivedBy] || selected.receivedBy);

      try {
        const entries: AuditEntry[] = [];
        let createdAt: string | null = null;
        let page = 1;
        let total = 0;
        let limit = 100;
        do {
          const result = await apiRequest<AuditResponse>(
            `/customers/${mijoz_id}/audit?page=${page}&limit=100`, { headers },
          );
          for (const entry of result.entries) {
            if (String(entry.entityId) !== selected.paymentId && String(entry.entityId) !== selected.id) continue;
            if (entry.action === "payment.updated") entries.push(entry);
            if (entry.action === "payment.created") createdAt = entry.createdAt;
          }
          total = result.total;
          limit = result.limit;
          page += 1;
          if (result.entries.length === 0) break;
        } while ((page - 1) * limit < total);
        setEdits(entries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
        setPaymentCreatedAt(createdAt);
      } catch (cause) {
        setHistoryError(cause instanceof Error ? cause.message : "Tahrirlar tarixi yuklanmadi.");
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await deleteStoredToken();
        router.replace("/");
      } else setError(cause instanceof Error ? cause.message : "To‘lov yuklanmadi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadingRef.current = false;
    }
  }, [mijoz_id, paymentId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const isLatestActivePayment = !!customer && !!payment && customer.payments
    .filter((item) => item.status !== "voided")
    .every((item) =>
      item.id === payment.id || Date.parse(item.paidAt) <= Date.parse(payment.paidAt),
    );
  const debtChanges = auditDebtChanges(
    edits,
    isLatestActivePayment ? customer.remainingBalance : payment?.remainingBalanceAfter ?? null,
  );
  const paymentFullCard = payment?.cardLast4 ? fullCardForLast4(payment.cardLast4) : null;

  return <View style={styles.screen}>
    <BlurTargetView ref={blurTargetRef} style={styles.screen} importantForAccessibility={selectedCard ? "no-hide-descendants" : "auto"}>
    <View style={[styles.stickyHeader, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.back}>
        <Text style={styles.link}>‹ To‘lovlarga qaytish</Text>
      </Pressable>
    </View>
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: 18, paddingBottom: insets.bottom + 40 }]} refreshControl={<PullRefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} />}>
    <Text style={styles.title}>To‘lov tafsilotlari</Text>
    {customer && <Text style={styles.subtitle}>{customer.name} · Mijoz #{customer.mijoz_id}</Text>}
    <PullRefreshFeedback active={refreshing} />
    {loading && <View style={styles.loading}><LoadingMark size={64} /><Text style={styles.muted}>Yuklanmoqda...</Text></View>}
    {!!error && <View style={styles.card}><Text style={styles.error}>{error}</Text><Pressable onPress={() => void load()} accessibilityRole="button"><Text style={styles.link}>Qayta yuklash</Text></Pressable></View>}
    {!loading && !error && payment && <>
      <View style={[styles.card, styles.paymentCard]}>
        <View style={styles.heading}><View style={styles.amountGroup}><Text style={styles.amount}>{formatMoney(payment.amount)}</Text><Text style={styles.mutedSmall}>{formatMoneyWithUnits(payment.amount, true)}</Text></View><Text style={[styles.badge, payment.status === "voided" ? styles.voided : styles.active]}>{payment.status === "voided" ? "Bekor qilingan" : "Faol"}</Text></View>
        {payment.remainingBalanceAfter != null && <Row label="To‘lovdan keyin qolgan qarz" value={formatMoney(payment.remainingBalanceAfter)} />}
        <Row label="Turi" value={payment.type === "initial" ? "Boshlang‘ich" : "Keyingi to‘lov"} />
        <Row label="Usul" value={methods[payment.method] || payment.method} />
        {!!payment.cardLast4 && <View style={styles.row}>
          <Text style={styles.rowLabel}>Karta</Text>
          {paymentFullCard ? <Pressable
            onPress={() => setSelectedCard(paymentFullCard)}
            accessibilityRole="button"
            accessibilityLabel={`Oxiri ${payment.cardLast4} bo‘lgan kartani to‘liq ko‘rish`}
            style={styles.rowCardButton}
          >
            <Text style={styles.rowCardValue}>•••• {payment.cardLast4}</Text>
          </Pressable> : <Text style={styles.rowValue}>•••• {payment.cardLast4}</Text>}
        </View>}
        {!!payment.provider && <Row label="Ilova" value={payment.providerName || payment.provider} />}
        {!!payment.forMonth && <Row label="Qaysi oy uchun" value={formatPaymentMonth(payment.forMonth)} />}
        {!!paymentCreatedAt && <Row label="To‘lov yaratilgan sana" value={formatDate(paymentCreatedAt)} />}
        <Row label="Qabul qilingan sana" value={formatDate(payment.paidAt)} />
        <Row label="Qabul qilgan" value={receiverName} />
        {payment.status === "voided" && <>
          {!!payment.voidedAt && <Row label="Bekor qilingan sana" value={formatDate(payment.voidedAt)} />}
          {!!payment.voidedBy && <Row label="Bekor qilgan" value={payment.voidedByName || payment.voidedBy} />}
          {!!payment.voidReason && <Row label="Sabab" value={payment.voidReason} />}
        </>}
      </View>
      {customer && <>
        <Text style={styles.sectionTitle}>Xarid va balans</Text>
        <View style={styles.card}>
          <Row label="Mahsulot nomi" value={customer.productName} />
          <Row label="Sotilgan narx" value={formatMoney(customer.totalPrice)} />
          <Row label="Boshlang‘ich to‘lov" value={formatMoney(customer.downPayment)} />
          <Row label="Nasiya muddati" value={`${customer.termMonths} oy`} />
          <Row label="Jami to‘langan" value={formatMoney(customer.totalPaid)} />
          <Row label="Hozirgi qolgan qarz" value={formatMoney(customer.remainingBalance)} />
          <Row label="Mijoz yozuvi yaratilgan sana" value={formatDate(customer.createdAt)} />
        </View>
      </>}
      <Text style={styles.sectionTitle}>Tahrirlar tarixi</Text>
      {historyError ? <View style={styles.card}><Text style={styles.error}>{historyError}</Text><Pressable onPress={() => void load()} accessibilityRole="button"><Text style={styles.link}>Qayta yuklash</Text></Pressable></View>
        : edits.length === 0 ? <View style={styles.card}><Text style={styles.muted}>Bu to‘lov uchun tahrir yozuvi topilmadi. Eski o‘zgarishlar auditga yozilmagan bo‘lishi mumkin.</Text></View>
        : edits.map((entry, index) => <View key={`${entry.id || entry.createdAt}-${index}`} style={styles.card}>
          <Text style={styles.editTitle}>To‘lov tahrirlandi</Text>
          <Text style={styles.editMeta}>{formatDate(entry.createdAt)}</Text>
          <Row label="O‘zgartirgan xodim" value={userNames[entry.actorId] || (/^[a-f\d]{24}$/i.test(entry.actorName) ? "Xodim nomi topilmadi" : entry.actorName) || "Noma’lum"} />
          <AuditChanges entry={entry} onOpenCard={setSelectedCard} />
          {debtChanges[index] && <View style={styles.change}>
            <Text style={styles.changeLabel}>Tahrirdan oldingi qarz</Text>
            <Text style={styles.oldValue}>{formatMoney(debtChanges[index].before)}</Text>
            <Text style={[styles.changeLabel, styles.debtAfterLabel]}>Tahrirdan keyingi qarz</Text>
            <Text style={styles.newValue}>→ {formatMoney(debtChanges[index].after)}</Text>
          </View>}
        </View>)}
    </>}
    </ScrollView>
    </BlurTargetView>
    {!!selectedCard && <View style={styles.cardOverlay} accessibilityViewIsModal>
      <BlurView blurTarget={blurTargetRef} blurMethod="dimezisBlurView" intensity={75} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.cardScrim} />
      <View style={styles.fullCardModal}>
        <Text style={styles.fullCardTitle} accessibilityRole="header">Karta raqami</Text>
        <Text style={styles.fullCardNumber} selectable>{selectedCard.replace(/(\d{4})(?=\d)/g, "$1 ")}</Text>
        <Pressable style={styles.fullCardClose} onPress={() => setSelectedCard(null)} accessibilityRole="button">
          <Text style={styles.fullCardCloseText}>Yopish</Text>
        </Pressable>
      </View>
    </View>}
  </View>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 18 },
  stickyHeader: { paddingHorizontal: 18, paddingBottom: 8, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E8EDF3" },
  back: { alignSelf: "flex-start", paddingVertical: 10 },
  link: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  title: { color: "#172536", fontSize: 26, fontWeight: "800" },
  subtitle: { color: "#627184", fontSize: 14, marginTop: 5, marginBottom: 18 },
  loading: { alignItems: "center", paddingVertical: 40 },
  muted: { color: "#627184", fontSize: 14, lineHeight: 20 },
  mutedSmall: { color: "#718097", fontSize: 12, marginTop: 3 },
  error: { color: "#C3333D", fontSize: 14, marginBottom: 10 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#E8EDF3" },
  paymentCard: { borderLeftWidth: 4, borderLeftColor: "#1677D2" },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  amountGroup: { flex: 1 },
  amount: { color: "#172536", fontSize: 18, fontWeight: "800" },
  badge: { fontSize: 12, fontWeight: "800", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  active: { color: "#16865A", backgroundColor: "#E8F7F0" },
  voided: { color: "#A62E38", backgroundColor: "#FFF1F1" },
  row: { flexDirection: "row", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#EEF1F5" },
  rowLabel: { flex: 1, color: "#718097", fontSize: 13, lineHeight: 19 },
  rowValue: { flex: 1.5, color: "#172536", fontSize: 13, fontWeight: "600", textAlign: "right", lineHeight: 19 },
  rowCardButton: { flex: 1.5, alignItems: "flex-end" },
  rowCardValue: { color: "#1677D2", fontSize: 13, fontWeight: "600", textDecorationLine: "underline", lineHeight: 19 },
  sectionTitle: { color: "#172536", fontSize: 17, fontWeight: "800", marginTop: 10, marginBottom: 12 },
  editTitle: { color: "#172536", fontSize: 16, fontWeight: "800" },
  editMeta: { color: "#627184", fontSize: 12, marginTop: 4, marginBottom: 12 },
  change: { borderTopWidth: 1, borderTopColor: "#EEF1F5", paddingVertical: 9 },
  changeLabel: { color: "#627184", fontSize: 12, marginBottom: 4 },
  oldValue: { color: "#A62E38", fontSize: 13 },
  newValue: { color: "#16865A", fontSize: 13, fontWeight: "700", marginTop: 3 },
  debtAfterLabel: { marginTop: 9 },
  methodState: { marginTop: 8, gap: 5 },
  methodStateLabel: { color: "#627184", fontSize: 12, fontWeight: "700" },
  cardLinkButton: { alignSelf: "flex-start" },
  cardLink: { color: "#1677D2", textDecorationLine: "underline" },
  cardOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", padding: 20 },
  cardScrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(23, 37, 54, 0.2)" },
  fullCardModal: { width: "100%", maxWidth: 360, borderRadius: 20, backgroundColor: "#FFFFFF", padding: 22, alignItems: "center", shadowColor: "#263A52", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 },
  fullCardTitle: { color: "#172536", fontSize: 19, fontWeight: "800" },
  fullCardNumber: { color: "#172536", fontSize: 20, fontWeight: "800", marginTop: 18, marginBottom: 22, textAlign: "center" },
  fullCardClose: { width: "100%", minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#1677D2" },
  fullCardCloseText: { color: "#FFFFFF", fontWeight: "700" },
});
