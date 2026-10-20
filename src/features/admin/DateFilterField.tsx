import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const months = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const weekdays = ["Du", "Se", "Cho", "Pa", "Ju", "Sha", "Ya"];

function parts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

function dateValue(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function DateFilterField({ label, value, onChange, todayKey }: { label: string; value: string; onChange: (value: string) => void; todayKey?: string }) {
  const now = new Date();
  const today = todayKey ?? dateValue(now.getFullYear(), now.getMonth(), now.getDate());
  const todayParts = parts(today)!;
  const currentMonth = new Date(todayParts.year, todayParts.month, 1);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = parts(value);
    return new Date(selected?.year ?? todayParts.year, selected?.month ?? todayParts.month, 1);
  });
  const selected = parts(value);
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const leadingDays = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const nextMonthDisabled = new Date(year, month + 1, 1) > currentMonth;
  const nextYearDisabled = new Date(year + 1, month, 1) > currentMonth;

  function shiftMonth(delta: number) {
    const target = new Date(year, month + delta, 1);
    if (target <= currentMonth) setVisibleMonth(target);
  }

  function chooseToday() {
    onChange(today);
    setVisibleMonth(currentMonth);
    setOpen(false);
  }

  return <View>
    <Text style={styles.label}>{label}</Text>
    <Pressable style={[styles.field, open && styles.fieldOpen]} onPress={() => { if (!open) {
      const current = parts(value);
      if (current) {
        const selectedMonth = new Date(current.year, current.month, 1);
        setVisibleMonth(selectedMonth > currentMonth ? currentMonth : selectedMonth);
      }
    } setOpen(!open); }} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${label}, ${value || "sana tanlanmagan"}`}>
      <Text style={[styles.fieldText, !value && styles.placeholder]}>{selected ? `${String(selected.day).padStart(2, "0")}.${String(selected.month + 1).padStart(2, "0")}.${selected.year}` : "Sana tanlang"}</Text>
      <Text style={styles.icon}>▦</Text>
    </Pressable>
    {open && <View style={styles.calendar}>
      <View style={styles.monthHeader}>
        <Text style={styles.monthTitle}>{months[month]} {year}</Text>
        <View style={styles.navigation}>
          <Pressable style={styles.navButton} onPress={() => shiftMonth(-12)} accessibilityRole="button" accessibilityLabel="Oldingi yil"><Text style={styles.navText}>«</Text></Pressable>
          <Pressable style={styles.navButton} onPress={() => shiftMonth(-1)} accessibilityRole="button" accessibilityLabel="Oldingi oy"><Text style={styles.navText}>‹</Text></Pressable>
          <Pressable style={[styles.navButton, nextMonthDisabled && styles.disabled]} onPress={() => shiftMonth(1)} disabled={nextMonthDisabled} accessibilityRole="button" accessibilityLabel="Keyingi oy"><Text style={styles.navText}>›</Text></Pressable>
          <Pressable style={[styles.navButton, nextYearDisabled && styles.disabled]} onPress={() => shiftMonth(12)} disabled={nextYearDisabled} accessibilityRole="button" accessibilityLabel="Keyingi yil"><Text style={styles.navText}>»</Text></Pressable>
        </View>
      </View>
      <View style={styles.days}>{weekdays.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
      <View style={styles.days}>
        {Array.from({ length: leadingDays }, (_, index) => <View key={`empty-${index}`} style={styles.dayCell} />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const active = selected?.year === year && selected.month === month && selected.day === day;
          const future = dateValue(year, month, day) > today;
          return <View key={day} style={styles.dayCell}>
            <Pressable style={[styles.dayButton, active && styles.selectedDay]} onPress={() => { onChange(dateValue(year, month, day)); setOpen(false); }} disabled={future} accessibilityRole="button" accessibilityLabel={`${day} ${months[month]} ${year}`} accessibilityState={{ selected: active, disabled: future }}>
              <Text style={[styles.dayText, active && styles.selectedDayText, future && styles.futureDayText]}>{day}</Text>
            </Pressable>
          </View>;
        })}
      </View>
      <View style={styles.footer}>
        <Pressable onPress={() => { onChange(""); setOpen(false); }} accessibilityRole="button"><Text style={styles.action}>Tozalash</Text></Pressable>
        <Pressable onPress={chooseToday} accessibilityRole="button"><Text style={styles.action}>Bugun</Text></Pressable>
      </View>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  label: { color: "#172536", fontSize: 14, fontWeight: "700", marginTop: 14, marginBottom: 7 },
  field: { minHeight: 48, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 11, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFFFFF" },
  fieldOpen: { borderColor: "#1677D2" },
  fieldText: { color: "#172536", fontSize: 15 },
  placeholder: { color: "#8794A5" },
  icon: { color: "#1677D2", fontSize: 25 },
  calendar: { marginTop: 8, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 13, padding: 10, backgroundColor: "#FFFFFF" },
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  monthTitle: { color: "#172536", fontSize: 15, fontWeight: "800" },
  navigation: { flexDirection: "row", alignItems: "center" },
  navButton: { minWidth: 32, minHeight: 36, alignItems: "center", justifyContent: "center" },
  navText: { color: "#1677D2", fontSize: 24 },
  disabled: { opacity: 0.35 },
  days: { flexDirection: "row", flexWrap: "wrap" },
  weekday: { width: "14.2857%", textAlign: "center", color: "#627184", fontSize: 12, fontWeight: "700", paddingVertical: 7 },
  dayCell: { width: "14.2857%", height: 38, alignItems: "center", justifyContent: "center" },
  dayButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  selectedDay: { backgroundColor: "#1677D2" },
  dayText: { color: "#172536", fontSize: 14 },
  futureDayText: { color: "#AAB5C2" },
  selectedDayText: { color: "#FFFFFF", fontWeight: "800" },
  footer: { borderTopWidth: 1, borderTopColor: "#E8EDF3", marginTop: 8, paddingTop: 12, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 7 },
  action: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
});
