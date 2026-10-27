import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, apiRequest, type User } from "./api";
import CatalogManagement from "./CatalogManagement";
import FullScreenLoading, {
  type DeleteConfirmation,
} from "./FullScreenLoading";
import LoadingMark from "./LoadingMark";
import { PullRefreshControl } from "./PullRefresh";
import { deleteStoredToken, getStoredToken } from "./session";

type Mode = "groups" | "sections" | "products";

export default function CatalogPage({ mode }: { mode: Mode }) {
  const params = useLocalSearchParams<{
    groupId?: string;
    sectionId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationMessage, setMutationMessage] = useState("Saqlanmoqda...");
  const [successToast, setSuccessToast] = useState<{
    id: number;
    message: string;
  } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] =
    useState<DeleteConfirmation | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshRequest, setRefreshRequest] = useState(0);
  const [createCategoryRequest, setCreateCategoryRequest] = useState(0);
  const [sessionRequest, setSessionRequest] = useState(0);
  const [groupSearch, setGroupSearch] = useState("");
  const [sectionSearch, setSectionSearch] = useState("");
  const catalogSearch = mode === "groups" ? groupSearch : sectionSearch;
  const setCatalogSearch =
    mode === "groups" ? setGroupSearch : setSectionSearch;
  const hasCategorySearch =
    (mode === "groups" || mode === "sections") &&
    !!token &&
    !checking &&
    !error;
  const onRefreshComplete = useCallback(() => setRefreshing(false), []);
  const onMutationBusyChange = useCallback(
    (busy: boolean, message = "Saqlanmoqda...") => {
      if (busy) {
        setSuccessToast(null);
        setMutationMessage(message);
      }
      setMutationBusy(busy);
    },
    [],
  );
  const showSuccess = useCallback((message: string) => {
    setSuccessToast((current) => ({ id: (current?.id ?? 0) + 1, message }));
  }, []);
  const dismissSuccess = useCallback((id: number) => {
    setSuccessToast((current) => (current?.id === id ? null : current));
  }, []);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const stored = await getStoredToken();
        if (!stored) {
          router.replace("/");
          return;
        }
        const result = await apiRequest<{ user: User }>("/auth/me", {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (
          result.user.role !== "product_creator" &&
          result.user.role !== "super_admin"
        ) {
          router.replace("/");
          return;
        }
        if (active) setToken(stored);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await deleteStoredToken();
          router.replace("/");
        } else if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Katalogni ochib bo'lmadi.",
          );
        }
      } finally {
        if (active) setChecking(false);
      }
    }
    void checkSession();
    return () => {
      active = false;
    };
  }, [sessionRequest]);

  const handleSessionExpired = useCallback(async () => {
    await deleteStoredToken();
    router.replace("/");
  }, []);

  return (
    <FullScreenLoading
      active={mutationBusy}
      message={mutationMessage}
      successToast={successToast}
      onSuccessDismiss={dismissSuccess}
      confirmation={
        deleteConfirmation && {
          ...deleteConfirmation,
          onConfirm: () => {
            setDeleteConfirmation(null);
            deleteConfirmation.onConfirm();
          },
        }
      }
      onCancelConfirmation={() => setDeleteConfirmation(null)}
    >
      <View style={[styles.fixedHeader, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.back}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <Text style={styles.backText}>‹ Orqaga</Text>
          </Pressable>
          {(mode === "groups" || mode === "sections") &&
            !!token &&
            !checking &&
            !error && (
              <Pressable
                style={[
                  styles.addGroupButton,
                  mutationBusy && styles.disabledButton,
                ]}
                onPress={() => setCreateCategoryRequest((value) => value + 1)}
                disabled={mutationBusy}
                accessibilityRole="button"
                accessibilityLabel={
                  mode === "groups"
                    ? "Yangi guruh yaratish"
                    : "Yangi bo'lim yaratish"
                }
              >
                <Text style={styles.addGroupIcon}>+</Text>
                <Text style={styles.addGroupText}>
                  {mode === "groups" ? "Yangi guruh" : "Yangi bo'lim"}
                </Text>
              </Pressable>
            )}
        </View>
      </View>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={hasCategorySearch ? [1] : undefined}
        refreshControl={
          <PullRefreshControl
            refreshing={refreshing || checking}
            onRefresh={() => {
              if (mutationBusy || refreshing || checking) return;
              setError("");
              if (token) {
                setRefreshing(true);
                setRefreshRequest((value) => value + 1);
              } else {
                setChecking(true);
                setSessionRequest((value) => value + 1);
              }
            }}
          />
        }
      >
        <View>
          <Text style={styles.title}>
            {mode === "groups"
              ? "Guruhlar"
              : mode === "sections"
                ? "Bo'limlar"
                : "Mahsulotlar"}
          </Text>
        </View>
        {hasCategorySearch && (
          <View style={styles.sectionSearchSticky}>
            <View style={styles.sectionSearchRow}>
              <SymbolView
                name={{
                  ios: "magnifyingglass",
                  android: "search",
                  web: "search",
                }}
                size={20}
                tintColor="#7B8CA0"
              />
              <TextInput
                style={styles.sectionSearchInput}
                value={catalogSearch}
                onChangeText={setCatalogSearch}
                placeholder={
                  mode === "groups"
                    ? "Guruh nomini qidiring"
                    : "Bo'lim nomini qidiring"
                }
                placeholderTextColor="#8A98A8"
                maxLength={100}
                autoCorrect={false}
                accessibilityLabel={
                  mode === "groups"
                    ? "Guruh nomi bo'yicha qidirish"
                    : "Bo'lim nomi bo'yicha qidirish"
                }
              />
              {!!catalogSearch && (
                <Pressable
                  onPress={() => setCatalogSearch("")}
                  accessibilityRole="button"
                  accessibilityLabel="Qidiruvni tozalash"
                  style={styles.clearSearchButton}
                >
                  <Text style={styles.clearSearchText}>{"×"}</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
        {checking ? (
          <View style={styles.center}>
            <LoadingMark size={72} />
          </View>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : token ? (
          <CatalogManagement
            mode={mode}
            token={token}
            onBusyChange={onMutationBusyChange}
            onSuccess={showSuccess}
            onRequestDelete={setDeleteConfirmation}
            createCategoryRequest={createCategoryRequest}
            initialGroupId={
              typeof params.groupId === "string" ? params.groupId : null
            }
            initialSectionId={
              typeof params.sectionId === "string" ? params.sectionId : null
            }
            onSessionExpired={handleSessionExpired}
            refreshRequest={refreshRequest}
            onRefreshComplete={onRefreshComplete}
            sectionSearch={sectionSearch}
            onSectionSearchChange={setSectionSearch}
            groupSearch={groupSearch}
          />
        ) : null}
      </ScrollView>
    </FullScreenLoading>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },
  fixedHeader: {
    backgroundColor: "#F6F8FB",
    paddingHorizontal: 20,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF3",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: { alignSelf: "flex-start", paddingVertical: 10, paddingRight: 20 },
  backText: { color: "#1677D2", fontSize: 16, fontWeight: "700" },
  addGroupButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: "#1677D2",
  },
  disabledButton: { opacity: 0.5 },
  addGroupIcon: { color: "#FFFFFF", fontSize: 22, fontWeight: "600" },
  addGroupText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  eyebrow: {
    color: "#1677D2",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: { color: "#172536", fontSize: 30, fontWeight: "800" },
  subtitle: {
    color: "#627184",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 24,
  },
  sectionSearchSticky: {
    backgroundColor: "#F6F8FB",
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
    zIndex: 1,
  },
  sectionSearchRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 4,
    backgroundColor: "#FFFFFF",
  },
  sectionSearchInput: {
    flex: 1,
    minWidth: 0,
    height: 46,
    color: "#172536",
    fontSize: 15,
  },
  clearSearchButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  clearSearchText: { color: "#627184", fontSize: 24, lineHeight: 28 },
  center: { alignItems: "center", paddingVertical: 48 },
  error: { color: "#C3333D", fontSize: 14 },
});
