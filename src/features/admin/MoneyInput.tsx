import { type ReactNode, type RefObject } from "react";
import { StyleSheet, Text, TextInput, type StyleProp, type TextStyle, View } from "react-native";
import { formatMoneyDigits, formatMoneyWithUnits, normalizeMoneyInput } from "./money";

export default function MoneyInput({ value, onChangeText, editable = true, placeholder = "1 500 000", placeholderTextColor = "#9AA6B5", inputStyle, style, wordsStyle, wordsAccessory, tone, emptyHint = "Summani kiriting", inputRef }: {
  value: string;
  onChangeText: (value: string) => void;
  editable?: boolean;
  placeholder?: string;
  placeholderTextColor?: string;
  inputStyle?: StyleProp<TextStyle>;
  style?: StyleProp<TextStyle>;
  wordsStyle?: StyleProp<TextStyle>;
  wordsAccessory?: ReactNode;
  tone?: "success" | "error";
  emptyHint?: string;
  inputRef?: RefObject<TextInput | null>;
}) {
  return <View>
    <TextInput
      ref={inputRef}
      style={[styles.input, tone === "success" && styles.inputSuccess, tone === "error" && styles.inputError, inputStyle, style]}
      value={formatMoneyDigits(value)}
      onChangeText={(text) => onChangeText(normalizeMoneyInput(text, value))}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      keyboardType="number-pad"
      editable={editable}
    />
    <View style={wordsAccessory ? styles.wordsRow : undefined}>
      <Text style={[styles.words, wordsAccessory ? styles.wordsInRow : undefined, tone === "success" && styles.wordsSuccess, tone === "error" && styles.wordsError, wordsStyle]}>
        {value ? formatMoneyWithUnits(value) : emptyHint}
      </Text>
      {wordsAccessory}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  input: { minHeight: 50, borderWidth: 1, borderColor: "#D7DFE8", borderRadius: 12, paddingHorizontal: 14, color: "#172536", fontSize: 16, backgroundColor: "#FFFFFF" },
  inputSuccess: { borderColor: "#7FCDA1", backgroundColor: "#F0FAF4", color: "#176B43" },
  inputError: { borderColor: "#E29B9F", backgroundColor: "#FFF1F1", color: "#A62E38" },
  words: { color: "#627184", fontSize: 13, lineHeight: 19, marginTop: 6 },
  wordsRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  wordsInRow: { flex: 1, minWidth: 0 },
  wordsSuccess: { color: "#16865A", fontWeight: "700" },
  wordsError: { color: "#C3333D", fontWeight: "700" },
});
