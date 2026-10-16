import { useCallback, useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, apiRequest, type User } from "./api";
import LoadingMark from "./LoadingMark";

type StaffRole = Exclude<User["role"], "super_admin">;

const roleNames: Record<StaffRole, string> = {
  yiguvchi: "Yig'uvchi",
  sotuvchi: "Sotuvchi",
  product_creator: "Mahsulot qo'shuvchi",
};

type Props = {
  token: string;
  onSessionExpired: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  refreshRequest?: number;
  onRefreshComplete?: () => void;
};

export default function StaffManagement({ token, onSessionExpired, onBusyChange, refreshRequest = 0, onRefreshComplete }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [listError, setListError] = useState("");
  const [login, setLogin] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<StaffRole>("yiguvchi");
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 2000);
    return () => clearTimeout(timer);
  }, [success]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setListError("");
    try {
      const result = await apiRequest<{ users: User[] }>("/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(result.users);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await onSessionExpired();
        return;
      }
      setListError(
        error instanceof Error
          ? error.message
          : "Xodimlar ro'yxatini olib bo'lmadi.",
      );
    } finally {
      setLoadingUsers(false);
    }
  }, [token, onSessionExpired]);

  useEffect(() => {
    void Promise.resolve().then(loadUsers);
  }, [loadUsers]);
  useEffect(() => {
    if (refreshRequest > 0) void Promise.resolve().then(loadUsers).finally(onRefreshComplete);
  }, [refreshRequest, loadUsers, onRefreshComplete]);

  async function saveUser() {
    const normalizedLogin = login.trim().toLowerCase();
    setFormError("");
    setSuccess("");
    if (
      !normalizedLogin ||
      normalizedLogin.length > 100 ||
      !name.trim() ||
      name.trim().length > 100 ||
      ((!editingUser || password.length > 0) && !/^\d{5}$/.test(password)) ||
      description.length > 1000
    ) {
      setFormError("Login, ism va 5 xonali raqamli parol kiriting.");
      return;
    }
    Keyboard.dismiss();
    setCreating(true);
    onBusyChange(true);
    try {
      const result = await apiRequest<{ user: User }>(
        editingUser ? `/users/${editingUser}` : "/users",
        {
          method: editingUser ? "PATCH" : "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            login: normalizedLogin,
            ...(password ? { password } : {}),
            role,
            name: name.trim(),
            description: description.trim(),
          }),
        },
      );
      setUsers((current) => [
        result.user,
        ...current.filter((item) => item.id !== result.user.id),
      ]);
      setLogin("");
      setName("");
      setDescription("");
      setPassword("");
      setShowPassword(false);
      setEditingUser(null);
      setSuccess(
        `${result.user.login} ${editingUser ? "yangilandi" : "yaratildi"}.`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await onSessionExpired();
        return;
      }
      setFormError(
        error instanceof Error ? error.message : "Xodim yaratib bo'lmadi.",
      );
    } finally {
      setCreating(false);
      onBusyChange(false);
    }
  }

  function editUser(item: User) {
    setEditingUser(item.id);
    setLogin(item.login);
    setName(item.name);
    setDescription(item.description);
    setRole(item.role as StaffRole);
    setPassword("");
    setFormError("");
    setSuccess("");
  }

  function cancelEdit() {
    setEditingUser(null);
    setLogin("");
    setName("");
    setDescription("");
    setPassword("");
    setRole("yiguvchi");
  }

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.title}>
          {editingUser ? "Xodimni tahrirlash" : "Yangi xodim"}
        </Text>
        <Text style={styles.subtitle}>
          Yig'uvchi, sotuvchi yoki mahsulot yaratuvchi uchun hisob yarating.
        </Text>

        <Text style={styles.label}>Login</Text>
        <TextInput
          style={styles.input}
          value={login}
          onChangeText={(value) => {
            setLogin(value);
            setFormError("");
            setSuccess("");
          }}
          placeholder="Masalan: ali"
          placeholderTextColor="#9AA6B5"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!creating}
        />

        <Text style={styles.label}>Ism</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setFormError("");
          }}
          placeholder="Xodim ismi"
          maxLength={100}
          editable={!creating}
        />
        <Text style={styles.label}>Parol</Text>
        <View style={styles.passwordBox}>
          <TextInput
            style={styles.passwordInput}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setFormError("");
              setSuccess("");
            }}
            placeholder={
              editingUser
                ? "O'zgartirmaslik uchun bo'sh qoldiring"
                : "5 xonali raqam"
            }
            placeholderTextColor="#9AA6B5"
            keyboardType="number-pad"
            maxLength={5}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!creating}
          />
          <Pressable
            onPress={() => setShowPassword((current) => !current)}
            accessibilityLabel={
              showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"
            }
          >
            <Text style={styles.showText}>
              {showPassword ? "Yashirish" : "Ko'rsatish"}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Izoh (ixtiyoriy)</Text>
        <TextInput
          style={[styles.input, styles.descriptionInput]}
          value={description}
          onChangeText={setDescription}
          placeholder="Xodim haqida izoh"
          maxLength={1000}
          multiline
          editable={!creating}
        />

        <Text style={styles.label}>Rol</Text>
        <View style={styles.roles}>
          {(["yiguvchi", "sotuvchi", "product_creator"] as const).map(
            (item) => (
              <Pressable
                key={item}
                style={[
                  styles.roleButton,
                  role === item && styles.roleSelected,
                ]}
                onPress={() => setRole(item)}
                accessibilityRole="radio"
                accessibilityState={{ selected: role === item }}
              >
                <Text
                  style={[
                    styles.roleText,
                    role === item && styles.roleTextSelected,
                  ]}
                >
                  {roleNames[item]}
                </Text>
              </Pressable>
            ),
          )}
        </View>

        {!!formError && (
          <Text style={styles.error} accessibilityRole="alert">
            {formError}
          </Text>
        )}
        {!!success && (
          <Text style={styles.success} accessibilityRole="alert">
            {success}
          </Text>
        )}
        <Pressable
          style={[
            styles.primaryButton,
            (creating || loadingUsers) && styles.disabled,
          ]}
          onPress={saveUser}
          disabled={creating || loadingUsers}
        >
          <Text style={styles.primaryText}>
            {editingUser ? "Saqlash" : "Xodim yaratish"}
          </Text>
        </Pressable>
        {editingUser && (
          <Pressable
            style={styles.cancelButton}
            onPress={cancelEdit}
            disabled={creating}
          >
            <Text style={styles.refresh}>Bekor qilish</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.listHeading}>
          <Text style={styles.title}>Xodimlar</Text>
          <Pressable onPress={() => void loadUsers()} disabled={loadingUsers}>
            <Text style={styles.refresh}>Yangilash</Text>
          </Pressable>
        </View>
        {loadingUsers && (
          <View style={styles.loader}>
            <LoadingMark size={54} />
            <Text style={styles.loadingText}>Xodimlar yuklanmoqda...</Text>
          </View>
        )}
        {!!listError && (
          <Text style={styles.error} accessibilityRole="alert">
            {listError}
          </Text>
        )}
        {!loadingUsers && !listError && users.length === 0 && (
          <Text style={styles.empty}>Hozircha xodimlar yo'q.</Text>
        )}
        {!loadingUsers &&
          users.map((item) => (
            <View key={item.id} style={styles.userRow}>
              <Text style={styles.userLogin}>
                {item.name} ({item.login})
              </Text>
              <Text style={styles.userRole}>
                {item.role === "super_admin"
                  ? "Super admin"
                  : roleNames[item.role]}
              </Text>
              <Pressable onPress={() => editUser(item)}>
                <Text style={styles.refresh}>Tahrirlash</Text>
              </Pressable>
            </View>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
  },
  title: { color: "#172536", fontSize: 20, fontWeight: "800" },
  subtitle: {
    color: "#627184",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 20,
  },
  label: { color: "#172536", fontSize: 14, fontWeight: "700", marginBottom: 8 },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    paddingHorizontal: 14,
    color: "#172536",
    fontSize: 16,
    marginBottom: 18,
  },
  descriptionInput: { height: 82, paddingTop: 12, textAlignVertical: "top" },
  passwordBox: {
    height: 50,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  passwordInput: { flex: 1, height: "100%", color: "#172536", fontSize: 16 },
  showText: {
    color: "#1677D2",
    fontSize: 13,
    fontWeight: "700",
    paddingLeft: 8,
  },
  roles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  roleButton: {
    minWidth: "45%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  roleSelected: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  roleText: { color: "#627184", fontSize: 14, fontWeight: "700" },
  roleTextSelected: { color: "#1677D2" },
  cancelButton: { alignItems: "center", padding: 12 },
  error: { color: "#C3333D", fontSize: 14, lineHeight: 20, marginTop: 14 },
  success: { color: "#16865A", fontSize: 14, lineHeight: 20, marginTop: 14 },
  primaryButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: "#1677D2",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.7 },
  listHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  refresh: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  loader: { marginVertical: 20, alignItems: "center" },
  loadingText: { color: "#627184", fontSize: 14, marginTop: 4 },
  empty: { color: "#627184", fontSize: 14, paddingVertical: 12 },
  userRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#E9EEF4",
  },
  userLogin: { color: "#172536", fontSize: 15, fontWeight: "700" },
  userRole: { color: "#627184", fontSize: 13 },
});
