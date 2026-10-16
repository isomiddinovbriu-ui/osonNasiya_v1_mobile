import { useState } from "react";
import {
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
import { SafeAreaView } from "react-native-safe-area-context";

type Task = {
  id: string;
  title: string;
  done: boolean;
};

type Filter = "all" | "active" | "done";

const filters: { label: string; value: Filter }[] = [
  { label: "Barchasi", value: "all" },
  { label: "Jarayonda", value: "active" },
  { label: "Bajarilgan", value: "done" },
];

export default function HomeScreen() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: "1", title: "Bugungi rejalarni yozish", done: true },
    { id: "2", title: "Mobil ilova ustida ishlash", done: false },
    { id: "3", title: "30 daqiqa ingliz tili o'rganish", done: false },
  ]);
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const completed = tasks.filter((task) => task.done).length;
  const progress = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;

  const visibleTasks = tasks.filter((task) => {
    if (filter === "active") return !task.done;
    if (filter === "done") return task.done;
    return true;
  });

  function addTask() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setTasks((current) => [
      {
        id: `${Date.now()}-${Math.random()}`,
        title: trimmedTitle,
        done: false,
      },
      ...current,
    ]);
    setTitle("");
    setFilter("all");
    Keyboard.dismiss();
  }

  function toggleTask(id: string) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>KUNINGIZNI REJALASHTIRING</Text>
              <Text style={styles.greeting}>Salom, Ruzi 👋</Text>
              <Text style={styles.subtitle}>
                Kichik qadamlar. Katta natijalar.
              </Text>
            </View>

            <View style={styles.avatar}>
              <Text style={styles.avatarText}>R</Text>
            </View>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <Text style={styles.heroLabel}>BUGUNGI NATIJA</Text>
              <Text style={styles.heroBadge}>{progress}%</Text>
            </View>

            <Text style={styles.heroTitle}>
              {tasks.length > 0 && completed === tasks.length
                ? "Ajoyib! Hammasi bajarildi."
                : "Bugun bir qadam oldinga."}
            </Text>

            <Text style={styles.heroDescription}>
              {tasks.length
                ? `${tasks.length} ta vazifadan ${completed} tasi bajarildi.`
                : "Birinchi vazifangizni qo'shib boshlang."}
            </Text>

            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: progress }}
              accessibilityLabel="Bajarilgan vazifalar"
            >
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          </View>

          <View style={styles.stats}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{tasks.length}</Text>
              <Text style={styles.statLabel}>Jami vazifalar</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={[styles.statNumber, styles.green]}>{completed}</Text>
              <Text style={styles.statLabel}>Bajarilgan</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={[styles.statNumber, styles.orange]}>
                {tasks.length - completed}
              </Text>
              <Text style={styles.statLabel}>Qolgan</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Yangi vazifa</Text>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Bugun nima qilmoqchisiz?"
              placeholderTextColor="#94A3B8"
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={addTask}
              returnKeyType="done"
              maxLength={120}
              accessibilityLabel="Yangi vazifa nomi"
            />

            <Pressable
              onPress={addTask}
              disabled={!title.trim()}
              accessibilityRole="button"
              accessibilityLabel="Vazifa qo'shish"
              style={({ pressed }) => [
                styles.addButton,
                !title.trim() && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.addButtonText}>+</Text>
            </Pressable>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Vazifalarim</Text>
            <Text style={styles.count}>{visibleTasks.length} ta</Text>
          </View>

          <View style={styles.filters}>
            {filters.map((item) => (
              <Pressable
                key={item.value}
                onPress={() => setFilter(item.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === item.value }}
                style={[
                  styles.filter,
                  filter === item.value && styles.activeFilter,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === item.value && styles.activeFilterText,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.taskList}>
            {visibleTasks.map((task) => (
              <Pressable
                key={task.id}
                onPress={() => toggleTask(task.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: task.done }}
                accessibilityLabel={task.title}
                style={({ pressed }) => [
                  styles.task,
                  task.done && styles.completedTask,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.checkbox, task.done && styles.checkedBox]}>
                  {task.done && <Text style={styles.checkmark}>✓</Text>}
                </View>

                <Text
                  style={[styles.taskTitle, task.done && styles.completedTitle]}
                >
                  {task.title}
                </Text>
              </Pressable>
            ))}

            {visibleTasks.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>✦</Text>
                <Text style={styles.emptyTitle}>Hozircha vazifa yo'q</Text>
                <Text style={styles.emptyText}>
                  Yangi vazifa qo'shing yoki boshqa filtrni tanlang.
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.footer}>
            O'zingizga bergan va’dadan boshlang.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: "#F5F7FB" },
  content: {
    padding: 24,
    paddingBottom: 110,
    gap: 20,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.3,
    color: "#64748B",
  },
  greeting: {
    fontSize: 28,
    fontWeight: "800",
    color: "#172033",
    marginTop: 8,
  },
  subtitle: { fontSize: 13, color: "#64748B", marginTop: 6 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: "#E8EAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#5854D6", fontWeight: "800", fontSize: 22 },
  hero: {
    backgroundColor: "#5854D6",
    borderRadius: 26,
    padding: 24,
    gap: 16,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroLabel: {
    color: "#DAD9FF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  heroBadge: {
    color: "#FFFFFF",
    fontWeight: "700",
    backgroundColor: "#716DE2",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: "hidden",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 27,
    lineHeight: 35,
    fontWeight: "800",
  },
  heroDescription: { color: "#E1E0FF", fontSize: 14, lineHeight: 21 },
  progressTrack: {
    height: 7,
    backgroundColor: "#7773E3",
    borderRadius: 10,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#C4F5D7",
    borderRadius: 10,
  },
  stats: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: "center",
    gap: 7,
  },
  statNumber: { fontSize: 26, fontWeight: "800", color: "#5854D6" },
  statLabel: { fontSize: 11, color: "#64748B" },
  green: { color: "#21966A" },
  orange: { color: "#D58A29" },
  sectionTitle: { fontSize: 19, fontWeight: "700", color: "#172033" },
  inputRow: { flexDirection: "row", gap: 10 },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E9F2",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 14,
    color: "#172033",
  },
  addButton: {
    width: 54,
    borderRadius: 16,
    backgroundColor: "#5854D6",
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: { fontSize: 30, color: "#FFFFFF" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  count: { color: "#64748B", fontSize: 13 },
  filters: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filter: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#EAEFF5",
  },
  activeFilter: { backgroundColor: "#5854D6" },
  filterText: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  activeFilterText: { color: "#FFFFFF" },
  taskList: { gap: 10 },
  task: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E8ECF3",
  },
  completedTask: { backgroundColor: "#F0F8F4", borderColor: "#DBEEE2" },
  checkbox: {
    width: 25,
    height: 25,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#CFD7E5",
    alignItems: "center",
    justifyContent: "center",
  },
  checkedBox: { backgroundColor: "#21966A", borderColor: "#21966A" },
  checkmark: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  taskTitle: { flex: 1, color: "#263247", fontSize: 14, lineHeight: 21 },
  completedTitle: { color: "#7B9386", textDecorationLine: "line-through" },
  empty: {
    alignItems: "center",
    padding: 30,
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
  },
  emptyIcon: { fontSize: 30, color: "#5854D6" },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#172033" },
  emptyText: { color: "#64748B", textAlign: "center", lineHeight: 21 },
  footer: { textAlign: "center", color: "#94A3B8", fontSize: 12 },
});
