import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, apiRequest, type User } from "./api";
import CatalogManagement from "./CatalogManagement";
import FullScreenLoading from "./FullScreenLoading";
import LoadingMark from "./LoadingMark";
import { deleteStoredToken, getStoredToken } from "./session";

type Mode = "groups" | "sections" | "products";

export default function CatalogPage({ mode }: { mode: Mode }) {
  const params = useLocalSearchParams<{ groupId?: string; sectionId?: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [mutationBusy, setMutationBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const stored = await getStoredToken();
        if (!stored) { router.replace("/"); return; }
        const result = await apiRequest<{ user: User }>("/auth/me", {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (result.user.role !== "product_creator" && result.user.role !== "super_admin") {
          router.replace("/");
          return;
        }
        if (active) setToken(stored);
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
  }, []);

  const handleSessionExpired = useCallback(async () => {
    await deleteStoredToken();
    router.replace("/");
  }, []);

  return <FullScreenLoading active={mutationBusy} message="Saqlanmoqda...">
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button">
      <Text style={styles.backText}>‹  Orqaga</Text>
    </Pressable>
    <Text style={styles.eyebrow}>KATALOG</Text>
    <Text style={styles.title}>{mode === "groups" ? "Guruhlar" : mode === "sections" ? "Bo‘limlar" : "Mahsulotlar"}</Text>
    <Text style={styles.subtitle}>{mode === "groups" ? "Guruh yarating, nomini o‘zgartiring yoki bo‘limlariga o‘ting." : mode === "sections" ? "Guruhni tanlab, uning bo‘limlarini boshqaring." : "Bo‘limni tanlab, mahsulot va rasmlarini boshqaring."}</Text>
    {checking ? <View style={styles.center}><LoadingMark size={72} /></View> : error ? <Text style={styles.error}>{error}</Text> : token ?
      <CatalogManagement
        mode={mode}
        token={token}
        onBusyChange={setMutationBusy}
        initialGroupId={typeof params.groupId === "string" ? params.groupId : null}
        initialSectionId={typeof params.sectionId === "string" ? params.sectionId : null}
        onSessionExpired={handleSessionExpired}
      /> : null}
    </ScrollView>
  </FullScreenLoading>;
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
