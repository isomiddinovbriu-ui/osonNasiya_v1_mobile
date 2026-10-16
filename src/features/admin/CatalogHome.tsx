import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, apiRequest, type User } from "./api";
import CatalogMenu from "./CatalogMenu";
import LoadingMark from "./LoadingMark";
import { PullRefreshControl } from "./PullRefresh";
import { deleteStoredToken, getStoredToken } from "./session";

export default function CatalogHome() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");
  const [refreshRequest, setRefreshRequest] = useState(0);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const token = await getStoredToken();
        if (!token) { router.replace("/"); return; }
        const result = await apiRequest<{ user: User }>("/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (result.user.role !== "super_admin" && result.user.role !== "product_creator") {
          router.replace("/");
          return;
        }
        if (active) setAllowed(true);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await deleteStoredToken();
          router.replace("/");
        } else if (active) {
          setError(cause instanceof Error ? cause.message : "Katalogni ochib bo‘lmadi.");
        }
      } finally {
        if (active) setChecking(false);
      }
    }
    void checkSession();
    return () => { active = false; };
  }, [refreshRequest]);

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<PullRefreshControl refreshing={checking} onRefresh={() => { if (!checking) { setError(""); setChecking(true); setRefreshRequest((value) => value + 1); } }} />}>
    <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button">
      <Text style={styles.backText}>‹  Orqaga</Text>
    </Pressable>
    <Text style={styles.eyebrow}>KATALOG</Text>
    <Text style={styles.title}>Mahsulotlar uchun</Text>
    <Text style={styles.subtitle}>Qaysi yozuvlarni boshqarishni tanlang.</Text>
    {checking ? <View style={styles.center}><LoadingMark size={72} /></View> : error ?
      <Text style={styles.error} accessibilityRole="alert">{error}</Text> : allowed ? <CatalogMenu /> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 40 },
  back: { alignSelf: "flex-start", paddingVertical: 10, paddingRight: 20, marginBottom: 18 },
  backText: { color: "#1677D2", fontSize: 16, fontWeight: "700" },
  eyebrow: { color: "#1677D2", fontSize: 12, fontWeight: "800", letterSpacing: 1.5, marginBottom: 8 },
  title: { color: "#172536", fontSize: 30, fontWeight: "800" },
  subtitle: { color: "#627184", fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 24 },
  center: { alignItems: "center", paddingVertical: 48 },
  error: { color: "#C3333D", fontSize: 14 },
});
