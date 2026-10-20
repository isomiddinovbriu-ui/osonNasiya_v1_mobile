import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_LOGIN_KEY = "osonnasiya_last_login";
const LOGIN_SWITCH_KEY = "osonnasiya_login_switch_available";

export async function getRememberedLogin(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(LAST_LOGIN_KEY);
  if (!stored) return null;

  if (!stored.startsWith("{")) return stored;

  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value === "object" && value !== null && "login" in value && typeof value.login === "string" && value.login) {
      return value.login;
    }
  } catch {
    // Ignore invalid data and let the user enter the login again.
  }

  await AsyncStorage.removeItem(LAST_LOGIN_KEY);
  return null;
}

export async function rememberLogin(login: string): Promise<void> {
  await AsyncStorage.setItem(LAST_LOGIN_KEY, login);
}

export async function canSwitchRememberedLogin(): Promise<boolean> {
  return (await AsyncStorage.getItem(LOGIN_SWITCH_KEY)) === "true";
}

export async function setCanSwitchRememberedLogin(available: boolean): Promise<void> {
  if (available) {
    await AsyncStorage.setItem(LOGIN_SWITCH_KEY, "true");
  } else {
    await AsyncStorage.removeItem(LOGIN_SWITCH_KEY);
  }
}
