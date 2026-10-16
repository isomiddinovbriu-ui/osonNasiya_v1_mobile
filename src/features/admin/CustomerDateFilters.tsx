import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import DateFilterField from "./DateFilterField";

export type DateFilterValues = {
  createdFrom: string;
  createdTo: string;
  paidFrom: string;
  paidTo: string;
};

type Period = "day" | "week" | "month";
type DateGroup = "created" | "paid";

const periods: { value: Period; label: string }[] = [
  { value: "day", label: "1 kun oldin" },
  { value: "week", label: "1 hafta oldin" },
  { value: "month", label: "1 oy oldin" },
];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function periodRange(period: Period) {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (period === "day") from.setDate(from.getDate() - 1);
  if (period === "week") from.setDate(from.getDate() - 7);
  if (period === "month") {
    const lastDay = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    from.setFullYear(today.getFullYear(), today.getMonth() - 1, Math.min(today.getDate(), lastDay));
  }
  return { from: dateKey(from), to: dateKey(today) };
}

export default function CustomerDateFilters({ values, onChange }: {
  values: DateFilterValues;
  onChange: (patch: Partial<DateFilterValues>) => void;
}) {
  const [openGroup, setOpenGroup] = useState<DateGroup | null>(null);

  return <View style={styles.groups}>
    {(["created", "paid"] as const).map((group) => {
      const fromKey = group === "created" ? "createdFrom" : "paidFrom";
      const toKey = group === "created" ? "createdTo" : "paidTo";
      const expanded = openGroup === group;
      const title = group === "created" ? "Yaratilgan vaqt bo'yicha" : "To'langan sana bo'yicha";
      const selectedPeriod = periods.find(({ value }) => {
        const range = periodRange(value);
        return values[fromKey] === range.from && values[toKey] === range.to;
      })?.value;

      return <View key={group} style={styles.group}>
        <Pressable style={styles.header} onPress={() => setOpenGroup(expanded ? null : group)} accessibilityRole="button" accessibilityState={{ expanded }}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {(values[fromKey] || values[toKey]) && <Text style={styles.summary}>{selectedPeriod ? periods.find(({ value }) => value === selectedPeriod)?.label : `${values[fromKey] || "…"} — ${values[toKey] || "…"}`}</Text>}
          </View>
          <Text style={styles.chevron}>{expanded ? "−" : "+"}</Text>
        </Pressable>
        {expanded && <View style={styles.body}>
          <Text style={styles.hint}>Tanlangan kundan bugungacha</Text>
          <View style={styles.presets}>
            {periods.map(({ value, label }) => <Pressable key={value} style={[styles.preset, selectedPeriod === value && styles.presetSelected]} onPress={() => {
              const range = periodRange(value);
              onChange({ [fromKey]: range.from, [toKey]: range.to });
            }} accessibilityRole="button" accessibilityState={{ selected: selectedPeriod === value }}>
              <Text style={[styles.presetText, selectedPeriod === value && styles.presetTextSelected]}>{label}</Text>
            </Pressable>)}
          </View>
          <DateFilterField label="Dan" value={values[fromKey]} onChange={(value) => onChange({ [fromKey]: value })} />
          <DateFilterField label="Gacha" value={values[toKey]} onChange={(value) => onChange({ [toKey]: value })} />
          {(values[fromKey] || values[toKey]) && <Pressable style={styles.clear} onPress={() => onChange({ [fromKey]: "", [toKey]: "" })} accessibilityRole="button"><Text style={styles.clearText}>Sanalarni tozalash</Text></Pressable>}
        </View>}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  groups: { gap: 8, marginTop: 12 },
  group: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 11, overflow: "hidden", backgroundColor: "#FFFFFF" },
  header: { minHeight: 54, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerText: { flex: 1 },
  title: { color: "#172536", fontSize: 14, fontWeight: "700" },
  summary: { color: "#1677D2", fontSize: 12, marginTop: 4 },
  chevron: { color: "#1677D2", fontSize: 22, marginLeft: 8 },
  body: { borderTopWidth: 1, borderTopColor: "#E2E8F0", paddingHorizontal: 12, paddingBottom: 16 },
  hint: { color: "#627184", fontSize: 12, marginTop: 12, marginBottom: 10 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  preset: { borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 10 },
  presetSelected: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  presetText: { color: "#45586E", fontSize: 12, fontWeight: "700" },
  presetTextSelected: { color: "#1677D2" },
  clear: { alignSelf: "flex-start", paddingVertical: 12, marginTop: 4 },
  clearText: { color: "#1677D2", fontSize: 13, fontWeight: "700" },
});
