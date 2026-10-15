import { BlurTargetView, BlurView } from "expo-blur";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
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
import { ApiError, apiRequest, type AuthResult, type User } from "./api";
import CatalogMenu from "./CatalogMenu";
import LoadingMark from "./LoadingMark";
import { deleteStoredToken, getStoredToken, setStoredToken } from "./session";

function VisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <View style={styles.eyeIcon}>
      <View style={styles.eyeOutline}>
        <View style={styles.eyePupil} />
      </View>
      {!visible && <View style={styles.eyeSlash} />}
    </View>
  );
}

export default function App() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [useSystemKeyboard, setUseSystemKeyboard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const blurTargetRef = useRef<View | null>(null);

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
    if (loading) return;
    const normalizedLogin = login.trim();
    if (!normalizedLogin || !password) {
      setError("Login va parolni kiriting.");
      return;
    }
    setError("");
    Keyboard.dismiss();
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

  function pressDigit(digit: string) {
    if (loading) return;
    Keyboard.dismiss();
    setPassword((current) => (current.length < 32 ? current + digit : current));
    setError("");
  }

  function deleteDigit() {
    if (loading) return;
    setPassword((current) => current.slice(0, -1));
    setError("");
  }

  async function signOut() {
    await deleteStoredToken();
    setConfirmSignOut(false);
    setUser(null);
    setPassword("");
  }

  if (checking)
    return (
      <View style={styles.center}>
        <LoadingMark size={104} />
        <Text style={styles.loadingText}>Faollik tekshirilmoqda...</Text>
        <StatusBar style="dark" />
      </View>
    );

  if (user) {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        <BlurTargetView ref={blurTargetRef} style={styles.contentLayer}>
          <ScrollView
            style={styles.home}
            contentContainerStyle={styles.homeContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.homeHeader}>
              <Text style={styles.brand}>OsonNasiya</Text>
              <Pressable
                style={styles.signOutIconButton}
                onPress={() => setConfirmSignOut(true)}
                accessibilityRole="button"
                accessibilityLabel="Akkauntdan chiqish"
              >
                <View style={styles.signOutDoor} />
                <Text style={styles.signOutArrow}>→</Text>
              </Pressable>
            </View>
            <View style={styles.welcomeCard}>
              <Text style={styles.eyebrow}>{user.role.toUpperCase()}</Text>
              <Text style={styles.welcomeTitle}>
                Xush kelibsiz, {user.login}
              </Text>
              <Text style={styles.welcomeText}>
                {user.role === "super_admin"
                  ? "Xodimlar va mahsulotlar katalogini boshqarish"
                  : user.role === "product_creator"
                    ? "Guruhlar, bo‘limlar va mahsulotlarni boshqarish"
                    : user.role === "sotuvchi"
                      ? "Mijoz va uning savdo ma’lumotlarini kiriting."
                      : "Hisobingizga muvaffaqiyatli kirdingiz."}
              </Text>
            </View>
            {user.role === "super_admin" && (
              <View style={styles.catalogLinks}>
                <Pressable
                  style={styles.catalogLink}
                  onPress={() => router.push("/catalog/home")}
                  accessibilityRole="button"
                >
                  <Text style={styles.catalogLinkIcon}>▣</Text>
                  <View style={styles.catalogLinkBody}>
                    <Text style={styles.catalogLinkTitle}>
                      Mahsulotlar uchun
                    </Text>
                    <Text style={styles.catalogLinkDescription}>
                      Guruh, bo‘lim va mahsulotlarni boshqaring
                    </Text>
                  </View>
                  <Text style={styles.catalogLinkArrow}>›</Text>
                </Pressable>
                <Pressable
                  style={styles.catalogLink}
                  onPress={() => router.push("/staff")}
                  accessibilityRole="button"
                >
                  <Text style={styles.catalogLinkIcon}>♙</Text>
                  <View style={styles.catalogLinkBody}>
                    <Text style={styles.catalogLinkTitle}>Xodimlar uchun</Text>
                    <Text style={styles.catalogLinkDescription}>
                      Xodimlarni yarating va tahrirlang
                    </Text>
                  </View>
                  <Text style={styles.catalogLinkArrow}>›</Text>
                </Pressable>
              </View>
            )}
            {user.role === "product_creator" && <CatalogMenu />}
            <View style={styles.catalogLinks}>
              <Pressable
                style={styles.catalogLink}
                onPress={() => router.push("/customers" as Href)}
                accessibilityRole="button"
              >
                <Text style={styles.catalogLinkIcon}>▤</Text>
                <View style={styles.catalogLinkBody}>
                  <Text style={styles.catalogLinkTitle}>Mijozlar</Text>
                  <Text style={styles.catalogLinkDescription}>
                    Mijozlarni qidiring va ma’lumotlarini ko‘ring
                  </Text>
                </View>
                <Text style={styles.catalogLinkArrow}>›</Text>
              </Pressable>
            </View>
            {user.role === "sotuvchi" && (
              <View style={styles.catalogLinks}>
                <Pressable
                  style={styles.catalogLink}
                  onPress={() => router.push("/customers/new")}
                  accessibilityRole="button"
                >
                  <Text style={styles.catalogLinkIcon}>＋</Text>
                  <View style={styles.catalogLinkBody}>
                    <Text style={styles.catalogLinkTitle}>
                      Yangi mijoz yaratish
                    </Text>
                    <Text style={styles.catalogLinkDescription}>
                      Mahsulot, hudud va to‘lov ma’lumotlarini kiriting
                    </Text>
                  </View>
                  <Text style={styles.catalogLinkArrow}>›</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </BlurTargetView>
        {confirmSignOut && (
          <View style={styles.signOutOverlay} accessibilityViewIsModal>
            <BlurView
              blurTarget={blurTargetRef}
              blurMethod="dimezisBlurView"
              intensity={75}
              tint="light"
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.signOutScrim} />
            <View style={styles.signOutCard}>
              <Text style={styles.signOutTitle}>
                Akkauntdan chiqmoqchimisiz?
              </Text>
              <View style={styles.signOutActions}>
                <Pressable
                  style={[styles.signOutAction, styles.cancelAction]}
                  onPress={() => setConfirmSignOut(false)}
                  accessibilityRole="button"
                >
                  <Text style={styles.signOutActionText}>Yo‘q</Text>
                </Pressable>
                <Pressable
                  style={[styles.signOutAction, styles.confirmAction]}
                  onPress={() => void signOut()}
                  accessibilityRole="button"
                >
                  <Text style={styles.signOutActionText}>Ha</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <BlurTargetView ref={blurTargetRef} style={styles.contentLayer}>
        <KeyboardAvoidingView
          style={styles.contentLayer}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.screenTitle}>Avtorizatsiya</Text>
            <View style={styles.loginField}>
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
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                editable={!loading}
              />
            </View>
            <View style={styles.pinSection}>
              <View style={styles.pinTitleRow}>
                <Text style={styles.pinTitle}>OsonNasiya PINni kiriting</Text>
                <View style={styles.pinLogoBadge}>
                  <Image
                    source={require("../../../assets/images/brand-mark.png")}
                    style={styles.pinLogo}
                    contentFit="contain"
                    accessibilityLabel="OsonNasiya logosi"
                  />
                </View>
              </View>
              <Text style={styles.pinSubtitle}>
                Hisobingizga kirish uchun parolni kiriting
              </Text>
              {useSystemKeyboard ? (
                <TextInput
                  style={styles.systemPasswordInput}
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setError("");
                  }}
                  placeholder="Parolni kiriting"
                  placeholderTextColor="#9AA6B5"
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  maxLength={32}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  accessibilityLabel="Parol"
                />
              ) : (
                <View style={styles.pinEntryRow}>
                  <View
                    style={styles.pinDots}
                    accessibilityLabel={`${password.length} ta raqam kiritildi`}
                  >
                    {Array.from(
                      { length: Math.max(5, password.length) },
                      (_, index) => (
                        <View key={index} style={styles.pinSlot}>
                          {showPassword ? (
                            <Text style={styles.pinDigit}>
                              {password[index] ?? "–"}
                            </Text>
                          ) : (
                            <View
                              style={[
                                styles.pinDot,
                                index < password.length && styles.pinDotFilled,
                              ]}
                            />
                          )}
                        </View>
                      ),
                    )}
                  </View>
                  <Pressable
                    onPress={() => setShowPassword((current) => !current)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? "Parolni yashirish" : "Parolni ko‘rsatish"
                    }
                    style={styles.showPasswordButton}
                  >
                    <VisibilityIcon visible={showPassword} />
                  </Pressable>
                </View>
              )}
              {useSystemKeyboard && (
                <Pressable
                  onPress={() => setShowPassword((current) => !current)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword ? "Parolni yashirish" : "Parolni ko‘rsatish"
                  }
                  style={styles.showPasswordButton}
                >
                  <VisibilityIcon visible={showPassword} />
                </Pressable>
              )}
              {!!error && (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              )}
            </View>
            <View style={styles.keypadSection}>
              {!useSystemKeyboard && (
                <>
                  <View style={styles.keypad}>
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(
                      (digit) => (
                        <Pressable
                          key={digit}
                          style={({ pressed }) => [
                            styles.key,
                            pressed && styles.keyPressed,
                          ]}
                          onPress={() => pressDigit(digit)}
                          disabled={loading}
                          accessibilityRole="button"
                          accessibilityLabel={digit}
                        >
                          <Text style={styles.keyText}>{digit}</Text>
                        </Pressable>
                      ),
                    )}
                    <View style={styles.keyEmpty} />
                    <Pressable
                      style={({ pressed }) => [
                        styles.key,
                        pressed && styles.keyPressed,
                      ]}
                      onPress={() => pressDigit("0")}
                      disabled={loading}
                      accessibilityRole="button"
                      accessibilityLabel="0"
                    >
                      <Text style={styles.keyText}>0</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.key,
                        pressed && styles.keyPressed,
                      ]}
                      onPress={deleteDigit}
                      disabled={loading || password.length === 0}
                      accessibilityRole="button"
                      accessibilityLabel="Oxirgi raqamni o‘chirish"
                    >
                      <Text style={styles.deleteKeyText}>⌫</Text>
                    </Pressable>
                  </View>
                </>
              )}
              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={signIn}
                disabled={loading}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>Kirish</Text>
              </Pressable>
              <Text style={styles.help}>
                Parolni unutdingizmi? Tizim administratoriga murojaat qiling.
              </Text>
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setUseSystemKeyboard((current) => !current);
                }}
                accessibilityRole="button"
                style={styles.keyboardSwitchButton}
              >
                <Text style={styles.keyboardSwitch}>
                  {useSystemKeyboard
                    ? "Raqamli panelga qaytish"
                    : "Oddiy klaviatura bilan kiritish"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </BlurTargetView>
      {loading && (
        <View style={styles.loadingOverlay} accessibilityViewIsModal>
          <BlurView
            blurTarget={blurTargetRef}
            blurMethod="dimezisBlurView"
            intensity={75}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.loadingScrim} />
          <View
            style={styles.loadingCard}
            accessibilityRole="progressbar"
            accessibilityLabel="Kirilmoqda"
          >
            <LoadingMark size={118} />
            <Text style={styles.loadingTitle}>Kirilmoqda...</Text>
            <Text style={styles.loadingHint}>Iltimos, kuting</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F8FC" },
  contentLayer: { flex: 1 },
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
    paddingBottom: 28,
  },
  screenTitle: {
    color: "#172536",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  loginField: {
    width: "90%",
    maxWidth: 300,
    alignSelf: "center",
    marginTop: 48,
  },
  pinSection: { alignItems: "center", marginTop: 60 },
  pinTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  pinTitle: { color: "#172536", fontSize: 17, fontWeight: "800" },
  pinLogoBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  pinLogo: { width: 21, height: 21 },
  pinSubtitle: {
    color: "#8793A3",
    fontSize: 12,
    textAlign: "center",
    marginTop: 5,
  },
  pinEntryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 19,
  },
  pinDots: {
    minHeight: 32,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    maxWidth: 280,
  },
  pinSlot: {
    width: 20,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  pinDigit: { color: "#1677D2", fontSize: 20, fontWeight: "500" },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#ECA65F",
  },
  pinDotFilled: { backgroundColor: "#E87520", borderColor: "#E87520" },
  systemPasswordInput: {
    width: "100%",
    maxWidth: 320,
    height: 50,
    marginTop: 16,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    backgroundColor: "#FFFFFF",
    color: "#172536",
    fontSize: 16,
  },
  showPasswordButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 7,
  },
  eyeIcon: {
    width: 24,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  eyeOutline: {
    width: 23,
    height: 14,
    borderWidth: 2,
    borderColor: "#1677D2",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  eyePupil: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1677D2",
  },
  eyeSlash: {
    position: "absolute",
    width: 27,
    height: 2,
    backgroundColor: "#1677D2",
    transform: [{ rotate: "-38deg" }],
  },
  brand: {
    color: "#183B66",
    fontSize: 21,
    fontWeight: "800",
  },
  label: { color: "#172536", fontSize: 14, fontWeight: "700", marginBottom: 8 },
  keyboardSwitchButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  keyboardSwitch: { color: "#1677D2", fontSize: 13, fontWeight: "700" },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    color: "#172536",
    fontSize: 16,
    marginBottom: 0,
  },
  keypadSection: {
    width: "100%",
    maxWidth: 340,
    alignSelf: "center",
    marginTop: "auto",
    paddingTop: 38,
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  key: {
    width: "30%",
    height: 58,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  keyEmpty: { width: "30%", height: 58 },
  keyPressed: { backgroundColor: "#EAF0F7" },
  keyText: { color: "#172536", fontSize: 26, fontWeight: "600" },
  deleteKeyText: { color: "#172536", fontSize: 26 },
  error: {
    color: "#C3333D",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
  },
  button: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#1677D2",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  loadingScrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(246, 248, 251, 0.34)",
  },
  loadingCard: {
    width: "78%",
    maxWidth: 320,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingVertical: 30,
    paddingHorizontal: 20,
    shadowColor: "#263A52",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
  loadingTitle: {
    color: "#172536",
    fontSize: 23,
    fontWeight: "800",
    marginTop: 8,
  },
  loadingHint: { color: "#627184", fontSize: 14, marginTop: 6 },
  help: {
    color: "#627184",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 14,
  },
  home: { flex: 1, backgroundColor: "#F6F8FB" },
  homeContent: { padding: 24, paddingTop: 70, paddingBottom: 40 },
  homeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 44,
  },
  signOutIconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  signOutDoor: {
    width: 15,
    height: 20,
    borderWidth: 2,
    borderColor: "#D33B45",
    borderRightWidth: 0,
    borderRadius: 2,
  },
  signOutArrow: {
    color: "#D33B45",
    fontSize: 22,
    fontWeight: "700",
    marginLeft: -3,
    marginTop: -2,
  },
  signOutOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  signOutScrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(23, 37, 54, 0.18)",
  },
  signOutCard: {
    width: "84%",
    maxWidth: 340,
    padding: 24,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    shadowColor: "#263A52",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
  signOutTitle: {
    color: "#172536",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 24,
  },
  signOutActions: { width: "100%", flexDirection: "row", gap: 12 },
  signOutAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelAction: { backgroundColor: "#1677D2" },
  confirmAction: { backgroundColor: "#D33B45" },
  signOutActionText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
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
  catalogLink: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF3",
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  catalogLinkIcon: {
    width: 46,
    height: 46,
    textAlign: "center",
    textAlignVertical: "center",
    overflow: "hidden",
    borderRadius: 13,
    backgroundColor: "#EAF4FF",
    color: "#1677D2",
    fontSize: 25,
    fontWeight: "700",
  },
  catalogLinkBody: { flex: 1 },
  catalogLinkTitle: { color: "#172536", fontSize: 17, fontWeight: "800" },
  catalogLinkDescription: {
    color: "#627184",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  catalogLinkArrow: { color: "#1677D2", fontSize: 30, lineHeight: 32 },
});
