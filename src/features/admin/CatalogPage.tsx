import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, apiRequest, type User } from "./api";
import CatalogManagement from "./CatalogManagement";
import FullScreenLoading, { type DeleteConfirmation } from "./FullScreenLoading";
import LoadingMark from "./LoadingMark";
import { PullRefreshControl } from "./PullRefresh";
import { deleteStoredToken, getStoredToken } from "./session";

type Mode = "groups" | "sections" | "products";

export default function CatalogPage({ mode }: { mode: Mode }) {
  const params = useLocalSearchParams<{ groupId?: string; sectionId?: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationMessage, setMutationMessage] = useState("Saqlanmoqda...");
  const [successToast, setSuccessToast] = useState<{ id: number; message: string } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshRequest, setRefreshRequest] = useState(0);
  const [createCategoryRequest, setCreateCategoryRequest] = useState(0);
  const [sessionRequest, setSessionRequest] = useState(0);
  const onRefreshComplete = useCallback(() => setRefreshing(false), []);
  const onMutationBusyChange = useCallback((busy: boolean, message = "Saqlanmoqda...") => {
    if (busy) {
      setSuccessToast(null);
      setMutationMessage(message);
    }
    setMutationBusy(busy);
  }, []);
  const showSuccess = useCallback((message: string) => {
    setSuccessToast((current) => ({ id: (current?.id ?? 0) + 1, message }));
  }, []);
  const dismissSuccess = useCallback((id: number) => {
    setSuccessToast((current) => current?.id === id ? null : current);
  }, []);

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
          setError(cause instanceof Error ? cause.message : "Katalogni ochib bo'lmadi.");
        }
      } finally {
        if (active) setChecking(false);
      }
    }
    void checkSession();
    return () => { active = false; };
  }, [sessionRequest]);

  const handleSessionExpired = useCallback(async () => {
    await deleteStoredToken();
    router.replace("/");
  }, []);

  return <FullScreenLoading active={mutationBusy} message={mutationMessage} successToast={successToast} onSuccessDismiss={dismissSuccess} confirmation={deleteConfirmation && { ...deleteConfirmation, onConfirm: () => { setDeleteConfirmation(null); deleteConfirmation.onConfirm(); } }} onCancelConfirmation={() => setDeleteConfirmation(null)}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<PullRefreshControl refreshing={refreshing || checking} onRefresh={() => { if (mutationBusy || refreshing || checking) return; setError(""); if (token) { setRefreshing(true); setRefreshRequest((value) => value + 1); } else { setChecking(true); setSessionRequest((value) => value + 1); } }} />}>
    <View style={styles.headerActions}>
      <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button">
        <Text style={styles.backText}>‹  Orqaga</Text>
      </Pressable>
      {(mode === "groups" || mode === "sections") && !!token && !checking && !error && <Pressable
        style={[styles.addGroupButton, mutationBusy && styles.disabledButton]}
        onPress={() => setCreateCategoryRequest((value) => value + 1)}
        disabled={mutationBusy}
        accessibilityRole="button"
        accessibilityLabel={mode === "groups" ? "Yangi guruh yaratish" : "Yangi bo'lim yaratish"}
      >
        <Text style={styles.addGroupIcon}>+</Text>
        <Text style={styles.addGroupText}>{mode === "groups" ? "Yangi guruh" : "Yangi bo'lim"}</Text>
      </Pressable>}
    </View>
    <Text style={styles.eyebrow}>KATALOG</Text>
    <Text style={styles.title}>{mode === "groups" ? "Guruhlar" : mode === "sections" ? "Bo'limlar" : "Mahsulotlar"}</Text>
    <Text style={styles.subtitle}>{mode === "groups" ? "Guruh yarating, nomini o'zgartiring yoki bo'limlariga o'ting." : mode === "sections" ? "Guruhni tanlab, uning bo'limlarini boshqaring." : "Bo'limni tanlab, mahsulot va rasmlarini boshqaring."}</Text>
    {checking ? <View style={styles.center}><LoadingMark size={72} /></View> : error ? <Text style={styles.error}>{error}</Text> : token ?
      <CatalogManagement
        mode={mode}
        token={token}
        onBusyChange={onMutationBusyChange}
        onSuccess={showSuccess}
        onRequestDelete={setDeleteConfirmation}
        createCategoryRequest={createCategoryRequest}
        initialGroupId={typeof params.groupId === "string" ? params.groupId : null}
        initialSectionId={typeof params.sectionId === "string" ? params.sectionId : null}
        onSessionExpired={handleSessionExpired}
        refreshRequest={refreshRequest}
        onRefreshComplete={onRefreshComplete}
      /> : null}
    </ScrollView>
  </FullScreenLoading>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 40 },
  headerActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  back: { alignSelf: "flex-start", paddingVertical: 10, paddingRight: 20 },
  backText: { color: "#1677D2", fontSize: 16, fontWeight: "700" },
  addGroupButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, borderRadius: 11, backgroundColor: "#1677D2" },
  disabledButton: { opacity: 0.5 },
  addGroupIcon: { color: "#FFFFFF", fontSize: 22, fontWeight: "600" },
  addGroupText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  eyebrow: { color: "#1677D2", fontSize: 12, fontWeight: "800", letterSpacing: 1.5, marginBottom: 8 },
  title: { color: "#172536", fontSize: 30, fontWeight: "800" },
  subtitle: { color: "#627184", fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 24 },
  center: { alignItems: "center", paddingVertical: 48 },
  error: { color: "#C3333D", fontSize: 14 },
});
