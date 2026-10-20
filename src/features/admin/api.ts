import { getStoredToken, refreshStoredSession } from "./session";

export type UserRole = "super_admin" | "yiguvchi" | "sotuvchi" | "product_creator";
export type User = { id: string; login: string; role: UserRole; name: string; description: string };
export type AuthResult = {
  token: string;
  accessToken: string;
  expiresIn: number;
  refreshExpiresAt: string;
  refreshToken?: string;
  user: User;
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  responseFormat: "json" | "text" = "json",
): Promise<T> {
  if (!API_URL) {
    throw new Error("API manzili sozlanmagan. .env faylini tekshiring.");
  }
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const bearer = headers.get("Authorization");
  const authenticated = bearer?.startsWith("Bearer ") &&
    !["/auth/login", "/auth/refresh", "/auth/logout"].includes(path);
  if (authenticated) {
    const currentToken = await getStoredToken();
    if (currentToken) headers.set("Authorization", `Bearer ${currentToken}`);
  }

  async function send() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      return await fetch(`${API_URL}${path}`, {
        ...options,
        credentials: options.credentials ?? (path.startsWith("/auth/") ? "include" : "same-origin"),
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  try {
    let response = await send();
    if (response.status === 401 && authenticated) {
      const failedToken = headers.get("Authorization")?.slice(7);
      const currentToken = await getStoredToken();
      const renewedToken = currentToken && currentToken !== failedToken
        ? currentToken
        : await refreshStoredSession();
      if (renewedToken) {
        headers.set("Authorization", `Bearer ${renewedToken}`);
        response = await send();
      }
    }
    const data = response.status === 204
      ? null
      : responseFormat === "text"
        ? await response.text()
        : await response.json();
    if (!response.ok) {
      let message = typeof data === "object" ? data?.message : undefined;
      if (typeof data === "string") {
        try { message = JSON.parse(data).message; } catch { message = data; }
      }
      throw new ApiError(message || "So'rov bajarilmadi.", response.status);
    }
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Server javob bermadi. Qayta urinib ko'ring.");
    }
    if (error instanceof TypeError) {
      throw new Error("Serverga ulanib bo'lmadi. Wi-Fi va API manzilini tekshiring.");
    }
    throw error;
  }
}

export function apiRequestText(path: string, options: RequestInit = {}) {
  return apiRequest<string>(path, options, "text");
}
