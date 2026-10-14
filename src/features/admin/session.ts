import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "osonnasiya_admin_token";
let memoryToken: string | null = null;

export async function getStoredToken() {
  return memoryToken ?? (Platform.OS === "web" ? null : SecureStore.getItemAsync(TOKEN_KEY));
}

export async function setStoredToken(token: string) {
  if (Platform.OS !== "web") await SecureStore.setItemAsync(TOKEN_KEY, token);
  memoryToken = token;
}

export async function deleteStoredToken() {
  memoryToken = null;
  if (Platform.OS !== "web") await SecureStore.deleteItemAsync(TOKEN_KEY);
}
