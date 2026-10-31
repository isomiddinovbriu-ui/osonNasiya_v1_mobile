import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
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
import { formatDate } from "./customers";
import type { DeleteConfirmation } from "./FullScreenLoading";
import LoadingMark from "./LoadingMark";
import { formatMoneyDigits, formatMoneyWithUnits, parseMoney } from "./money";
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
  createdAt?: string | null;
  updatedAt?: string | null;
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
  groupSearch: string;
  sectionSearch: string;
  onSectionSearchChange: (value: string) => void;
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

function parseWarrantyPeriod(value: string) {
  const match = /^(10|[0-9])(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const years = Number(match[1]);
  const months = Number(match[2] ?? 0);
  return months <= 11 && (years > 0 || months > 0)
    ? { years, months }
    : null;
}

function formatWarrantyPeriod(value: string | null) {
  if (!value) return "Kiritilmagan";
  const period = parseWarrantyPeriod(value);
  return period
    ? [period.years && `${period.years} yil`, period.months && `${period.months} oy`]
        .filter(Boolean)
        .join(" ")
    : value;
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
  groupSearch,
  sectionSearch,
  onSectionSearchChange,
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
  const [confirmLowPrice, setConfirmLowPrice] = useState(false);
  const parsedOriginalPrice = parsePrice(originalPrice);
  const parsedMinSellingPrice = parsePrice(minSellingPrice);
  const minPriceTone =
    parsedOriginalPrice === null || parsedMinSellingPrice === null
      ? undefined
      : parsedMinSellingPrice < parsedOriginalPrice
        ? "error"
        : parsedMinSellingPrice > parsedOriginalPrice
          ? "success"
          : undefined;
  const [warrantyPeriod, setWarrantyPeriod] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [viewingProductId, setViewingProductId] = useState<string | null>(null);
  const [productDetail, setProductDetail] = useState<Product | null>(null);
  const [productDetailLoading, setProductDetailLoading] = useState(false);
  const [productDetailError, setProductDetailError] = useState("");
  const [productImageError, setProductImageError] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const productDetailRequest = useRef(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pickerType, setPickerType] = useState<"group" | "section" | null>(
    null,
  );
  const [pickerSearch, setPickerSearch] = useState("");
  const [sectionSearchResult, setSectionSearchResult] = useState<{
    groupId: string;
    query: string;
    source: Category[];
    items: Category[];
    error: string;
  } | null>(null);
  const [groupSearchResult, setGroupSearchResult] = useState<{
    query: string;
    source: Category[];
    items: Category[];
    error: string;
  } | null>(null);

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
    if (
      (mode !== "groups" && mode !== "sections") ||
      createCategoryRequest === 0
    )
      return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setEditingCategory(null);
      setCategoryName("");
      setError("");
      setFormOpen(true);
    });
    return () => {
      active = false;
    };
  }, [createCategoryRequest, mode]);

  async function run(
    action: () => Promise<void>,
    message: string,
    hideFormDuringRequest = false,
    loadingMessage = "Saqlanmoqda...",
    onActionError?: (cause: unknown) => void,
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
      if (
        onActionError &&
        !(cause instanceof ApiError && cause.status === 401)
      ) {
        onActionError(cause);
      } else {
        await handleError(cause);
      }
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  const groups = categories.filter((category) => category.parentId === null);
  const groupSearchQuery = groupSearch.trim();
  const matchingGroupSearch =
    groupSearchResult?.query === groupSearchQuery &&
    groupSearchResult.source === categories;
  const searchedGroups = groupSearchQuery
    ? matchingGroupSearch
      ? (groupSearchResult?.items ?? [])
      : []
    : groups;
  const searchingGroups =
    mode === "groups" && !!groupSearchQuery && !matchingGroupSearch;
  const groupSearchError =
    groupSearchQuery && matchingGroupSearch
      ? (groupSearchResult?.error ?? "")
      : "";

  useEffect(() => {
    if (mode !== "groups" || !groupSearchQuery) return;
    let active = true;
    const timer = setTimeout(() => {
      void apiRequest<{ categories: Category[] }>(
        `/product-categories?parentId=null&search=${encodeURIComponent(groupSearchQuery)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
        .then((result) => {
          if (active)
            setGroupSearchResult({
              query: groupSearchQuery,
              source: categories,
              items: result.categories,
              error: "",
            });
        })
        .catch(async (cause: unknown) => {
          if (!active) return;
          if (cause instanceof ApiError && cause.status === 401) {
            await onSessionExpired();
          } else {
            setGroupSearchResult({
              query: groupSearchQuery,
              source: categories,
              items: [],
              error:
                cause instanceof Error
                  ? cause.message
                  : "Qidiruvni bajarib bo'lmadi.",
            });
          }
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mode, groupSearchQuery, categories, token, onSessionExpired]);
  const sectionCountByGroup = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of categories) {
      if (category.parentId) {
        counts.set(category.parentId, (counts.get(category.parentId) ?? 0) + 1);
      }
    }
    return counts;
  }, [categories]);
  const productCountBySection = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [products]);
  const groupId =
    groups.find((category) => category.id === preferredGroupId)?.id ??
    newestCategory(groups)?.id ??
    null;
  const sections = categories.filter(
    (category) => category.parentId === groupId,
  );
  const sectionSearchQuery = sectionSearch.trim();
  const matchingSectionSearch =
    sectionSearchResult?.groupId === groupId &&
    sectionSearchResult.query === sectionSearchQuery &&
    sectionSearchResult.source === categories;
  const searchedSections = sectionSearchQuery
    ? matchingSectionSearch
      ? (sectionSearchResult?.items ?? [])
      : []
    : sections;
  const searchingSections =
    mode === "sections" &&
    !!groupId &&
    !!sectionSearchQuery &&
    !matchingSectionSearch;
  const sectionSearchError =
    sectionSearchQuery && matchingSectionSearch
      ? (sectionSearchResult?.error ?? "")
      : "";

  useEffect(() => {
    if (mode !== "sections" || !groupId || !sectionSearchQuery) return;
    let active = true;
    const timer = setTimeout(() => {
      void apiRequest<{ categories: Category[] }>(
        `/product-categories?parentId=${encodeURIComponent(groupId)}&search=${encodeURIComponent(sectionSearchQuery)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
        .then((result) => {
          if (active)
            setSectionSearchResult({
              groupId,
              query: sectionSearchQuery,
              source: categories,
              items: result.categories,
              error: "",
            });
        })
        .catch(async (cause: unknown) => {
          if (!active) return;
          if (cause instanceof ApiError && cause.status === 401) {
            await onSessionExpired();
          } else {
            setSectionSearchResult({
              groupId,
              query: sectionSearchQuery,
              source: categories,
              items: [],
              error:
                cause instanceof Error
                  ? cause.message
                  : "Qidiruvni bajarib bo'lmadi.",
            });
          }
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mode, groupId, sectionSearchQuery, categories, token, onSessionExpired]);
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
    setConfirmLowPrice(false);
    setFormOpen(false);
    setEditingProduct(null);
    clearProductForm();
    setError("");
  }

  function beginEditProduct(product: Product) {
    closeProductDetail();
    setConfirmLowPrice(false);
    setEditingProduct(product.id);
    setProductName(product.name);
    setProductTitle(product.title);
    setOriginalPrice(product.originalPrice?.toString() ?? "");
    setMinSellingPrice(product.minSellingPrice?.toString() ?? "");
    setWarrantyPeriod(product.warrantyPeriod ?? "");
    setError("");
    setFormOpen(true);
  }

  function confirmDeleteProduct(product: Product) {
    closeProductDetail();
    onRequestDelete({
      message: "Mahsulotni o'chirishni tasdiqlaysizmi?",
      subject: product.name,
      onConfirm: () => deleteItem("product", product.id),
    });
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
    onSectionSearchChange("");
    setPreferredSectionId(null);
    setFormOpen(false);
    setEditingCategory(null);
    setEditingProduct(null);
    setCategoryName("");
    clearProductForm();
    setError("");
  }

  function closePicker() {
    setPickerType(null);
    setPickerSearch("");
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

  function saveProduct(lowPriceConfirmed = false) {
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
    if (!parseWarrantyPeriod(warranty)) {
      setError("Kafolat uchun 1–11 oy yoki 1–10 yil tanlang.");
      return;
    }
    if (minimum < original && !lowPriceConfirmed) {
      Keyboard.dismiss();
      setError("");
      setConfirmLowPrice(true);
      return;
    }
    setConfirmLowPrice(false);
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

  async function openProductDetail(id: string) {
    const request = ++productDetailRequest.current;
    setPreviewImage(null);
    setViewingProductId(id);
    setProductDetail(null);
    setProductDetailError("");
    setProductImageError("");
    setProductDetailLoading(true);
    try {
      const result = await apiRequest<{ product: Product }>(
        `/products/${encodeURIComponent(id)}`,
        { headers },
      );
      if (request === productDetailRequest.current)
        setProductDetail(result.product);
    } catch (cause) {
      if (request !== productDetailRequest.current) return;
      if (cause instanceof ApiError && cause.status === 401) {
        closeProductDetail();
        await onSessionExpired();
      } else {
        setProductDetailError(
          cause instanceof Error
            ? cause.message
            : "Mahsulotni yuklab bo'lmadi.",
        );
      }
    } finally {
      if (request === productDetailRequest.current)
        setProductDetailLoading(false);
    }
  }

  function closeProductDetail() {
    productDetailRequest.current += 1;
    setPreviewImage(null);
    setViewingProductId(null);
    setProductDetail(null);
    setProductDetailError("");
    setProductImageError("");
    setProductDetailLoading(false);
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

  async function uploadImage(product: Product, inDetail = false) {
    try {
      if (inDetail) setProductImageError("");
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
          setProductDetail((current) =>
            current?.id === product.id ? updated.product : current,
          );
        },
        "Rasmlar yuklandi.",
        false,
        "Yuklanmoqda...",
        inDetail
          ? (cause) =>
              setProductImageError(
                cause instanceof Error
                  ? cause.message
                  : "Rasmni yuklab bo'lmadi.",
              )
          : undefined,
      );
    } catch (cause) {
      if (inDetail) {
        setProductImageError(
          cause instanceof Error ? cause.message : "Rasmni tanlab bo'lmadi.",
        );
      } else {
        await handleError(cause);
      }
    }
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
      detail:
        relatedCount > 0
          ? "Avval ichidagi yozuvlarni o'chirish kerak."
          : undefined,
      disabled: relatedCount > 0,
      onConfirm: () => deleteItem("category", item.id),
    });
  }

  function categoryRow(item: Category) {
    const isGroup = item.parentId === null;
    const relatedCount = isGroup
      ? (sectionCountByGroup.get(item.id) ?? 0)
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
          <Text style={styles.itemName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.hint}>
            {relatedCount} ta {isGroup ? "bo'lim" : "mahsulot"}
          </Text>
        </Pressable>
        <View style={styles.categoryActionRow}>
          <Pressable
            style={[
              styles.categoryIconButton,
              styles.deleteIconButton,
              busy && styles.disabled,
            ]}
            onPress={() => confirmDeleteCategory(item, relatedCount)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}ni o'chirish`}
          >
            <SymbolView
              name={{ ios: "trash", android: "delete", web: "delete" }}
              size={22}
              tintColor="#C3333D"
            />
          </Pressable>
          <Pressable
            style={[styles.manageButton, busy && styles.disabled]}
            onPress={openChildren}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={
              isGroup
                ? `${item.name} guruhining bo'limlarini boshqarish`
                : `${item.name} bo'limining mahsulotlarini boshqarish`
            }
          >
            <SymbolView
              name={{
                ios: "square.grid.2x2",
                android: "grid_view",
                web: "grid_view",
              }}
              size={20}
              tintColor="#FFFFFF"
            />
            <Text style={styles.manageButtonText}>
              {isGroup ? "Bo'limlar" : "Mahsulotlar"}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.categoryIconButton,
              styles.editIconButton,
              busy && styles.disabled,
            ]}
            onPress={() => editCategory(item)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`${item.name} nomini o'zgartirish`}
          >
            <SymbolView
              name={{ ios: "pencil", android: "edit", web: "edit" }}
              size={22}
              tintColor="#1677D2"
            />
          </Pressable>
        </View>
      </View>
    );
  }

  const selectedGroup = groups.find((item) => item.id === groupId);
  const selectedSection = sections.find((item) => item.id === sectionId);
  const categoryItems = mode === "groups" ? searchedGroups : searchedSections;
  const searchingCategories =
    mode === "groups" ? searchingGroups : searchingSections;
  const categorySearchError =
    mode === "groups" ? groupSearchError : sectionSearchError;
  const pickerQuery = pickerSearch.trim().toLocaleLowerCase("uz-UZ");
  const pickerItems = pickerType === "section" ? sections : groups;
  const filteredPickerItems = pickerQuery
    ? pickerItems.filter((item) =>
        item.name.toLocaleLowerCase("uz-UZ").includes(pickerQuery),
      )
    : pickerItems;
  const selectedPickerId = pickerType === "section" ? sectionId : groupId;

  return (
    <View>
      {mode !== "groups" && (
        <View style={[styles.card, styles.sectionSelector]}>
          <View style={styles.heading}>
            <Text style={styles.title}>
              {mode === "sections"
                ? "Guruhni tanlang"
                : "Guruh va bo'limni tanlang"}
            </Text>
            {mode === "products" && (
              <Pressable
                style={[
                  styles.refreshButton,
                  (loading || busy) && styles.disabled,
                ]}
                onPress={() => void refresh()}
                disabled={loading || busy}
                accessibilityRole="button"
                accessibilityLabel="Katalogni yangilash"
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
            )}
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
            <Pressable
              style={[
                styles.groupPickerTrigger,
                mode === "products" && styles.productPickerTrigger,
                (loading || groups.length === 0) && styles.disabled,
              ]}
              onPress={() => {
                setPickerSearch("");
                setPickerType("group");
              }}
              disabled={loading || groups.length === 0}
              accessibilityRole="button"
              accessibilityLabel={`Guruhni tanlash. Hozir: ${selectedGroup?.name ?? "tanlanmagan"}`}
            >
              <View style={styles.groupPickerTriggerText}>
                <Text style={styles.groupPickerName} numberOfLines={1}>
                  {selectedGroup?.name ?? "Guruh tanlang"}
                </Text>
                <Text style={styles.groupPickerCount}>
                  Jami {sections.length} ta bo&apos;lim
                </Text>
              </View>
              <SymbolView
                name={{
                  ios: "chevron.down",
                  android: "keyboard_arrow_down",
                  web: "keyboard_arrow_down",
                }}
                size={20}
                tintColor="#1677D2"
              />
            </Pressable>
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
                <Pressable
                  style={[
                    styles.groupPickerTrigger,
                    styles.productPickerTrigger,
                    (loading || sections.length === 0) && styles.disabled,
                  ]}
                  onPress={() => {
                    setPickerSearch("");
                    setPickerType("section");
                  }}
                  disabled={loading || sections.length === 0}
                  accessibilityRole="button"
                  accessibilityLabel={`Bo'limni tanlash. Hozir: ${selectedSection?.name ?? "tanlanmagan"}`}
                >
                  <View style={styles.groupPickerTriggerText}>
                    <Text style={styles.groupPickerName} numberOfLines={1}>
                      {selectedSection?.name ?? "Bo'lim tanlang"}
                    </Text>
                    <Text style={styles.groupPickerCount}>
                      Jami {visibleProducts.length} ta mahsulot
                    </Text>
                  </View>
                  <SymbolView
                    name={{
                      ios: "chevron.down",
                      android: "keyboard_arrow_down",
                      web: "keyboard_arrow_down",
                    }}
                    size={20}
                    tintColor="#1677D2"
                  />
                </Pressable>
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
          </>
        </View>
      )}

      {mode !== "groups" && (
        <Modal
          visible={pickerType !== null}
          transparent
          animationType="slide"
          onRequestClose={closePicker}
        >
          <KeyboardAvoidingView
            style={styles.groupPickerOverlay}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closePicker}
              accessibilityRole="button"
              accessibilityLabel="Tanlash oynasini yopish"
            />
            <View style={styles.groupPickerSheet}>
              <View style={styles.groupPickerHeading}>
                <Text style={styles.title}>
                  {pickerType === "section"
                    ? "Bo'limni tanlang"
                    : "Guruhni tanlang"}
                </Text>
                <Pressable
                  style={styles.groupPickerClose}
                  onPress={closePicker}
                  accessibilityRole="button"
                  accessibilityLabel="Yopish"
                >
                  <SymbolView
                    name={{ ios: "xmark", android: "close", web: "close" }}
                    size={20}
                    tintColor="#627184"
                  />
                </Pressable>
              </View>
              <View style={styles.groupPickerSearchRow}>
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
                  style={styles.groupPickerSearchInput}
                  value={pickerSearch}
                  onChangeText={setPickerSearch}
                  placeholder={
                    pickerType === "section"
                      ? "Bo'lim nomini qidiring"
                      : "Guruh nomini qidiring"
                  }
                  placeholderTextColor="#8A98A8"
                  autoCorrect={false}
                  accessibilityLabel={
                    pickerType === "section"
                      ? "Bo'lim nomi bo'yicha qidirish"
                      : "Guruh nomi bo'yicha qidirish"
                  }
                />
              </View>
              <FlatList
                data={filteredPickerItems}
                keyExtractor={(item) => item.id}
                extraData={[
                  selectedPickerId,
                  sectionCountByGroup,
                  productCountBySection,
                ]}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.groupPickerList}
                ListEmptyComponent={
                  <Text style={styles.groupPickerEmpty}>
                    {pickerType === "section"
                      ? "Bo'lim topilmadi."
                      : "Guruh topilmadi."}
                  </Text>
                }
                renderItem={({ item }) => (
                  <Pressable
                    style={[
                      styles.groupPickerItem,
                      item.id === selectedPickerId &&
                        styles.groupPickerItemSelected,
                    ]}
                    onPress={() => {
                      if (pickerType === "section" && item.id !== sectionId)
                        selectSection(item.id);
                      if (pickerType === "group" && item.id !== groupId)
                        selectGroup(item.id);
                      closePicker();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: item.id === selectedPickerId,
                    }}
                  >
                    <Text
                      style={[
                        styles.groupPickerItemText,
                        item.id === selectedPickerId &&
                          styles.groupPickerItemTextSelected,
                      ]}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                    <Text
                      style={[
                        styles.groupPickerSectionCount,
                        item.id === selectedPickerId &&
                          styles.groupPickerItemTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {pickerType === "section"
                        ? `${productCountBySection.get(item.id) ?? 0} ta mahsulot`
                        : `${sectionCountByGroup.get(item.id) ?? 0} ta bo'lim`}
                    </Text>
                    {item.id === selectedPickerId && (
                      <SymbolView
                        name={{
                          ios: "checkmark",
                          android: "check",
                          web: "check",
                        }}
                        size={20}
                        tintColor="#1677D2"
                      />
                    )}
                  </Pressable>
                )}
              />
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

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
                <Text style={styles.modalBackText}>
                  ‹ {mode === "groups" ? "Guruhlarga" : "Bo'limlarga"} qaytish
                </Text>
              </Pressable>
              <Text style={styles.title}>
                {editingCategory
                  ? mode === "groups"
                    ? "Guruh nomini o'zgartirish"
                    : "Bo'lim nomini o'zgartirish"
                  : mode === "groups"
                    ? "Yangi guruh"
                    : "Yangi bo'lim"}
              </Text>
              <Text style={styles.hint}>
                {editingCategory
                  ? "Yangi nomni kiriting."
                  : mode === "groups"
                    ? "Masalan: Maishiy texnika"
                    : `Guruh: ${selectedGroup?.name ?? "Tanlanmagan"}`}
              </Text>
              {!!error && (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              )}
              <Text style={styles.label}>
                {editingCategory
                  ? "Yangi nom"
                  : mode === "groups"
                    ? "Guruh nomi"
                    : "Bo'lim nomi"}
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
                  editingCategory
                    ? "O'zgarishni saqlash"
                    : mode === "groups"
                      ? "Guruhni yaratish"
                      : "Bo'limni yaratish"
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
              {searchingCategories ? "..." : categoryItems.length}
            </Text>
            <Pressable
              style={[
                styles.refreshButton,
                (loading || busy) && styles.disabled,
              ]}
              onPress={() => void refresh()}
              disabled={loading || busy}
              accessibilityRole="button"
              accessibilityLabel={
                mode === "groups"
                  ? "Guruhlar ro'yxatini yangilash"
                  : "Bo'limlar ro'yxatini yangilash"
              }
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
          {mode === "groups" && loading && (
            <View style={styles.loading}>
              <LoadingMark size={54} />
              <Text style={styles.hint}>Katalog yuklanmoqda...</Text>
            </View>
          )}
          {mode === "groups" && !!error && (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          )}
          {searchingCategories && (
            <Text style={styles.hint}>Qidirilmoqda...</Text>
          )}
          {!!categorySearchError && (
            <Text style={styles.error} accessibilityRole="alert">
              {categorySearchError}
            </Text>
          )}
          {!loading &&
            !searchingCategories &&
            !categorySearchError &&
            categoryItems.length === 0 && (
              <Text style={styles.hint_red}>
                {mode === "groups"
                  ? groupSearchQuery
                    ? "Mos guruh topilmadi."
                    : "Hali guruh yo'q. Yuqoridagi tugma orqali birinchisini yarating."
                  : sectionSearchQuery
                    ? "Mos bo'lim topilmadi."
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
          visible={
            formOpen || viewingProductId !== null || previewImage !== null
          }
          animationType="slide"
          onRequestClose={
            previewImage
              ? () => setPreviewImage(null)
              : confirmLowPrice
                ? () => setConfirmLowPrice(false)
              : formOpen
                ? closeProductForm
                : closeProductDetail
          }
        >
          <KeyboardAvoidingView
            style={styles.modalScreen}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            {(formOpen || viewingProductId !== null) && (
              <View style={styles.productDetailStickyBar}>
                <Pressable
                  onPress={formOpen ? closeProductForm : closeProductDetail}
                  accessibilityRole="button"
                  style={styles.productDetailStickyBack}
                >
                  <Text style={styles.modalBackText}>
                    ‹ Mahsulotlarga qaytish
                  </Text>
                </Pressable>
              </View>
            )}
            <ScrollView
              contentContainerStyle={[
                styles.modalContent,
                styles.productDetailScrollContent,
              ]}
              keyboardShouldPersistTaps="handled"
            >
              {formOpen ? (
                <>
                  <Text style={styles.title}>
                    {editingProduct
                      ? "Mahsulotni tahrirlash"
                      : "Yangi mahsulot"}
                  </Text>
                  <Text style={styles.hint}>
                    {editingProduct
                      ? `${selectedSection.name} bo‘limidagi mahsulot`
                      : `“${selectedSection.name}” bo‘limiga qo‘shiladi.`}
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
                    tone={minPriceTone}
                  />
                  <Text style={styles.hint}>
                    Mijozga sotuv narxi bundan kam bo&apos;lishi mumkin emas.
                  </Text>
                  <Text style={styles.label}>Kafolat muddati *</Text>
                  <WarrantyPeriodPicker
                    value={warrantyPeriod}
                    onChange={setWarrantyPeriod}
                    disabled={busy}
                  />
                  <Action
                    title={
                      busy
                        ? "Saqlanmoqda..."
                        : editingProduct
                          ? "O'zgarishni saqlash"
                          : "Mahsulotni yaratish"
                    }
                    onPress={() => saveProduct()}
                    disabled={busy}
                  />
                  <Action
                    title="Bekor qilish"
                    onPress={closeProductForm}
                    disabled={busy}
                    secondary
                  />
                </>
              ) : (
                <>
                  <Text style={styles.title}>Mahsulot ma&apos;lumotlari</Text>
                  {productDetailLoading && (
                    <Text style={styles.hint}>Mahsulot yuklanmoqda...</Text>
                  )}
                  {!!productDetailError && (
                    <>
                      <Text style={styles.error} accessibilityRole="alert">
                        {productDetailError}
                      </Text>
                      <Action
                        title="Qayta urinish"
                        onPress={() => {
                          if (viewingProductId)
                            void openProductDetail(viewingProductId);
                        }}
                      />
                    </>
                  )}
                  {productDetail && (
                    <>
                      <View style={styles.productDetailHero}>
                        <View style={styles.productDetailTopRow}>
                          <Text style={styles.productDetailEyebrow}>
                            MAHSULOT · {productDetail.universalId}
                          </Text>
                          <View style={styles.productDetailActions}>
                            <Pressable
                              style={styles.productDetailEditButton}
                              onPress={() => beginEditProduct(productDetail)}
                              accessibilityRole="button"
                              accessibilityLabel="Mahsulotni tahrirlash"
                            >
                              <SymbolView
                                name={{
                                  ios: "square.and.pencil",
                                  android: "edit",
                                  web: "edit",
                                }}
                                size={20}
                                tintColor="#1677D2"
                              />
                            </Pressable>
                            <Pressable
                              style={styles.productDetailDeleteButton}
                              onPress={() =>
                                confirmDeleteProduct(productDetail)
                              }
                              accessibilityRole="button"
                              accessibilityLabel="Mahsulotni o'chirish"
                            >
                              <SymbolView
                                name={{
                                  ios: "trash",
                                  android: "delete",
                                  web: "delete",
                                }}
                                size={20}
                                tintColor="#C3333D"
                              />
                            </Pressable>
                          </View>
                        </View>
                        <Text style={styles.productDetailName}>
                          {productDetail.name}
                        </Text>
                        <Text style={styles.productDetailSubtitle}>
                          {productDetail.title}
                        </Text>
                      </View>
                      <View style={styles.productDetailCard}>
                        <Text style={styles.productDetailSectionTitle}>
                          Mahsulot haqida
                        </Text>
                        <Text style={styles.productDetailLabel}>
                          Bo&apos;lim
                        </Text>
                        <Text style={styles.productDetailValue}>
                          {categories.find(
                            (category) =>
                              category.id === productDetail.categoryId,
                          )?.name ?? productDetail.categoryId}
                        </Text>
                        <View style={styles.productDetailDivider} />
                        <ProductDetailPrice
                          label="Asl narx"
                          value={productDetail.originalPrice}
                        />
                        <ProductDetailPrice
                          label="Eng past sotilish narxi"
                          value={productDetail.minSellingPrice}
                        />
                        <View style={styles.productDetailDivider} />
                        <Text style={styles.productDetailLabel}>
                          Kafolat muddati
                        </Text>
                        <Text style={styles.productDetailValue}>
                          {formatWarrantyPeriod(productDetail.warrantyPeriod)}
                        </Text>
                        <View style={styles.productDetailDivider} />
                        <Text style={styles.productDetailLabel}>
                          Yaratilgan vaqt
                        </Text>
                        <Text style={styles.productDetailValue}>
                          {productDetail.createdAt
                            ? formatDate(productDetail.createdAt)
                            : "Kiritilmagan"}
                        </Text>
                        <Text style={styles.productDetailLabel}>
                          Oxirgi yangilangan vaqt
                        </Text>
                        <Text style={styles.productDetailValue}>
                          {productDetail.updatedAt
                            ? formatDate(productDetail.updatedAt)
                            : "Kiritilmagan"}
                        </Text>
                      </View>
                      <View style={styles.productDetailCard}>
                        <Text style={styles.productDetailSectionTitle}>
                          Rasmlar · {productDetail.images.length}
                        </Text>
                        {productDetail.images.length === 0 ? (
                          <Text style={styles.productDetailEmpty}>
                            Rasm qo&apos;shilmagan.
                          </Text>
                        ) : (
                          <View style={styles.wrap}>
                            {productDetail.images.map((image, index) => (
                              <Pressable
                                key={image.id}
                                onPress={() => setPreviewImage(image.url)}
                                accessibilityRole="button"
                                accessibilityLabel={`${index + 1}-rasmni kattalashtirish`}
                              >
                                <Image
                                  source={{ uri: (API_URL ?? "") + image.url }}
                                  style={styles.productDetailImage}
                                />
                              </Pressable>
                            ))}
                          </View>
                        )}
                        {!!productImageError && (
                          <Text style={styles.error} accessibilityRole="alert">
                            {productImageError}
                          </Text>
                        )}
                        <Pressable
                          style={[
                            styles.productDetailAddImageButton,
                            (busy || productDetail.images.length >= 10) &&
                              styles.disabled,
                          ]}
                          onPress={() => void uploadImage(productDetail, true)}
                          disabled={busy || productDetail.images.length >= 10}
                          accessibilityRole="button"
                          accessibilityLabel="Mahsulotga rasm qo'shish"
                        >
                          <SymbolView
                            name={{ ios: "plus", android: "add", web: "add" }}
                            size={18}
                            tintColor="#1677D2"
                          />
                          <Text style={styles.productDetailAddImageText}>
                            {busy
                              ? "Yuklanmoqda..."
                              : productDetail.images.length >= 10
                                ? "Rasm limiti to'ldi"
                                : "Rasm qo'shish"}
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </>
              )}
            </ScrollView>
            {formOpen && confirmLowPrice && (
              <View style={styles.lowPriceOverlay} accessibilityViewIsModal>
                <Pressable
                  style={styles.lowPriceScrim}
                  onPress={() => setConfirmLowPrice(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Tasdiqlash oynasini yopish"
                />
                <View style={styles.lowPriceCard}>
                  <Text style={styles.lowPriceTitle}>Past narxda saqlaysizmi?</Text>
                  <Text style={styles.lowPriceDescription}>
                    Eng past sotilish narxi asl narxdan kam. Shu qiymatlarni saqlashga aminmisiz?
                  </Text>
                  <View style={styles.lowPriceValues}>
                    <Text style={styles.lowPriceValue}>Asl narx: {formatPrice(parsedOriginalPrice)}</Text>
                    <Text style={styles.lowPriceValue}>Eng past narx: {formatPrice(parsedMinSellingPrice)}</Text>
                  </View>
                  <View style={styles.lowPriceActions}>
                    <Pressable style={[styles.lowPriceAction, styles.lowPriceCancel]}
                      onPress={() => setConfirmLowPrice(false)} accessibilityRole="button">
                      <Text style={styles.lowPriceActionText}>Bekor qilish</Text>
                    </Pressable>
                    <Pressable style={[styles.lowPriceAction, styles.lowPriceConfirm]}
                      onPress={() => saveProduct(true)} accessibilityRole="button">
                      <Text style={styles.lowPriceActionText}>Ha, saqlash</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
            {!!previewImage && (
              <View style={styles.imagePreviewOverlay} accessibilityViewIsModal>
                <Pressable
                  style={({ pressed }) => [
                    styles.imagePreviewBack,
                    pressed && styles.imagePreviewBackPressed,
                  ]}
                  onPress={() => setPreviewImage(null)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    viewingProductId
                      ? "Mahsulotga qaytish"
                      : "Mahsulotlar ro'yxatiga qaytish"
                  }
                >
                  <Text style={styles.imagePreviewBackArrow}>←</Text>
                  <Text style={styles.imagePreviewBackText}>
                    {viewingProductId
                      ? "Mahsulotga qaytish"
                      : "Mahsulotlar ro'yxatiga qaytish"}
                  </Text>
                </Pressable>
                <View style={styles.imagePreviewArea}>
                  <Image
                    source={{ uri: (API_URL ?? "") + previewImage }}
                    style={styles.imagePreviewImage}
                    resizeMode="contain"
                  />
                </View>
              </View>
            )}
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
            return (
              <View key={product.id} style={styles.itemCard}>
                <View style={styles.productCardHeader}>
                  <View style={styles.productCardHeading}>
                    <Text style={styles.itemType}>MAHSULOT</Text>
                    <Text style={styles.productCardName} numberOfLines={2}>
                      {product.name}
                    </Text>
                    <Text style={styles.productCardCode}>
                      Kod: {product.universalId}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.productViewButton}
                    onPress={() => void openProductDetail(product.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${product.name} ma'lumotlarini ko'rish`}
                  >
                    <SymbolView
                      name={{
                        ios: "eye",
                        android: "visibility",
                        web: "visibility",
                      }}
                      size={22}
                      tintColor="#1677D2"
                    />
                  </Pressable>
                </View>
                {product.title.trim() !== product.name.trim() && (
                  <Text style={styles.productCardSubtitle}>
                    {product.title}
                  </Text>
                )}
                <View style={styles.productCardFacts}>
                  <View style={styles.productCardFact}>
                    <Text style={styles.productCardFactLabel}>Asl narx</Text>
                    <Text style={styles.productCardFactValue}>
                      {formatPrice(product.originalPrice)}
                    </Text>
                  </View>
                  <View style={styles.productCardFact}>
                    <Text style={styles.productCardFactLabel}>
                      Eng past sotilish narxi
                    </Text>
                    <Text style={styles.productCardFactValue}>
                      {formatPrice(product.minSellingPrice)}
                    </Text>
                  </View>
                  <View
                    style={[styles.productCardFact, styles.productCardWarranty]}
                  >
                    <Text style={styles.productCardFactLabel}>
                      Kafolat muddati
                    </Text>
                    <Text style={styles.productCardFactValue}>
                      {formatWarrantyPeriod(product.warrantyPeriod)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.imageCount}>
                  Rasmlar · {product.images.length}/10
                </Text>
                <View style={styles.wrap}>
                  {product.images.map((image, index) => (
                    <View key={image.id} style={styles.imageBox}>
                      <Pressable
                        onPress={() => setPreviewImage(image.url)}
                        accessibilityRole="button"
                        accessibilityLabel={`${index + 1}-rasmni kattalashtirish`}
                      >
                        <Image
                          source={{ uri: (API_URL ?? "") + image.url }}
                          style={styles.image}
                        />
                      </Pressable>
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

function ProductDetailPrice({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const readable =
    value !== null && value >= 1_000 ? formatMoneyWithUnits(value) : null;
  return (
    <View style={styles.productDetailPrice}>
      <Text style={styles.productDetailLabel}>{label}</Text>
      <Text style={styles.productDetailPriceValue}>{formatPrice(value)}</Text>
      {!!readable && (
        <Text style={styles.productDetailPriceReading}>{readable}</Text>
      )}
    </View>
  );
}

function WarrantyPeriodPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const selected = parseWarrantyPeriod(value);
  function updateSelection(years: number, months: number) {
    onChange(
      years
        ? `${years}${months ? `.${months}` : ""}`
        : months
          ? `0.${months}`
          : "",
    );
  }
  return (
    <View>
      <Text style={styles.warrantyHint}>Yilni tanlang (ixtiyoriy)</Text>
      <View style={styles.warrantyOptions}>
        {Array.from({ length: 10 }, (_, index) => index + 1).map((year) => (
          <Pressable
            key={year}
            style={[
              styles.warrantyOption,
              selected?.years === year && styles.warrantyOptionSelected,
              disabled && styles.disabled,
            ]}
            onPress={() =>
              updateSelection(
                selected?.years === year ? 0 : year,
                selected?.months ?? 0,
              )
            }
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${year} yil`}
            accessibilityState={{ selected: selected?.years === year }}
          >
            <Text
              style={[
                styles.warrantyOptionText,
                selected?.years === year && styles.warrantyOptionTextSelected,
              ]}
            >
              {year} yil
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.warrantyHint}>Oylarni tanlang</Text>
      <View style={styles.warrantyOptions}>
        {Array.from({ length: 11 }, (_, index) => index + 1).map(
          (month) => (
            <Pressable
              key={month}
              style={[
                styles.warrantyOption,
                selected?.months === month && styles.warrantyOptionSelected,
                disabled && styles.disabled,
              ]}
              onPress={() =>
                updateSelection(
                  selected?.years ?? 0,
                  selected?.months === month ? 0 : month,
                )
              }
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`${month} oy`}
              accessibilityState={{ selected: selected?.months === month }}
            >
              <Text
                style={[
                  styles.warrantyOptionText,
                  selected?.months === month &&
                    styles.warrantyOptionTextSelected,
                ]}
              >
                {month} oy
              </Text>
            </Pressable>
          ),
        )}
      </View>
      {selected && (
        <Text style={styles.warrantySummary}>
          Kafolat muddati: {formatWarrantyPeriod(value)}
        </Text>
      )}
    </View>
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
  lowPriceOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 30, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  lowPriceScrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(23, 37, 54, 0.42)" },
  lowPriceCard: { width: "100%", maxWidth: 340, borderRadius: 22, backgroundColor: "#FFFFFF", padding: 24, alignItems: "center", shadowColor: "#263A52", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 10 },
  lowPriceTitle: { color: "#172536", fontSize: 20, fontWeight: "800", textAlign: "center" },
  lowPriceDescription: { color: "#627184", fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 10 },
  lowPriceValues: { alignSelf: "stretch", backgroundColor: "#FFF4F4", borderRadius: 12, padding: 12, gap: 5, marginTop: 16 },
  lowPriceValue: { color: "#A52D38", fontSize: 14, fontWeight: "700", textAlign: "center" },
  lowPriceActions: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 22 },
  lowPriceAction: { flex: 1, minHeight: 48, paddingHorizontal: 6, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  lowPriceCancel: { backgroundColor: "#1677D2" },
  lowPriceConfirm: { backgroundColor: "#D33B45" },
  lowPriceActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", textAlign: "center" },
  modalContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  productDetailStickyBar: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 50 : 24,
    paddingBottom: 8,
    backgroundColor: "#F6F8FB",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF3",
  },
  productDetailStickyBack: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingRight: 20,
  },
  productDetailScrollContent: { paddingTop: 18 },
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
  sectionSelector: {
    backgroundColor: "transparent",
    borderRadius: 0,
    padding: 0,
    marginBottom: 22,
  },
  groupPickerTrigger: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    marginTop: 12,
  },
  productPickerTrigger: { marginTop: 0 },
  groupPickerTriggerText: { flex: 1, minWidth: 0, paddingVertical: 9 },
  groupPickerName: { color: "#172536", fontSize: 16, fontWeight: "700" },
  groupPickerCount: { color: "#627184", fontSize: 12, marginTop: 3 },
  groupPickerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(23, 37, 54, 0.35)",
  },
  groupPickerSheet: {
    height: "72%",
    backgroundColor: "#F6F8FB",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
  },
  groupPickerHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupPickerClose: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  groupPickerSearchRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    marginTop: 14,
    marginBottom: 12,
  },
  groupPickerSearchInput: {
    flex: 1,
    minWidth: 0,
    height: 46,
    color: "#172536",
    fontSize: 15,
  },
  groupPickerList: { paddingBottom: 12 },
  groupPickerItem: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
    backgroundColor: "#FFFFFF",
  },
  groupPickerItemSelected: { backgroundColor: "#EAF4FF" },
  groupPickerItemText: {
    flex: 1,
    color: "#172536",
    fontSize: 15,
    fontWeight: "600",
  },
  groupPickerItemTextSelected: { color: "#1677D2", fontWeight: "700" },
  groupPickerSectionCount: {
    color: "#627184",
    fontSize: 12,
    fontWeight: "600",
  },
  groupPickerEmpty: {
    color: "#627184",
    textAlign: "center",
    paddingVertical: 24,
  },
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
  hint_red: { color: "#C3333D" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 },
  warrantyHint: { color: "#627184", fontSize: 13, marginBottom: 8 },
  warrantyOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  warrantyOption: {
    minWidth: 56,
    minHeight: 42,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  warrantyOptionSelected: {
    borderColor: "#1677D2",
    backgroundColor: "#EAF4FF",
  },
  warrantyOptionText: { color: "#172536", fontSize: 14, fontWeight: "600" },
  warrantyOptionTextSelected: { color: "#1677D2", fontWeight: "700" },
  warrantySummary: {
    color: "#1677D2",
    backgroundColor: "#EAF4FF",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
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
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF4FF",
  },
  itemCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF3",
    borderRadius: 16,
    padding: 18,
    marginBottom: 10,
  },
  productCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  productCardHeading: { flex: 1, minWidth: 0 },
  productCardName: {
    color: "#172536",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 3,
  },
  productCardCode: { color: "#627184", fontSize: 12, marginTop: 5 },
  productCardSubtitle: {
    color: "#50667E",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  productCardFacts: {
    backgroundColor: "#F6F8FB",
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginTop: 14,
  },
  productCardFact: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  productCardFactLabel: {
    flex: 1,
    color: "#627184",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  productCardFactValue: {
    flexShrink: 1,
    color: "#172536",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    textAlign: "right",
  },
  productCardWarranty: {
    borderTopWidth: 1,
    borderTopColor: "#E5EBF2",
    paddingTop: 10,
  },
  productViewButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -7,
    marginRight: -7,
  },
  productDetailHero: {
    backgroundColor: "#EAF4FF",
    borderWidth: 1,
    borderColor: "#D7EAFB",
    borderRadius: 18,
    padding: 18,
    marginTop: 18,
  },
  productDetailTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  productDetailEyebrow: {
    flex: 1,
    color: "#3977AE",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  productDetailActions: { flexDirection: "row", gap: 8 },
  productDetailEditButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  productDetailDeleteButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FDECEE",
    alignItems: "center",
    justifyContent: "center",
  },
  productDetailName: {
    color: "#172536",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 12,
  },
  productDetailSubtitle: {
    color: "#50667E",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
  },
  productDetailCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF3",
    borderRadius: 16,
    padding: 18,
    marginTop: 12,
  },
  productDetailSectionTitle: {
    color: "#172536",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  productDetailLabel: {
    color: "#627184",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 3,
  },
  productDetailValue: {
    color: "#172536",
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "700",
  },
  productDetailPrice: {
    backgroundColor: "#F6F8FB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
    marginTop: 10,
  },
  productDetailPriceValue: {
    color: "#172536",
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "800",
  },
  productDetailPriceReading: { color: "#627184", fontSize: 13, marginTop: 2 },
  productDetailDivider: {
    height: 1,
    backgroundColor: "#EDF1F5",
    marginTop: 16,
  },
  productDetailEmpty: { color: "#627184", fontSize: 14, marginTop: 12 },
  productDetailImage: { width: 100, height: 100, borderRadius: 10 },
  productDetailAddImageButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 11,
    backgroundColor: "#EAF4FF",
    marginTop: 16,
  },
  productDetailAddImageText: {
    color: "#1677D2",
    fontSize: 14,
    fontWeight: "700",
  },
  imagePreviewOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
    backgroundColor: "#111A27",
    paddingHorizontal: 4,
    paddingTop: 56,
    paddingBottom: 30,
  },
  imagePreviewBack: {
    minHeight: 64,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#1E5FA3",
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  imagePreviewBackPressed: { opacity: 0.82 },
  imagePreviewBackArrow: { color: "#FFFFFF", fontSize: 28, lineHeight: 32 },
  imagePreviewBackText: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "600",
    textAlign: "center",
  },
  imagePreviewArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 14,
  },
  imagePreviewImage: { width: "100%", height: "100%" },
  categoryActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
  },
  categoryIconButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteIconButton: { backgroundColor: "#FDECEE" },
  editIconButton: { backgroundColor: "#EAF4FF" },
  manageButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 11,
    backgroundColor: "#1677D2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 8,
  },
  manageButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  itemName: { fontSize: 16, fontWeight: "700", color: "#172536" },
  itemType: {
    color: "#7B8CA0",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 4,
  },
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
