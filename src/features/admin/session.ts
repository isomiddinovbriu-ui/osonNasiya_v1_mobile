import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ACCESS_KEY = "osonnasiya_admin_token";
const REFRESH_KEY = "osonnasiya_admin_refresh_token";
const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");

type SessionTokens = {
  token: string;
  accessToken?: string;
  refreshToken?: string;
};

let memoryToken: string | null = null;
let memoryRefreshToken: string | null = null;
let generation = 0;
let refreshPromise: Promise<string | null> | null = null;

async function sessionRequest(path: string, refreshToken: string | null) {
  if (!API_URL) throw new Error("API manzili sozlanmagan. .env faylini tekshiring.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetch(`${API_URL}${path}`, {
      method: "POST",
      credentials: Platform.OS === "web" ? "include" : "omit",
      headers: { "Content-Type": "application/json" },
      body: Platform.OS === "web" ? undefined : JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Server javob bermadi. Qayta urinib ko‘ring.");
    }
    if (error instanceof TypeError) {
      throw new Error("Serverga ulanib bo‘lmadi. Internetni tekshiring.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getRefreshToken() {
  if (Platform.OS === "web") return null;
  if (memoryRefreshToken) return memoryRefreshToken;
  memoryRefreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  return memoryRefreshToken;
}

export async function getStoredToken() {
  if (memoryToken) return memoryToken;
  if (Platform.OS === "web") return refreshStoredSession();
  memoryToken = await SecureStore.getItemAsync(ACCESS_KEY);
  if (memoryToken) return memoryToken;
  return refreshStoredSession();
}

export async function setStoredSession(tokens: SessionTokens) {
  const accessToken = tokens.accessToken || tokens.token;
  if (!accessToken || (Platform.OS !== "web" && !tokens.refreshToken)) {
    throw new Error("Sessiya tokenlari to‘liq kelmadi.");
  }
  generation += 1;
  if (Platform.OS !== "web") {
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken!);
    await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  }
  memoryRefreshToken = Platform.OS === "web" ? null : tokens.refreshToken!;
  memoryToken = accessToken;
}

export async function deleteStoredToken() {
  generation += 1;
  memoryToken = null;
  memoryRefreshToken = null;
  if (Platform.OS !== "web") {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
    ]);
  }
}

export function refreshStoredSession(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const currentGeneration = generation;
    const refreshToken = await getRefreshToken();
    if (Platform.OS !== "web" && !refreshToken) {
      await deleteStoredToken();
      return null;
    }
    const response = await sessionRequest("/auth/refresh", refreshToken);
    if (response.status === 401) {
      if (generation === currentGeneration) await deleteStoredToken();
      return null;
    }
    if (!response.ok) throw new Error("Sessiyani yangilab bo‘lmadi.");
    const tokens = (await response.json()) as SessionTokens;
    if (generation !== currentGeneration) return null;
    await setStoredSession(tokens);
    return tokens.accessToken || tokens.token;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function logoutStoredSession() {
  if (refreshPromise) {
    try { await refreshPromise; } catch { /* Local sign out still proceeds. */ }
  }
  const refreshToken = await getRefreshToken();
  try {
    if (Platform.OS === "web" || refreshToken) {
      const response = await sessionRequest("/auth/logout", refreshToken);
      if (!response.ok) throw new Error("Serverdagi sessiyani yopib bo‘lmadi.");
    }
  } finally {
    await deleteStoredToken();
  }
}
