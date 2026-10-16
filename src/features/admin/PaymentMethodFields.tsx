import { useState } from "react";
import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { PaymentMethod } from "./customers";
import { PAYMENT_CARDS, type PaymentOptions } from "./paymentOptions";

type Props = {
  options: PaymentOptions;
  method: PaymentMethod | null;
  onMethodChange: (value: PaymentMethod) => void;
  cardNumber: string;
  onCardNumberChange: (value: string) => void;
  provider: string;
  onProviderChange: (value: string) => void;
  providerName: string;
  onProviderNameChange: (value: string) => void;
  disabled?: boolean;
  presentation?: "compact" | "step";
};

const formatCard = (card: string) => card.replace(/(.{4})/g, "$1 ").trim();
const featuredApps = [
  { id: "click", short: "C", color: "#0875D4", icon: "https://img.samsungapps.com/productNew/000007844827/ENG/IconImage_20260324070323756_NEW_WAP_ICON_512_512.png" },
  { id: "payme", short: "payme", color: "#18B8B1", icon: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/83/32/37/83323775-0c1f-263f-3339-c3837b31cfac/AppIcon-0-0-1x_U007emarketing-0-9-0-85-220.png/640x640bb.webp" },
  { id: "paynet", short: "paynet", color: "#56B837", icon: "https://cdn.aptoide.com/imgs/c/4/4/c446ca423588fe676f60fed0c560a46e_icon.png" },
  { id: "alif_mobi", short: "a", color: "#36B751", icon: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/71/c9/5d/71c95db0-3fee-79a9-c60c-2128fb52bc0a/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/512x512bb.jpg" },
  { id: "oson", short: "O", color: "#2479CF", icon: "https://static.rustore.ru/imgproxy/4yC4rPk12CxhBV7AWD-ybViT_TI8ipnXUDpKfZ6EapQ/preset%3Avk_og_img/plain/https%3A/static.rustore.ru/2026/2/5/c3/apk/2063587570/content/ICON/556ea94b-ce13-44b7-8c17-64d7201fb838.png%40webp" },
  { id: "pulpul", short: "P", color: "#8744B9", icon: "https://www.google.com/s2/favicons?domain=pulpul.uz&sz=128" },
] as const;

export function ProviderIcon({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  const app = featuredApps.find((item) => item.id === id);
  if (!app) return null;
  return (
    <View style={[styles.appIcon, { backgroundColor: app.color }]}>
      {failed ? (
        <Text style={styles.appIconFallback}>{app.short}</Text>
      ) : (
        <Image source={{ uri: app.icon }} style={styles.appIconImage} contentFit="cover" onError={() => setFailed(true)} />
      )}
    </View>
  );
}

export default function PaymentMethodFields({
  options, method, onMethodChange, cardNumber, onCardNumberChange,
  provider, onProviderChange, providerName, onProviderNameChange, disabled = false,
  presentation = "compact",
}: Props) {
  const isStep = presentation === "step";
  const [providerOpen, setProviderOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedProvider = options.providers.find((item) => item.id === provider);
  const other = options.providers.find((item) => item.id === "other");
  const popular = featuredApps
    .map((item) => options.providers.find((available) => available.id === item.id))
    .filter((item): item is PaymentOptions["providers"][number] => Boolean(item));
  const query = search.trim().toLocaleLowerCase();
  const searchResults = options.providers.filter((item) =>
    item.id !== "other" && `${item.label} ${item.id}`.toLocaleLowerCase().includes(query),
  );
  const chooseProvider = (id: string) => {
    onProviderChange(id);
    onProviderNameChange("");
    onCardNumberChange("");
    setProviderOpen(false);
    setSearchOpen(false);
    setSearch("");
    setCardOpen(true);
  };
  const methods = [
    { id: "cash" as const, label: "Naqd" },
    { id: "payment_app" as const, label: "O‘tkazma" },
  ].filter((item) => options.methods.some((available) => available.id === item.id));

  return (
    <View>
      <View style={[styles.methods, isStep && styles.stepMethods]}>
        {methods.map((item) => (
          <Pressable
            key={item.id}
            style={[
              styles.choice,
              isStep && styles.stepChoice,
              method === item.id && styles.selected,
              isStep && method === item.id && styles.stepChoiceSelected,
            ]}
            onPress={() => {
              onMethodChange(item.id);
              onCardNumberChange("");
              onProviderChange("");
              onProviderNameChange("");
              setProviderOpen(item.id === "payment_app");
              setCardOpen(false);
              setSearchOpen(false);
              setSearch("");
            }}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: method === item.id, disabled }}
          >
            {isStep && (
              <View style={[styles.methodIcon, method === item.id && styles.methodIconSelected]}>
                <Text style={[styles.methodIconText, method === item.id && styles.methodIconTextSelected]}>
                  {item.id === "cash" ? "💵" : "↗"}
                </Text>
              </View>
            )}
            <Text style={[styles.choiceText, isStep && styles.stepChoiceText, method === item.id && styles.selectedText]}>{item.label}</Text>
            {isStep && (
              <Text style={styles.methodDescription}>
                {item.id === "cash" ? "Qo‘lda qabul qilindi" : "Ilovadan kartaga yuborildi"}
              </Text>
            )}
          </Pressable>
        ))}
      </View>
      {isStep && method === "cash" && (
        <View style={styles.cashNote}>
          <Text style={styles.cashNoteText}>Naqd to‘lov uchun qo‘shimcha ma’lumot kerak emas.</Text>
        </View>
      )}

      {method === "payment_app" && (
        <View style={[styles.extraField, isStep && styles.stepExtraField]}>
          {isStep && <Text style={styles.stepHint}>Ilova va pul yuborilgan kartani tanlang.</Text>}
          <Text style={styles.label}>{isStep ? "1. To‘lov ilovasi *" : "To‘lov ilovasi *"}</Text>
          <Pressable
            style={[styles.input, styles.selectButton, isStep && styles.stepSelect]}
            onPress={() => setProviderOpen((value) => !value)}
            disabled={disabled}
            accessibilityRole="button"
          >
            <View style={styles.selectedProvider}>
              {selectedProvider && <ProviderIcon id={selectedProvider.id} />}
              <Text style={selectedProvider ? styles.value : styles.placeholder}>
                {selectedProvider?.label || "Ilovani tanlang"}
              </Text>
            </View>
            <Text style={styles.chevron}>{providerOpen ? "▲" : "▼"}</Text>
          </Pressable>
          {providerOpen && (
            <View style={styles.panel}>
              {!searchOpen ? (
                <>
                  <Text style={styles.category}>Ommabop ilovalar</Text>
                  <View style={styles.popularGrid}>
                    {popular.map((app) => (
                      <Pressable
                        key={app.id}
                        style={[styles.popularTile, provider === app.id && styles.optionSelected]}
                        onPress={() => chooseProvider(app.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: provider === app.id }}
                      >
                        <ProviderIcon id={app.id} />
                        <Text style={styles.popularLabel} numberOfLines={2}>{app.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable style={styles.searchLink} onPress={() => setSearchOpen(true)} accessibilityRole="button">
                    <Text style={styles.searchLinkText}>⌕  Boshqa ilovani qidirish</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.searchHeader}>
                    <TextInput
                      style={styles.searchInput}
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Ilova nomini yozing"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus
                    />
                    <Pressable onPress={() => { setSearchOpen(false); setSearch(""); }} accessibilityRole="button">
                      <Text style={styles.backText}>Orqaga</Text>
                    </Pressable>
                  </View>
                  <ScrollView style={styles.providerList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {searchResults.map((app) => (
                      <Pressable key={app.id} style={styles.option} onPress={() => chooseProvider(app.id)} accessibilityRole="radio">
                        <View style={styles.resultRow}>
                          <ProviderIcon id={app.id} />
                          <Text style={styles.value}>{app.label}</Text>
                        </View>
                      </Pressable>
                    ))}
                    {other && (!query || `${other.label} other`.toLocaleLowerCase().includes(query)) && (
                      <Pressable style={styles.option} onPress={() => chooseProvider("other")} accessibilityRole="radio">
                        <Text style={styles.value}>{other.label}</Text>
                      </Pressable>
                    )}
                    {!searchResults.length && !(other && (!query || `${other.label} other`.toLocaleLowerCase().includes(query))) && (
                      <Text style={styles.emptyText}>Ilova topilmadi.</Text>
                    )}
                  </ScrollView>
                </>
              )}
            </View>
          )}
          {provider === "other" && (
            <View style={styles.nextField}>
              <Text style={styles.label}>Ilova nomi *</Text>
              <TextInput
                style={styles.input}
                value={providerName}
                onChangeText={onProviderNameChange}
                placeholder="Ilova nomini kiriting"
                maxLength={80}
                editable={!disabled}
              />
            </View>
          )}
          {selectedProvider && (
            <View style={styles.nextField}>
              <Text style={styles.label}>{isStep ? "2. Karta raqami *" : "Karta raqami *"}</Text>
              <Pressable
                style={[styles.input, styles.selectButton, isStep && styles.stepSelect]}
                onPress={() => setCardOpen((value) => !value)}
                disabled={disabled}
                accessibilityRole="button"
              >
                <Text style={cardNumber ? styles.value : styles.placeholder}>
                  {cardNumber ? formatCard(cardNumber) : "Kartani tanlang"}
                </Text>
                <Text style={styles.chevron}>{cardOpen ? "▲" : "▼"}</Text>
              </Pressable>
              {cardOpen && (
                <View style={styles.panel}>
                  {PAYMENT_CARDS.map((card) => (
                    <Pressable
                      key={card}
                      style={[styles.option, cardNumber === card && styles.optionSelected]}
                      onPress={() => {
                        onCardNumberChange(card);
                        setCardOpen(false);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: cardNumber === card }}
                    >
                      <Text style={styles.value}>{formatCard(card)}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  methods: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  stepMethods: { flexWrap: "nowrap", gap: 10, marginTop: 0 },
  choice: { borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10 },
  stepChoice: {
    flex: 1,
    minWidth: 0,
    minHeight: 112,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderColor: "#DCE5EF",
    borderRadius: 14,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  stepChoiceSelected: { borderWidth: 2, backgroundColor: "#EAF4FF" },
  selected: { borderColor: "#1677D2", backgroundColor: "#EAF4FF" },
  choiceText: { color: "#1677D2", fontSize: 14, fontWeight: "700" },
  stepChoiceText: { color: "#172536", fontSize: 16, fontWeight: "800", marginTop: 7 },
  selectedText: { color: "#1267B8" },
  methodDescription: { color: "#627184", fontSize: 11, lineHeight: 15, marginTop: 3 },
  methodIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: "#F0F4F8", alignItems: "center", justifyContent: "center" },
  methodIconSelected: { backgroundColor: "#D8EBFF" },
  methodIconText: { color: "#627184", fontSize: 18, fontWeight: "800" },
  methodIconTextSelected: { color: "#1677D2" },
  cashNote: { marginTop: 16, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, backgroundColor: "#F1FAF4", borderWidth: 1, borderColor: "#B8E3C9" },
  cashNoteText: { color: "#176B43", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  extraField: { marginTop: 16 },
  stepExtraField: { marginTop: 22, paddingTop: 18, borderTopWidth: 1, borderTopColor: "#E8EDF3" },
  stepHint: { color: "#627184", fontSize: 13, lineHeight: 19, marginBottom: 16 },
  nextField: { marginTop: 12 },
  label: { color: "#172536", fontSize: 13, fontWeight: "700", marginBottom: 7 },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10, backgroundColor: "#FFFFFF", color: "#172536", fontSize: 15, paddingHorizontal: 12 },
  stepSelect: { minHeight: 54, borderColor: "#CAD9E8" },
  selectButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectedProvider: { flexDirection: "row", alignItems: "center", gap: 9, flex: 1 },
  appIcon: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  appIconImage: { width: 34, height: 34 },
  appIconFallback: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  value: { color: "#172536", fontSize: 14 },
  placeholder: { color: "#9AA6B5", fontSize: 14 },
  chevron: { color: "#627184", fontSize: 11 },
  panel: { marginTop: 8, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10, backgroundColor: "#FFFFFF", padding: 8 },
  providerList: { maxHeight: 240 },
  category: { color: "#627184", fontSize: 12, fontWeight: "700", margin: 8 },
  popularGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  popularTile: { width: "31%", minHeight: 86, flexGrow: 1, borderWidth: 1, borderColor: "#E3EAF2", borderRadius: 11, alignItems: "center", justifyContent: "center", padding: 7, gap: 5 },
  popularLabel: { color: "#172536", fontSize: 11, fontWeight: "700", textAlign: "center" },
  searchLink: { marginTop: 10, borderTopWidth: 1, borderTopColor: "#E7EDF4", paddingVertical: 12, alignItems: "center" },
  searchLinkText: { color: "#1677D2", fontSize: 13, fontWeight: "700" },
  searchHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  searchInput: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 8, paddingHorizontal: 10, color: "#172536" },
  backText: { color: "#1677D2", fontSize: 13, fontWeight: "700" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  emptyText: { color: "#627184", fontSize: 13, padding: 12, textAlign: "center" },
  option: { borderRadius: 7, paddingHorizontal: 10, paddingVertical: 10 },
  optionSelected: { backgroundColor: "#EAF4FF", borderColor: "#1677D2" },
});
