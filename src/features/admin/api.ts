export type UserRole = "super_admin" | "yiguvchi" | "sotuvchi" | "product_creator";
export type User = { id: string; login: string; role: UserRole; name: string; description: string };
export type AuthResult = { token: string; user: User };

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!API_URL) {
    throw new Error("API manzili sozlanmagan. .env faylini tekshiring.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...options.headers },
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      throw new ApiError(data?.message || "So‘rov bajarilmadi.", response.status);
    }
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Server javob bermadi. Qayta urinib ko‘ring.");
    }
    if (error instanceof TypeError) {
      throw new Error("Serverga ulanib bo‘lmadi. Wi-Fi va API manzilini tekshiring.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
