import { router, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ApiError, apiRequest } from "./api";
import CatalogFilterPicker, {
  type CatalogFilterValues,
} from "./CatalogFilterPicker";
import {
  formatDate,
  formatMoney,
  type Customer,
  type CustomerListResponse,
} from "./customers";
import DateFilterField from "./DateFilterField";
import LoadingMark from "./LoadingMark";
import { deleteStoredToken, getStoredToken } from "./session";

const filterFields = [
  { key: "mijoz_id", label: "Mijoz raqami", keyboard: "number-pad" },
  { key: "mijoz_idMin", label: "Mijoz raqami: dan", keyboard: "number-pad" },
  { key: "mijoz_idMax", label: "Mijoz raqami: gacha", keyboard: "number-pad" },
  { key: "regionId", label: "Hudud ID", keyboard: "default" },
  { key: "groupId", label: "Guruh ID", keyboard: "default" },
  { key: "sectionId", label: "Bo‘lim ID", keyboard: "default" },
  { key: "productId", label: "Mahsulot ID", keyboard: "default" },
  { key: "createdBy", label: "Yaratgan xodim ID", keyboard: "default" },
  { key: "name", label: "Mijoz ismi", keyboard: "default" },
  { key: "phoneNumber", label: "Telefon raqami", keyboard: "phone-pad" },
  { key: "productName", label: "Mahsulot nomi", keyboard: "default" },
  { key: "description", label: "Izoh", keyboard: "default" },
  { key: "paymentId", label: "To‘lov ID", keyboard: "default" },
  { key: "receivedBy", label: "To‘lovni olgan xodim ID", keyboard: "default" },
  { key: "createdFrom", label: "Yaratilgan: dan", keyboard: "default" },
  { key: "createdTo", label: "Yaratilgan: gacha", keyboard: "default" },
  { key: "paidFrom", label: "To‘langan: dan", keyboard: "default" },
  { key: "paidTo", label: "To‘langan: gacha", keyboard: "default" },
] as const;

const numericFields = [
  { key: "totalPrice", label: "Umumiy narx" },
  { key: "downPayment", label: "Boshlang‘ich to‘lov" },
  { key: "termMonths", label: "Nasiya muddati (oy)" },
  { key: "totalPaid", label: "Jami to‘langan" },
  { key: "remainingBalance", label: "Qolgan qarz" },
  { key: "paymentAmount", label: "To‘lov summasi" },
  { key: "lat", label: "Kenglik (lat)" },
  { key: "long", label: "Uzunlik (long)" },
] as const;

const numericFilterFields = numericFields.flatMap(({ key, label }) => [
  { key, label },
  { key: `${key}Min`, label: `${label}: dan` },
  { key: `${key}Max`, label: `${label}: gacha` },
]);

type FieldKey = (typeof filterFields)[number]["key"];
type NumericKey = (typeof numericFields)[number]["key"];
type NumericFilterKey = NumericKey | `${NumericKey}Min` | `${NumericKey}Max`;
type ChoiceKey = "hasDebt" | "paymentMethod" | "paymentType";
type FilterKey = FieldKey | NumericFilterKey | ChoiceKey | "search";
type Filters = Record<FilterKey, string>;
const emptyFilters = Object.fromEntries([
  ...filterFields.map((field) => [field.key, ""]),
  ...numericFilterFields.map((field) => [field.key, ""]),
  ["search", ""],
  ["hasDebt", ""],
  ["paymentMethod", ""],
  ["paymentType", ""],
]) as Filters;

const choices: {
  key: ChoiceKey;
  label: string;
  options: { value: string; label: string }[];
}[] = [
  {
    key: "paymentMethod",
    label: "To‘lov usuli",
    options: [
      { value: "", label: "Barchasi" },
      { value: "cash", label: "Naqd" },
      { value: "transfer", label: "O‘tkazma" },
    ],
  },
  {
    key: "paymentType",
    label: "To‘lov turi",
    options: [
      { value: "", label: "Barchasi" },
      { value: "initial", label: "Boshlang‘ich" },
      { value: "installment", label: "Oylik" },
    ],
  },
];

