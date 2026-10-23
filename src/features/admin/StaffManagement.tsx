import { BlurTargetView, BlurView } from "expo-blur";
import { File } from "expo-file-system";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { API_URL, ApiError, apiRequest, type User } from "./api";
import type { DeleteConfirmation } from "./FullScreenLoading";
import LoadingMark from "./LoadingMark";

type StaffRole = Exclude<User["role"], "super_admin">;

const roleNames: Record<StaffRole, string> = {
  yiguvchi: "Yig'uvchi",
  sotuvchi: "Sotuvchi",
  product_creator: "Mahsulot qo'shuvchi",
};

function avatarUri(user: User, version: number) {
  if (!user.avatarUrl || !API_URL) return null;
  const url = user.avatarUrl.startsWith("http")
    ? user.avatarUrl
    : `${API_URL}${user.avatarUrl.startsWith("/") ? "" : "/"}${user.avatarUrl}`;
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}

function userInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function formatTashkentDate(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return value;
  const date = new Date(timestamp + 5 * 60 * 60 * 1000);
  const monthNames = [
    "yanvar",
    "fevral",
    "mart",
    "aprel",
    "may",
    "iyun",
    "iyul",
    "avgust",
    "sentabr",
    "oktabr",
    "noyabr",
    "dekabr",
  ];
  const twoDigits = (part: number) => String(part).padStart(2, "0");
  return `${date.getUTCDate()}-${monthNames[date.getUTCMonth()]}, ${date.getUTCFullYear()}-yil, ${twoDigits(date.getUTCHours())}:${twoDigits(date.getUTCMinutes())}:${twoDigits(date.getUTCSeconds())}`;
}

const cyrillicToLatin: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "j",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "x",
  ц: "s",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "",
  ы: "i",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  ғ: "g",
  қ: "q",
  ў: "o",
  ҳ: "h",
};

function loginBase(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[а-яёғқўҳ]/g, (letter) => cyrillicToLatin[letter] ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 70);
}

function randomSuffix(previous: string) {
  const hasPrevious = /^\d{5}$/.test(previous);
  let number =
    Math.floor(Math.random() * (hasPrevious ? 89999 : 90000)) + 10000;
  if (hasPrevious && number >= Number(previous)) number += 1;
  return String(number);
}

type Props = {
  token: string;
  onSessionExpired: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onRequestDelete: (confirmation: DeleteConfirmation) => void;
  refreshRequest?: number;
  onRefreshComplete?: () => void;
  createRequest?: number;
};

