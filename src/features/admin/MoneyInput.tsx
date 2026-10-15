import { StyleSheet, Text, TextInput, type StyleProp, type TextStyle, View } from "react-native";
import { formatMoneyDigits, formatMoneyWithUnits, normalizeMoneyInput } from "./money";

export default function MoneyInput({ value, onChangeText, editable = true, placeholder = "1 500 000", inputStyle }: {
  value: string;
  onChangeText: (value: string) => void;
  editable?: boolean;
  placeholder?: string;
  inputStyle?: StyleProp<TextStyle>;
}) {
  return <View>
    <TextInput
      style={[styles.input, inputStyle]}
      value={formatMoneyDigits(value)}
      onChangeText={(text) => onChangeText(normalizeMoneyInput(text, value))}
      placeholder={placeholder}
      placeholderTextColor="#9AA6B5"
      keyboardType="number-pad"
      editable={editable}
    />
    <Text style={styles.words}>{value ? formatMoneyWithUnits(value) : "Summani kiriting"}</Text>
  </View>;
}

const styles = StyleSheet.create({
  input: { minHeight: 50, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 12, paddingHorizontal: 14, color: "#172536", fontSize: 16, backgroundColor: "#FFFFFF" },
  words: { color: "#627184", fontSize: 13, lineHeight: 19, marginTop: 6 },
});
