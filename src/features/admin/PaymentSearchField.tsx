import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type Props = {
  value: string;
  onChangeText: (value: string) => void;
};

export default function PaymentSearchField({ value, onChangeText }: Props) {
  return <View style={styles.container}>
    <TextInput
      accessibilityLabel="To‘lovlarni qidirish"
      autoCapitalize="none"
      autoCorrect={false}
      value={value}
      onChangeText={onChangeText}
      placeholder="Ism, telefon, manzil, mahsulot, izoh yoki mijoz ID"
      placeholderTextColor="#8B97A8"
      returnKeyType="search"
      style={styles.input}
    />
    {!!value && <Pressable onPress={() => onChangeText("")} accessibilityRole="button" accessibilityLabel="Qidiruvni tozalash" style={styles.clear}>
      <Text style={styles.clearText}>×</Text>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", marginTop: 14, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 10, backgroundColor: "#FFFFFF" },
  input: { flex: 1, minHeight: 46, paddingHorizontal: 12, color: "#172536", fontSize: 14 },
  clear: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  clearText: { color: "#627184", fontSize: 24 },
});
