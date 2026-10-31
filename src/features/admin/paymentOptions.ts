import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "./api";
import type { PaymentMethod } from "./customers";

export type PaymentOptions = {
  methods: { id: PaymentMethod; label: string }[];
  providers: { id: string; label: string; category: string | null }[];
  categories: { category: string; apps: { id: string; label: string }[] }[];
};

export const PAYMENT_CARDS = ["1234567896543215", "8600123456789012", "9860432167891234"] as const;

export function fullCardForLast4(last4: string) {
  const matches = PAYMENT_CARDS.filter((number) => number.endsWith(last4));
  return matches.length === 1 ? matches[0] : null;
}

export function usePaymentOptions(token: string | null) {
  const [options, setOptions] = useState<PaymentOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<PaymentOptions>("/payments/options", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOptions(result);
    } catch (cause) {
      setOptions(null);
      setError(cause instanceof Error ? cause.message : "To‘lov usullari yuklanmadi.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void reload();
    }, 0);
    return () => clearTimeout(timer);
  }, [reload]);

  return { options, loading, error, reload };
}

export function paymentDetailsError(
  method: PaymentMethod | null,
  cardNumber: string,
  provider: string,
  providerName: string,
  options: PaymentOptions | null,
) {
  if (!options) return "To‘lov usullari yuklanishini kuting.";
  if (!method || !["cash", "payment_app"].includes(method) || !options.methods.some((item) => item.id === method))
    return "To‘lov usulini tanlang.";
  if (method === "payment_app") {
    if (!PAYMENT_CARDS.some((card) => card === cardNumber))
      return "Karta raqamini tanlang.";
    if (!options.providers.some((item) => item.id === provider))
      return "To‘lov ilovasini tanlang.";
    if (provider === "other" && (!providerName.trim() || providerName.trim().length > 80))
      return "Boshqa ilova nomini kiriting (80 belgigacha).";
  }
  return "";
}

export function paymentExtraFields(
  method: PaymentMethod,
  cardNumber: string,
  provider: string,
  providerName: string,
) {
  if (method === "payment_app")
    return { provider, cardNumber, ...(provider === "other" ? { providerName: providerName.trim() } : {}) };
  return {};
}
