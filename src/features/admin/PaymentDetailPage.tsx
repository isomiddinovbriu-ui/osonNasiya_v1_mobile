import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import { formatDate, formatMoney, type Customer, type CustomerPayment } from "./customers";
import LoadingMark from "./LoadingMark";
import { formatMoneyWithUnits } from "./money";
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
const fieldNames: Record<string, string> = {
  amount: "Summa",
  method: "Usul",
  forMonth: "Qaysi oy uchun",
  cardLast4: "Karta oxirgi raqamlari",
  provider: "Ilova",
  providerName: "Ilova nomi",
};

function readableValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "amount") {
    return typeof value === "number" ? formatMoney(value) : String(value);
  }
  if (key === "method") return methods[String(value)] || String(value);
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

function AuditChanges({ entry }: { entry: AuditEntry }) {
  const changes = changedFields(entry.before, entry.after);
  if (changes.length > 0) return changes.map((change) => {
    const name = change.key.split(".").at(-1) || change.key;
    return <View key={change.key} style={styles.change}>
      <Text style={styles.changeLabel}>{fieldNames[name] || change.key}</Text>
      <Text style={styles.oldValue}>{readableValue(name, change.before)}</Text>
      <Text style={styles.newValue}>→ {readableValue(name, change.after)}</Text>
    </View>;
  });
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
  const [edits, setEdits] = useState<AuditEntry[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const loadingRef = useRef(false);

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
    try {
      const token = await getStoredToken();
      if (!token) { router.replace("/"); return; }
      const headers = { Authorization: `Bearer ${token}` };
      const [customerResult, session] = await Promise.all([
        apiRequest<{ customer: Customer }>(`/customers/${mijoz_id}`, { headers }),
        apiRequest<{ user: User }>("/auth/me", { headers }),
      ]);
      const selected = customerResult.customer.payments.find((item) =>
        item.paymentId === paymentId || item.id === paymentId,
      );
      if (!selected) throw new Error("To‘lov topilmadi.");
      setCustomer(customerResult.customer);
      setPayment(selected);
      setReceiverName(selected.receivedBy === session.user.id ? session.user.name || session.user.login : selected.receivedBy);

      try {
        const entries: AuditEntry[] = [];
        let page = 1;
        let total = 0;
        let limit = 100;
        do {
          const result = await apiRequest<AuditResponse>(
            `/customers/${mijoz_id}/audit?page=${page}&limit=100`, { headers },
          );
          entries.push(...result.entries.filter((entry) =>
            entry.action === "payment.updated" &&
            (String(entry.entityId) === selected.paymentId || String(entry.entityId) === selected.id),
          ));
          total = result.total;
          limit = result.limit;
          page += 1;
          if (result.entries.length === 0) break;
        } while ((page - 1) * limit < total);
        setEdits(entries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
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

  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 40 }]} refreshControl={<PullRefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} />}>
    <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.back}>
      <Text style={styles.link}>‹ To‘lovlarga qaytish</Text>
    </Pressable>
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
        {!!payment.cardLast4 && <Row label="Karta" value={`•••• ${payment.cardLast4}`} />}
        {!!payment.provider && <Row label="Ilova" value={payment.providerName || payment.provider} />}
        {!!payment.forMonth && <Row label="Qaysi oy uchun" value={payment.forMonth} />}
        <Row label="Qabul qilingan sana" value={formatDate(payment.paidAt)} />
        <Row label="Qabul qilgan" value={receiverName} />
        {payment.status === "voided" && <>
          {!!payment.voidedAt && <Row label="Bekor qilingan sana" value={formatDate(payment.voidedAt)} />}
          {!!payment.voidedBy && <Row label="Bekor qilgan" value={payment.voidedByName || payment.voidedBy} />}
          {!!payment.voidReason && <Row label="Sabab" value={payment.voidReason} />}
        </>}
      </View>
      <Text style={styles.sectionTitle}>Tahrirlar tarixi</Text>
      {historyError ? <View style={styles.card}><Text style={styles.error}>{historyError}</Text><Pressable onPress={() => void load()} accessibilityRole="button"><Text style={styles.link}>Qayta yuklash</Text></Pressable></View>
        : edits.length === 0 ? <View style={styles.card}><Text style={styles.muted}>Bu to‘lov uchun tahrir yozuvi topilmadi. Eski o‘zgarishlar auditga yozilmagan bo‘lishi mumkin.</Text></View>
        : edits.map((entry, index) => <View key={`${entry.id || entry.createdAt}-${index}`} style={styles.card}>
          <Text style={styles.editTitle}>To‘lov tahrirlandi</Text>
          <Text style={styles.editMeta}>{formatDate(entry.createdAt)} · {entry.actorName || entry.actorId}</Text>
          <AuditChanges entry={entry} />
        </View>)}
    </>}
  </ScrollView>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 18 },
  back: { alignSelf: "flex-start", paddingVertical: 10, marginBottom: 8 },
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
  sectionTitle: { color: "#172536", fontSize: 17, fontWeight: "800", marginTop: 10, marginBottom: 12 },
  editTitle: { color: "#172536", fontSize: 16, fontWeight: "800" },
  editMeta: { color: "#627184", fontSize: 12, marginTop: 4, marginBottom: 12 },
  change: { borderTopWidth: 1, borderTopColor: "#EEF1F5", paddingVertical: 9 },
  changeLabel: { color: "#627184", fontSize: 12, marginBottom: 4 },
  oldValue: { color: "#A62E38", fontSize: 13 },
  newValue: { color: "#16865A", fontSize: 13, fontWeight: "700", marginTop: 3 },
});