export default function StaffManagement({
  token,
  onSessionExpired,
  onBusyChange,
  onRequestDelete,
  refreshRequest = 0,
  onRefreshComplete,
  createRequest = 0,
}: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [listError, setListError] = useState("");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const listRequest = useRef(0);
  const searchRef = useRef("");
  const detailRequest = useRef(0);
  const detailTargetRef = useRef<View | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<User | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [confirmAvatarDelete, setConfirmAvatarDelete] = useState(false);
  const [login, setLogin] = useState("");
  const [loginManuallyEdited, setLoginManuallyEdited] = useState(false);
  const loginSuffix = useRef("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<StaffRole>("yiguvchi");
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 2000);
    return () => clearTimeout(timer);
  }, [success]);

  const loadUsers = useCallback(
    async (query: string) => {
      const request = ++listRequest.current;
      setLoadingUsers(true);
      setListError("");
      try {
        const path = query
          ? `/users?search=${encodeURIComponent(query)}`
          : "/users";
        const result = await apiRequest<{ users: User[] }>(path, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (request === listRequest.current) setUsers(result.users);
      } catch (error) {
        if (request !== listRequest.current) return;
        if (error instanceof ApiError && error.status === 401) {
          await onSessionExpired();
          return;
        }
        setListError(
          error instanceof Error
            ? error.message
            : "Xodimlar ro'yxatini olib bo'lmadi.",
        );
      } finally {
        if (request === listRequest.current) setLoadingUsers(false);
      }
    },
    [token, onSessionExpired],
  );

  useEffect(() => {
    const timer = setTimeout(
      () => void loadUsers(search.trim()),
      search.trim() ? 300 : 0,
    );
    return () => clearTimeout(timer);
  }, [loadUsers, search]);
  useEffect(() => {
    if (refreshRequest > 0)
      void Promise.resolve()
        .then(() => loadUsers(searchRef.current))
        .finally(onRefreshComplete);
  }, [refreshRequest, loadUsers, onRefreshComplete]);
  useEffect(() => {
    if (createRequest > 0)
      void Promise.resolve().then(() => {
        cancelEdit();
        setFormOpen(true);
      });
  }, [createRequest]);

  function suggestLogin(nextName: string) {
    const base = loginBase(nextName);
    if (!base) {
      setLogin("");
      return;
    }
    const previousSuffix = loginSuffix.current;
    let nextSuffix = randomSuffix(previousSuffix);
    let candidate = `${base}.${nextSuffix}`;
    for (
      let attempt = 0;
      attempt < 20 &&
      users.some((user) => user.login.toLowerCase() === candidate);
      attempt++
    ) {
      nextSuffix = randomSuffix(previousSuffix);
      candidate = `${base}.${nextSuffix}`;
    }
    loginSuffix.current = nextSuffix;
    setLogin(candidate);
  }

  async function saveUser() {
    const normalizedLogin = login.trim().toLowerCase();
    setFormError("");
    setSuccess("");
    if (
      !normalizedLogin ||
      normalizedLogin.length > 100 ||
      !name.trim() ||
      name.trim().length > 100 ||
      ((!editingUser || password.length > 0) && !/^\d{5}$/.test(password)) ||
      description.length > 1000
    ) {
      setFormError("Login, ism va 5 xonali raqamli parol kiriting.");
      return;
    }
    Keyboard.dismiss();
    setFormOpen(false);
    setCreating(true);
    onBusyChange(true);
    try {
      const result = await apiRequest<{ user: User }>(
        editingUser ? `/users/${editingUser}` : "/users",
        {
          method: editingUser ? "PATCH" : "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            login: normalizedLogin,
            ...(password ? { password } : {}),
            role,
            name: name.trim(),
            description: description.trim(),
          }),
        },
      );
      void loadUsers(searchRef.current);
      setLogin("");
      setLoginManuallyEdited(false);
      loginSuffix.current = "";
      setName("");
      setDescription("");
      setPassword("");
      setShowPassword(false);
      setEditingUser(null);
      setFormOpen(false);
      setSuccess(
        `${result.user.login} ${editingUser ? "yangilandi" : "yaratildi"}.`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await onSessionExpired();
        return;
      }
      setFormOpen(true);
      setFormError(
        error instanceof Error ? error.message : "Xodim yaratib bo'lmadi.",
      );
    } finally {
      setCreating(false);
      onBusyChange(false);
    }
  }

  function editUser(item: User) {
    if (item.role === "super_admin") return;
    setEditingUser(item.id);
    setLogin(item.login);
    setLoginManuallyEdited(true);
    loginSuffix.current = "";
    setName(item.name);
    setDescription(item.description);
    setRole(item.role as StaffRole);
    setPassword("");
    setFormError("");
    setSuccess("");
    setFormOpen(true);
  }

  function cancelEdit() {
    setEditingUser(null);
    setLogin("");
    setLoginManuallyEdited(false);
    loginSuffix.current = "";
    setName("");
    setDescription("");
    setPassword("");
    setShowPassword(false);
    setRole("yiguvchi");
    setFormError("");
  }

  async function openUserDetail(id: string, keepCurrent = false) {
    const request = ++detailRequest.current;
    setViewingUserId(id);
    if (!keepCurrent) setUserDetail(null);
    setDetailError("");
    if (!keepCurrent) {
      setAvatarError("");
      setConfirmAvatarDelete(false);
    }
    setDetailLoading(true);
    try {
      const result = await apiRequest<{ user: User }>(
        `/users/${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (request === detailRequest.current) {
        setUserDetail(result.user);
        setUsers((current) =>
          current.map((item) => (item.id === id ? result.user : item)),
        );
        if (keepCurrent) setAvatarVersion((current) => current + 1);
      }
    } catch (cause) {
      if (request !== detailRequest.current) return;
      if (cause instanceof ApiError && cause.status === 401) {
        closeUserDetail();
        await onSessionExpired();
        return;
      }
      setDetailError(
        cause instanceof ApiError && cause.status === 400
          ? "Xodim IDsi noto‘g‘ri."
          : cause instanceof ApiError && cause.status === 404
            ? "Xodim topilmadi. Ro‘yxatni yangilang."
            : cause instanceof Error
              ? cause.message
              : "Xodim ma’lumotini yuklab bo‘lmadi.",
      );
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }

  function closeUserDetail() {
    detailRequest.current += 1;
    setViewingUserId(null);
    setUserDetail(null);
    setDetailError("");
    setDetailLoading(false);
    setAvatarError("");
    setConfirmAvatarDelete(false);
  }

  function updateUserAvatar(updated: User) {
    setUsers((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    setUserDetail((current) =>
      current?.id === updated.id ? updated : current,
    );
    setAvatarVersion((current) => current + 1);
  }

  async function uploadAvatar(user: User) {
    setAvatarError("");
    try {
      const selected = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (selected.canceled) return;
      const asset = selected.assets[0];
      const extension = (asset.fileName ?? asset.uri)
        .split(".")
        .pop()
        ?.toLowerCase();
      const mime =
        asset.mimeType ??
        (
          {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            webp: "image/webp",
          } as Record<string, string>
        )[extension ?? ""];
      if (!["image/jpeg", "image/png", "image/webp"].includes(mime))
        throw new Error("Faqat JPEG, PNG yoki WebP rasm tanlang.");
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
        if (blob.size > 5 * 1024 * 1024)
          throw new Error("Rasm hajmi 5 MB dan oshmasin.");
        form.append(
          "avatar",
          blob,
          asset.fileName ?? `avatar.${extension ?? "jpg"}`,
        );
      } else {
        const file = new File(asset.uri);
        if ((asset.fileSize ?? file.size) > 5 * 1024 * 1024)
          throw new Error("Rasm hajmi 5 MB dan oshmasin.");
        form.append("avatar", file, asset.fileName ?? file.name);
      }
      setAvatarBusy(true);
      const result = await apiRequest<{ user: User }>(
        `/users/${encodeURIComponent(user.id)}/avatar`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        },
      );
      updateUserAvatar(result.user);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        closeUserDetail();
        await onSessionExpired();
        return;
      }
      setAvatarError(
        cause instanceof Error ? cause.message : "Avatarni yuklab bo‘lmadi.",
      );
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar(user: User) {
    setConfirmAvatarDelete(false);
    setAvatarError("");
    setAvatarBusy(true);
    try {
      const result = await apiRequest<{ user: User }>(
        `/users/${encodeURIComponent(user.id)}/avatar`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      updateUserAvatar(result.user);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        closeUserDetail();
        await onSessionExpired();
        return;
      }
      setAvatarError(
        cause instanceof Error ? cause.message : "Avatarni o‘chirib bo‘lmadi.",
      );
    } finally {
      setAvatarBusy(false);
    }
  }

  function confirmDeleteUser(user: User) {
    onRequestDelete({
      message: "Xodimni o‘chirishni tasdiqlaysizmi?",
      subject: user.name,
      detail:
        "Xodim tizimga kira olmaydi. Uning loginini qayta ishlatib bo‘lmaydi.",
      onConfirm: () => {
        void deleteUser(user);
      },
    });
  }

  async function deleteUser(user: User) {
    onBusyChange(true);
    setListError("");
    try {
      await apiRequest<null>(`/users/${encodeURIComponent(user.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers((current) => current.filter((item) => item.id !== user.id));
      void loadUsers(searchRef.current);
      setSuccess(`${user.name} ro‘yxatdan chiqarildi.`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await onSessionExpired();
        return;
      }
      setListError(
        cause instanceof ApiError && cause.status === 409
          ? "Bu xodimga mijoz biriktirilgan. Avval mijozlarni boshqa xodimga o‘tkazing."
          : cause instanceof ApiError && cause.status === 400
            ? "Xodim IDsi noto‘g‘ri."
            : cause instanceof ApiError && cause.status === 404
              ? "Xodim topilmadi. Ro‘yxatni yangilang."
              : cause instanceof Error
                ? cause.message
                : "Xodimni o‘chirib bo‘lmadi.",
      );
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <View>
      <View style={styles.card}>
        <View style={styles.listHeading}>
          <Text style={styles.title}>Xodimlar ro‘yxati</Text>
          <Pressable
            onPress={() => void loadUsers(searchRef.current)}
            disabled={loadingUsers}
            accessibilityRole="button"
          >
            <Text style={styles.refresh}>Yangilash</Text>
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={(value) => {
              listRequest.current += 1;
              searchRef.current = value.trim();
              setLoadingUsers(true);
              setSearch(value);
            }}
            placeholder="Ism yoki login bo‘yicha qidirish"
            placeholderTextColor="#8A98A8"
            maxLength={100}
            autoCorrect={false}
            accessibilityLabel="Xodim ismi yoki loginini qidirish"
          />
          {!!search && (
            <Pressable
              onPress={() => {
                listRequest.current += 1;
                searchRef.current = "";
                setLoadingUsers(true);
                setSearch("");
              }}
              style={styles.clearSearchButton}
              accessibilityRole="button"
              accessibilityLabel="Qidiruvni tozalash"
            >
              <Text style={styles.clearSearchText}>×</Text>
            </Pressable>
          )}
        </View>
      </View>
      {!!success && (
        <Text style={styles.success} accessibilityRole="alert">
          {success}
        </Text>
      )}
      {loadingUsers && (
        <View style={styles.loader}>
          <LoadingMark size={54} />
          <Text style={styles.loadingText}>Xodimlar yuklanmoqda...</Text>
        </View>
      )}
      {!!listError && (
        <Text style={styles.error} accessibilityRole="alert">
          {listError}
        </Text>
      )}
      {!loadingUsers && !listError && users.length === 0 && (
        <Text style={styles.empty}>
          {search.trim() ? "Mos xodim topilmadi." : "Hozircha xodimlar yo‘q."}
        </Text>
      )}
      {!loadingUsers &&
        !listError &&
        users.map((item) => (
          <View key={item.id} style={styles.listCard}>
            <View style={styles.userRow}>
              {avatarUri(item, avatarVersion) ? (
                <Image
                  source={{ uri: avatarUri(item, avatarVersion)! }}
                  style={styles.avatarSmall}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>
                    {userInitials(item.name)}
                  </Text>
                </View>
              )}
              <View style={styles.userInfo}>
                <Text style={styles.itemType}>
                  {item.role === "super_admin"
                    ? "SUPER ADMIN"
                    : roleNames[item.role].toLocaleUpperCase("uz-UZ")}
                </Text>
                <Text style={styles.userLogin} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.userDetail}>@{item.login}</Text>
              </View>
            </View>
            {!!item.description?.trim() && (
              <Text style={styles.userDescription} numberOfLines={2}>
                {item.description}
              </Text>
            )}
            <View style={styles.userActions}>
              {item.role !== "super_admin" && (
                <Pressable
                  onPress={() => confirmDeleteUser(item)}
                  style={[styles.iconAction, styles.deleteAction]}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}ni o'chirish`}
                >
                  <SymbolView
                    name={{ ios: "trash", android: "delete", web: "delete" }}
                    size={22}
                    tintColor="#C3333D"
                  />
                </Pressable>
              )}
              <Pressable
                onPress={() => void openUserDetail(item.id)}
                style={styles.manageButton}
                accessibilityRole="button"
                accessibilityLabel={`${item.name} ma'lumotlarini ko'rish`}
              >
                <SymbolView
                  name={{
                    ios: "eye",
                    android: "visibility",
                    web: "visibility",
                  }}
                  size={20}
                  tintColor="#FFFFFF"
                />
                <Text style={styles.manageButtonText}>Ma’lumotlar</Text>
              </Pressable>
              {item.role !== "super_admin" && (
                <Pressable
                  onPress={() => editUser(item)}
                  style={[styles.iconAction, styles.editAction]}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}ni tahrirlash`}
                >
                  <SymbolView
                    name={{ ios: "pencil", android: "edit", web: "edit" }}
                    size={22}
                    tintColor="#1677D2"
                  />
                </Pressable>
              )}
            </View>
          </View>
        ))}
      <Modal
        visible={viewingUserId !== null}
        animationType="slide"
        onRequestClose={() => {
          if (confirmAvatarDelete) setConfirmAvatarDelete(false);
          else if (!avatarBusy) closeUserDetail();
        }}
      >
        <View style={styles.detailScreen}>
          <BlurTargetView ref={detailTargetRef} style={styles.detailScreen}>
            <View style={styles.detailHeader}>
              <Pressable
                onPress={closeUserDetail}
                disabled={avatarBusy}
                style={styles.detailBack}
                accessibilityRole="button"
                accessibilityLabel="Xodimlar ro‘yxatiga qaytish"
              >
                <Text style={styles.modalBackText}>‹ Xodimlarga qaytish</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.detailContent}>
              {detailLoading && (
                <View style={styles.loader}>
                  <LoadingMark size={64} />
                  <Text style={styles.loadingText}>
                    {userDetail
                      ? "Ma’lumotlar yangilanmoqda..."
                      : "Xodim yuklanmoqda..."}
                  </Text>
                </View>
              )}
              {!!detailError && (
                <View style={styles.card}>
                  <Text style={styles.error} accessibilityRole="alert">
                    {detailError}
                  </Text>
                  <Pressable
                    onPress={() =>
                      viewingUserId &&
                      void openUserDetail(viewingUserId, !!userDetail)
                    }
                    style={styles.retryButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.refresh}>Qayta urinish</Text>
                  </Pressable>
                </View>
              )}
              {userDetail && (
                <>
                  <View style={styles.detailHero}>
                    <View style={styles.detailHeroHeader}>
                      <Text style={styles.detailEyebrow}>XODIM</Text>
                      <Pressable
                        onPress={() => void openUserDetail(userDetail.id, true)}
                        disabled={detailLoading || avatarBusy}
                        style={[
                          styles.detailRefreshButton,
                          (detailLoading || avatarBusy) && styles.disabled,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Xodim ma’lumotlarini yangilash"
                      >
                        <SymbolView
                          name={{
                            ios: "arrow.clockwise",
                            android: "refresh",
                            web: "refresh",
                          }}
                          size={21}
                          tintColor="#1677D2"
                        />
                      </Pressable>
                    </View>
                    {avatarUri(userDetail, avatarVersion) ? (
                      <Image
                        source={{ uri: avatarUri(userDetail, avatarVersion)! }}
                        style={styles.avatarLarge}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.avatarLargeFallback}>
                        <Text style={styles.avatarLargeInitials}>
                          {userInitials(userDetail.name)}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.detailName}>{userDetail.name}</Text>
                    <Text style={styles.detailLogin}>@{userDetail.login}</Text>
                  </View>
                  <View style={styles.detailCard}>
                    <Text style={styles.detailSectionTitle}>Avatar</Text>
                    <Text style={styles.avatarHint}>
                      JPEG, PNG yoki WebP · 5 MB gacha
                    </Text>
                    {!!avatarError && (
                      <Text style={styles.error} accessibilityRole="alert">
                        {avatarError}
                      </Text>
                    )}
                    {avatarBusy && (
                      <Text style={styles.loadingText}>
                        Avatar saqlanmoqda...
                      </Text>
                    )}
                    <Pressable
                      onPress={() => void uploadAvatar(userDetail)}
                      disabled={avatarBusy}
                      style={[
                        styles.avatarUploadButton,
                        avatarBusy && styles.disabled,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.primaryText}>
                        {userDetail.avatarUrl
                          ? "Avatarni almashtirish"
                          : "Avatar yuklash"}
                      </Text>
                    </Pressable>
                    {!!userDetail.avatarUrl && (
                      <Pressable
                        onPress={() => setConfirmAvatarDelete(true)}
                        disabled={avatarBusy}
                        style={styles.avatarRemoveButton}
                        accessibilityRole="button"
                      >
                        <Text style={styles.deleteText}>
                          Avatarni o‘chirish
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={styles.detailCard}>
                    <Text style={styles.detailSectionTitle}>Xodim haqida</Text>
                    <Text style={styles.detailLabel}>Rol</Text>
                    <Text style={styles.detailValue}>
                      {userDetail.role === "super_admin"
                        ? "Super admin"
                        : roleNames[userDetail.role]}
                    </Text>
                    <View style={styles.detailDivider} />
                    <Text style={styles.detailLabel}>Izoh</Text>
                    <Text style={styles.detailValue}>
                      {userDetail.description?.trim() || "Izoh kiritilmagan"}
                    </Text>
                    <View style={styles.detailDivider} />
                    <Text style={styles.detailLabel}>Yaratilgan sana</Text>
                    <Text style={styles.detailValue}>
                      {userDetail.createdAt
                        ? formatTashkentDate(userDetail.createdAt)
                        : "Ma’lumot yo‘q"}
                    </Text>
                    <View style={styles.detailDivider} />
                    <Text style={styles.detailLabel}>Yangilangan sana</Text>
                    <Text style={styles.detailValue}>
                      {userDetail.updatedAt
                        ? formatTashkentDate(userDetail.updatedAt)
                        : "Hali yangilanmagan"}
                    </Text>
                    <View style={styles.detailDivider} />
                    <Text style={styles.detailLabel}>ID</Text>
                    <Text style={styles.detailId}>{userDetail.id}</Text>
                  </View>
                </>
              )}
            </ScrollView>
          </BlurTargetView>
          {confirmAvatarDelete && userDetail && (
            <View style={styles.avatarConfirmOverlay} accessibilityViewIsModal>
              <BlurView
                blurTarget={detailTargetRef}
                blurMethod="dimezisBlurView"
                intensity={75}
                tint="light"
                style={StyleSheet.absoluteFill}
              />
              <Pressable
                style={styles.avatarConfirmScrim}
                onPress={() => setConfirmAvatarDelete(false)}
                accessibilityRole="button"
                accessibilityLabel="Avatarni o‘chirish oynasini yopish"
              />
              <View style={styles.avatarConfirmCard}>
                <Text style={styles.avatarConfirmTitle}>
                  Avatarni o‘chirasizmi?
                </Text>
                <Text style={styles.avatarConfirmDetail}>
                  {userDetail.name}ning avatari o‘chiriladi.
                </Text>
                <View style={styles.avatarConfirmActions}>
                  <Pressable
                    onPress={() => setConfirmAvatarDelete(false)}
                    style={styles.avatarCancelButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.avatarCancelText}>Bekor qilish</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void removeAvatar(userDetail)}
                    style={styles.avatarConfirmDelete}
                    accessibilityRole="button"
                  >
                    <Text style={styles.avatarConfirmDeleteText}>
                      O‘chirish
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
      </Modal>
      <Modal
        visible={formOpen}
        animationType="slide"
        onRequestClose={() => {
          if (!creating) {
            setFormOpen(false);
            cancelEdit();
          }
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalScreen}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
    <View style={styles.modalHeading}>
      <Pressable
        onPress={() => {
          setFormOpen(false);
          cancelEdit();
        }}
        disabled={creating}
        accessibilityRole="button"
      >
        <Text style={styles.modalBackText}>‹ Xodimlarga qaytish</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          setFormOpen(false);
          cancelEdit();
        }}
        disabled={creating}
        accessibilityRole="button"
        accessibilityLabel="Formani yopish"
        style={styles.closeButton}
      >
        <Text style={styles.closeText}>×</Text>
      </Pressable>
    </View>
          <ScrollView
            style={styles.modalScreen}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.card}>
              <Text style={styles.title}>
                {editingUser ? "Xodimni tahrirlash" : "Yangi xodim"}
              </Text>
              <Text style={styles.subtitle}>
                Yig‘uvchi, sotuvchi yoki mahsulot yaratuvchi uchun hisob
                yarating.
              </Text>

              <Text style={styles.label}>Ism</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  if (!editingUser && !loginManuallyEdited) suggestLogin(value);
                  setFormError("");
                }}
                placeholder="Xodim ismi"
                maxLength={100}
                editable={!creating}
              />
              <View style={styles.loginLabelRow}>
                <Text style={styles.label}>Login</Text>
                {!editingUser && !!name.trim() && (
                  <Pressable
                    onPress={() => {
                      suggestLogin(name);
                      setLoginManuallyEdited(false);
                      setFormError("");
                    }}
                    disabled={creating}
                    accessibilityRole="button"
                    accessibilityLabel="Yangi login yaratish"
                  >
                    <Text style={styles.regenerateText}>Qayta yaratish</Text>
                  </Pressable>
                )}
              </View>
              <TextInput
                style={styles.input}
                value={login}
                onChangeText={(value) => {
                  setLogin(value);
                  setLoginManuallyEdited(true);
                  setFormError("");
                  setSuccess("");
                }}
                placeholder="Ism kiritilganda yaratiladi"
                placeholderTextColor="#9AA6B5"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={100}
                editable={!creating}
              />
              <Text style={styles.label}>Parol</Text>
              <View style={styles.passwordBox}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setFormError("");
                    setSuccess("");
                  }}
                  placeholder={
                    editingUser
                      ? "O'zgartirmaslik uchun bo'sh qoldiring"
                      : "5 xonali raqam"
                  }
                  placeholderTextColor="#9AA6B5"
                  keyboardType="number-pad"
                  maxLength={5}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!creating}
                />
                <Pressable
                  onPress={() => setShowPassword((current) => !current)}
                  accessibilityLabel={
                    showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"
                  }
                >
                  <Text style={styles.showText}>
                    {showPassword ? "Yashirish" : "Ko'rsatish"}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Izoh (ixtiyoriy)</Text>
              <TextInput
                style={[styles.input, styles.descriptionInput]}
                value={description}
                onChangeText={setDescription}
                placeholder="Xodim haqida izoh"
                maxLength={1000}
                multiline
                editable={!creating}
              />

              <Text style={styles.label}>Rol</Text>
              <View style={styles.roles}>
                {(["yiguvchi", "sotuvchi", "product_creator"] as const).map(
                  (item) => (
                    <Pressable
                      key={item}
                      style={[
                        styles.roleButton,
                        role === item && styles.roleSelected,
                      ]}
                      onPress={() => setRole(item)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: role === item }}
                    >
                      <Text
                        style={[
                          styles.roleText,
                          role === item && styles.roleTextSelected,
                        ]}
                      >
                        {roleNames[item]}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>

              {!!formError && (
                <Text style={styles.error} accessibilityRole="alert">
                  {formError}
                </Text>
              )}
              <Pressable
                style={[styles.primaryButton, creating && styles.disabled]}
                onPress={saveUser}
                disabled={creating}
              >
                <Text style={styles.primaryText}>
                  {editingUser ? "Saqlash" : "Xodim yaratish"}
                </Text>
              </Pressable>
              {editingUser && (
                <Pressable
                  style={styles.cancelButton}
                  onPress={cancelEdit}
                  disabled={creating}
                >
                  <Text style={styles.refresh}>Bekor qilish</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  detailScreen: { flex: 1, backgroundColor: "#F6F8FB" },
  detailHeader: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 50 : 24,
    paddingBottom: 8,
    backgroundColor: "#F6F8FB",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF3",
  },
  detailBack: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingRight: 20,
  },
  detailContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },
  detailHero: {
    backgroundColor: "#EAF4FF",
    borderWidth: 1,
    borderColor: "#D7EAFB",
    borderRadius: 18,
    padding: 18,
  },
  detailHeroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailEyebrow: {
    color: "#3977AE",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  detailRefreshButton: {
    width: 44,
    height: 44,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLarge: { width: 88, height: 88, borderRadius: 44, marginTop: 16 },
  avatarLargeFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginTop: 16,
    backgroundColor: "#C8E2FA",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLargeInitials: { color: "#1677D2", fontSize: 30, fontWeight: "800" },
  detailName: {
    color: "#172536",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 12,
  },
  detailLogin: { color: "#50667E", fontSize: 14, marginTop: 5 },
  detailCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF3",
    borderRadius: 16,
    padding: 18,
    marginTop: 12,
  },
  detailSectionTitle: {
    color: "#172536",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  detailLabel: {
    color: "#627184",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 3,
  },
  detailValue: {
    color: "#172536",
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "700",
  },
  detailId: { color: "#627184", fontSize: 13, lineHeight: 20 },
  detailDivider: { height: 1, backgroundColor: "#EDF1F5", marginTop: 16 },
  avatarHint: { color: "#627184", fontSize: 13, marginTop: 4 },
  avatarUploadButton: {
    minHeight: 46,
    marginTop: 16,
    borderRadius: 11,
    backgroundColor: "#1677D2",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRemoveButton: {
    minHeight: 44,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: { color: "#C3333D", fontSize: 14, fontWeight: "700" },
  avatarConfirmOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  avatarConfirmScrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(23, 37, 54, 0.18)",
  },
  avatarConfirmCard: {
    width: "84%",
    maxWidth: 340,
    padding: 24,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    shadowColor: "#263A52",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
  avatarConfirmTitle: {
    color: "#172536",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  avatarConfirmDetail: {
    color: "#627184",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 10,
  },
  avatarConfirmActions: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
  avatarCancelButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#EAF4FF",
  },
  avatarCancelText: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  avatarConfirmDelete: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#C3333D",
  },
  avatarConfirmDeleteText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  retryButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    marginTop: 12,
  },
  modalScreen: { flex: 1, backgroundColor: "#F6F8FB" },
  modalContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },
  modalHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 50 : 24,
    paddingBottom: 8,
    backgroundColor: "#F6F8FB",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF3",
  },
  modalBackText: { color: "#1677D2", fontSize: 16, fontWeight: "700" },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { color: "#627184", fontSize: 28 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
  },
  title: { color: "#172536", fontSize: 20, fontWeight: "800" },
  subtitle: {
    color: "#627184",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 20,
  },
  label: { color: "#172536", fontSize: 14, fontWeight: "700", marginBottom: 8 },
  loginLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  regenerateText: {
    color: "#1677D2",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    paddingHorizontal: 14,
    color: "#172536",
    fontSize: 16,
    marginBottom: 18,
  },
  descriptionInput: { height: 82, paddingTop: 12, textAlignVertical: "top" },
  passwordBox: {
    height: 50,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  passwordInput: { flex: 1, height: "100%", color: "#172536", fontSize: 16 },
  showText: {
    color: "#1677D2",
    fontSize: 13,
    fontWeight: "700",
    paddingLeft: 8,
  },
  roles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  roleButton: {
    minWidth: "45%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  roleSelected: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  roleText: { color: "#627184", fontSize: 14, fontWeight: "700" },
  roleTextSelected: { color: "#1677D2" },
  cancelButton: { alignItems: "center", padding: 12 },
  error: { color: "#C3333D", fontSize: 14, lineHeight: 20, marginTop: 14 },
  success: { color: "#16865A", fontSize: 14, lineHeight: 20, marginTop: 14 },
  primaryButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: "#1677D2",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.7 },
  listHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  refresh: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  searchBox: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 4,
  },
  searchInput: {
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
  loader: { marginVertical: 20, alignItems: "center" },
  loadingText: { color: "#627184", fontSize: 14, marginTop: 4 },
  empty: { color: "#627184", fontSize: 14, paddingVertical: 12 },
  listCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5EBF2",
    borderRadius: 15,
    padding: 16,
    marginBottom: 12,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarSmall: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { color: "#1677D2", fontSize: 16, fontWeight: "800" },
  userInfo: { flex: 1, minWidth: 0 },
  itemType: {
    color: "#7B8CA0",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  userLogin: {
    color: "#172536",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  userDetail: { color: "#627184", fontSize: 13, marginTop: 4 },
  userDescription: { color: "#627184", fontSize: 13, marginTop: 10 },
  userActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
  },
  iconAction: {
    width: 44,
    height: 44,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteAction: { backgroundColor: "#FDECEE" },
  editAction: { backgroundColor: "#EAF4FF" },
  manageButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 11,
    backgroundColor: "#1677D2",
  },
  manageButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});
