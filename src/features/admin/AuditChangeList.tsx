import { StyleSheet, Text, View } from "react-native";
import { formatDate, formatMoney, validPaymentMonth } from "./customers";

type Change = { key: string; before: unknown; after: unknown };

const labels: Record<string, string> = {
  name: "Mijoz ismi", phoneNumber: "Telefon", addPhoneNumber: "Qo‘shimcha telefon",
  address: "Manzil", assignedTo: "Mas’ul xodim", productName: "Mahsulot",
  totalPrice: "Sotilgan narx", downPayment: "Boshlang‘ich to‘lov",
  termMonths: "Muddat", totalPaid: "Jami to‘langan", remainingBalance: "Qolgan qarz",
  description: "Izoh", regionId: "Hudud", lat: "Kenglik", long: "Uzunlik",
  type: "To‘lov turi", amount: "Summa", method: "To‘lov usuli",
  receivedBy: "Qabul qilgan", paidAt: "To‘lov sanasi", forMonth: "To‘lov oyi",
  allocations: "Oylarga taqsimot", dailyPlanId: "Kunlik reja",
  cardLast4: "Karta oxirgi raqamlari", provider: "To‘lov ilovasi",
  providerName: "Ilova nomi", status: "Holat", voidedAt: "Bekor qilingan sana",
  voidedBy: "Bekor qilgan", voidReason: "Bekor qilish sababi",
};
const moneyFields = new Set(["totalPrice", "downPayment", "totalPaid", "remainingBalance", "amount"]);
const dateFields = new Set(["paidAt", "voidedAt", "createdAt"]);
const hiddenFields = new Set(["id", "paymentId", "mijoz_id", "customerId", "createdBy", "createdByRole", "createdAt"]);
const methods: Record<string, string> = { cash: "Naqd", transfer: "O‘tkazma", card: "Bank kartasi", payment_app: "To‘lov ilovasi" };
const monthNames = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

function parseSnapshot(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function flatten(value: unknown, path = "", result: Record<string, unknown> = {}) {
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const next = path ? `${path}.${key}` : key;
      if (isRecord(child)) flatten(child, next, result);
      else result[next] = child;
    }
  } else if (path) result[path] = value;
  return result;
}

function month(value: string) {
  if (!validPaymentMonth(value)) return value;
  const [year, index] = value.split("-").map(Number);
  return `${monthNames[index - 1]} ${year}`;
}

function displayValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const field = key.split(".").at(-1) || key;
  if (field === "allocations" && Array.isArray(value)) {
    return value.length ? value.map((item) => {
      if (!isRecord(item)) return String(item);
      const allocationMonth = typeof item.month === "string" ? month(item.month) : "Oy ko‘rsatilmagan";
      const amount = typeof item.amount === "number" ? formatMoney(item.amount) : String(item.amount ?? "—");
      return `${allocationMonth}: ${amount}`;
    }).join("\n") : "Taqsimot yo‘q";
  }
  if (moneyFields.has(field) && typeof value === "number") return formatMoney(value);
  if (field === "termMonths") return `${value} oy`;
  if (field === "forMonth" && typeof value === "string") return month(value);
  if (dateFields.has(field) && typeof value === "string") return formatDate(value);
  if (field === "method") return methods[String(value)] || String(value);
  if (field === "type") return value === "initial" ? "Boshlang‘ich" : value === "installment" ? "Oylik" : String(value);
  if (field === "status") return value === "active" ? "Faol" : value === "voided" ? "Bekor qilingan" : String(value);
  if (field === "cardLast4") return `•••• ${String(value).slice(-4)}`;
  if (typeof value === "boolean") return value ? "Ha" : "Yo‘q";
  if (Array.isArray(value)) return value.map((item) => isRecord(item) ? Object.values(item).map(String).join(" · ") : String(item)).join("\n") || "—";
  if (isRecord(value)) return Object.entries(value).map(([name, item]) => `${name}: ${String(item)}`).join(" · ") || "—";
  return String(value);
}

function fieldLabel(key: string) {
  const parts = key.split(".");
  const field = parts.at(-1) || key;
  const label = labels[field] || field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return parts[0] === "balance" ? `Balans · ${label}` : label;
}

export default function AuditChangeList({ before, after }: { before: unknown; after: unknown }) {
  const oldValues = flatten(parseSnapshot(before));
  const newValues = flatten(parseSnapshot(after));
  const changes: Change[] = [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])]
    .filter((key) => !hiddenFields.has(key.split(".").at(-1) || key))
    .filter((key) => JSON.stringify(oldValues[key] ?? null) !== JSON.stringify(newValues[key] ?? null))
    .map((key) => ({ key, before: oldValues[key], after: newValues[key] }));

  if (!changes.length) return <Text style={styles.empty}>Ko‘rsatiladigan o‘zgarish yo‘q.</Text>;
  return <View style={styles.list}>
    {changes.map((change) => <View key={change.key} style={styles.row}>
      <Text style={styles.label}>{fieldLabel(change.key)}</Text>
      {before != null && <Text style={styles.old}>{displayValue(change.key, change.before)}</Text>}
      <Text style={styles.new}>{before != null ? "→ " : ""}{displayValue(change.key, change.after)}</Text>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  list: { marginTop: 10, borderTopWidth: 1, borderTopColor: "#E8EDF3" },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#EEF1F5" },
  label: { color: "#627184", fontSize: 12, fontWeight: "700", marginBottom: 4 },
  old: { color: "#8B5960", fontSize: 14, lineHeight: 20 },
  new: { color: "#176B4A", fontSize: 14, lineHeight: 20, fontWeight: "700" },
  empty: { color: "#627184", fontSize: 14, marginTop: 10 },
});
