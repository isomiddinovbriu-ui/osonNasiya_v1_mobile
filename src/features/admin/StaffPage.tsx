import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, apiRequest, type User } from "./api";
import FullScreenLoading, { type DeleteConfirmation } from "./FullScreenLoading";
import LoadingMark from "./LoadingMark";
import { PullRefreshControl } from "./PullRefresh";
import { deleteStoredToken, getStoredToken } from "./session";
import StaffManagement from "./StaffManagement";

export default function StaffPage() {
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshRequest, setRefreshRequest] = useState(0);
  const [createRequest, setCreateRequest] = useState(0);
  const [sessionRequest, setSessionRequest] = useState(0);
  const onRefreshComplete = useCallback(() => setRefreshing(false), []);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const stored = await getStoredToken();
        if (!stored) { router.replace("/"); return; }
        const result = await apiRequest<{ user: User }>("/auth/me", {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (result.user.role !== "super_admin") { router.replace("/"); return; }
        if (active) setToken(stored);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await deleteStoredToken();
          router.replace("/");
        } else if (active) {
          setError(cause instanceof Error ? cause.message : "Xodimlar sahifasini ochib bo'lmadi.");
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

  return <FullScreenLoading active={mutationBusy} message="Xodim amali bajarilmoqda..." confirmation={deleteConfirmation && { ...deleteConfirmation, onConfirm: () => { setDeleteConfirmation(null); deleteConfirmation.onConfirm(); } }} onCancelConfirmation={() => setDeleteConfirmation(null)}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<PullRefreshControl refreshing={refreshing || checking} onRefresh={() => { if (mutationBusy || refreshing || checking) return; setError(""); if (token) { setRefreshing(true); setRefreshRequest((value) => value + 1); } else { setChecking(true); setSessionRequest((value) => value + 1); } }} />}>
    <View style={styles.headerActions}>
      <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button">
        <Text style={styles.backText}>‹  Orqaga</Text>
      </Pressable>
      {!!token && !checking && !error && <Pressable
        style={[styles.addButton, mutationBusy && styles.disabledButton]}
        onPress={() => setCreateRequest((value) => value + 1)}
        disabled={mutationBusy}
        accessibilityRole="button"
        accessibilityLabel="Yangi xodim qo'shish"
      >
        <Text style={styles.addIcon}>+</Text>
        <Text style={styles.addText}>Yangi xodim</Text>
      </Pressable>}
    </View>
    <Text style={styles.eyebrow}>XODIMLAR</Text>
    <Text style={styles.title}>Xodimlar</Text>
    <Text style={styles.subtitle}>Xodimlarni qidiring va hisoblarini boshqaring.</Text>
    {checking ? <View style={styles.center}><LoadingMark size={72} /></View> : error ?
      <Text style={styles.error} accessibilityRole="alert">{error}</Text> : token ?
        <StaffManagement token={token} onSessionExpired={handleSessionExpired} onBusyChange={setMutationBusy} onRequestDelete={setDeleteConfirmation} refreshRequest={refreshRequest} onRefreshComplete={onRefreshComplete} createRequest={createRequest} /> : null}
    </ScrollView>
  </FullScreenLoading>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 40 },
  headerActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  back: { alignSelf: "flex-start", paddingVertical: 10, paddingRight: 12 },
  backText: { color: "#1677D2", fontSize: 16, fontWeight: "700" },
  addButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, borderRadius: 11, backgroundColor: "#1677D2" },
  disabledButton: { opacity: 0.5 },
  addIcon: { color: "#FFFFFF", fontSize: 22, fontWeight: "600" },
  addText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  eyebrow: { color: "#1677D2", fontSize: 12, fontWeight: "800", letterSpacing: 1.5, marginBottom: 8 },
  title: { color: "#172536", fontSize: 30, fontWeight: "800" },
  subtitle: { color: "#627184", fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 24 },
  center: { alignItems: "center", paddingVertical: 48 },
  error: { color: "#C3333D", fontSize: 14 },
});
