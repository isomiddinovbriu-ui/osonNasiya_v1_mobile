import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
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
import { API_URL, ApiError, apiRequest } from "./api";
import type { DeleteConfirmation } from "./FullScreenLoading";
import LoadingMark from "./LoadingMark";
import { formatMoneyDigits, parseMoney } from "./money";
import MoneyInput from "./MoneyInput";

type Category = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
};
type Product = {
  id: string;
  universalId: string;
  categoryId: string;
  name: string;
  title: string;
  originalPrice: number | null;
  minSellingPrice: number | null;
  warrantyPeriod: string | null;
  images: { id: string; url: string }[];
};
type Props = {
  token: string;
  onSessionExpired: () => Promise<void>;
  onBusyChange: (busy: boolean, message?: string) => void;
  onSuccess: (message: string) => void;
  onRequestDelete: (confirmation: DeleteConfirmation) => void;
  mode: "groups" | "sections" | "products";
  initialGroupId?: string | null;
  initialSectionId?: string | null;
  createCategoryRequest?: number;
  refreshRequest?: number;
  onRefreshComplete?: () => void;
};

function newestCategory(items: Category[]) {
  return items.reduce<Category | null>(
    (newest, item) =>
      !newest || item.createdAt > newest.createdAt ? item : newest,
    null,
  );
}

function formatPrice(price: number | null) {
  return price === null ? "Kiritilmagan" : `${formatMoneyDigits(price)} so'm`;
}

function parsePrice(value: string) {
  const price = parseMoney(value);
  return price !== null && price > 0 ? price : null;
}

