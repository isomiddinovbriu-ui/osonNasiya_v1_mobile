import { Image } from "expo-image";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ApiError, apiRequest, type AuthResult, type User } from "./api";
import StaffManagement from "./StaffManagement";
import LoadingMark from "./LoadingMark";
import { deleteStoredToken, getStoredToken, setStoredToken } from "./session";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function App() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const token = await getStoredToken();
        if (token) {
          const result = await apiRequest<{ user: User }>("/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (active) {
            setToken(token);
            setUser(result.user);
          }
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
      setToken(result.token);
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
    setToken(null);
    setUser(null);
    setPassword("");
  }

  async function handleSessionExpired() {
    await signOut();
    setError("Sessiya tugadi. Qayta kiring.");
  }

  if (checking)
    return (
      <View style={styles.center}>
        <LoadingMark size={104} />
        <Text style={styles.loadingText}>Sessiya tekshirilmoqda...</Text>
        <StatusBar style="dark" />
      </View>
    );

  if (user) {
    return (
      <ScrollView
        style={styles.home}
        contentContainerStyle={styles.homeContent}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar style="dark" />
        <Text style={styles.brand}>OsonNasiya</Text>
        <View style={styles.welcomeCard}>
          <Text style={styles.eyebrow}>{user.role.toUpperCase()}</Text>
          <Text style={styles.welcomeTitle}>Xush kelibsiz, {user.login}</Text>
          <Text style={styles.welcomeText}>
            {user.role === "super_admin"
              ? "Xodimlarni yaratish va ro‘yxatini boshqarish"
              : user.role === "product_creator"
                ? "Guruhlar, bo‘limlar va mahsulotlarni boshqarish"
              : "Hisobingizga muvaffaqiyatli kirdingiz."}
          </Text>
        </View>
        {user.role === "super_admin" && token && (
          <StaffManagement token={token} onSessionExpired={handleSessionExpired} />
        )}
        {user.role === "product_creator" && <View style={styles.catalogLinks}>
          <Pressable style={styles.catalogLink} onPress={() => router.push("/catalog/groups")} accessibilityRole="button">
            <Text style={styles.catalogLinkIcon}>▦</Text>
            <View style={styles.catalogLinkBody}>
              <Text style={styles.catalogLinkTitle}>Guruhlar uchun amallar</Text>
              <Text style={styles.catalogLinkDescription}>Guruhlarni yarating va boshqaring</Text>
            </View>
            <Text style={styles.catalogLinkArrow}>›</Text>
          </Pressable>
          <Pressable style={styles.catalogLink} onPress={() => router.push("/catalog/sections")} accessibilityRole="button">
            <Text style={styles.catalogLinkIcon}>☷</Text>
            <View style={styles.catalogLinkBody}>
              <Text style={styles.catalogLinkTitle}>Bo‘limlar uchun amallar</Text>
              <Text style={styles.catalogLinkDescription}>Guruh bo‘yicha bo‘limlarni boshqaring</Text>
            </View>
            <Text style={styles.catalogLinkArrow}>›</Text>
          </Pressable>
          <Pressable style={styles.catalogLink} onPress={() => router.push("/catalog/products")} accessibilityRole="button">
            <Text style={styles.catalogLinkIcon}>▣</Text>
            <View style={styles.catalogLinkBody}>
              <Text style={styles.catalogLinkTitle}>Mahsulotlar uchun amallar</Text>
              <Text style={styles.catalogLinkDescription}>Mahsulot qo‘shing, rasmlarini boshqaring</Text>
            </View>
            <Text style={styles.catalogLinkArrow}>›</Text>
          </Pressable>
        </View>}
        <Pressable style={styles.outlineButton} onPress={signOut}>
          <Text style={styles.outlineButtonText}>Chiqish</Text>
        </Pressable>
      </ScrollView>
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
        <View style={styles.loginHero}>
          <View style={styles.logoMark}>
            <Image
              source={require("../../../assets/images/brand-mark.png")}
              style={styles.loginLogo}
              contentFit="contain"
              accessibilityLabel="OsonNasiya logosi"
            />
          </View>
          <Text style={styles.loginBrand}>OsonNasiya</Text>
        </View>
        <View style={styles.loginIntro}>
          <Text style={styles.heading}>Tizimga kirish</Text>
          <Text style={styles.subtitle}>
            Hisobingizga kirib, ishni davom ettiring.
          </Text>
        </View>
        <View style={styles.form}>
          <Text style={styles.label}>Login</Text>
          <TextInput
            style={styles.input}
            value={login}
            onChangeText={(value) => {
              setLogin(value);
              setError("");
            }}
            placeholder="Loginni kiriting"
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
              <View style={styles.buttonLoading}>
                <LoadingMark size={32} />
                <Text style={styles.buttonText}>Kirilmoqda...</Text>
              </View>
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
  loadingText: { color: "#627184", fontSize: 15, marginTop: 8 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 36,
  },
  loginHero: { alignItems: "center", marginBottom: 28 },
  logoMark: {
    width: 132,
    height: 132,
    borderRadius: 36,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E8EDF3",
    shadowColor: "#263A52",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
    marginBottom: 12,
  },
  loginLogo: { width: 110, height: 110 },
  loginBrand: { color: "#183B66", fontSize: 22, fontWeight: "800" },
  loginIntro: { alignItems: "center", marginBottom: 24 },
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
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    color: "#627184",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },
  form: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF3",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#263A52",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 2,
  },
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
  buttonLoading: { flexDirection: "row", alignItems: "center", gap: 8 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  help: {
    color: "#627184",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 22,
  },
  home: { flex: 1, backgroundColor: "#F6F8FB" },
  homeContent: { padding: 24, paddingTop: 70, paddingBottom: 40 },
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
  catalogLinks: { gap: 12, marginBottom: 24 },
  catalogLink: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8EDF3", borderRadius: 18, padding: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  catalogLinkIcon: { width: 46, height: 46, textAlign: "center", textAlignVertical: "center", overflow: "hidden", borderRadius: 13, backgroundColor: "#EAF4FF", color: "#1677D2", fontSize: 25, fontWeight: "700" },
  catalogLinkBody: { flex: 1 },
  catalogLinkTitle: { color: "#172536", fontSize: 17, fontWeight: "800" },
  catalogLinkDescription: { color: "#627184", fontSize: 13, lineHeight: 19, marginTop: 4 },
  catalogLinkArrow: { color: "#1677D2", fontSize: 30, lineHeight: 32 },
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
