import { BlurTargetView, BlurView } from "expo-blur";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState, type ComponentProps } from "react";
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
import { ApiError, apiRequest, type AuthResult, type User, type UserRole } from "./api";
import CatalogMenu from "./CatalogMenu";
import LoadingMark from "./LoadingMark";
import { PullRefreshControl, PullRefreshFeedback } from "./PullRefresh";
import { canSwitchRememberedLogin, getRememberedLogin, rememberLogin, setCanSwitchRememberedLogin } from "./rememberedLogin";
import { deleteStoredToken, getStoredToken, logoutStoredSession, setStoredSession } from "./session";

type SymbolName = ComponentProps<typeof SymbolView>["name"];

const roleAppearance: Record<UserRole, { label: string; icon: SymbolName; color: string; background: string }> = {
  super_admin: {
    label: "Super admin",
    icon: { ios: "person.crop.circle.badge.checkmark", android: "admin_panel_settings", web: "admin_panel_settings" },
    color: "#1769B6",
    background: "#E7F2FF",
  },
  product_creator: {
    label: "Mahsulotlar menejeri",
    icon: { ios: "shippingbox.fill", android: "inventory_2", web: "inventory_2" },
    color: "#7654B5",
    background: "#F0EAFC",
  },
  sotuvchi: {
    label: "Sotuvchi",
    icon: { ios: "bag.fill", android: "storefront", web: "storefront" },
    color: "#BA6B1F",
    background: "#FFF0DE",
  },
  yiguvchi: {
    label: "Yig‘uvchi",
    icon: { ios: "creditcard.fill", android: "payments", web: "payments" },
    color: "#188064",
    background: "#E3F5EE",
  },
};

