import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import { formatDate } from "./customers";
import LoadingMark from "./LoadingMark";
import { deleteStoredToken, getStoredToken } from "./session";

type AuditEntry = {
  id?: string;
  action: "customer.created" | "customer.updated" | "customer.terms_updated" | "payment.created" | "payment.voided";
  entityType: string;
  entityId: string | number;
  mijoz_id: number;
  actorId: string;
  actorRole: string;
  actorName: string;
  createdAt: string;
  reason: string | null;
  before: unknown;
  after: unknown;
};

type AuditResponse = { entries: AuditEntry[]; total: number; page: number; limit: number };
const pageSize = 20;
const actionNames: Record<AuditEntry["action"], string> = {
  "customer.created": "Mijoz yaratildi",
  "customer.updated": "Mijoz tuzatildi",
  "customer.terms_updated": "Narx va muddat tuzatildi",
  "payment.created": "To‘lov yaratildi",
  "payment.voided": "To‘lov bekor qilindi",
};

function snapshotText(value: unknown) {
  if (value == null) return "Ma’lumot yo‘q";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) || "Ma’lumot yo‘q";
}

export default function CustomerAuditPage() {
  const insets = useSafeAreaInsets();
  const { mijoz_id } = useLocalSearchParams<{ mijoz_id: string }>();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!mijoz_id || !/^[1-9]\d*$/.test(mijoz_id) || !Number.isSafeInteger(Number(mijoz_id))) {
      setError("Mijoz raqami noto‘g‘ri.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const token = await getStoredToken();
      if (!token) {
        router.replace("/");
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const session = await apiRequest<{ user: User }>("/auth/me", { headers });
      if (session.user.role !== "super_admin") {
        setError("Audit tarixi faqat super admin uchun ochiq.");
        setResult(null);
        return;
      }
      const data = await apiRequest<AuditResponse>(
        `/customers/${mijoz_id}/audit?page=${page}&limit=${pageSize}`,
        { headers },
      );
      setResult(data);
      setExpanded(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await deleteStoredToken();
        router.replace("/");
      } else {
        setError(cause instanceof ApiError && cause.status === 403
          ? "Audit tarixi faqat super admin uchun ochiq."
          : cause instanceof Error ? cause.message : "Audit tarixi yuklanmadi.");
      }
    } finally {
      setLoading(false);
    }
  }, [mijoz_id, page]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.back}>
        <Text style={styles.link}>‹ Mijozga qaytish</Text>
      </Pressable>
      <Text style={styles.title}>Audit tarixi</Text>
      <Text style={styles.subtitle}>Mijoz #{mijoz_id} · yangi amallardan boshlab yoziladi</Text>
      {loading && <View style={styles.loading}><LoadingMark size={64} /><Text style={styles.muted}>Yuklanmoqda...</Text></View>}
      {!!error && <View style={styles.card}>
        <Text style={styles.error} accessibilityRole="alert">{error}</Text>
        <Pressable onPress={() => void load()} accessibilityRole="button"><Text style={styles.link}>Qayta yuklash</Text></Pressable>
      </View>}
      {!loading && !error && result && (
        <>
          <Text style={styles.count}>Jami {result.total} ta voqea</Text>
          {result.entries.length === 0 && <View style={styles.card}><Text style={styles.muted}>Hozircha audit yozuvlari yo‘q. Eski amallar uchun tarix avtomatik yaratilmaydi.</Text></View>}
          {result.entries.map((entry, index) => {
            const key = `${entry.id || entry.entityId}-${entry.createdAt}-${index}`;
            const isExpanded = expanded === key;
            return <View key={key} style={styles.card}>
              <Text style={styles.action}>{actionNames[entry.action] || entry.action}</Text>
              <Text style={styles.date}>{formatDate(entry.createdAt)}</Text>
              <Info label="Kim" value={`${entry.actorName || entry.actorId} · ${entry.actorRole}`} />
              <Info label="Yozuv" value={`${entry.entityType} #${entry.entityId}`} />
              {!!entry.reason && <Info label="Sabab" value={entry.reason} />}
              <Pressable onPress={() => setExpanded(isExpanded ? null : key)} accessibilityRole="button" style={styles.expand}>
                <Text style={styles.link}>{isExpanded ? "O‘zgarishni yashirish" : "Oldingi va keyingi holatni ko‘rish"}</Text>
              </Pressable>
              {isExpanded && <>
                <Text style={styles.snapshotLabel}>Oldin</Text>
                <Text style={styles.snapshot} selectable>{snapshotText(entry.before)}</Text>
                <Text style={styles.snapshotLabel}>Keyin</Text>
                <Text style={styles.snapshot} selectable>{snapshotText(entry.after)}</Text>
              </>}
            </View>;
          })}
          {totalPages > 1 && <View style={styles.pagination}>
            <Pressable disabled={page <= 1} onPress={() => setPage(page - 1)} accessibilityRole="button" style={[styles.pageButton, page <= 1 && styles.disabled]}>
              <Text style={styles.link}>‹ Oldingi</Text>
            </Pressable>
            <Text style={styles.muted}>{page} / {totalPages}</Text>
            <Pressable disabled={page >= totalPages} onPress={() => setPage(page + 1)} accessibilityRole="button" style={[styles.pageButton, page >= totalPages && styles.disabled]}>
              <Text style={styles.link}>Keyingi ›</Text>
            </Pressable>
          </View>}
        </>
      )}
    </ScrollView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.info}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue} selectable>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 18 },
  back: { alignSelf: "flex-start", paddingVertical: 10, marginBottom: 5 },
  link: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  title: { color: "#172536", fontSize: 27, fontWeight: "800" },
  subtitle: { color: "#627184", fontSize: 14, marginTop: 5, marginBottom: 18 },
  loading: { alignItems: "center", paddingVertical: 40 },
  muted: { color: "#627184", fontSize: 14, lineHeight: 20 },
  error: { color: "#C3333D", fontSize: 14, marginBottom: 10 },
  count: { color: "#627184", fontSize: 13, marginBottom: 10 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#E8EDF3" },
  action: { color: "#172536", fontSize: 17, fontWeight: "800" },
  date: { color: "#627184", fontSize: 12, marginTop: 3, marginBottom: 10 },
  info: { flexDirection: "row", gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: "#EEF1F5" },
  infoLabel: { flex: 1, color: "#627184", fontSize: 13 },
  infoValue: { flex: 2, color: "#172536", fontSize: 13, textAlign: "right", fontWeight: "600" },
  expand: { paddingTop: 12, paddingBottom: 4 },
  snapshotLabel: { color: "#172536", fontSize: 13, fontWeight: "800", marginTop: 14, marginBottom: 5 },
  snapshot: { color: "#34445A", fontSize: 12, lineHeight: 18, backgroundColor: "#F6F8FB", borderRadius: 8, padding: 10 },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  pageButton: { paddingVertical: 12, paddingHorizontal: 8 },
  disabled: { opacity: 0.4 },
});
