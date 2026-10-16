import { StyleSheet, Text, View } from "react-native";

export default function CurrentLocationPreview({ point }: { point: { latitude: number; longitude: number } }) {
  return <View style={styles.frame}>
    <Text style={styles.text}>{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  frame: { backgroundColor: "#EAF4FF", borderRadius: 12, padding: 14, marginTop: 12 },
  text: { color: "#45586E", fontSize: 13, lineHeight: 19 },
});