const filterGroups: {
  id: string;
  title: string;
  fields?: FieldKey[];
  numbers?: NumericKey[];
  choices?: ChoiceKey[];
}[] = [
  {
    id: "customer",
    title: "Mijoz ma’lumotlari",
    fields: ["mijoz_id", "mijoz_idMin", "mijoz_idMax", "name", "phoneNumber"],
  },
  {
    id: "catalog",
    title: "Mahsulot va hudud",
    fields: ["productName", "regionId", "groupId", "sectionId", "productId"],
  },
  {
    id: "sale",
    title: "Savdo va qarz",
    numbers: [
      "totalPrice",
      "downPayment",
      "termMonths",
      "totalPaid",
      "remainingBalance",
    ],
  },
  {
    id: "payment",
    title: "To‘lovlar",
    fields: ["paymentId", "receivedBy"],
    numbers: ["paymentAmount"],
    choices: ["paymentMethod", "paymentType"],
  },
  {
    id: "dates",
    title: "Sanalar",
    fields: ["createdFrom", "createdTo", "paidFrom", "paidTo"],
  },
  {
    id: "other",
    title: "Qo‘shimcha",
    fields: ["createdBy", "description"],
    numbers: ["lat", "long"],
  },
];

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function queryString(filters: Filters, page: number, limit: number) {
  const entries = Object.entries(filters)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => `${key}=${encodeURIComponent(value.trim())}`);
  return `?${[...entries, `page=${page}`, `limit=${limit}`].join("&")}`;
}