export default function CatalogManagement({
  token,
  onSessionExpired,
  onBusyChange,
  onSuccess,
  onRequestDelete,
  mode,
  initialGroupId = null,
  initialSectionId = null,
  createCategoryRequest = 0,
  refreshRequest = 0,
  onRefreshComplete,
}: Props) {
  const categoryNameInputRef = useRef<TextInput>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [preferredGroupId, setPreferredGroupId] = useState<string | null>(
    initialGroupId,
  );
  const [preferredSectionId, setPreferredSectionId] = useState<string | null>(
    initialSectionId,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [productName, setProductName] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [minSellingPrice, setMinSellingPrice] = useState("");
  const [warrantyPeriod, setWarrantyPeriod] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const headers = { Authorization: `Bearer ${token}` };
  const handleError = useCallback(
    async (cause: unknown) => {
      if (cause instanceof ApiError && cause.status === 401) {
        await onSessionExpired();
        return;
      }
      if (cause instanceof ApiError && cause.status === 409) {
        setError(
          cause.message ||
            "Bu mahsulot savdoga biriktirilgan, uni o'chirib bo'lmaydi.",
        );
        return;
      }
      setError(
        cause instanceof Error ? cause.message : "Amalni bajarib bo'lmadi.",
      );
    },
    [onSessionExpired],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [categoryResult, productResult] = await Promise.all([
        apiRequest<{ categories: Category[] }>("/product-categories", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        apiRequest<{ products: Product[] }>("/products", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setCategories(categoryResult.categories);
      setProducts(productResult.products);
    } catch (cause) {
      await handleError(cause);
    } finally {
      setLoading(false);
    }
  }, [token, handleError]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);
  useEffect(() => {
    if (refreshRequest > 0)
      void Promise.resolve().then(refresh).finally(onRefreshComplete);
  }, [refreshRequest, refresh, onRefreshComplete]);

  useEffect(() => {
    if ((mode !== "groups" && mode !== "sections") || createCategoryRequest === 0) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setEditingCategory(null);
      setCategoryName("");
      setError("");
      setFormOpen(true);
    });
    return () => { active = false; };
  }, [createCategoryRequest, mode]);

  async function run(
    action: () => Promise<void>,
    message: string,
    hideFormDuringRequest = false,
    loadingMessage = "Saqlanmoqda...",
  ) {
    Keyboard.dismiss();
    if (hideFormDuringRequest) setFormOpen(false);
    setBusy(true);
    onBusyChange(true, loadingMessage);
    setError("");
    try {
      await action();
      try {
        const result = await apiRequest<{ categories: Category[] }>(
          "/product-categories",
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setCategories(result.categories);
      } catch (cause) {
        await handleError(cause);
      }
      onSuccess(message);
    } catch (cause) {
      if (
        hideFormDuringRequest &&
        !(cause instanceof ApiError && cause.status === 401)
      )
        setFormOpen(true);
      await handleError(cause);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  const groups = categories.filter((category) => category.parentId === null);
  const groupId =
    groups.find((category) => category.id === preferredGroupId)?.id ??
    newestCategory(groups)?.id ??
    null;
  const sections = categories.filter(
    (category) => category.parentId === groupId,
  );
  const sectionId =
    sections.find((category) => category.id === preferredSectionId)?.id ??
    newestCategory(sections)?.id ??
    null;
  const visibleProducts = products.filter(
    (product) => product.categoryId === sectionId,
  );

  function clearProductForm() {
    setProductName("");
    setProductTitle("");
    setOriginalPrice("");
    setMinSellingPrice("");
    setWarrantyPeriod("");
  }

  function closeProductForm() {
    if (busy) return;
    setFormOpen(false);
    clearProductForm();
    setError("");
  }

  function closeCategoryForm() {
    if (busy) return;
    setFormOpen(false);
    setEditingCategory(null);
    setCategoryName("");
    setError("");
  }

  function selectGroup(id: string | null) {
    setPreferredGroupId(id);
    setPreferredSectionId(null);
    setFormOpen(false);
    setEditingCategory(null);
    setEditingProduct(null);
    setCategoryName("");
    clearProductForm();
    setError("");
  }

  function selectSection(id: string | null) {
    setPreferredSectionId(id);
    setEditingCategory(null);
    setEditingProduct(null);
    setCategoryName("");
    clearProductForm();
    setError("");
    setFormOpen(false);
  }

  function saveCategory() {
    const name = categoryName.trim();
    if (!name || name.length > 100) {
      setError("Nom 1–100 belgi bo'lishi kerak.");
      return;
    }
    const parentId = mode === "groups" ? null : groupId;
    if (mode === "sections" && !parentId) {
      setError("Avval guruhni tanlang.");
      return;
    }
    void run(
      async () => {
        if (editingCategory) {
          const result = await apiRequest<{ category: Category }>(
            `/product-categories/${editingCategory}`,
            {
              method: "PATCH",
              headers,
              body: JSON.stringify({ name }),
            },
          );
          setCategories((items) =>
            items.map((item) =>
              item.id === editingCategory ? result.category : item,
            ),
          );
        } else {
          const result = await apiRequest<{ category: Category }>(
            "/product-categories",
            {
              method: "POST",
              headers,
              body: JSON.stringify({ name, parentId }),
            },
          );
          setCategories((items) => [...items, result.category]);
          if (parentId) {
            setPreferredSectionId(result.category.id);
          } else {
            setPreferredGroupId(result.category.id);
            setPreferredSectionId(null);
          }
        }
        setCategoryName("");
        setEditingCategory(null);
        setFormOpen(false);
      },
      editingCategory
        ? "O'zgarish saqlandi."
        : parentId
          ? "Bo'lim yaratildi."
          : "Guruh yaratildi.",
      mode !== "products",
    );
  }

  function saveProduct() {
    const name = productName.trim();
    const title = productTitle.trim();
    const original = parsePrice(originalPrice);
    const minimum = parsePrice(minSellingPrice);
    const warranty = warrantyPeriod.trim();
    if (
      !sectionId ||
      !name ||
      name.length > 100 ||
      !title ||
      title.length > 200
    ) {
      setError("Mahsulot nomi (1–100) va sarlavhasini (1–200) kiriting.");
      return;
    }
    if (original === null || minimum === null) {
      setError(
        "Asl narx va eng past sotilish narxini musbat butun so'mda kiriting.",
      );
      return;
    }
    if (!/^\d+(?:\.\d+)?$/.test(warranty)) {
      setError("Kafolat muddatini 1.6 kabi kiriting.");
      return;
    }
    void run(
      async () => {
        const result = await apiRequest<{ product: Product }>(
          editingProduct ? `/products/${editingProduct}` : "/products",
          {
            method: editingProduct ? "PATCH" : "POST",
            headers,
            body: JSON.stringify({
              name,
              title,
              categoryId: sectionId,
              originalPrice: original,
              minSellingPrice: minimum,
              warrantyPeriod: warranty,
            }),
          },
        );
        setProducts((items) =>
          editingProduct
            ? items.map((item) =>
                item.id === editingProduct ? result.product : item,
              )
            : [result.product, ...items],
        );
        clearProductForm();
        setEditingProduct(null);
        setFormOpen(false);
      },
      editingProduct ? "Mahsulot yangilandi." : "Mahsulot yaratildi.",
      !editingProduct,
    );
  }

  function deleteItem(kind: "category" | "product", id: string) {
    void run(
      async () => {
        await apiRequest<null>(
          kind === "category" ? `/product-categories/${id}` : `/products/${id}`,
          {
            method: "DELETE",
            headers,
          },
        );
        if (kind === "category") {
          setCategories((items) => items.filter((item) => item.id !== id));
          if (id === sectionId) selectSection(null);
          if (id === groupId) selectGroup(null);
        } else {
          setProducts((items) => items.filter((item) => item.id !== id));
        }
      },
      "O'chirildi.",
      false,
      "O‘chirilmoqda...",
    );
  }

  async function uploadImage(product: Product) {
    try {
      const remaining = 10 - product.images.length;
      if (remaining < 1) throw new Error("Bu mahsulotda 10 ta rasm bor.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 1,
      });
      if (result.canceled) return;
      const assets = result.assets;
      if (
        assets.length > remaining ||
        assets.some(
          (asset) => asset.fileSize && asset.fileSize > 5 * 1024 * 1024,
        )
      ) {
        throw new Error(
          "Jami 10 tagacha rasm, har biri 5 MB gacha bo'lishi mumkin.",
        );
      }
      const form = new FormData();
      for (const asset of assets) {
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
        if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
          throw new Error("Faqat JPEG, PNG yoki WebP rasm tanlang.");
        }
        if (Platform.OS === "web") {
          const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
          form.append("images", blob, asset.fileName ?? "image.jpg");
        } else {
          const file = new File(asset.uri);
          form.append("images", file, asset.fileName ?? file.name);
        }
      }
      await run(
        async () => {
          const updated = await apiRequest<{ product: Product }>(
            `/products/${product.id}/images`,
            {
              method: "POST",
              headers,
              body: form,
            },
          );
          setProducts((items) =>
            items.map((item) =>
              item.id === product.id ? updated.product : item,
            ),
          );
        },
        "Rasmlar yuklandi.",
        false,
        "Yuklanmoqda...",
      );
    } catch (cause) {
      await handleError(cause);
    }
  }

  function deleteImage(product: Product, imageId: string) {
    void run(
      async () => {
        const result = await apiRequest<{ product: Product }>(
          `/products/${product.id}/images/${imageId}`,
          {
            method: "DELETE",
            headers,
          },
        );
        setProducts((items) =>
          items.map((item) => (item.id === product.id ? result.product : item)),
        );
      },
      "Rasm o'chirildi.",
      false,
      "O‘chirilmoqda...",
    );
  }

  function editCategory(item: Category) {
    setEditingCategory(item.id);
    setCategoryName(item.name);
    setError("");
    setFormOpen(true);
  }

  function confirmDeleteCategory(item: Category, relatedCount: number) {
    onRequestDelete({
      message: `${item.parentId === null ? "Guruhni" : "Bo'limni"} o'chirishni tasdiqlaysizmi?`,
      subject: item.name,
      detail: relatedCount > 0 ? "Avval ichidagi yozuvlarni o'chirish kerak." : undefined,
      disabled: relatedCount > 0,
      onConfirm: () => deleteItem("category", item.id),
    });
  }

  function categoryRow(item: Category) {
    const isGroup = item.parentId === null;
    const relatedCount = isGroup
      ? categories.filter((category) => category.parentId === item.id).length
      : products.filter((product) => product.categoryId === item.id).length;

    const openChildren = () =>
      isGroup
        ? router.push({
            pathname: "/catalog/sections",
            params: { groupId: item.id },
          })
        : router.push({
            pathname: "/catalog/products",
            params: { groupId: item.parentId ?? "", sectionId: item.id },
          });

    return (
      <View key={item.id} style={styles.itemCard}>
        <Pressable
          onPress={openChildren}
          accessibilityRole="button"
          accessibilityLabel={
            isGroup
              ? `${item.name} guruhining bo'limlari`
              : `${item.name} bo'limining mahsulotlari`
          }
        >
          <Text style={styles.itemType}>{isGroup ? "GURUH" : "BO'LIM"}</Text>
          <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.hint}>
            {relatedCount} ta {isGroup ? "bo'lim" : "mahsulot"}
          </Text>
        </Pressable>
        <View style={styles.categoryActionRow}>
            <Pressable style={[styles.categoryIconButton, styles.deleteIconButton, busy && styles.disabled]} onPress={() => confirmDeleteCategory(item, relatedCount)} disabled={busy} accessibilityRole="button" accessibilityLabel={`${item.name}ni o'chirish`}>
              <SymbolView name={{ ios: "trash", android: "delete", web: "delete" }} size={22} tintColor="#C3333D" />
            </Pressable>
            <Pressable style={[styles.manageButton, busy && styles.disabled]} onPress={openChildren} disabled={busy} accessibilityRole="button" accessibilityLabel={isGroup ? `${item.name} guruhining bo'limlarini boshqarish` : `${item.name} bo'limining mahsulotlarini boshqarish`}>
              <SymbolView name={{ ios: "square.grid.2x2", android: "grid_view", web: "grid_view" }} size={20} tintColor="#FFFFFF" />
              <Text style={styles.manageButtonText}>{isGroup ? "Bo'limlar" : "Mahsulotlar"}</Text>
            </Pressable>
            <Pressable style={[styles.categoryIconButton, styles.editIconButton, busy && styles.disabled]} onPress={() => editCategory(item)} disabled={busy} accessibilityRole="button" accessibilityLabel={`${item.name} nomini o'zgartirish`}>
              <SymbolView name={{ ios: "pencil", android: "edit", web: "edit" }} size={22} tintColor="#1677D2" />
            </Pressable>
        </View>
      </View>
    );
  }

  const selectedGroup = groups.find((item) => item.id === groupId);
  const selectedSection = sections.find((item) => item.id === sectionId);
  const categoryItems = mode === "groups" ? groups : sections;

  return (
    <View>
      {mode !== "groups" && <View style={[styles.card, mode === "sections" && styles.sectionSelector]}>
        <View style={styles.heading}>
          <Text style={styles.title}>
            {mode === "sections" ? "Guruhni tanlang" : "Joylashuvni tanlang"}
          </Text>
          {mode === "products" && <Pressable
            onPress={() => void refresh()}
            disabled={loading || busy}
            accessibilityRole="button"
          >
            <Text style={styles.link}>Yangilash</Text>
          </Pressable>}
        </View>
        {loading && (
          <View style={styles.loading}>
            <LoadingMark size={54} />
            <Text style={styles.hint}>Katalog yuklanmoqda...</Text>
          </View>
        )}
        {!!error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
          <>
            {mode === "products" && <Text style={styles.label}>Guruh</Text>}
            <View style={styles.wrap}>
              {groups.map((item) => (
                <Chip
                  key={item.id}
                  title={item.name}
                  selected={groupId === item.id}
                  onPress={() => selectGroup(item.id)}
                />
              ))}
            </View>
            {!loading && groups.length === 0 && (
              <>
                <Text style={styles.hint}>Hali guruh yaratilmagan.</Text>
                <Action
                  title="Guruh yaratishga o'tish  →"
                  onPress={() => router.push("/catalog/groups")}
                  secondary
                />
              </>
            )}
            {mode === "products" && !!groupId && (
              <>
                <Text style={styles.label}>Bo'lim</Text>
                <View style={styles.wrap}>
                  {sections.map((item) => (
                    <Chip
                      key={item.id}
                      title={item.name}
                      selected={sectionId === item.id}
                      onPress={() => selectSection(item.id)}
                    />
                  ))}
                </View>
                {!loading && sections.length === 0 && (
                  <Action
                    title="Bu guruhga bo'lim yaratish  →"
                    onPress={() =>
                      router.push({
                        pathname: "/catalog/sections",
                        params: { groupId },
                      })
                    }
                    secondary
                  />
                )}
              </>
            )}
            {mode === "products" && !!selectedSection && (
              <Text style={styles.hint}>
                “{selectedGroup?.name}” / “{selectedSection.name}” mahsulotlari
                ko'rsatilmoqda.
              </Text>
            )}
          </>
      </View>}

      {(mode === "groups" || mode === "sections") && (
        <Modal
          visible={formOpen}
          transparent
          animationType="fade"
          onRequestClose={closeCategoryForm}
          onShow={() => categoryNameInputRef.current?.focus()}
        >
          <KeyboardAvoidingView
            style={styles.groupModalOverlay}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closeCategoryForm}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Modalni yopish"
            />
            <ScrollView
              style={styles.groupModalCard}
              contentContainerStyle={styles.groupModalContent}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                onPress={closeCategoryForm}
                disabled={busy}
                accessibilityRole="button"
                style={styles.modalBack}
              >
                <Text style={styles.modalBackText}>‹ {mode === "groups" ? "Guruhlarga" : "Bo'limlarga"} qaytish</Text>
              </Pressable>
              <Text style={styles.title}>
                {editingCategory
                  ? mode === "groups" ? "Guruh nomini o'zgartirish" : "Bo'lim nomini o'zgartirish"
                  : mode === "groups" ? "Yangi guruh" : "Yangi bo'lim"}
              </Text>
              <Text style={styles.hint}>
                {editingCategory
                  ? "Yangi nomni kiriting."
                  : mode === "groups" ? "Masalan: Maishiy texnika" : `Guruh: ${selectedGroup?.name ?? "Tanlanmagan"}`}
              </Text>
              {!!error && (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              )}
              <Text style={styles.label}>
                {editingCategory ? "Yangi nom" : mode === "groups" ? "Guruh nomi" : "Bo'lim nomi"}
              </Text>
              <TextInput
                ref={categoryNameInputRef}
                style={styles.input}
                value={categoryName}
                onChangeText={setCategoryName}
                placeholder="Nomini kiriting"
                maxLength={100}
                editable={!busy}
                selectTextOnFocus={!!editingCategory}
              />
              <Action
                title={
                  editingCategory ? "O'zgarishni saqlash" : mode === "groups" ? "Guruhni yaratish" : "Bo'limni yaratish"
                }
                onPress={saveCategory}
                disabled={busy}
              />
              <Action
                title="Bekor qilish"
                onPress={closeCategoryForm}
                disabled={busy}
                secondary
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {(mode === "groups" || (mode === "sections" && !!selectedGroup)) && (
        <View style={styles.list}>
          <View style={[styles.heading, styles.listHeading]}>
            <Text style={[styles.listTitle, styles.listTitleInRow]}>
              {mode === "groups" ? "Mavjud guruhlar" : "Mavjud bo'limlar"} ·{" "}
              {categoryItems.length}
            </Text>
            <Pressable
              style={[styles.refreshButton, (loading || busy) && styles.disabled]}
              onPress={() => void refresh()}
              disabled={loading || busy}
              accessibilityRole="button"
              accessibilityLabel={mode === "groups" ? "Guruhlar ro'yxatini yangilash" : "Bo'limlar ro'yxatini yangilash"}
            >
              <SymbolView name={{ ios: "arrow.clockwise", android: "refresh", web: "refresh" }} size={21} tintColor="#1677D2" />
            </Pressable>
          </View>
          {mode === "groups" && loading && <View style={styles.loading}>
            <LoadingMark size={54} />
            <Text style={styles.hint}>Katalog yuklanmoqda...</Text>
          </View>}
          {mode === "groups" && !!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
          {!loading && categoryItems.length === 0 && (
            <Text style={styles.hint}>
              {mode === "groups"
                ? "Hali guruh yo'q. Yuqoridagi tugma orqali birinchisini yarating."
                : "Bu guruhda bo'lim yo'q. Yuqoridagi tugma orqali yarating."}
            </Text>
          )}
          {categoryItems.map(categoryRow)}
        </View>
      )}

      {mode === "products" && !!selectedSection && (
        <View style={styles.card}>
          <Text style={styles.title}>
            “{selectedSection.name}” mahsulotlari
          </Text>
          <Text style={styles.hint}>
            Yangi mahsulot shu bo'limga qo'shiladi.
          </Text>
          <Action
            title="+ Yangi mahsulot qo'shish"
            onPress={() => {
              setFormOpen(true);
              setEditingProduct(null);
              clearProductForm();
              setError("");
            }}
            disabled={busy}
          />
        </View>
      )}

      {mode === "products" && !!selectedSection && (
        <Modal
          visible={formOpen}
          animationType="slide"
          onRequestClose={closeProductForm}
        >
          <KeyboardAvoidingView
            style={styles.modalScreen}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                onPress={closeProductForm}
                disabled={busy}
                accessibilityRole="button"
                style={styles.modalBack}
              >
                <Text style={styles.modalBackText}>
                  ‹ Mahsulotlarga qaytish
                </Text>
              </Pressable>
              <Text style={styles.title}>Yangi mahsulot</Text>
              <Text style={styles.hint}>
                “{selectedSection.name}” bo‘limiga qo‘shiladi.
              </Text>
              {!!error && (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              )}
              <Text style={styles.label}>Mahsulot nomi</Text>
              <TextInput
                style={styles.input}
                value={productName}
                onChangeText={setProductName}
                placeholder="Masalan: Muzlatkich"
                maxLength={100}
                editable={!busy}
              />
              <Text style={styles.label}>Sarlavha</Text>
              <TextInput
                style={styles.input}
                value={productTitle}
                onChangeText={setProductTitle}
                placeholder="Qisqa tavsif"
                maxLength={200}
                editable={!busy}
              />
              <Text style={styles.label}>Asl narx (so&apos;m)</Text>
              <MoneyInput
                value={originalPrice}
                onChangeText={setOriginalPrice}
                placeholder="3 000 000"
                editable={!busy}
              />
              <Text style={styles.label}>
                Eng past sotilish narxi (so&apos;m)
              </Text>
              <MoneyInput
                value={minSellingPrice}
                onChangeText={setMinSellingPrice}
                placeholder="2 800 000"
                editable={!busy}
              />
              <Text style={styles.hint}>
                Mijozga sotuv narxi bundan kam bo&apos;lishi mumkin emas.
              </Text>
              <Text style={styles.label}>Kafolat muddati *</Text>
              <TextInput
                style={styles.input}
                value={warrantyPeriod}
                onChangeText={(value) =>
                  setWarrantyPeriod(value.replace(",", "."))
                }
                placeholder="Masalan: 1.6"
                keyboardType="decimal-pad"
                maxLength={20}
                editable={!busy}
              />
              <Action
                title={busy ? "Saqlanmoqda..." : "Mahsulotni yaratish"}
                onPress={saveProduct}
                disabled={busy}
              />
              <Action
                title="Bekor qilish"
                onPress={closeProductForm}
                disabled={busy}
                secondary
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {mode === "products" && !!selectedSection && (
        <View style={styles.list}>
          <Text style={styles.listTitle}>
            Mavjud mahsulotlar · {visibleProducts.length}
          </Text>
          {!loading && visibleProducts.length === 0 && (
            <Text style={styles.hint}>Bu bo'limda hali mahsulot yo'q.</Text>
          )}
          {visibleProducts.map((product) => {
            const editing = editingProduct === product.id;
            return (
              <View key={product.id} style={styles.itemCard}>
                <Text style={styles.itemType}>MAHSULOT</Text>
                <Text style={styles.itemName}>{product.name}</Text>
                <Text style={styles.hint}>Kod: {product.universalId}</Text>
                <Text style={styles.hint}>{product.title}</Text>
                <Text style={styles.priceText}>
                  Asl narx: {formatPrice(product.originalPrice)}
                </Text>
                <Text style={styles.priceText}>
                  Eng past sotilish narxi:{" "}
                  {formatPrice(product.minSellingPrice)}
                </Text>
                <Text style={styles.priceText}>
                  Kafolat muddati: {product.warrantyPeriod || "Kiritilmagan"}
                </Text>
                {editing ? (
                  <>
                    <Text style={styles.label}>Mahsulot nomi</Text>
                    <TextInput
                      style={styles.input}
                      value={productName}
                      onChangeText={setProductName}
                      maxLength={100}
                      editable={!busy}
                    />
                    <Text style={styles.label}>Sarlavha</Text>
                    <TextInput
                      style={styles.input}
                      value={productTitle}
                      onChangeText={setProductTitle}
                      maxLength={200}
                      editable={!busy}
                    />
                    <Text style={styles.label}>Asl narx (so'm)</Text>
                    <MoneyInput
                      value={originalPrice}
                      onChangeText={setOriginalPrice}
                      placeholder="3 000 000"
                      editable={!busy}
                    />
                    <Text style={styles.label}>
                      Eng past sotilish narxi (so'm)
                    </Text>
                    <MoneyInput
                      value={minSellingPrice}
                      onChangeText={setMinSellingPrice}
                      placeholder="2 800 000"
                      editable={!busy}
                    />
                    <Text style={styles.label}>Kafolat muddati *</Text>
                    <TextInput
                      style={styles.input}
                      value={warrantyPeriod}
                      onChangeText={(value) =>
                        setWarrantyPeriod(value.replace(",", "."))
                      }
                      placeholder="Masalan: 1.6"
                      keyboardType="decimal-pad"
                      maxLength={20}
                      editable={!busy}
                    />
                    <Action
                      title="O'zgarishni saqlash"
                      onPress={saveProduct}
                      disabled={busy}
                    />
                    <Action
                      title="Bekor qilish"
                      onPress={() => {
                        setEditingProduct(null);
                        clearProductForm();
                      }}
                      disabled={busy}
                      secondary
                    />
                  </>
                ) : (
                  <View style={styles.actions}>
                    <Action
                      title="Tahrirlash"
                      onPress={() => {
                        setFormOpen(false);
                        setEditingProduct(product.id);
                        setProductName(product.name);
                        setProductTitle(product.title);
                        setOriginalPrice(
                          product.originalPrice?.toString() ?? "",
                        );
                        setMinSellingPrice(
                          product.minSellingPrice?.toString() ?? "",
                        );
                        setWarrantyPeriod(product.warrantyPeriod ?? "");
                      }}
                      disabled={busy}
                      secondary
                    />
                    <Action
                      title="O'chirish"
                      onPress={() =>
                        onRequestDelete({
                          message: "Mahsulotni o'chirishni tasdiqlaysizmi?",
                          subject: product.name,
                          onConfirm: () => deleteItem("product", product.id),
                        })
                      }
                      disabled={busy}
                      danger
                    />
                  </View>
                )}
                <Text style={styles.imageCount}>
                  Rasmlar: {product.images.length}/10
                </Text>
                <View style={styles.wrap}>
                  {product.images.map((image) => (
                    <View key={image.id} style={styles.imageBox}>
                      <Image
                        source={{ uri: (API_URL ?? "") + image.url }}
                        style={styles.image}
                      />
                      <Action
                        title="Rasmni o'chirish"
                        onPress={() =>
                          onRequestDelete({
                            message: "Rasmni o'chirishni tasdiqlaysizmi?",
                            subject: product.name,
                            onConfirm: () => deleteImage(product, image.id),
                          })
                        }
                        disabled={busy}
                        danger
                      />
                    </View>
                  ))}
                </View>
                <Action
                  title="+ Rasm qo'shish"
                  onPress={() => uploadImage(product)}
                  disabled={busy || product.images.length >= 10}
                  secondary
                />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function Chip({
  title,
  selected,
  onPress,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {title}
      </Text>
    </Pressable>
  );
}

function Action({
  title,
  onPress,
  disabled,
  secondary,
  danger,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.action,
        secondary && styles.secondary,
        danger && styles.danger,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text
        style={[
          styles.actionText,
          (secondary || danger) && styles.altText,
          danger && styles.dangerText,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groupModalOverlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 24,
    backgroundColor: "rgba(23, 37, 54, 0.35)",
  },
  groupModalCard: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: "85%",
    backgroundColor: "#F6F8FB",
    borderRadius: 18,
  },
  groupModalContent: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 24,
  },
  modalScreen: { flex: 1, backgroundColor: "#F6F8FB" },
  modalContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  modalBack: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingRight: 20,
    marginBottom: 18,
  },
  modalBackText: { color: "#1677D2", fontSize: 16, fontWeight: "700" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
  },
  sectionSelector: { backgroundColor: "transparent", borderRadius: 0, padding: 0, marginBottom: 22 },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  loading: { alignItems: "center", marginTop: 14 },
  title: { fontSize: 20, fontWeight: "800", color: "#172536" },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#172536",
    marginTop: 18,
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: "#627184",
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 12,
  },
  link: { color: "#1677D2", fontWeight: "700" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chipSelected: { backgroundColor: "#EAF4FF", borderColor: "#1677D2" },
  chipText: { color: "#627184", fontWeight: "700" },
  chipTextSelected: { color: "#1677D2" },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    paddingHorizontal: 14,
    color: "#172536",
    fontSize: 16,
    marginTop: 16,
  },
  action: {
    backgroundColor: "#1677D2",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
    alignItems: "center",
    marginTop: 10,
  },
  secondary: { backgroundColor: "#EAF4FF" },
  danger: { backgroundColor: "#FDECEE" },
  actionText: { color: "#FFFFFF", fontWeight: "700" },
  altText: { color: "#1677D2" },
  dangerText: { color: "#C3333D" },
  disabled: { opacity: 0.5 },
  list: { marginBottom: 18 },
  listTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#172536",
    marginBottom: 12,
  },
  listHeading: { marginBottom: 12 },
  listTitleInRow: { marginBottom: 0 },
  refreshButton: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF4FF" },
  itemCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF3",
    borderRadius: 16,
    padding: 18,
    marginBottom: 10,
  },
  categoryActionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18 },
  categoryIconButton: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  deleteIconButton: { backgroundColor: "#FDECEE" },
  editIconButton: { backgroundColor: "#EAF4FF" },
  manageButton: { flex: 1, minHeight: 48, borderRadius: 11, backgroundColor: "#1677D2", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 8 },
  manageButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", textAlign: "center" },
  itemName: { fontSize: 16, fontWeight: "700", color: "#172536" },
  priceText: {
    color: "#32465C",
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
  },
  itemType: {
    color: "#7B8CA0",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 4,
  },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  imageCount: {
    color: "#627184",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 18,
  },
  imageBox: { alignItems: "flex-start" },
  image: { width: 90, height: 90, borderRadius: 8 },
  error: { color: "#C3333D", marginTop: 12 },
});
