import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

const months = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const weekdays = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
const quickOptions = [
  { label: "Ertaga", days: 1 },
  { label: "3 kundan keyin", days: 3 },
  { label: "7 kundan keyin", days: 7 },
  { label: "2 haftadan keyin", days: 14 },
  { label: "1 oydan keyin", months: 1 },
] as const;

export function localDateString(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function quickDate(option: (typeof quickOptions)[number]) {
  const today = new Date();
  if ("days" in option) {
    today.setDate(today.getDate() + option.days);
    return localDateString(today);
  }
  const target = new Date(today.getFullYear(), today.getMonth() + option.months + 1, 0);
  target.setDate(Math.min(today.getDate(), target.getDate()));
  return localDateString(target);
}

function readableDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${months[month - 1]} ${year}`;
}

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  showQuickOptions?: boolean;
};

export default function ContactDatePicker({ label, value, onChange, showQuickOptions = false }: Props) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [today, setToday] = useState(localDateString);

  function show() {
    const current = localDateString();
    const initial = value && value >= current ? value : current;
    const [year, month] = initial.split("-").map(Number);
    setToday(current);
    setViewMonth(new Date(year, month - 1, 1));
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setToday(localDateString()), 60_000);
    return () => clearInterval(timer);
  }, [open]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => index - firstWeekday + 1);
  const currentMonth = today.slice(0, 7);
  const shownMonth = `${year}-${String(month + 1).padStart(2, "0")}`;

  function moveMonth(offset: number) {
    setViewMonth(new Date(year, month + offset, 1));
  }

  return <>
    <Pressable style={styles.field} onPress={show} accessibilityRole="button" accessibilityLabel={`${label}: ${value ? readableDate(value) : "sana tanlanmagan"}`}>
      <Text style={[styles.fieldText, !value && styles.placeholder]}>{value ? readableDate(value) : "Sanani tanlang"}</Text>
      <Text style={styles.calendarAction} accessible={false}>Tanlash ›</Text>
    </Pressable>
    {showQuickOptions && <View style={styles.quickSection}>
      <Text style={styles.quickTitle}>Tez tanlash</Text>
      <View style={styles.quickRow}>{quickOptions.map((option) => {
        const date = quickDate(option);
        const selected = value === date;
        return <Pressable key={option.label} style={[styles.quickChoice, selected && styles.quickChoiceSelected]}
          onPress={() => onChange(quickDate(option))} accessibilityRole="button" accessibilityState={{ selected }}>
          <Text style={[styles.quickText, selected && styles.quickTextSelected]}>{option.label}</Text>
        </Pressable>;
      })}</View>
    </View>}
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Kalendarni yopish" />
        <View style={styles.sheet}>
          <View style={styles.topRow}>
            <View style={styles.headingCopy}>
              <Text style={styles.heading}>{label}</Text>
              <Text style={styles.hint}>Bugundan boshlab sanani tanlang</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Yopish">
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.monthRow}>
            <Pressable style={[styles.navButton, shownMonth <= currentMonth && styles.navDisabled]} disabled={shownMonth <= currentMonth} onPress={() => moveMonth(-1)} accessibilityRole="button" accessibilityLabel="Oldingi oy">
              <Text style={styles.navText}>‹</Text>
            </Pressable>
            <Text style={styles.monthTitle}>{months[month]} {year}</Text>
            <Pressable style={styles.navButton} onPress={() => moveMonth(1)} accessibilityRole="button" accessibilityLabel="Keyingi oy">
              <Text style={styles.navText}>›</Text>
            </Pressable>
          </View>
          <View style={styles.weekRow}>{weekdays.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
          <View style={styles.daysGrid}>{cells.map((day, index) => {
            if (day < 1 || day > daysInMonth) return <View key={index} style={styles.dayCell} />;
            const date = `${shownMonth}-${String(day).padStart(2, "0")}`;
            const disabled = date < today;
            const selected = date === value;
            return <View key={index} style={styles.dayCell}>
              <Pressable style={[styles.dayButton, date === today && styles.todayButton, selected && styles.selectedDay]}
                disabled={disabled} onPress={() => { onChange(date); setOpen(false); }}
                accessibilityRole="button" accessibilityLabel={readableDate(date)} accessibilityState={{ disabled, selected }}>
                <Text style={[styles.dayText, disabled && styles.disabledDayText, selected && styles.selectedDayText]}>{day}</Text>
              </Pressable>
            </View>;
          })}</View>
          <Pressable style={styles.todayShortcut} onPress={() => { onChange(localDateString()); setOpen(false); }} accessibilityRole="button">
            <Text style={styles.todayShortcutText}>Bugunni tanlash</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  field: { minHeight: 44, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, backgroundColor: "#FFFFFF" },
  fieldText: { color: "#172536", fontSize: 14, flex: 1 },
  placeholder: { color: "#8A97A6" },
  calendarAction: { color: "#1677D2", fontSize: 12, fontWeight: "700" },
  quickSection: { gap: 7, marginTop: 2 },
  quickTitle: { color: "#627184", fontSize: 12 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  quickChoice: { minHeight: 34, paddingHorizontal: 10, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 9, backgroundColor: "#F6F8FB", alignItems: "center", justifyContent: "center" },
  quickChoiceSelected: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  quickText: { color: "#627184", fontSize: 12, fontWeight: "700" },
  quickTextSelected: { color: "#1677D2" },
  overlay: { flex: 1, justifyContent: "center", padding: 16, backgroundColor: "rgba(23, 37, 54, 0.45)" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { width: "100%", maxWidth: 400, alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 18, padding: 18 },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  headingCopy: { flex: 1 },
  heading: { color: "#172536", fontSize: 18, fontWeight: "800" },
  hint: { color: "#627184", fontSize: 12, marginTop: 4 },
  closeButton: { width: 32, height: 32, borderRadius: 9, backgroundColor: "#F1F4F8", alignItems: "center", justifyContent: "center" },
  closeText: { color: "#627184", fontSize: 25, lineHeight: 28 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 14 },
  monthTitle: { color: "#172536", fontSize: 16, fontWeight: "800" },
  navButton: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#EAF4FF", alignItems: "center", justifyContent: "center" },
  navDisabled: { opacity: 0.35 },
  navText: { color: "#1677D2", fontSize: 27, lineHeight: 30 },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: { width: "14.2857%", textAlign: "center", color: "#627184", fontSize: 12, fontWeight: "700" },
  daysGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: "14.2857%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dayButton: { width: "86%", aspectRatio: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  todayButton: { borderWidth: 1, borderColor: "#1677D2" },
  selectedDay: { backgroundColor: "#1677D2", borderColor: "#1677D2" },
  dayText: { color: "#172536", fontSize: 14, fontWeight: "700" },
  disabledDayText: { color: "#B9C3CF" },
  selectedDayText: { color: "#FFFFFF" },
  todayShortcut: { alignSelf: "center", paddingHorizontal: 16, paddingVertical: 10, marginTop: 12 },
  todayShortcutText: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
});