export default function CustomerListPage() {
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [draft, setDraft] = useState<Filters>({ ...emptyFilters });
  const [applied, setApplied] = useState<Filters>({ ...emptyFilters });
  const [filterError, setFilterError] = useState("");
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const lastChangedKey = useRef<FilterKey | "catalog" | "clear" | null>(null);

  const handleExpired = useCallback(async () => {
    await deleteStoredToken();
    router.replace("/");
  }, []);

  useEffect(() => {
    let active = true;
    getStoredToken()
      .then((stored) => {
        if (!active) return;
        if (!stored) {
          router.replace("/");
          return;
        }
        setToken(stored);
      })
      .catch(() => {
        if (active) router.replace("/");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<CustomerListResponse>(
        `/customers${queryString(applied, page, limit)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (currentRequest !== requestId.current) return;
      setRows(result.customers);
      setTotal(result.total);
    } catch (cause) {
      if (currentRequest !== requestId.current) return;
      if (cause instanceof ApiError && cause.status === 401)
        await handleExpired();
      else
        setError(
          cause instanceof Error ? cause.message : "Mijozlar yuklanmadi.",
        );
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [token, applied, page, limit, handleExpired]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function update(key: FilterKey, value: string) {
    lastChangedKey.current = key;
    setDraft((current) =>
      current[key] === value ? current : { ...current, [key]: value },
    );
  }

  function updateCatalog(patch: Partial<CatalogFilterValues>) {
    lastChangedKey.current = "catalog";
    setDraft((current) =>
      Object.entries(patch).every(
        ([key, value]) => current[key as keyof CatalogFilterValues] === value,
      )
        ? current
        : { ...current, ...patch },
    );
  }

  useEffect(() => {
    const immediate =
      lastChangedKey.current === "catalog" ||
      lastChangedKey.current === "hasDebt" ||
      lastChangedKey.current === "paymentMethod" ||
      lastChangedKey.current === "paymentType" ||
      lastChangedKey.current === "createdFrom" ||
      lastChangedKey.current === "createdTo" ||
      lastChangedKey.current === "paidFrom" ||
      lastChangedKey.current === "paidTo" ||
      lastChangedKey.current === "clear";
    const timer = setTimeout(
      () => {
        for (const field of [
          ...filterFields.slice(0, 3),
          ...numericFilterFields,
        ]) {
          const value = draft[field.key as FilterKey].trim();
          if (
            value &&
            (!/^-?\d+(\.\d+)?$/.test(value) ||
              !Number.isFinite(Number(value)) ||
              (field.key.startsWith("mijoz_id") &&
                (!Number.isSafeInteger(Number(value)) || Number(value) < 1)))
          ) {
            setFilterError(`${field.label}: to‘g‘ri raqam kiriting.`);
            return;
          }
        }
        for (const { key, label } of numericFields) {
          const min = draft[`${key}Min`].trim();
          const max = draft[`${key}Max`].trim();
          if (min && max && Number(min) > Number(max)) {
            setFilterError(
              `${label}: boshlanish qiymati tugash qiymatidan katta bo‘lmasligi kerak.`,
            );
            return;
          }
        }
        if (
          draft.mijoz_idMin &&
          draft.mijoz_idMax &&
          Number(draft.mijoz_idMin) > Number(draft.mijoz_idMax)
        ) {
          setFilterError("Mijoz raqami oralig‘i noto‘g‘ri.");
          return;
        }
        const today = new Date();
        const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        for (const key of [
          "createdFrom",
          "createdTo",
          "paidFrom",
          "paidTo",
        ] as const) {
          if (draft[key].trim() && !validDate(draft[key].trim())) {
            setFilterError("Sanalarni YYYY-MM-DD shaklida to‘g‘ri kiriting.");
            return;
          }
          if (draft[key].trim() > todayValue) {
            setFilterError("Bugundan keyingi sanani tanlab bo‘lmaydi.");
            return;
          }
        }
        if (
          (draft.createdFrom &&
            draft.createdTo &&
            draft.createdFrom > draft.createdTo) ||
          (draft.paidFrom && draft.paidTo && draft.paidFrom > draft.paidTo)
        ) {
          setFilterError(
            "Boshlanish sanasi tugash sanasidan keyin bo‘lmasligi kerak.",
          );
          return;
        }
        setFilterError("");
        setPage(1);
        setApplied((current) =>
          Object.keys(draft).every(
            (key) => current[key as FilterKey] === draft[key as FilterKey],
          )
            ? current
            : { ...draft },
        );
      },
      immediate ? 0 : 400,
    );
    return () => clearTimeout(timer);
  }, [draft]);

  function clearFilters() {
    lastChangedKey.current = "clear";
    setDraft({ ...emptyFilters });
    setApplied({ ...emptyFilters });
    setPage(1);
    setFilterError("");
    Keyboard.dismiss();
  }

  const pages = Math.max(1, Math.ceil(total / limit));
  const draftAdvancedCount = Object.entries(draft).filter(
    ([key, value]) => key !== "search" && key !== "hasDebt" && value.trim(),
  ).length;

  function groupCount(group: (typeof filterGroups)[number]) {
    const keys: FilterKey[] = [
      ...(group.fields ?? []),
      ...(group.choices ?? []),
      ...(group.numbers ?? []).flatMap((key): NumericFilterKey[] => [
        key,
        `${key}Min`,
        `${key}Max`,
      ]),
    ];
    return keys.filter((key) => draft[key].trim()).length;
  }

  const header = (
    <View>
      <Pressable
        onPress={() => router.back()}
        style={styles.back}
        accessibilityRole="button"
      >
        <Text style={styles.link}>‹ Orqaga</Text>
      </Pressable>
      <Text style={styles.title}>Mijozlar</Text>
      <Text style={styles.subtitle}>
        Mijozlarni qidiring va savdo ma’lumotlarini ko‘ring.
      </Text>
      <View style={styles.card}>
        <Text style={styles.label}>Umumiy qidiruv</Text>
        <TextInput
          style={styles.input}
          value={draft.search}
          onChangeText={(value) => update("search", value)}
          placeholder="Ism, telefon, mahsulot yoki izoh"
          maxLength={100}
          returnKeyType="search"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        <Text style={styles.label}>Qarz holati</Text>
        <View style={styles.options}>
          {[
            { value: "", label: "Barchasi" },
            { value: "true", label: "Qarzi bor" },
            { value: "false", label: "Qarzi yopilgan" },
          ].map((item) => (
            <Choice
              key={item.label}
              title={item.label}
              selected={draft.hasDebt === item.value}
              onPress={() => update("hasDebt", item.value)}
            />
          ))}
        </View>
        <Pressable
          onPress={() => setFiltersOpen((open) => !open)}
          style={styles.expand}
          accessibilityRole="button"
        >
          <Text style={styles.link}>
            {filtersOpen
              ? "Kengaytirilgan filtrlarni yopish"
              : "Kengaytirilgan filtrlar"}{" "}
            {draftAdvancedCount > 0 ? `(${draftAdvancedCount})` : ""}
          </Text>
        </Pressable>
        {filtersOpen && (
          <View style={styles.filterGroups}>
            {filterGroups.map((group) => {
              const expanded = openGroup === group.id;
              const count = groupCount(group);
              return (
                <View key={group.id} style={styles.filterGroup}>
                  <Pressable
                    style={styles.groupHeader}
                    onPress={() => setOpenGroup(expanded ? null : group.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                  >
                    <Text style={styles.groupTitle}>{group.title}</Text>
                    <View style={styles.groupTrailing}>
                      {count > 0 && (
                        <Text style={styles.groupCount}>{count}</Text>
                      )}
                      <Text style={styles.chevron}>{expanded ? "−" : "+"}</Text>
                    </View>
                  </Pressable>
                  {expanded && (
                    <View style={styles.groupBody}>
                      {group.id === "catalog" && token && (
                        <>
                          <CatalogFilterPicker
                            token={token}
                            values={{
                              regionId: draft.regionId,
                              groupId: draft.groupId,
                              sectionId: draft.sectionId,
                              productId: draft.productId,
                            }}
                            onChange={updateCatalog}
                            onSessionExpired={handleExpired}
                          />
                          <Text style={styles.label}>
                            Mahsulot nomi bo‘yicha
                          </Text>
                          <TextInput
                            style={styles.input}
                            value={draft.productName}
                            onChangeText={(value) =>
                              update("productName", value)
                            }
                            placeholder="Mahsulot nomi"
                            maxLength={100}
                          />
                        </>
                      )}
                      {group.id !== "catalog" && (
                        <>
                          {(group.fields ?? []).map((key) => {
                            if (key === "mijoz_idMax") return null;
                            if (key === "mijoz_idMin")
                              return (
                                <View key={key}>
                                  <Text style={styles.label}>
                                    Mijoz raqami oralig‘i
                                  </Text>
                                  <View style={styles.rangeRow}>
                                    <TextInput
                                      style={[styles.input, styles.rangeInput]}
                                      value={draft.mijoz_idMin}
                                      onChangeText={(value) =>
                                        update("mijoz_idMin", value)
                                      }
                                      placeholder="Dan"
                                      accessibilityLabel="Mijoz raqami: dan"
                                      keyboardType="number-pad"
                                      maxLength={15}
                                    />
                                    <TextInput
                                      style={[styles.input, styles.rangeInput]}
                                      value={draft.mijoz_idMax}
                                      onChangeText={(value) =>
                                        update("mijoz_idMax", value)
                                      }
                                      placeholder="Gacha"
                                      accessibilityLabel="Mijoz raqami: gacha"
                                      keyboardType="number-pad"
                                      maxLength={15}
                                    />
                                  </View>
                                </View>
                              );
                            const field = filterFields.find(
                              (item) => item.key === key,
                            )!;
                            if (
                              key === "createdFrom" ||
                              key === "createdTo" ||
                              key === "paidFrom" ||
                              key === "paidTo"
                            ) {
                              return (
                                <DateFilterField
                                  key={key}
                                  label={field.label}
                                  value={draft[key]}
                                  onChange={(value) => update(key, value)}
                                />
                              );
                            }
                            return (
                              <View key={key}>
                                <Text style={styles.label}>{field.label}</Text>
                                <TextInput
                                  style={styles.input}
                                  value={draft[key]}
                                  onChangeText={(value) => update(key, value)}
                                  placeholder={
                                    key.endsWith("From") || key.endsWith("To")
                                      ? "YYYY-MM-DD"
                                      : field.label
                                  }
                                  keyboardType={field.keyboard}
                                  maxLength={
                                    key.endsWith("From") || key.endsWith("To")
                                      ? 10
                                      : 100
                                  }
                                  autoCapitalize="none"
                                />
                              </View>
                            );
                          })}
                          {(group.numbers ?? []).map((key) => {
                            const field = numericFields.find(
                              (item) => item.key === key,
                            )!;
                            return (
                              <View key={key}>
                                <Text style={styles.label}>{field.label}</Text>
                                <TextInput
                                  style={styles.input}
                                  value={draft[key]}
                                  onChangeText={(value) => update(key, value)}
                                  placeholder="Aniq qiymat"
                                  keyboardType="decimal-pad"
                                  maxLength={20}
                                />
                                <View style={styles.rangeRow}>
                                  {(["Min", "Max"] as const).map((suffix) => {
                                    const rangeKey: NumericFilterKey = `${key}${suffix}`;
                                    return (
                                      <TextInput
                                        key={suffix}
                                        style={[
                                          styles.input,
                                          styles.rangeInput,
                                        ]}
                                        value={draft[rangeKey]}
                                        onChangeText={(value) =>
                                          update(rangeKey, value)
                                        }
                                        placeholder={
                                          suffix === "Min" ? "Dan" : "Gacha"
                                        }
                                        accessibilityLabel={`${field.label}: ${suffix === "Min" ? "dan" : "gacha"}`}
                                        keyboardType="decimal-pad"
                                        maxLength={20}
                                      />
                                    );
                                  })}
                                </View>
                              </View>
                            );
                          })}
                          {(group.choices ?? []).map((key) => {
                            const choice = choices.find(
                              (item) => item.key === key,
                            )!;
                            return (
                              <View key={key}>
                                <Text style={styles.label}>{choice.label}</Text>
                                <View style={styles.options}>
                                  {choice.options.map((item) => (
                                    <Choice
                                      key={item.value}
                                      title={item.label}
                                      selected={draft[key] === item.value}
                                      onPress={() => update(key, item.value)}
                                    />
                                  ))}
                                </View>
                              </View>
                            );
                          })}
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
        {!!filterError && (
          <Text style={styles.error} accessibilityRole="alert">
            {filterError}
          </Text>
        )}
        <Pressable
          style={styles.clearButton}
          onPress={clearFilters}
          accessibilityRole="button"
        >
          <Text style={styles.link}>Filtrlarni tozalash</Text>
        </Pressable>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.count}>Jami: {total} ta mijoz</Text>
        <Pressable onPress={() => void load()} accessibilityRole="button">
          <Text style={styles.link}>Yangilash</Text>
        </Pressable>
      </View>
      {!!error && (
        <View style={styles.card}>
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        </View>
      )}
      {loading && (
        <View style={styles.loading}>
          <LoadingMark size={54} />
          <Text style={styles.hint}>Mijozlar yuklanmoqda...</Text>
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      data={rows}
      keyExtractor={(item) => String(item.mijoz_id)}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <Pressable
          style={styles.customerCard}
          onPress={() =>
            router.push({
              pathname: "/customers/detail",
              params: { mijoz_id: String(item.mijoz_id) },
            } as Href)
          }
          accessibilityRole="button"
        >
          <View style={styles.customerTop}>
            <Text style={styles.customerName}>{item.name}</Text>
            <Text
              style={[
                styles.badge,
                item.remainingBalance <= 0 && styles.badgePaid,
              ]}
            >
              {item.remainingBalance > 0 ? "Qarzi bor" : "To‘langan"}
            </Text>
          </View>
          <Text style={styles.customerMeta}>Mijoz raqami: {item.mijoz_id}</Text>
          <Text style={styles.customerMeta}>
            {item.phoneNumber} · {item.productName}
          </Text>
          <Text style={styles.customerAmount}>
            Qolgan qarz: {formatMoney(item.remainingBalance)}
          </Text>
          <Text style={styles.customerMeta}>{formatDate(item.createdAt)}</Text>
        </Pressable>
      )}
      ListEmptyComponent={
        !loading && !checking && !error ? (
          <Text style={styles.empty}>Mijoz topilmadi.</Text>
        ) : null
      }
      ListFooterComponent={
        !checking && !error ? (
          <View style={styles.footer}>
            <Text style={styles.hint}>
              {page} / {pages} sahifa
            </Text>
            <View style={styles.actions}>
              <Pressable
                style={[styles.pageButton, page <= 1 && styles.disabled]}
                disabled={page <= 1 || loading}
                onPress={() => setPage((current) => current - 1)}
                accessibilityRole="button"
              >
                <Text style={styles.link}>Oldingi</Text>
              </Pressable>
              <Pressable
                style={[styles.pageButton, page >= pages && styles.disabled]}
                disabled={page >= pages || loading}
                onPress={() => setPage((current) => current + 1)}
                accessibilityRole="button"
              >
                <Text style={styles.link}>Keyingi</Text>
              </Pressable>
            </View>
            <Text style={styles.label}>Sahifadagi yozuvlar</Text>
            <View style={styles.options}>
              {[20, 50, 100].map((size) => (
                <Choice
                  key={size}
                  title={String(size)}
                  selected={limit === size}
                  onPress={() => {
                    setPage(1);
                    setLimit(size);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null
      }
    />
  );
}

function Choice({
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
      style={[styles.choice, selected && styles.choiceActive]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FB" },
  content: { paddingHorizontal: 18, paddingTop: 54, paddingBottom: 40 },
  back: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingRight: 20,
    marginBottom: 10,
  },
  link: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  title: { color: "#172536", fontSize: 30, fontWeight: "800" },
  subtitle: {
    color: "#627184",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 7,
    marginBottom: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E8EDF3",
    marginBottom: 20,
  },
  label: {
    color: "#172536",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 7,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 11,
    paddingHorizontal: 13,
    color: "#172536",
    fontSize: 15,
  },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderWidth: 1,
    borderColor: "#D7DFE8",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  choiceActive: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  choiceText: { color: "#45586E", fontSize: 13, fontWeight: "700" },
  choiceTextActive: { color: "#1677D2" },
  expand: { paddingVertical: 15 },
  filterGroups: { gap: 8, marginTop: 2 },
  filterGroup: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FAFCFF",
  },
  groupHeader: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupTitle: { color: "#172536", fontSize: 14, fontWeight: "700" },
  groupTrailing: { flexDirection: "row", alignItems: "center", gap: 12 },
  groupCount: {
    color: "#1677D2",
    backgroundColor: "#EAF4FF",
    overflow: "hidden",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: "700",
  },
  chevron: { color: "#1677D2", fontSize: 22, lineHeight: 26 },
  groupBody: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  rangeRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  rangeInput: { flex: 1, minWidth: 0 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  clearButton: {
    minHeight: 44,
    borderRadius: 11,
    backgroundColor: "#EAF4FF",
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  count: { color: "#172536", fontSize: 16, fontWeight: "800" },
  customerCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF3",
    borderRadius: 15,
    padding: 16,
    marginBottom: 10,
  },
  customerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },
  customerName: { flex: 1, color: "#172536", fontSize: 17, fontWeight: "800" },
  customerMeta: {
    color: "#627184",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
  },
  customerAmount: {
    color: "#172536",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 9,
  },
  badge: {
    color: "#B76517",
    backgroundColor: "#FFF2E4",
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: "700",
  },
  badgePaid: { color: "#16865A", backgroundColor: "#E8F7F0" },
  loading: { alignItems: "center", paddingVertical: 18 },
  hint: { color: "#627184", fontSize: 13, marginTop: 6 },
  empty: {
    color: "#627184",
    fontSize: 15,
    textAlign: "center",
    paddingVertical: 30,
  },
  error: { color: "#C3333D", fontSize: 14, lineHeight: 20, marginTop: 8 },
  footer: { alignItems: "center", paddingTop: 10, paddingBottom: 20 },
  pageButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.45 },
});
