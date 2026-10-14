import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type User = { id: string; login: string; role: "super_admin" };
type AuthResult = { token: string; user: User };

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const TOKEN_KEY = "osonnasiya_admin_token";
const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");

// SecureStore is native-only. Keep web sessions in memory for previewing the UI.
async function getStoredToken() {
  return Platform.OS === "web" ? null : SecureStore.getItemAsync(TOKEN_KEY);
}

async function setStoredToken(token: string) {
  if (Platform.OS !== "web") await SecureStore.setItemAsync(TOKEN_KEY, token);
}

async function deleteStoredToken() {
  if (Platform.OS !== "web") await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!API_URL)
    throw new Error("API manzili sozlanmagan. .env faylini tekshiring.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    const data = await response.json();
    if (!response.ok)
      throw new ApiError(
        data.message || "So‘rov bajarilmadi.",
        response.status,
      );
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("Server javob bermadi. Qayta urinib ko‘ring.");
    if (error instanceof TypeError)
      throw new Error(
        "Serverga ulanib bo‘lmadi. Wi-Fi va API manzilini tekshiring.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export default function App() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const token = await getStoredToken();
        if (token) {
          const result = await apiRequest<{ user: User }>("/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (active) setUser(result.user);
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await deleteStoredToken();
          if (active) setError("Sessiya tugadi. Qayta kiring.");
        } else if (active) {
          setError(
            error instanceof Error
              ? error.message
              : "Sessiyani tekshirib bo‘lmadi.",
          );
        }
      } finally {
        if (active) setChecking(false);
      }
    }
    restoreSession();
    return () => {
      active = false;
    };
  }, []);

  async function signIn() {
    const normalizedLogin = login.trim();
    if (!normalizedLogin || !password) {
      setError("Login va parolni kiriting.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await apiRequest<AuthResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ login: normalizedLogin, password }),
      });
      await setStoredToken(result.token);
      setPassword("");
      setUser(result.user);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Kirishda xatolik yuz berdi.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await deleteStoredToken();
    setUser(null);
    setPassword("");
  }

  if (checking)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1677D2" />
        <StatusBar style="dark" />
      </View>
    );

  if (user) {
    return (
      <View style={styles.home}>
        <StatusBar style="dark" />
        <Text style={styles.brand}>OsonNasiya</Text>
        <View style={styles.welcomeCard}>
          <Text style={styles.eyebrow}>SUPER ADMIN</Text>
          <Text style={styles.welcomeTitle}>Xush kelibsiz, {user.login}</Text>
          <Text style={styles.welcomeText}>
            Kirish muvaffaqiyatli. Boshqaruv bo‘limlari keyingi bosqichda
            qo‘shiladi.
          </Text>
        </View>
        <Pressable style={styles.outlineButton} onPress={signOut}>
          <Text style={styles.outlineButtonText}>Chiqish</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoMark}>
          <Text style={styles.logoLetter}>O</Text>
        </View>
        <Text style={styles.brand}>OsonNasiya</Text>
        <Text style={styles.heading}>Tizimga kirish</Text>
        <Text style={styles.subtitle}>
          Boshqaruv paneliga kirish uchun hisobingizni kiriting.
        </Text>
        <View style={styles.form}>
          <Text style={styles.label}>Login</Text>
          <TextInput
            style={styles.input}
            value={login}
            onChangeText={(value) => {
              setLogin(value);
              setError("");
            }}
            placeholder="Admin loginini kiriting"
            placeholderTextColor="#9AA6B5"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            returnKeyType="next"
            editable={!loading}
          />
          <Text style={styles.label}>Parol</Text>
          <View style={styles.passwordBox}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setError("");
              }}
              placeholder="Parolni kiriting"
              placeholderTextColor="#9AA6B5"
              secureTextEntry={!showPassword}
              textContentType="password"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={signIn}
              editable={!loading}
            />
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              accessibilityLabel={
                showPassword ? "Parolni yashirish" : "Parolni ko‘rsatish"
              }
            >
              <Text style={styles.showText}>
                {showPassword ? "Yashirish" : "Ko‘rsatish"}
              </Text>
            </Pressable>
          </View>
          {!!error && (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          )}
          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={signIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Kirish</Text>
            )}
          </Pressable>
          <Text style={styles.help}>
            Parolni unutdingizmi? Tizim administratoriga murojaat qiling.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F6F8FB" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F8FB",
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 90,
    paddingBottom: 32,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#183B66",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  logoLetter: { color: "#FFFFFF", fontSize: 36, fontWeight: "800" },
  brand: {
    color: "#183B66",
    fontSize: 21,
    fontWeight: "800",
    marginBottom: 44,
  },
  heading: {
    color: "#172536",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 10,
  },
  subtitle: {
    color: "#627184",
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 32,
  },
  form: { width: "100%" },
  label: { color: "#172536", fontSize: 14, fontWeight: "700", marginBottom: 8 },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    color: "#172536",
    fontSize: 16,
    marginBottom: 20,
  },
  passwordBox: {
    height: 52,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: { flex: 1, color: "#172536", fontSize: 16, height: "100%" },
  showText: {
    color: "#1677D2",
    fontWeight: "700",
    fontSize: 13,
    paddingLeft: 8,
  },
  error: { color: "#C3333D", fontSize: 14, lineHeight: 20, marginTop: 14 },
  button: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#1677D2",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  help: {
    color: "#627184",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 22,
  },
  home: { flex: 1, backgroundColor: "#F6F8FB", padding: 24, paddingTop: 90 },
  welcomeCard: {
    backgroundColor: "#FFFFFF",
    padding: 24,
    borderRadius: 16,
    marginTop: 12,
    marginBottom: 24,
  },
  eyebrow: {
    color: "#1677D2",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 12,
  },
  welcomeTitle: {
    color: "#172536",
    fontSize: 25,
    fontWeight: "800",
    marginBottom: 10,
  },
  welcomeText: { color: "#627184", fontSize: 15, lineHeight: 23 },
  outlineButton: {
    height: 52,
    borderWidth: 1,
    borderColor: "#1677D2",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineButtonText: { color: "#1677D2", fontSize: 16, fontWeight: "700" },
});
