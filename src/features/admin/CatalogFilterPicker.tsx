import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, apiRequest } from "./api";

type Category = { id: string; name: string; parentId: string | null };
type Region = { id: string; name: string };
type Product = { id: string; universalId: string; categoryId: string; name: string; title?: string };

export type CatalogFilterValues = { regionId: string; groupId: string; sectionId: string; productId: string };
type PickerKey = keyof CatalogFilterValues;
type Option = { id: string; name: string; detail?: string };
const visibleOptionLimit = 3;

export default function CatalogFilterPicker({ token, values, onChange, onSessionExpired }: {
  token: string;
  values: CatalogFilterValues;
  onChange: (patch: Partial<CatalogFilterValues>) => void;
  onSessionExpired: () => Promise<void>;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState<PickerKey | null>(null);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [regionResult, categoryResult, productResult] = await Promise.all([
        apiRequest<{ regions: Region[] }>("/regions", { headers }),
        apiRequest<{ categories: Category[] }>("/product-categories", { headers }),
        apiRequest<{ products: Product[] }>("/products", { headers }),
      ]);
      setRegions(regionResult.regions);
      setCategories(categoryResult.categories);
      setProducts(productResult.products);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await onSessionExpired();
      else setError(cause instanceof Error ? cause.message : "Ro‘yxatlar yuklanmadi.");
    } finally { setLoading(false); }
  }, [token, onSessionExpired]);

  useEffect(() => { void Promise.resolve().then(load); }, [load, refreshKey]);

  const groups = categories.filter((item) => item.parentId === null);
  const sections = categories.filter((item) => item.parentId !== null && (values.groupId === "" || item.parentId === values.groupId));
  const visibleProducts = products.filter((item) => values.sectionId === "" || item.categoryId === values.sectionId);
  const options: Record<PickerKey, Option[]> = {
    regionId: regions,
    groupId: groups,
    sectionId: sections.map((item) => ({ ...item, detail: groups.find((group) => group.id === item.parentId)?.name })),
    productId: visibleProducts.map((item) => ({
      id: item.id,
      name: item.name,
      detail: [item.universalId, item.title].filter(Boolean).join(" · "),
    })),
  };
  const labels: Record<PickerKey, string> = { regionId: "Hudud", groupId: "Guruh", sectionId: "Bo‘lim", productId: "Mahsulot" };
  const selectedNames: Record<PickerKey, string> = {
    regionId: regions.find((item) => item.id === values.regionId)?.name ?? "Barchasi",
    groupId: groups.find((item) => item.id === values.groupId)?.name ?? "Barchasi",
    sectionId: categories.find((item) => item.id === values.sectionId)?.name ?? "Barchasi",
    productId: (() => {
      const product = products.find((item) => item.id === values.productId);
      return product ? `${product.name} · ${product.universalId}` : "Barchasi";
    })(),
  };

  function select(key: PickerKey, id: string) {
    if (key === "regionId") onChange({ regionId: id });
    if (key === "groupId") onChange({ groupId: id, sectionId: "", productId: "" });
    if (key === "sectionId") {
      const section = categories.find((item) => item.id === id);
      onChange({ groupId: section?.parentId ?? values.groupId, sectionId: id, productId: "" });
    }
    if (key === "productId") {
      const product = products.find((item) => item.id === id);
      const section = categories.find((item) => item.id === product?.categoryId);
      onChange({ groupId: section?.parentId ?? values.groupId, sectionId: product?.categoryId ?? values.sectionId, productId: id });
    }
    setActive(null); setSearch("");
  }

  if (loading) return <Text style={styles.hint}>Hudud va mahsulotlar yuklanmoqda...</Text>;
  if (error) return <View><Text style={styles.error} accessibilityRole="alert">{error}</Text><Pressable onPress={() => setRefreshKey((value) => value + 1)} accessibilityRole="button"><Text style={styles.link}>Qayta yuklash</Text></Pressable></View>;

  return <View>
    {(["regionId", "groupId", "sectionId", "productId"] as const).map((key) => {
      const expanded = active === key;
      const term = search.trim().toLocaleLowerCase();
      const matches = options[key].filter((item) => `${item.name} ${item.detail ?? ""}`.toLocaleLowerCase().includes(term));
      return <View key={key} style={styles.picker}>
        <Text style={styles.label}>{labels[key]}</Text>
        <Pressable style={styles.trigger} onPress={() => { setActive(expanded ? null : key); setSearch(""); }} accessibilityRole="button" accessibilityState={{ expanded }}>
          <Text style={styles.triggerText} numberOfLines={1}>{selectedNames[key]}</Text><Text style={styles.link}>{expanded ? "Yopish" : "Tanlash"}</Text>
        </Pressable>
        {expanded && <View style={styles.options}>
          <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder={`${labels[key]}ni qidiring${key === "productId" ? " (nom yoki UD-kod)" : ""}`} autoCapitalize="none" autoFocus maxLength={100} />
          <Pressable style={styles.option} onPress={() => select(key, "")} accessibilityRole="button"><Text style={[styles.optionText, !values[key] && styles.selected]}>Barchasi</Text></Pressable>
          {matches.slice(0, visibleOptionLimit).map((item) => <Pressable key={item.id} style={styles.option} onPress={() => select(key, item.id)} accessibilityRole="button">
            <Text style={[styles.optionText, values[key] === item.id && styles.selected]}>{item.name}</Text>
            {!!item.detail && <Text style={styles.detail}>{item.detail}</Text>}
          </Pressable>)}
          {matches.length === 0 && <Text style={styles.hint}>Hech narsa topilmadi.</Text>}
          {matches.length > visibleOptionLimit && <Text style={styles.hint}>Yana {matches.length - visibleOptionLimit} ta natija bor. Topish uchun qidiruvni aniqlashtiring.</Text>}
        </View>}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  picker: { marginTop: 14 },
  label: { color: "#172536", fontSize: 14, fontWeight: "700", marginBottom: 7 },
  trigger: { minHeight: 48, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 11, backgroundColor: "#FFFFFF", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  triggerText: { flex: 1, color: "#172536", fontSize: 15 },
  link: { color: "#1677D2", fontWeight: "700", fontSize: 13 },
  options: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 11, backgroundColor: "#FFFFFF", marginTop: 6, padding: 8 },
  search: { minHeight: 44, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 9, paddingHorizontal: 11, color: "#172536", fontSize: 14, marginBottom: 6 },
  option: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F0F3F7" },
  optionText: { color: "#172536", fontSize: 14, fontWeight: "600" },
  selected: { color: "#1677D2", fontWeight: "800" },
  detail: { color: "#627184", fontSize: 12, marginTop: 3 },
  hint: { color: "#627184", fontSize: 13, lineHeight: 19, marginTop: 10 },
  error: { color: "#C3333D", fontSize: 14, marginTop: 10, marginBottom: 8 },
});
