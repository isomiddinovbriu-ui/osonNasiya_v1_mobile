import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, apiRequest, type User } from "./api";

const visibleLimit = 3;
const roleNames: Record<User["role"], string> = {
  super_admin: "Super admin",
  sotuvchi: "Sotuvchi",
  yiguvchi: "Yig'uvchi",
  product_creator: "Mahsulot yaratuvchi",
};

export default function StaffFilterPicker({ token, value, onChange, onSessionExpired }: {
  token: string;
  value: string;
  onChange: (value: string) => void;
  onSessionExpired: () => Promise<void>;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const result = await apiRequest<{ users: User[] }>("/users", { headers });
      setUsers(result.users);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await onSessionExpired();
      } else if (cause instanceof ApiError && cause.status === 403) {
        try {
          const result = await apiRequest<{ user: User }>("/auth/me", { headers });
          setUsers([result.user]);
        } catch (fallbackCause) {
          if (fallbackCause instanceof ApiError && fallbackCause.status === 401) await onSessionExpired();
          else setError(fallbackCause instanceof Error ? fallbackCause.message : "Xodim yuklanmadi.");
        }
      } else {
        setError(cause instanceof Error ? cause.message : "Xodimlar ro'yxati yuklanmadi.");
      }
    } finally { setLoading(false); }
  }, [token, onSessionExpired]);

  useEffect(() => { void Promise.resolve().then(load); }, [load, refreshKey]);

  const selected = users.find((user) => user.id === value);
  const query = search.trim().toLocaleLowerCase();
  const matches = users.filter((user) => `${user.name} ${user.login} ${roleNames[user.role]}`.toLocaleLowerCase().includes(query));

  if (loading) return <Text style={styles.hint}>Xodimlar yuklanmoqda...</Text>;
  if (error) return <View><Text style={styles.error} accessibilityRole="alert">{error}</Text><Pressable onPress={() => setRefreshKey((current) => current + 1)} accessibilityRole="button"><Text style={styles.link}>Qayta yuklash</Text></Pressable></View>;

  return <View>
    <Text style={styles.label}>Yaratgan xodim</Text>
    <Pressable style={styles.trigger} onPress={() => { setOpen((current) => !current); setSearch(""); }} accessibilityRole="button" accessibilityState={{ expanded: open }}>
      <Text style={styles.triggerText} numberOfLines={1}>{selected ? `${selected.name} · ${selected.login}` : value ? "Tanlangan xodim" : "Barchasi"}</Text>
      <Text style={styles.link}>{open ? "Yopish" : "Tanlash"}</Text>
    </Pressable>
    {open && <View style={styles.options}>
      <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder="Ism yoki login bo'yicha qidiring" autoCapitalize="none" autoFocus maxLength={100} />
      <Pressable style={styles.option} onPress={() => { onChange(""); setOpen(false); }} accessibilityRole="button"><Text style={[styles.optionName, !value && styles.selected]}>Barchasi</Text></Pressable>
      {matches.slice(0, visibleLimit).map((user) => <Pressable key={user.id} style={styles.option} onPress={() => { onChange(user.id); setOpen(false); }} accessibilityRole="button">
        <Text style={[styles.optionName, value === user.id && styles.selected]}>{user.name}</Text>
        <Text style={styles.detail}>{user.login} · {roleNames[user.role]}</Text>
      </Pressable>)}
      {matches.length === 0 && <Text style={styles.hint}>Xodim topilmadi.</Text>}
      {matches.length > visibleLimit && <Text style={styles.hint}>Yana {matches.length - visibleLimit} ta natija bor. Qidiruvni aniqlashtiring.</Text>}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  label: { color: "#172536", fontSize: 14, fontWeight: "700", marginTop: 14, marginBottom: 7 },
  trigger: { minHeight: 48, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 11, backgroundColor: "#FFFFFF", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  triggerText: { flex: 1, color: "#172536", fontSize: 15 },
  link: { color: "#1677D2", fontWeight: "700", fontSize: 13 },
  options: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 11, backgroundColor: "#FFFFFF", marginTop: 6, padding: 8 },
  search: { minHeight: 44, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 9, paddingHorizontal: 11, color: "#172536", fontSize: 14, marginBottom: 6 },
  option: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F0F3F7" },
  optionName: { color: "#172536", fontSize: 14, fontWeight: "600" },
  selected: { color: "#1677D2", fontWeight: "800" },
  detail: { color: "#627184", fontSize: 12, marginTop: 3 },
  hint: { color: "#627184", fontSize: 13, lineHeight: 19, marginTop: 10 },
  error: { color: "#C3333D", fontSize: 14, marginTop: 10, marginBottom: 8 },
});