type HomeAction = { title: string; href: Href; icon: SymbolName };

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
  const [loginFocused, setLoginFocused] = useState(false);
  const [editingLogin, setEditingLogin] = useState(true);
  const [showLoginSwitch, setShowLoginSwitch] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [useSystemKeyboard, setUseSystemKeyboard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const blurTargetRef = useRef<View | null>(null);

  async function restoreRememberedLogin() {
    try {
      const savedLogin = await getRememberedLogin();
      setLogin(savedLogin ?? "");
      setEditingLogin(!savedLogin);
      const canSwitch = savedLogin
        ? await canSwitchRememberedLogin().catch(() => false)
        : false;
      setShowLoginSwitch(canSwitch);
    } catch {
      setLogin("");
      setEditingLogin(true);
      setShowLoginSwitch(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const savedLogin = await getRememberedLogin();
        if (active && savedLogin) {
          setLogin(savedLogin);
          setEditingLogin(false);
          setShowLoginSwitch(await canSwitchRememberedLogin());
        }
      } catch {
        // A storage failure should still allow manual sign in.
      }
      try {
        const token = await getStoredToken();
        if (token) {
          const result = await apiRequest<{ user: User }>("/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (active) {
            setUser(result.user);
            setLogin(result.user.login);
            setEditingLogin(false);
            setShowLoginSwitch(false);
          }
          void rememberLogin(result.user.login).catch(() => {});
          void setCanSwitchRememberedLogin(false).catch(() => {});
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
        credentials: Platform.OS === "web" ? "include" : "omit",
        body: JSON.stringify({ login: normalizedLogin, password, clientType: Platform.OS === "web" ? "web" : "mobile" }),
      });
      await setStoredSession(result);
      setLogin(result.user.login);
      const saved = await rememberLogin(result.user.login).then(() => true, () => false);
      setEditingLogin(!saved);
      setShowLoginSwitch(false);
      await setCanSwitchRememberedLogin(false).catch(() => {});
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
    try {
      await logoutStoredSession();
    } catch {
      setError("Serverdagi sessiyani yopib bo‘lmadi.");
    } finally {
      setConfirmSignOut(false);
      setUser(null);
      setPassword("");
      setLogin(user?.login ?? login);
      setEditingLogin(false);
      setShowLoginSwitch(true);
      await setCanSwitchRememberedLogin(true).catch(() => {});
    }
  }

  async function refreshSession() {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const token = await getStoredToken();
      if (!token) { setUser(null); await restoreRememberedLogin(); return; }
      const result = await apiRequest<{ user: User }>("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(result.user);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await deleteStoredToken();
        setUser(null);
        await restoreRememberedLogin();
        setError("Sessiya tugadi. Qayta kiring.");
      } else {
        setError(cause instanceof Error ? cause.message : "Yangilab bo‘lmadi.");
      }
    } finally {
      setRefreshing(false);
    }
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
    const homeActions: HomeAction[] = [
      ...(user.role === "super_admin"
        ? [
            { title: "Mahsulotlar", href: "/catalog/home" as Href, icon: { ios: "shippingbox", android: "inventory_2", web: "inventory_2" } as const },
            { title: "Xodimlar", href: "/staff" as Href, icon: { ios: "person.2", android: "groups", web: "groups" } as const },
            { title: "Hisobotlar", href: "/reports" as Href, icon: { ios: "chart.bar.fill", android: "bar_chart", web: "bar_chart" } as const },
          ]
        : []),
      ...(user.role === "sotuvchi"
        ? [
            { title: "Yangi mijoz", href: "/customers/new" as Href, icon: { ios: "person.badge.plus", android: "person_add", web: "person_add" } as const },
            { title: "Qarzlarni undirish", href: "/sales" as Href, icon: { ios: "creditcard", android: "payments", web: "payments" } as const },
          ]
        : []),
      ...(user.role === "super_admin" || user.role === "yiguvchi"
        ? [{ title: "Ish ro‘yxati", href: "/collections" as Href, icon: { ios: "list.bullet.clipboard", android: "assignment", web: "assignment" } as const }]
        : []),
      { title: "Mijozlar", href: "/customers" as Href, icon: { ios: "person.2", android: "group", web: "group" } },
      ...(user.role !== "product_creator"
        ? [{ title: "Aloqalar", href: "/contacts" as Href, icon: { ios: "phone.arrow.up.right", android: "call", web: "call" } as const }]
        : []),
    ];
    const appearance = roleAppearance[user.role];
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        <BlurTargetView ref={blurTargetRef} style={styles.contentLayer}>
          <ScrollView
            style={styles.home}
            contentContainerStyle={styles.homeContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={<PullRefreshControl refreshing={refreshing} onRefresh={() => { void refreshSession(); }} />}
          >
            <PullRefreshFeedback active={refreshing} />
            {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
            <View style={styles.homeHeader}>
              <View style={styles.brandRow}>
                <Image
                  source={require("../../../assets/images/brand-mark.png")}
                  style={styles.brandLogo}
                  contentFit="contain"
                  accessibilityLabel="OsonNasiya logosi"
                />
                <Text style={styles.brand}>OsonNasiya</Text>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.signOutIconButton,
                  pressed && styles.signOutIconButtonPressed,
                ]}
                onPress={() => setConfirmSignOut(true)}
                accessibilityRole="button"
                accessibilityLabel="Akkauntdan chiqish"
              >
                <SymbolView
                  name={{ ios: "rectangle.portrait.and.arrow.right", android: "logout", web: "logout" }}
                  tintColor="#C3333D"
                  size={23}
                />
              </Pressable>
            </View>
            <View style={styles.homeIntro}>
              <View style={[styles.roleIcon, { backgroundColor: appearance.background }]}>
                <SymbolView name={appearance.icon} tintColor={appearance.color} size={27} />
              </View>
              <View style={styles.homeIntroText}>
                <Text style={styles.homeGreeting}>Salom, {user.name || user.login}</Text>
                <Text style={styles.homeRole}>{appearance.label}</Text>
              </View>
            </View>
            {user.role === "product_creator" && <CatalogMenu />}
            <Text style={styles.homeSectionTitle}>Bo‘limlar</Text>
            <View style={styles.homeMenu}>
              {homeActions.map((action, index) => (
                <Pressable
                  key={action.title}
                  style={({ pressed }) => [
                    styles.homeMenuItem,
                    index < homeActions.length - 1 && styles.homeMenuDivider,
                    pressed && styles.homeMenuItemPressed,
                  ]}
                  onPress={() => router.push(action.href)}
                  accessibilityRole="button"
                >
                  <View style={styles.homeMenuIcon}>
                    <SymbolView name={action.icon} tintColor="#1677D2" size={20} />
                  </View>
                  <Text style={styles.homeMenuTitle}>{action.title}</Text>
                  <Text style={styles.homeMenuArrow}>›</Text>
                </Pressable>
              ))}
            </View>
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
            <Pressable
              style={styles.signOutScrim}
              onPress={() => setConfirmSignOut(false)}
              accessibilityRole="button"
              accessibilityLabel="Chiqish oynasini yopish"
            />
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
            refreshControl={<PullRefreshControl refreshing={refreshing} onRefresh={() => { if (!loading) void refreshSession(); }} />}
          >
            <PullRefreshFeedback active={refreshing} />
            <Text style={styles.screenTitle}>Avtorizatsiya</Text>
            <View style={styles.loginField}>
              {editingLogin ? (
                <>
                  <Text style={styles.label}>Login</Text>
                  <View style={[styles.loginInputCard, loginFocused && styles.loginInputCardFocused]}>
                    <View style={styles.loginInputIcon}>
                      <SymbolView name={{ ios: "person.fill", android: "person", web: "person" }} size={20} tintColor="#1677D2" />
                    </View>
                    <TextInput
                      style={styles.loginInput}
                      value={login}
                      onChangeText={(value) => {
                        setLogin(value);
                        setError("");
                      }}
                      onFocus={() => setLoginFocused(true)}
                      onBlur={() => setLoginFocused(false)}
                      placeholder="Loginni kiriting"
                      placeholderTextColor="#9AA6B5"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="username"
                      textContentType="username"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      editable={!loading}
                      accessibilityLabel="Login"
                      underlineColorAndroid="transparent"
                    />
                  </View>
                </>
              ) : (
                <View style={styles.savedLoginCard}>
                  <View style={styles.savedLoginRow}>
                    <View style={styles.savedLoginIcon}>
                      <SymbolView name={{ ios: "person.crop.circle.fill", android: "account_circle", web: "account_circle" }} size={28} tintColor="#1677D2" />
                    </View>
                    <View style={styles.savedLoginText}>
                      <Text style={styles.savedLoginLabel}>Saqlangan akkaunt</Text>
                      <Text style={styles.savedLoginName} numberOfLines={1}>{login}</Text>
                    </View>
                  </View>
                  {showLoginSwitch && (
                    <Pressable
                      onPress={() => {
                        setLogin("");
                        setPassword("");
                        setEditingLogin(true);
                        setError("");
                      }}
                      disabled={loading}
                      accessibilityRole="button"
                      accessibilityLabel="Boshqa login bilan kirish"
                      style={({ pressed }) => [styles.changeLoginButton, pressed && styles.changeLoginButtonPressed, loading && styles.changeLoginButtonDisabled]}
                    >
                      <Text style={styles.changeLoginText}>Boshqa akkauntga kirish</Text>
                      <SymbolView name={{ ios: "chevron.right", android: "chevron_right", web: "chevron_right" }} size={18} tintColor="#1677D2" />
                    </Pressable>
                  )}
                </View>
              )}
            </View>
            <View style={[styles.pinSection, !editingLogin && styles.savedLoginPinSection]}>
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
  savedLoginCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E1E9F2",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 11,
  },
  savedLoginRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  savedLoginIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#EAF4FF", alignItems: "center", justifyContent: "center" },
  savedLoginText: { flex: 1 },
  savedLoginLabel: { color: "#718197", fontSize: 12, fontWeight: "600", marginBottom: 3 },
  savedLoginName: { color: "#172536", fontSize: 17, fontWeight: "800" },
  changeLoginButton: { minHeight: 45, borderTopWidth: 1, borderTopColor: "#E8EDF3", marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  changeLoginButtonPressed: { opacity: 0.65 },
  changeLoginButtonDisabled: { opacity: 0.45 },
  changeLoginText: { color: "#1677D2", fontSize: 13, fontWeight: "700" },
  pinSection: { alignItems: "center", marginTop: 60 },
  savedLoginPinSection: { marginTop: 44 },
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
  loginInputCard: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#E1E9F2",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  loginInputCardFocused: {
    borderColor: "#1677D2",
    backgroundColor: "#FDFEFF",
  },
  loginInputIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  loginInput: {
    flex: 1,
    minWidth: 0,
    height: 54,
    paddingHorizontal: 0,
    color: "#172536",
    fontSize: 16,
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
  homeContent: { paddingHorizontal: 20, paddingTop: 62, paddingBottom: 40 },
  homeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 40,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandLogo: { width: 34, height: 34 },
  signOutIconButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1F2",
    borderWidth: 1,
    borderColor: "#F7C9CE",
  },
  signOutIconButtonPressed: {
    backgroundColor: "#FCE1E4",
    transform: [{ scale: 0.96 }],
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
  homeIntro: { marginBottom: 35, flexDirection: "row", alignItems: "center", gap: 14 },
  roleIcon: { width: 54, height: 54, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  homeIntroText: { flex: 1 },
  homeGreeting: { color: "#172536", fontSize: 25, fontWeight: "800" },
  homeRole: { color: "#627184", fontSize: 14, marginTop: 6 },
  homeSectionTitle: { color: "#627184", fontSize: 13, fontWeight: "700", marginBottom: 12 },
  homeMenu: { backgroundColor: "#FFFFFF", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#E8EDF3" },
  homeMenuItem: { minHeight: 65, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 15 },
  homeMenuIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center" },
  homeMenuDivider: { borderBottomWidth: 1, borderBottomColor: "#EEF1F5" },
  homeMenuItemPressed: { backgroundColor: "#F1F7FF" },
  homeMenuTitle: { flex: 1, color: "#172536", fontSize: 16, fontWeight: "700" },
  homeMenuArrow: { color: "#1677D2", fontSize: 27, lineHeight: 30 },
});
